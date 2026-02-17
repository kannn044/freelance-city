import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { marketBotService } from "../services/marketBot.service";
import { getEffectiveMaxStack, getUserEquipmentEffects } from "../services/equipmentEffects.service";
import type { EquipmentRarity } from "../config/game.config";

interface AuthRequest extends Request {
    userId?: number;
}

let marketListingRarityColumnEnsured = false;

async function ensureMarketListingRarityColumn() {
    if (marketListingRarityColumnEnsured) return;

    const rows = await prisma.$queryRaw<Array<{ cnt: number | bigint }>>`
        SELECT COUNT(*) as cnt
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'market_listings'
          AND COLUMN_NAME = 'equipment_rarity'
    `;

    const exists = Number(rows[0]?.cnt ?? 0) > 0;
    if (!exists) {
        await prisma.$executeRawUnsafe(`
            ALTER TABLE market_listings
            ADD COLUMN equipment_rarity ENUM('NORMAL','RARE','EPIC','LEGENDARY') NULL
        `);
    }

    marketListingRarityColumnEnsured = true;
}

async function getMarketListingRarityMap(listingIds: number[]) {
    await ensureMarketListingRarityColumn();
    if (listingIds.length === 0) return new Map<number, EquipmentRarity | null>();

    const safeIds = listingIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0);
    if (safeIds.length === 0) return new Map<number, EquipmentRarity | null>();

    const rows = await prisma.$queryRawUnsafe<Array<{ id: number; equipment_rarity: EquipmentRarity | null }>>(
        `SELECT id, equipment_rarity FROM market_listings WHERE id IN (${safeIds.join(",")})`
    );

    const map = new Map<number, EquipmentRarity | null>();
    for (const row of rows) {
        map.set(Number(row.id), row.equipment_rarity ?? null);
    }
    return map;
}

async function getMarketListingRarityById(listingId: number): Promise<EquipmentRarity | null> {
    const map = await getMarketListingRarityMap([listingId]);
    return map.get(listingId) ?? null;
}

async function setMarketListingRarity(listingId: number, rarity: EquipmentRarity | null) {
    await ensureMarketListingRarityColumn();
    await prisma.$executeRaw`
        UPDATE market_listings
        SET equipment_rarity = ${rarity}
        WHERE id = ${listingId}
    `;
}

async function placeItemInInventoryTx(
    tx: any,
    userId: number,
    itemId: number,
    quantity: number,
    maxStack: number,
    rarity: EquipmentRarity | null = null,
): Promise<boolean> {
    const slots = await tx.inventorySlot.findMany({
        where: { user_id: userId },
        orderBy: { slot: "asc" },
    });

    const stackCapacity = slots
        .filter((s: any) => s.item_id === itemId && (s.equipment_rarity ?? null) === (rarity ?? null))
        .reduce((sum: number, s: any) => sum + Math.max(0, maxStack - s.quantity), 0);
    const emptySlots = slots.filter((s: any) => s.item_id === null).length;
    const totalCapacity = stackCapacity + emptySlots * maxStack;
    if (totalCapacity < quantity) return false;

    let remaining = quantity;

    for (const slot of slots) {
        if (remaining <= 0) break;
        if (slot.item_id !== itemId || slot.quantity >= maxStack) continue;
        if ((slot.equipment_rarity ?? null) !== (rarity ?? null)) continue;

        const add = Math.min(maxStack - slot.quantity, remaining);
        remaining -= add;

        await tx.inventorySlot.update({
            where: { id: slot.id },
            data: { quantity: slot.quantity + add },
        });
    }

    for (const slot of slots) {
        if (remaining <= 0) break;
        if (slot.item_id !== null) continue;

        const put = Math.min(maxStack, remaining);
        remaining -= put;

        await tx.inventorySlot.update({
            where: { id: slot.id },
            data: { item_id: itemId, quantity: put },
        });
        await tx.$executeRaw`
            UPDATE inventory_slots
            SET equipment_rarity = ${rarity}
            WHERE id = ${slot.id}
        `;
    }

    return remaining === 0;
}

/**
 * GET /game/market — List all active market listings
 */
