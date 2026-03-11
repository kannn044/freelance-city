import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { CARGO_BOX_CONFIG, SHIP_CONFIG, PURCHASE_ORDER_TIMEOUT_MIN } from "../../../shared/gameConfig";
import { getTravelTimeSeconds } from "../../../shared/mapData";
import { createNotificationTx } from "../services/notification.service";
import { computeMarketTradeTaxTx, applyMarketTradeTaxTx } from "../services/city.service";
import { invalidateListingsCache } from "./market.controller";

interface AuthRequest extends Request {
    userId?: number;
}

// ─── Bot Ship Helpers ────────────────────────────────────

const BOT_EMAIL_SUFFIX = "@npc.market";

// ─── Inventory Helper ────────────────────────────────────

/**
 * Places items from a cargo box's items list directly into a user's inventory.
 * Returns an error string if inventory is full, or null on success.
 */
async function unpackCargoBoxItemsToInventoryTx(
    tx: any,
    userId: number,
    cargoItems: Array<{
        item_id: number;
        quantity: number;
        equipment_rarity?: string | null;
        equipment_durability?: number | null;
        enchant_level: number;
        special_stat_1?: string | null;
        special_stat_2?: string | null;
        special_stat_3?: string | null;
        special_stat_4?: string | null;
        item: { max_stack: number };
    }>,
): Promise<string | null> {
    const slots = await tx.inventorySlot.findMany({
        where: { user_id: userId },
        orderBy: { slot: "asc" },
    });

    for (const cargoItem of cargoItems) {
        let remaining = cargoItem.quantity;
        const maxStack = cargoItem.item.max_stack;

        // Fill existing stacks first
        for (const slot of slots) {
            if (remaining <= 0) break;
            if (slot.item_id !== cargoItem.item_id) continue;
            if ((slot.equipment_rarity ?? null) !== (cargoItem.equipment_rarity ?? null)) continue;
            const canAdd = Math.min(maxStack - slot.quantity, remaining);
            if (canAdd <= 0) continue;
            await tx.inventorySlot.update({ where: { id: slot.id }, data: { quantity: slot.quantity + canAdd } });
            slot.quantity += canAdd;
            remaining -= canAdd;
        }

        // Use empty slots
        for (const slot of slots) {
            if (remaining <= 0) break;
            if (slot.item_id !== null) continue;
            const put = Math.min(maxStack, remaining);
            await tx.inventorySlot.update({
                where: { id: slot.id },
                data: {
                    item_id: cargoItem.item_id,
                    quantity: put,
                    equipment_rarity: cargoItem.equipment_rarity ?? null,
                    equipment_durability: cargoItem.equipment_durability ?? null,
                    enchant_level: cargoItem.enchant_level,
                    special_stat_1: cargoItem.special_stat_1 ?? null,
                    special_stat_2: cargoItem.special_stat_2 ?? null,
                    special_stat_3: cargoItem.special_stat_3 ?? null,
                    special_stat_4: cargoItem.special_stat_4 ?? null,
                },
            });
            slot.item_id = cargoItem.item_id;
            slot.quantity = put;
            remaining -= put;
        }

        if (remaining > 0) return "Not enough inventory space";
    }
    return null;
}

/**
 * Snaps to the nearest future 5-minute boundary.
 */
function nextPublicSlot(fromNow: Date = new Date()): Date {
    const ms = fromNow.getTime();
    const interval = SHIP_CONFIG.public.departureIntervalMin * 60_000;
    return new Date(Math.ceil(ms / interval) * interval);
}

/**
 * Finds an existing DOCKED bot public ship on the given route with spare capacity,
 * or creates a new one snapped to the next 5-minute departure slot.
 */
async function findOrCreateBotPublicShipTx(
    tx: any,
    originCity: string,
    destCity: string,
) {
    const existing = await tx.ship.findFirst({
        where: {
            type: "PUBLIC",
            origin_city: originCity,
            dest_city: destCity,
            status: "DOCKED",
            is_bot_ship: true,
            departs_at: { gt: new Date() },
        },
        include: { _count: { select: { cargo: true } } },
        orderBy: { departs_at: "asc" },
    });

    if (existing && existing._count.cargo < existing.capacity) {
        return existing;
    }

    return tx.ship.create({
        data: {
            type: "PUBLIC",
            origin_city: originCity,
            dest_city: destCity,
            status: "DOCKED",
            capacity: SHIP_CONFIG.public.capacity,
            is_bot_ship: true,
            departs_at: nextPublicSlot(),
        },
    });
}

