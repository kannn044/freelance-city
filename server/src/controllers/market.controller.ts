import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { marketBotService } from "../services/marketBot.service";
import { getEffectiveMaxStack, getUserEquipmentEffects } from "../services/equipmentEffects.service";
import type { EquipmentRarity } from "../config/game.config";
import { applyMarketTradeTaxTx, computeMarketTradeTaxTx } from "../services/city.service";
import { ensureCitySchema } from "../services/city.service";
import { toJobPayload } from "../lib/userPayload";

interface AuthRequest extends Request {
    userId?: number;
}

let marketListingRarityColumnEnsured = false;

// Simple response cache for getListings (shared across all clients)
let listingsCache: { data: any; expiresAt: number } | null = null;
const LISTINGS_CACHE_TTL_MS = 5000; // 5 seconds

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

async function getSellerCityMap(userIds: number[]) {
    await ensureCitySchema(prisma);
    const safeIds = userIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0);
    if (safeIds.length === 0) {
        return new Map<number, { city_key: string | null; city_name: string | null }>();
    }

    const rows = await prisma.$queryRawUnsafe<Array<{
        id: number;
        city_key: string | null;
        city_name: string | null;
    }>>(
        `
        SELECT u.id, u.city_key, cs.display_name AS city_name
        FROM users u
        LEFT JOIN city_states cs ON BINARY cs.city_key = BINARY u.city_key
        WHERE u.id IN (${safeIds.join(",")})
        `
    );

    const map = new Map<number, { city_key: string | null; city_name: string | null }>();
    for (const row of rows) {
        map.set(Number(row.id), {
            city_key: row.city_key ?? null,
            city_name: row.city_name ?? null,
        });
    }

    return map;
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
 * Uses a single JOIN query + 5s response cache.
 */