export const getListings = async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        await ensureMarketListingRarityColumn();

        const listings = await prisma.marketListing.findMany({
            where: { status: "ACTIVE" },
            include: {
                item: true,
                seller: { select: { id: true, email: true, role: true } },
            },
            orderBy: { created_at: "desc" },
        });

        const rarityById = await getMarketListingRarityMap(listings.map((l) => l.id));

        const payload = listings.map((l) => ({
            ...l,
            equipment_rarity: rarityById.get(l.id) ?? null,
        }));

        res.json({ listings: payload });
    } catch (error) {
        console.error("getListings error:", error);
        res.status(500).json({ error: "Failed to fetch listings" });
    }
};

/**
 * GET /game/market/sales-history — Get sold listing history for current seller
 */
export const getSalesHistory = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        await ensureMarketListingRarityColumn();

        const sales = await prisma.marketListing.findMany({
            where: {
                seller_id: req.userId!,
                status: "SOLD",
            },
            include: {
                item: true,
                buyer: {
                    select: { id: true, email: true, role: true },
                },
            },
            orderBy: { sold_at: "desc" },
            take: 100,
        });

        const rarityById = await getMarketListingRarityMap(sales.map((s) => s.id));

        const history = sales.map((sale) => ({
            id: sale.id,
            item_id: sale.item_id,
            quantity: sale.quantity,
            price: sale.price,
            sold_at: sale.sold_at,
            item: sale.item,
            equipment_rarity: rarityById.get(sale.id) ?? null,
            buyer: sale.buyer,
            buyer_name: sale.buyer?.email?.split("@")[0] ?? "Market Bot",
            total: sale.quantity * sale.price,
        }));

        res.json({ history });
    } catch (error) {
        console.error("getSalesHistory error:", error);
        res.status(500).json({ error: "Failed to fetch sales history" });
    }
};

/**
 * POST /game/market/sell — Create a sell listing from inventory
 * Body: { slotId: number, quantity: number, price: number }
 */
export const createListing = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        await ensureMarketListingRarityColumn();

        const { slotId, quantity, price } = req.body;

        if (!slotId || !quantity || !price || quantity <= 0 || price <= 0) {
            res.status(400).json({ error: "Invalid listing parameters" });
            return;
        }

        const slot = await prisma.inventorySlot.findFirst({
            where: { id: slotId, user_id: req.userId! },
            include: { item: true },
        });

        if (!slot || !slot.item || slot.quantity < quantity) {
            res.status(400).json({ error: "Not enough items in this slot" });
            return;
        }

        const listingRarity = (slot as any).equipment_rarity ?? null;

        // Deduct from inventory
        if (slot.quantity > quantity) {
            await prisma.inventorySlot.update({
                where: { id: slotId },
                data: { quantity: slot.quantity - quantity },
            });
        } else {
            await prisma.inventorySlot.update({
                where: { id: slotId },
                data: { item_id: null, quantity: 0 },
            });
            await prisma.$executeRaw`
                UPDATE inventory_slots
                SET equipment_rarity = NULL
                WHERE id = ${slotId}
            `;
        }

        // Create listing (price is unit price)
        const listing = await prisma.marketListing.create({
            data: {
                seller_id: req.userId!,
                item_id: slot.item.id,
                quantity,
                price,
            },
            include: { item: true },
        });

        await setMarketListingRarity(listing.id, listingRarity);

        const totalValue = quantity * price;

        // Get updated user for response
        const updatedUser = await prisma.user.findUnique({ where: { id: req.userId! } });

        const message = `Listed ${quantity}x ${slot.item.name} at ${price} credits each (total ${totalValue})`;

        res.json({
            message,
            listing: {
                ...listing,
                equipment_rarity: listingRarity,
            },
            expGained: 0,
            levelUp: false,
            user: {
                id: updatedUser!.id,
                email: updatedUser!.email,
                role: updatedUser!.role,
                money: updatedUser!.money,
                hunger: updatedUser!.hunger,
                provider_level: updatedUser!.provider_level,
                provider_exp: updatedUser!.provider_exp,
                chef_level: updatedUser!.chef_level,
                chef_exp: updatedUser!.chef_exp,
            },
        });
    } catch (error) {
        console.error("createListing error:", error);
        res.status(500).json({ error: "Failed to create listing" });
    }
};