// ─── Purchase Orders ─────────────────────────────────────

/** POST /game/market/buy-cargo/:listingId — buy a cargo box listing, create purchase order */
export const buyCargoListing = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.userId!;
        const listingId = parseInt(String(req.params.listingId));

        const result = await prisma.$transaction(async (tx) => {
            const listing = await tx.marketListing.findUnique({
                where: { id: listingId },
                include: { seller: true },
            });

            if (!listing) return { error: "Listing not found" };
            if (listing.status !== "ACTIVE") return { error: "Listing is not active" };
            if (!listing.is_cross_city) return { error: "This is not a cross-city listing" };
            if (listing.seller_id === userId) return { error: "Cannot buy your own listing" };

            const buyer = await tx.user.findUniqueOrThrow({ where: { id: userId } });

            // ── Same-city direct purchase ────────────────────────────
            // If buyer is already in the same city as the seller, unpack the
            // cargo box items directly into the buyer's inventory (no ship needed).
            if (buyer.city_key === listing.origin_city) {
                const cargoBox = await tx.cargoBox.findUnique({
                    where: { id: listing.cargo_box_id! },
                    include: { items: { include: { item: true } } },
                });

                if (!cargoBox) return { error: "Cargo box not found" };

                const tax = await computeMarketTradeTaxTx(tx, listing.seller_id, userId, listing.price);

                if (buyer.money < tax.buyerPays) {
                    return { error: `Not enough credits. Need ${tax.buyerPays}` };
                }

                const unpackError = await unpackCargoBoxItemsToInventoryTx(tx, userId, cargoBox.items);
                if (unpackError) return { error: unpackError };

                // Deduct from buyer
                await tx.user.update({ where: { id: userId }, data: { money: { decrement: tax.buyerPays } } });

                // Pay seller
                await tx.user.update({ where: { id: listing.seller_id }, data: { money: { increment: tax.sellerReceives } } });

                await applyMarketTradeTaxTx(tx, tax);

                // Mark listing and cargo box as done
                await tx.marketListing.update({
                    where: { id: listingId },
                    data: { status: "SOLD", buyer_id: userId, sold_at: new Date() },
                });

                await tx.cargoBox.update({
                    where: { id: listing.cargo_box_id! },
                    data: { status: "CLAIMED" },
                });

                return { sameCityPurchase: true };
            }
            // ─────────────────────────────────────────────────────────

            // Check port storage capacity
            const buyerCity = buyer.city_key!;
            let portStorage = await tx.userPortStorage.findUnique({
                where: { user_id_city_key: { user_id: userId, city_key: buyerCity } },
            });
            if (!portStorage) {
                portStorage = await tx.userPortStorage.create({
                    data: { user_id: userId, city_key: buyerCity, max_slots: 5 },
                });
            }

            const pendingAtPort = await tx.purchaseOrder.count({
                where: {
                    buyer_id: userId,
                    status: { in: ["PENDING", "SHIPPING", "DELIVERED"] },
                },
            });

            if (pendingAtPort >= portStorage.max_slots) {
                return { error: "Port storage full. Claim existing cargo first." };
            }

            // Calculate locked amount (price + estimated import tax)
            const buyerCityState = await tx.cityState.findUnique({
                where: { city_key: buyerCity },
            });
            const importTaxBp = buyerCityState?.import_tax_bp ?? 300;
            const estimatedImportTax = Math.ceil(listing.price * importTaxBp / 10000);
            const lockedAmount = listing.price + estimatedImportTax;

            if (buyer.money < lockedAmount) {
                return { error: `Not enough money. Need ${lockedAmount} (price ${listing.price} + estimated tax ${estimatedImportTax})` };
            }

            // Lock money
            await tx.user.update({
                where: { id: userId },
                data: {
                    money: { decrement: lockedAmount },
                    locked_money: { increment: lockedAmount },
                },
            });

            // Update listing
            await tx.marketListing.update({
                where: { id: listingId },
                data: { status: "SOLD", buyer_id: userId, sold_at: new Date() },
            });

            // Update cargo box
            await tx.cargoBox.update({
                where: { id: listing.cargo_box_id! },
                data: { status: "SOLD" },
            });

            // Create purchase order
            const expiresAt = new Date(Date.now() + PURCHASE_ORDER_TIMEOUT_MIN * 60 * 1000);
            const order = await tx.purchaseOrder.create({
                data: {
                    cargo_box_id: listing.cargo_box_id!,
                    listing_id: listingId,
                    buyer_id: userId,
                    seller_id: listing.seller_id,
                    price: listing.price,
                    locked_amount: lockedAmount,
                    status: "PENDING",
                    expires_at: expiresAt,
                },
            });

            // ── Bot instant delivery ─────────────────────────────────
            // Bot sellers deliver instantly: skip shipping, go straight to AT_PORT
            // and settle the payment immediately.
            const isBotSeller = listing.seller.email.endsWith(BOT_EMAIL_SUFFIX);
            if (isBotSeller) {
                // Compute taxes for cross-city delivery
                const sellerCityState = await tx.cityState.findUnique({ where: { city_key: listing.origin_city! } });
                const buyerCityState = await tx.cityState.findUnique({ where: { city_key: buyer.city_key! } });
                const exportTaxBp = sellerCityState?.export_tax_bp ?? 300;
                const importTaxBp = buyerCityState?.import_tax_bp ?? 300;
                const exportTax = Math.floor(listing.price * exportTaxBp / 10000);
                const importTax = Math.floor(listing.price * importTaxBp / 10000);
                const sellerReceives = listing.price - exportTax;

                // Settle money: buyer already had money locked, now finalise
                // Refund over-estimated lock vs actual import tax
                const actualLock = listing.price + importTax;
                const lockDiff = lockedAmount - actualLock;
                if (lockDiff > 0) {
                    await tx.user.update({ where: { id: userId }, data: { money: { increment: lockDiff }, locked_money: { decrement: lockDiff } } });
                }
                // Finalise locked money (keep only what we need)
                await tx.user.update({
                    where: { id: userId },
                    data: { locked_money: { decrement: actualLock } },
                });

                // Pay seller
                await tx.user.update({ where: { id: listing.seller_id }, data: { money: { increment: sellerReceives } } });

                // Tax to treasuries
                if (sellerCityState) {
                    await tx.cityState.update({ where: { city_key: sellerCityState.city_key }, data: { treasury: { increment: exportTax } } });
                }
                if (buyerCityState) {
                    await tx.cityState.update({ where: { city_key: buyerCityState.city_key }, data: { treasury: { increment: importTax } } });
                }

                // Finalise order as delivered
                await tx.purchaseOrder.update({
                    where: { id: order.id },
                    data: {
                        status: "DELIVERED",
                        export_tax: exportTax,
                        import_tax: importTax,
                        locked_amount: actualLock,
                        settled_at: new Date(),
                    },
                });

                await tx.cargoBox.update({
                    where: { id: listing.cargo_box_id! },
                    data: { status: "AT_PORT" },
                });

                // Notify buyer to claim at port
                await createNotificationTx(tx, userId, "SHIP_ARRIVED",
                    "Cargo delivered! Visit Port to claim.",
                    `Your order #${order.id} has arrived at your city port. Go to Port to claim your items.`,
                    { orderId: order.id },
                );

                // Notify seller
                await createNotificationTx(tx, listing.seller_id, "SETTLEMENT_COMPLETE",
                    "Bot order settled",
                    `A bot order for Cargo Box #${listing.cargo_box_id} was instantly delivered. You received ${sellerReceives} credits.`,
                    { orderId: order.id },
                );

                return { order: { ...order, status: "DELIVERED" }, instantDelivered: true };
            }
            // ────────────────────────────────────────────────────────

            // Notify seller (human seller path)
            await createNotificationTx(tx, listing.seller_id, "ORDER_CREATED",
                "New order received",
                `A buyer purchased your Cargo Box #${listing.cargo_box_id}. Your cargo will be loaded on the next public ship.`,
                { orderId: order.id, cargoBoxId: listing.cargo_box_id },
            );

            // ── Auto-load onto public ship ───────────────────────────
            // Find a docked public ship for this route, or create one
            const buyerDestCity = buyer.city_key!;
            const sellerOriginCity = listing.origin_city!;

            let publicShip = await tx.ship.findFirst({
                where: {
                    type: "PUBLIC",
                    status: "DOCKED",
                    origin_city: sellerOriginCity,
                    dest_city: buyerDestCity,
                },
                include: { _count: { select: { cargo: true } } },
                orderBy: { departs_at: "asc" },
            });

            if (!publicShip || publicShip._count.cargo >= publicShip.capacity) {
                // Create a new public ship on this route
                publicShip = await tx.ship.create({
                    data: {
                        type: "PUBLIC",
                        origin_city: sellerOriginCity,
                        dest_city: buyerDestCity,
                        status: "DOCKED",
                        capacity: SHIP_CONFIG.public.capacity,
                        departs_at: nextPublicSlot(),
                    },
                    include: { _count: { select: { cargo: true } } },
                });
            }

            // Load cargo onto the ship
            await tx.shipCargo.create({
                data: {
                    ship_id: publicShip.id,
                    order_id: order.id,
                    cargo_box_id: listing.cargo_box_id!,
                },
            });

            await tx.purchaseOrder.update({
                where: { id: order.id },
                data: { status: "SHIPPING" },
            });

            await tx.cargoBox.update({
                where: { id: listing.cargo_box_id! },
                data: { status: "ON_SHIP" },
            });

            await createNotificationTx(tx, buyer.id, "SHIP_DEPARTED",
                "Order loaded on public ship",
                `Your order #${order.id} has been auto-loaded onto a public ship. It will depart soon!`,
                { orderId: order.id, shipId: publicShip.id },
            );
            // ────────────────────────────────────────────────────────

            return { order: { ...order, status: "SHIPPING" } };
        });

        if ("error" in result) {
            res.status(400).json({ error: result.error });
            return;
        }

        if ("sameCityPurchase" in result && result.sameCityPurchase) {
            res.json({ sameCityPurchase: true, message: "Items unpacked directly to your inventory!" });
            return;
        }

        res.json({
            order: result.order,
            instantDelivered: (result as any).instantDelivered ?? false,
        });
    } catch (err: any) {
        console.error("buyCargoListing error:", err);
        res.status(500).json({ error: "Failed to buy cargo listing" });
    }
};