export const getListings = async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        // Return cached response if still fresh
        const now = Date.now();
        if (listingsCache && now < listingsCache.expiresAt) {
            res.json(listingsCache.data);
            return;
        }

        await ensureMarketListingRarityColumn();
        await ensureCitySchema(prisma);

        // Single query with JOINs instead of 3 sequential queries
        const rows = await prisma.$queryRawUnsafe<Array<{
            id: number;
            seller_id: number;
            item_id: number;
            quantity: number;
            price: number;
            status: string;
            created_at: Date;
            equipment_rarity: string | null;
            // item fields
            i_id: number;
            i_name: string;
            i_type: string;
            i_equipment_slot: string | null;
            i_effect_key: string | null;
            i_effect_value: number | null;
            i_effect_value2: number | null;
            i_buy_price: number | null;
            i_sell_price: number | null;
            i_kcal: number | null;
            i_buff_pct: number | null;
            i_buff_mins: number | null;
            i_max_stack: number;
            i_grow_mins: number | null;
            i_icon: string;
            i_exp_value: number;
            // seller fields
            s_id: number;
            s_email: string;
            s_role: string;
            // city fields
            city_key: string | null;
            city_name: string | null;
        }>>(`
            SELECT
                ml.id, ml.seller_id, ml.item_id, ml.quantity, ml.price, ml.status,
                ml.created_at, ml.equipment_rarity,
                i.id AS i_id, i.name AS i_name, i.type AS i_type,
                i.equipment_slot AS i_equipment_slot,
                i.effect_key AS i_effect_key, i.effect_value AS i_effect_value,
                i.effect_value2 AS i_effect_value2,
                i.buy_price AS i_buy_price, i.sell_price AS i_sell_price,
                i.kcal AS i_kcal, i.buff_pct AS i_buff_pct, i.buff_mins AS i_buff_mins,
                i.max_stack AS i_max_stack, i.grow_mins AS i_grow_mins,
                i.icon AS i_icon, i.exp_value AS i_exp_value,
                u.id AS s_id, u.email AS s_email, u.role AS s_role,
                u.city_key, cs.display_name AS city_name
            FROM market_listings ml
            JOIN items i ON i.id = ml.item_id
            JOIN users u ON u.id = ml.seller_id
            LEFT JOIN city_states cs ON BINARY cs.city_key = BINARY u.city_key
            WHERE ml.status = 'ACTIVE'
            ORDER BY ml.created_at DESC
        `);

        const payload = rows.map((r) => ({
            id: Number(r.id),
            seller_id: Number(r.seller_id),
            item_id: Number(r.item_id),
            quantity: Number(r.quantity),
            price: Number(r.price),
            status: r.status,
            created_at: r.created_at,
            equipment_rarity: r.equipment_rarity ?? null,
            item: {
                id: Number(r.i_id),
                name: r.i_name,
                type: r.i_type,
                equipment_slot: r.i_equipment_slot ?? null,
                effect_key: r.i_effect_key ?? null,
                effect_value: r.i_effect_value != null ? Number(r.i_effect_value) : null,
                effect_value2: r.i_effect_value2 != null ? Number(r.i_effect_value2) : null,
                buy_price: r.i_buy_price != null ? Number(r.i_buy_price) : null,
                sell_price: r.i_sell_price != null ? Number(r.i_sell_price) : null,
                kcal: r.i_kcal != null ? Number(r.i_kcal) : null,
                buff_pct: r.i_buff_pct != null ? Number(r.i_buff_pct) : null,
                buff_mins: r.i_buff_mins != null ? Number(r.i_buff_mins) : null,
                max_stack: Number(r.i_max_stack),
                grow_mins: r.i_grow_mins != null ? Number(r.i_grow_mins) : null,
                icon: r.i_icon,
                exp_value: Number(r.i_exp_value),
            },
            seller: {
                id: Number(r.s_id),
                email: r.s_email,
                role: r.s_role,
                city_key: r.city_key ?? null,
                city_name: r.city_name ?? null,
            },
        }));

        const responseData = { listings: payload };
        listingsCache = { data: responseData, expiresAt: Date.now() + LISTINGS_CACHE_TTL_MS };
        res.json(responseData);
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
        const updatedUser = await prisma.user.findUnique({ where: { id: req.userId! } }) as any;

        const message = `Listed ${quantity}x ${slot.item.name} at ${price} credits each (total ${totalValue})`;

        listingsCache = null; // Invalidate cache on mutation
        res.json({
            message,
            listing: {
                ...listing,
                equipment_rarity: listingRarity,
            },
            expGained: 0,
            levelUp: false,
            user: toJobPayload({
                id: updatedUser!.id,
                email: updatedUser!.email,
                role: updatedUser!.role,
                money: updatedUser!.money,
                hunger: updatedUser!.hunger,
                first_job_level: updatedUser!.first_job_level,
                first_job_exp: updatedUser!.first_job_exp,
                secondary_job_level: updatedUser!.secondary_job_level,
                secondary_job_exp: updatedUser!.secondary_job_exp,
            }),
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
        const tradeValue = unitPrice * requestedQty;

        const taxPreview = await computeMarketTradeTaxTx(
            prisma,
            listing.seller_id,
            req.userId!,
            tradeValue,
        );
        const totalCost = taxPreview.buyerPays;

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

            const tax = await computeMarketTradeTaxTx(
                tx,
                listing.seller_id,
                req.userId!,
                tradeValue,
            );

            await tx.user.update({
                where: { id: req.userId! },
                data: { money: { decrement: totalCost } },
            });
            await tx.user.update({
                where: { id: listing.seller_id },
                data: { money: { increment: tax.sellerReceives } },
            });
            await applyMarketTradeTaxTx(tx, tax);

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

        const updatedUser = await prisma.user.findUnique({ where: { id: req.userId! } }) as any;

        const taxText = taxPreview.totalTax > 0
            ? ` (tax ${taxPreview.totalTax}, net to seller ${taxPreview.sellerReceives})`
            : "";

        listingsCache = null; // Invalidate cache on mutation
        res.json({
            message: `Bought ${requestedQty}x ${listing.item.name} for ${totalCost} credits${taxText}`,
            user: toJobPayload({
                id: updatedUser!.id,
                email: updatedUser!.email,
                role: updatedUser!.role,
                money: updatedUser!.money,
                hunger: updatedUser!.hunger,
                first_job_level: updatedUser!.first_job_level,
                first_job_exp: updatedUser!.first_job_exp,
                secondary_job_level: updatedUser!.secondary_job_level,
                secondary_job_exp: updatedUser!.secondary_job_exp,
            }),
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

        listingsCache = null; // Invalidate cache on mutation
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
 * Body: {
 *   enabled?, tickMs?,
 *   buyChancePerTick?, maxListingsPerTick?, maxQtyPerListing?, maxUnitPriceRatio?, minListingAgeMs?,
 *   sellChancePerTick?, maxSellListingsPerTick?, maxSellersPerItem?,
 *   sellMinQtyPerListing?, sellMaxQtyPerListing?,
 *   sellUnitPriceMinRatio?, sellUnitPriceMaxRatio?,
 *   sellItemNames?,
 *   sellFeedCooldownMs?, maxActiveBotListingsTotal?, maxBotUsers?
 * }
 */
export const updateMarketBotConfig = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const {
            enabled,
            tickMs,
            buyChancePerTick,
            maxListingsPerTick,
            maxQtyPerListing,
            maxUnitPriceRatio,
            minListingAgeMs,
            sellChancePerTick,
            maxSellListingsPerTick,
            maxSellersPerItem,
            sellMinQtyPerListing,
            sellMaxQtyPerListing,
            sellUnitPriceMinRatio,
            sellUnitPriceMaxRatio,
            sellItemNames,
            sellFeedCooldownMs,
            maxActiveBotListingsTotal,
            maxBotUsers,
        } = req.body ?? {};

        const config = marketBotService.updateConfig({
            enabled: typeof enabled === "boolean" ? enabled : undefined,
            tickMs: typeof tickMs === "number" ? tickMs : undefined,
            buyChancePerTick: typeof buyChancePerTick === "number" ? buyChancePerTick : undefined,
            maxListingsPerTick: typeof maxListingsPerTick === "number" ? maxListingsPerTick : undefined,
            maxQtyPerListing: typeof maxQtyPerListing === "number" ? maxQtyPerListing : undefined,
            maxUnitPriceRatio: typeof maxUnitPriceRatio === "number" ? maxUnitPriceRatio : undefined,
            minListingAgeMs: typeof minListingAgeMs === "number" ? minListingAgeMs : undefined,
            sellChancePerTick: typeof sellChancePerTick === "number" ? sellChancePerTick : undefined,
            maxSellListingsPerTick: typeof maxSellListingsPerTick === "number" ? maxSellListingsPerTick : undefined,
            maxSellersPerItem: typeof maxSellersPerItem === "number" ? maxSellersPerItem : undefined,
            sellMinQtyPerListing: typeof sellMinQtyPerListing === "number" ? sellMinQtyPerListing : undefined,
            sellMaxQtyPerListing: typeof sellMaxQtyPerListing === "number" ? sellMaxQtyPerListing : undefined,
            sellUnitPriceMinRatio: typeof sellUnitPriceMinRatio === "number" ? sellUnitPriceMinRatio : undefined,
            sellUnitPriceMaxRatio: typeof sellUnitPriceMaxRatio === "number" ? sellUnitPriceMaxRatio : undefined,
            sellItemNames: Array.isArray(sellItemNames)
                ? sellItemNames.map((n) => String(n))
                : undefined,
            sellFeedCooldownMs: typeof sellFeedCooldownMs === "number" ? sellFeedCooldownMs : undefined,
            maxActiveBotListingsTotal: typeof maxActiveBotListingsTotal === "number" ? maxActiveBotListingsTotal : undefined,
            maxBotUsers: typeof maxBotUsers === "number" ? maxBotUsers : undefined,
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