/**
 * POST /game/market/buy/:listingId — Buy from a market listing
 * Body: { quantity?: number }
 */
export const buyListing = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        await ensureMarketListingRarityColumn();

        if (typeof req.params.listingId !== 'string') {
            res.status(400).json({ error: "Invalid listing ID" });
            return;
        }
        const listingId = parseInt(req.params.listingId);

        const listing = await prisma.marketListing.findFirst({
            where: { id: listingId, status: "ACTIVE" },
            include: { item: true },
        });

        if (!listing) {
            res.status(404).json({ error: "Listing not found or already sold" });
            return;
        }

        const listingRarity = await getMarketListingRarityById(listing.id);

        if (listing.seller_id === req.userId!) {
            res.status(400).json({ error: "You cannot buy your own listing" });
            return;
        }

        const requestedQtyRaw = Number(req.body?.quantity ?? listing.quantity);
        const requestedQty = Math.max(1, Math.floor(requestedQtyRaw));
        if (!Number.isFinite(requestedQtyRaw) || requestedQty <= 0) {
            res.status(400).json({ error: "Invalid quantity" });
            return;
        }
        if (requestedQty > listing.quantity) {
            res.status(400).json({ error: `Not enough quantity in listing. Available: ${listing.quantity}` });
            return;
        }

        const unitPrice = listing.price;
        const totalCost = unitPrice * requestedQty;

        // Check buyer has enough money
        const buyer = await prisma.user.findUnique({ where: { id: req.userId! } });
        if (!buyer || buyer.money < totalCost) {
            res.status(400).json({ error: "Not enough credits" });
            return;
        }

        await prisma.$transaction(async (tx) => {
            const effects = await getUserEquipmentEffects(req.userId!, tx);
            const effectiveMaxStack = getEffectiveMaxStack(listing.item.type, listing.item.max_stack, effects);

            const placed = await placeItemInInventoryTx(
                tx,
                req.userId!,
                listing.item_id,
                requestedQty,
                effectiveMaxStack,
                listingRarity
            );

            if (!placed) {
                throw new Error("Inventory full!");
            }

            await tx.user.update({
                where: { id: req.userId! },
                data: { money: { decrement: totalCost } },
            });
            await tx.user.update({
                where: { id: listing.seller_id },
                data: { money: { increment: totalCost } },
            });

            if (requestedQty === listing.quantity) {
                await tx.marketListing.update({
                    where: { id: listingId },
                    data: {
                        status: "SOLD",
                        buyer_id: req.userId!,
                        sold_at: new Date(),
                    },
                });
            } else {
                await tx.marketListing.update({
                    where: { id: listingId },
                    data: {
                        quantity: { decrement: requestedQty },
                    },
                });

                // Keep sale history accurate for partial fills
                await tx.marketListing.create({
                    data: {
                        seller_id: listing.seller_id,
                        buyer_id: req.userId!,
                        item_id: listing.item_id,
                        quantity: requestedQty,
                        price: unitPrice,
                        status: "SOLD",
                        sold_at: new Date(),
                    },
                });

                const soldRows = await tx.marketListing.findMany({
                    where: {
                        seller_id: listing.seller_id,
                        buyer_id: req.userId!,
                        item_id: listing.item_id,
                        quantity: requestedQty,
                        price: unitPrice,
                        status: "SOLD",
                    },
                    orderBy: { id: "desc" },
                    take: 1,
                });
                if (soldRows[0]) {
                    await tx.$executeRaw`
                        UPDATE market_listings
                        SET equipment_rarity = ${listingRarity}
                        WHERE id = ${soldRows[0].id}
                    `;
                }
            }
        });

        const updatedUser = await prisma.user.findUnique({ where: { id: req.userId! } });

        res.json({
            message: `Bought ${requestedQty}x ${listing.item.name} for ${totalCost} credits`,
            user: {
                id: updatedUser!.id,
                email: updatedUser!.email,
                role: updatedUser!.role,
                money: updatedUser!.money,
                hunger: updatedUser!.hunger,
                provider_level: updatedUser!.provider_level,
                provider_exp: updatedUser!.provider_exp,
                chef_level: updatedUser!.chef_level,
                chef_exp: updatedUser!.chef_exp,
            },
        });
    } catch (error: any) {
        console.error("buyListing error:", error);
        if (error?.message === "Inventory full!") {
            res.status(400).json({ error: "Inventory full!" });
            return;
        }
        res.status(500).json({ error: "Failed to buy listing" });
    }
};