/** POST /game/market/sell-cargo — list a cargo box on the marketplace */
export const sellCargoListing = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.userId!;
        const { cargoBoxId, price } = req.body as { cargoBoxId: number; price: number };

        if (!cargoBoxId || !price || price <= 0) {
            res.status(400).json({ error: "cargoBoxId and positive price required" });
            return;
        }

        const result = await prisma.$transaction(async (tx) => {
            const box = await tx.cargoBox.findFirst({
                where: { id: cargoBoxId, owner_id: userId },
                include: { items: { include: { item: true } } },
            });

            if (!box) return { error: "Cargo box not found" };
            if (box.status !== "PACKED") return { error: "Box must be PACKED to list" };
            if (box.items.length === 0) return { error: "Box has no items" };

            const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
            if (!user.city_key) return { error: "Must be in a city" };

            // Use the first item as the "representative" item for the listing
            const firstItem = box.items[0];

            const listing = await tx.marketListing.create({
                data: {
                    seller_id: userId,
                    item_id: firstItem.item_id,
                    quantity: box.items.reduce((s, i) => s + i.quantity, 0),
                    price,
                    status: "ACTIVE",
                    is_cross_city: true,
                    cargo_box_id: cargoBoxId,
                    origin_city: user.city_key,
                },
            });

            await tx.cargoBox.update({
                where: { id: cargoBoxId },
                data: { status: "LISTED" },
            });

            return { listing };
        });

        if ("error" in result) {
            res.status(400).json({ error: result.error });
            return;
        }

        invalidateListingsCache(); // Ensure fresh data on next market fetch
        res.json({ listing: result.listing });
    } catch (err: any) {
        console.error("sellCargoListing error:", err);
        res.status(500).json({ error: "Failed to list cargo box" });
    }
};

/** GET /game/orders — list purchase orders for the user (buyer or seller) */
export const getOrders = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.userId!;
        const role = req.query.role as string; // "buyer" | "seller" | undefined (both)

        const where: any = {};
        if (role === "buyer") where.buyer_id = userId;
        else if (role === "seller") where.seller_id = userId;
        else where.OR = [{ buyer_id: userId }, { seller_id: userId }];

        const orders = await prisma.purchaseOrder.findMany({
            where,
            include: {
                cargo_box: {
                    include: { items: { include: { item: true } } },
                },
                buyer: { select: { id: true, email: true, city_key: true } },
                seller: { select: { id: true, email: true, city_key: true } },
            },
            orderBy: { created_at: "desc" },
        });

        res.json({ orders });
    } catch (err: any) {
        console.error("getOrders error:", err);
        res.status(500).json({ error: "Failed to fetch orders" });
    }
};

/** POST /game/orders/:orderId/cancel — buyer cancel a pending order */
export const cancelOrder = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.userId!;
        const orderId = parseInt(String(req.params.orderId));

        const result = await prisma.$transaction(async (tx) => {
            const order = await tx.purchaseOrder.findUnique({
                where: { id: orderId },
                include: { cargo_box: true },
            });

            if (!order) return { error: "Order not found" };
            if (order.buyer_id !== userId) return { error: "Only the buyer can cancel" };
            if (order.status !== "PENDING") return { error: "Can only cancel PENDING orders" };

            // Check if already on ship
            if (order.cargo_box.status === "ON_SHIP") {
                return { error: "Cannot cancel — cargo is already on a ship" };
            }

            // Refund locked money
            await tx.user.update({
                where: { id: userId },
                data: {
                    money: { increment: order.locked_amount },
                    locked_money: { decrement: order.locked_amount },
                },
            });

            // Update order
            await tx.purchaseOrder.update({
                where: { id: orderId },
                data: { status: "CANCELLED_BUYER" },
            });

            // Re-list on marketplace
            await tx.marketListing.update({
                where: { id: order.listing_id },
                data: { status: "ACTIVE", buyer_id: null, sold_at: null },
            });

            // Re-list cargo box
            await tx.cargoBox.update({
                where: { id: order.cargo_box_id },
                data: { status: "LISTED" },
            });

            // Notify seller
            await createNotificationTx(tx, order.seller_id, "ORDER_CANCELLED_BUYER",
                "Order cancelled",
                `Order #${orderId} was cancelled by the buyer. Your cargo is back on the marketplace.`,
                { orderId },
            );

            return { success: true };
        });

        if ("error" in result) {
            res.status(400).json({ error: result.error });
            return;
        }

        res.json({ success: true });
    } catch (err: any) {
        console.error("cancelOrder error:", err);
        res.status(500).json({ error: "Failed to cancel order" });
    }
};