/**
 * POST /game/market/cancel/:listingId — Cancel own active listing and return items to inventory
 */
export const cancelListing = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        await ensureMarketListingRarityColumn();

        if (typeof req.params.listingId !== "string") {
            res.status(400).json({ error: "Invalid listing ID" });
            return;
        }

        const listingId = parseInt(req.params.listingId);

        const listing = await prisma.marketListing.findFirst({
            where: {
                id: listingId,
                seller_id: req.userId!,
                status: "ACTIVE",
            },
            include: { item: true },
        });

        if (!listing) {
            res.status(404).json({ error: "Active listing not found" });
            return;
        }

        const listingRarity = await getMarketListingRarityById(listing.id);

        await prisma.$transaction(async (tx) => {
            const effects = await getUserEquipmentEffects(req.userId!, tx);
            const effectiveMaxStack = getEffectiveMaxStack(listing.item.type, listing.item.max_stack, effects);

            const placed = await placeItemInInventoryTx(
                tx,
                req.userId!,
                listing.item_id,
                listing.quantity,
                effectiveMaxStack,
                listingRarity
            );

            if (!placed) {
                throw new Error("Inventory full!");
            }

            await tx.marketListing.update({
                where: { id: listing.id },
                data: {
                    status: "CANCELLED",
                    buyer_id: null,
                    sold_at: null,
                },
            });
        });

        const slots = await prisma.inventorySlot.findMany({
            where: { user_id: req.userId! },
            include: { item: true },
            orderBy: { slot: "asc" },
        });

        res.json({
            message: `Cancelled listing and returned ${listing.quantity}x ${listing.item.name}`,
            slots,
        });
    } catch (error: any) {
        console.error("cancelListing error:", error);
        if (error?.message === "Inventory full!") {
            res.status(400).json({ error: "Inventory full! Cannot cancel listing." });
            return;
        }
        res.status(500).json({ error: "Failed to cancel listing" });
    }
};

/**
 * GET /game/market/bot/config — Get market bot config
 */
export const getMarketBotConfig = async (_req: AuthRequest, res: Response): Promise<void> => {
    res.json({ config: marketBotService.getConfig() });
};

/**
 * POST /game/market/bot/config — Update market bot config
 * Body: { enabled?, tickMs?, buyChancePerTick?, maxListingsPerTick?, maxQtyPerListing?, maxUnitPriceRatio?, minListingAgeMs? }
 */
export const updateMarketBotConfig = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { enabled, tickMs, buyChancePerTick, maxListingsPerTick, maxQtyPerListing, maxUnitPriceRatio, minListingAgeMs } = req.body ?? {};

        const config = marketBotService.updateConfig({
            enabled: typeof enabled === "boolean" ? enabled : undefined,
            tickMs: typeof tickMs === "number" ? tickMs : undefined,
            buyChancePerTick: typeof buyChancePerTick === "number" ? buyChancePerTick : undefined,
            maxListingsPerTick: typeof maxListingsPerTick === "number" ? maxListingsPerTick : undefined,
            maxQtyPerListing: typeof maxQtyPerListing === "number" ? maxQtyPerListing : undefined,
            maxUnitPriceRatio: typeof maxUnitPriceRatio === "number" ? maxUnitPriceRatio : undefined,
            minListingAgeMs: typeof minListingAgeMs === "number" ? minListingAgeMs : undefined,
        });

        res.json({ message: "Market bot config updated", config });
    } catch (error) {
        console.error("updateMarketBotConfig error:", error);
        res.status(500).json({ error: "Failed to update market bot config" });
    }
};

/**
 * POST /game/market/bot/tick — Run one bot tick immediately
 */
export const runMarketBotTick = async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        await marketBotService.runTickManually();
        res.json({ message: "Market bot tick executed", config: marketBotService.getConfig() });
    } catch (error) {
        console.error("runMarketBotTick error:", error);
        res.status(500).json({ error: "Failed to execute market bot tick" });
    }
};