// ─── Ships ───────────────────────────────────────────────

/** GET /game/ship/public/schedule — view public ship schedules */
export const getPublicShipSchedule = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const ships = await prisma.ship.findMany({
            where: { type: "PUBLIC", status: { in: ["DOCKED", "SAILING"] } },
            include: { _count: { select: { cargo: true } } },
            orderBy: [{ origin_city: "asc" }, { dest_city: "asc" }],
        });

        res.json({
            ships: ships.map((s) => ({
                id: s.id,
                origin_city: s.origin_city,
                dest_city: s.dest_city,
                status: s.status,
                capacity: s.capacity,
                cargo_count: s._count.cargo,
                departs_at: s.departs_at,
                departed_at: s.departed_at,
                arrives_at: s.arrives_at,
            })),
        });
    } catch (err: any) {
        console.error("getPublicShipSchedule error:", err);
        res.status(500).json({ error: "Failed to fetch ship schedule" });
    }
};

/** POST /game/ship/public/load — load cargo onto a public ship */
export const loadPublicShip = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.userId!;
        const { orderId } = req.body as { orderId: number };

        const result = await prisma.$transaction(async (tx) => {
            const order = await tx.purchaseOrder.findUnique({
                where: { id: orderId },
                include: { cargo_box: true, buyer: true },
            });

            if (!order) return { error: "Order not found" };
            if (order.seller_id !== userId) return { error: "Only the seller can load cargo" };
            if (order.status !== "PENDING") return { error: "Order is not PENDING" };
            if (order.cargo_box.status === "ON_SHIP") return { error: "Cargo already on a ship" };

            const seller = await tx.user.findUniqueOrThrow({ where: { id: userId } });
            const destCity = order.buyer.city_key!;

            // Find a docked public ship for this route
            const ship = await tx.ship.findFirst({
                where: {
                    type: "PUBLIC",
                    status: "DOCKED",
                    origin_city: seller.city_key!,
                    dest_city: destCity,
                },
                include: { _count: { select: { cargo: true } } },
            });

            if (!ship) return { error: "No public ship available for this route" };
            if (ship._count.cargo >= ship.capacity) return { error: "Public ship is full" };

            // Load cargo
            await tx.shipCargo.create({
                data: {
                    ship_id: ship.id,
                    order_id: orderId,
                    cargo_box_id: order.cargo_box_id,
                },
            });

            await tx.purchaseOrder.update({
                where: { id: orderId },
                data: { status: "SHIPPING" },
            });

            await tx.cargoBox.update({
                where: { id: order.cargo_box_id },
                data: { status: "ON_SHIP" },
            });

            await createNotificationTx(tx, order.buyer_id, "SHIP_DEPARTED",
                "Order loaded on ship",
                `Your order #${orderId} has been loaded onto a public ship heading to your city.`,
                { orderId, shipId: ship.id },
            );

            return { success: true, shipId: ship.id };
        });

        if ("error" in result) {
            res.status(400).json({ error: result.error });
            return;
        }

        res.json({ success: true, shipId: result.shipId });
    } catch (err: any) {
        console.error("loadPublicShip error:", err);
        res.status(500).json({ error: "Failed to load cargo" });
    }
};

/** POST /game/ship/private/rent — rent a private ship */
export const rentPrivateShip = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.userId!;
        const { size, destCity, rpsSequence } = req.body as {
            size: string;
            destCity: string;
            rpsSequence: string[];
        };

        if (!["S", "M", "L"].includes(size)) {
            res.status(400).json({ error: "Invalid ship size" });
            return;
        }

        const sizeKey = size as keyof typeof SHIP_CONFIG.private.sizes;
        const config = SHIP_CONFIG.private.sizes[sizeKey];

        if (!rpsSequence || rpsSequence.length !== config.rpsSlots) {
            res.status(400).json({ error: `RPS sequence must have exactly ${config.rpsSlots} values` });
            return;
        }

        const validRPS = ["ROCK", "PAPER", "SCISSORS"];
        if (!rpsSequence.every((v) => validRPS.includes(v))) {
            res.status(400).json({ error: "Invalid RPS values" });
            return;
        }

        const result = await prisma.$transaction(async (tx) => {
            const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
            if (!user.city_key) return { error: "Must be in a city" };
            if (user.city_key === destCity) return { error: "Cannot ship to your own city" };

            // Check fuel cell
            const fuelItem = await tx.item.findUnique({ where: { name: "Fuel Cell" } });
            if (!fuelItem) return { error: "Fuel Cell item not found in game" };

            const fuelSlots = await tx.inventorySlot.findMany({
                where: { user_id: userId, item_id: fuelItem.id },
                orderBy: { slot: "asc" },
            });

            const totalFuel = fuelSlots.reduce((s, sl) => s + sl.quantity, 0);
            if (totalFuel < config.fuelCost) {
                return { error: `Need ${config.fuelCost} Fuel Cell(s), have ${totalFuel}` };
            }

            // Deduct fuel cells
            let fuelToDeduct = config.fuelCost;
            for (const slot of fuelSlots) {
                if (fuelToDeduct <= 0) break;
                const take = Math.min(slot.quantity, fuelToDeduct);
                fuelToDeduct -= take;
                const newQty = slot.quantity - take;
                if (newQty <= 0) {
                    await tx.inventorySlot.update({
                        where: { id: slot.id },
                        data: { item_id: null, quantity: 0 },
                    });
                } else {
                    await tx.inventorySlot.update({
                        where: { id: slot.id },
                        data: { quantity: newQty },
                    });
                }
            }

            const ship = await tx.ship.create({
                data: {
                    type: "PRIVATE",
                    size: sizeKey,
                    owner_id: userId,
                    origin_city: user.city_key,
                    dest_city: destCity,
                    status: "LOADING",
                    capacity: config.capacity,
                    rps_sequence: JSON.stringify(rpsSequence),
                },
            });

            return { ship };
        });

        if ("error" in result) {
            res.status(400).json({ error: result.error });
            return;
        }

        res.json({ ship: result.ship });
    } catch (err: any) {
        console.error("rentPrivateShip error:", err);
        res.status(500).json({ error: "Failed to rent private ship" });
    }
};

/** POST /game/ship/private/load — load cargo onto private ship */
export const loadPrivateShip = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.userId!;
        const { shipId, orderId } = req.body as { shipId: number; orderId: number };

        const result = await prisma.$transaction(async (tx) => {
            const ship = await tx.ship.findFirst({
                where: { id: shipId, owner_id: userId, type: "PRIVATE" },
                include: { _count: { select: { cargo: true } } },
            });

            if (!ship) return { error: "Ship not found" };
            if (ship.status !== "LOADING") return { error: "Ship is not in LOADING status" };
            if (ship._count.cargo >= ship.capacity) return { error: "Ship is full" };

            const order = await tx.purchaseOrder.findUnique({
                where: { id: orderId },
                include: { cargo_box: true, buyer: true },
            });

            if (!order) return { error: "Order not found" };
            if (order.seller_id !== userId) return { error: "Only the seller can load cargo" };
            if (order.status !== "PENDING") return { error: "Order is not PENDING" };

            // Verify destination matches
            if (order.buyer.city_key !== ship.dest_city) {
                return { error: "Order destination does not match ship destination" };
            }

            await tx.shipCargo.create({
                data: {
                    ship_id: shipId,
                    order_id: orderId,
                    cargo_box_id: order.cargo_box_id,
                },
            });

            await tx.purchaseOrder.update({
                where: { id: orderId },
                data: { status: "SHIPPING" },
            });

            await tx.cargoBox.update({
                where: { id: order.cargo_box_id },
                data: { status: "ON_SHIP" },
            });

            return { success: true };
        });

        if ("error" in result) {
            res.status(400).json({ error: result.error });
            return;
        }

        res.json({ success: true });
    } catch (err: any) {
        console.error("loadPrivateShip error:", err);
        res.status(500).json({ error: "Failed to load cargo" });
    }
};

/** POST /game/ship/private/dispatch — send the private ship */
export const dispatchPrivateShip = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.userId!;
        const { shipId } = req.body as { shipId: number };

        const result = await prisma.$transaction(async (tx) => {
            const ship = await tx.ship.findFirst({
                where: { id: shipId, owner_id: userId, type: "PRIVATE" },
                include: { cargo: { include: { order: true } } },
            });

            if (!ship) return { error: "Ship not found" };
            if (ship.status !== "LOADING") return { error: "Ship is not in LOADING status" };
            if (ship.cargo.length === 0) return { error: "Ship has no cargo" };

            const travelTime = getTravelTimeSeconds(ship.origin_city, ship.dest_city);
            if (travelTime <= 0) return { error: "Invalid route" };

            const now = new Date();
            const arrivesAt = new Date(now.getTime() + travelTime * 1000);

            await tx.ship.update({
                where: { id: shipId },
                data: {
                    status: "SAILING",
                    departed_at: now,
                    arrives_at: arrivesAt,
                },
            });

            // Notify all buyers
            for (const sc of ship.cargo) {
                await createNotificationTx(tx, sc.order.buyer_id, "SHIP_DEPARTED",
                    "Your cargo has departed!",
                    `A private ship carrying your order #${sc.order_id} has departed. ETA: ${travelTime} seconds.`,
                    { orderId: sc.order_id, shipId },
                );
            }

            return { success: true, arrives_at: arrivesAt };
        });

        if ("error" in result) {
            res.status(400).json({ error: result.error });
            return;
        }

        res.json({ success: true, arrives_at: result.arrives_at });
    } catch (err: any) {
        console.error("dispatchPrivateShip error:", err);
        res.status(500).json({ error: "Failed to dispatch ship" });
    }
};

// ─── World Map ───────────────────────────────────────────

/** GET /game/world-map/ships — get all active ships for map rendering */
export const getWorldMapShips = async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        const ships = await prisma.ship.findMany({
            where: { status: { in: ["SAILING", "DOCKED"] } },
            include: { _count: { select: { cargo: true } } },
        });

        res.json({
            ships: ships.map((s) => ({
                id: s.id,
                type: s.type,
                size: s.size,
                origin_city: s.origin_city,
                dest_city: s.dest_city,
                status: s.status,
                departed_at: s.departed_at,
                arrives_at: s.arrives_at,
                departs_at: s.departs_at,
                cargo_count: s._count.cargo,
                is_bot_ship: s.is_bot_ship,
                bot_marker: s.is_bot_ship,
                owner_id: s.owner_id,
            })),
            server_time: new Date().toISOString(),
        });
    } catch (err: any) {
        console.error("getWorldMapShips error:", err);
        res.status(500).json({ error: "Failed to fetch ships" });
    }
};
