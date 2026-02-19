import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { getEffectiveMaxStack, getUserEquipmentEffects } from "../services/equipmentEffects.service";
import { getEffectiveNpcBuyPrice, getGameEquipmentRarityConfig, getGamePricing } from "../services/gamePricing.service";
import { getUserCityProfile } from "../services/city.service";
import { toJobPayload } from "../lib/userPayload";
import {
    EQUIPMENT_RARITY_BUFF_MULTIPLIER,
    getEquipmentRarityBuffMultiplier,
    type EquipmentRarity,
} from "../config/game.config";

interface AuthRequest extends Request {
    userId?: number;
}

const SLOT_WEIGHTS: Record<string, number> = {
    HEAD: 14,
    UPPER_BODY: 18,
    LOWER_BODY: 18,
    ARM: 16,
    GLOVE: 16,
    SHOE: 18,
};

function pickByWeight<T>(entries: Array<{ value: T; weight: number }>): T {
    const total = entries.reduce((sum, e) => sum + e.weight, 0);
    const rand = Math.random() * total;
    let acc = 0;
    for (const e of entries) {
        acc += e.weight;
        if (rand <= acc) return e.value;
    }
    return entries[entries.length - 1].value;
}

async function addItemToInventory(
    userId: number,
    itemId: number,
    qty: number,
    equipmentRarity: EquipmentRarity | null = null,
): Promise<boolean> {
    const item = await prisma.item.findUnique({ where: { id: itemId } });
    if (!item) return false;
    const isEquipment = (item as any).type === "EQUIPMENT";
    const effects = await getUserEquipmentEffects(userId);
    const maxStack = getEffectiveMaxStack(item.type, item.max_stack, effects);

    let remaining = qty;
    const slots = await prisma.inventorySlot.findMany({
        where: { user_id: userId },
        orderBy: { slot: "asc" },
    });

    for (const slot of slots) {
        if (remaining <= 0) break;
        const sameRarity = !isEquipment || (slot as any).equipment_rarity === (equipmentRarity ?? "NORMAL");
        if (slot.item_id !== itemId || slot.quantity >= maxStack || !sameRarity) continue;

        const add = Math.min(maxStack - slot.quantity, remaining);
        remaining -= add;
        await prisma.inventorySlot.update({
            where: { id: slot.id },
            data: { quantity: slot.quantity + add },
        });
    }

    for (const slot of slots) {
        if (remaining <= 0) break;
        if (slot.item_id !== null) continue;

        const put = Math.min(maxStack, remaining);
        remaining -= put;
        await prisma.inventorySlot.update({
            where: { id: slot.id },
            data: { item_id: itemId, quantity: put },
        });
        if (isEquipment) {
            await prisma.$executeRaw`
                UPDATE inventory_slots
                SET equipment_rarity = ${equipmentRarity ?? "NORMAL"}
                WHERE id = ${slot.id}
            `;
        } else {
            await prisma.$executeRaw`
                UPDATE inventory_slots
                SET equipment_rarity = NULL
                WHERE id = ${slot.id}
            `;
        }
    }

    return remaining === 0;
}

async function addItemToInventoryTx(
    tx: Prisma.TransactionClient,
    userId: number,
    itemId: number,
    qty: number,
    maxStack: number,
    equipmentRarity: EquipmentRarity | null = null,
): Promise<boolean> {
    const item = await tx.item.findUnique({ where: { id: itemId } });
    if (!item) return false;
    const isEquipment = (item as any).type === "EQUIPMENT";

    let remaining = qty;
    const slots = await tx.inventorySlot.findMany({
        where: { user_id: userId },
        orderBy: { slot: "asc" },
    });

    // Fill existing stacks first
    for (const slot of slots) {
        if (remaining <= 0) break;
        const sameRarity = !isEquipment || (slot as any).equipment_rarity === (equipmentRarity ?? "NORMAL");
        if (slot.item_id !== itemId || slot.quantity >= maxStack || !sameRarity) continue;

        const add = Math.min(maxStack - slot.quantity, remaining);
        remaining -= add;
        await tx.inventorySlot.update({
            where: { id: slot.id },
            data: { quantity: slot.quantity + add },
        });
    }

    // Use empty slots
    for (const slot of slots) {
        if (remaining <= 0) break;
        if (slot.item_id !== null) continue;

        const put = Math.min(maxStack, remaining);
        remaining -= put;
        await tx.inventorySlot.update({
            where: { id: slot.id },
            data: { item_id: itemId, quantity: put },
        });
        if (isEquipment) {
            await tx.$executeRaw`
                UPDATE inventory_slots
                SET equipment_rarity = ${equipmentRarity ?? "NORMAL"}
                WHERE id = ${slot.id}
            `;
        } else {
            await tx.$executeRaw`
                UPDATE inventory_slots
                SET equipment_rarity = NULL
                WHERE id = ${slot.id}
            `;
        }
    }

    return remaining === 0;
}

function buildEquipmentOdds() {
    const slots = Object.entries(SLOT_WEIGHTS);
    return slots.map(([slot, slotWeight]) => ({
        slot,
        chancePct: Number(slotWeight.toFixed(2)),
    }));
}

function buildRarityOdds(dropRates: Record<EquipmentRarity, number>) {
    return (Object.entries(dropRates) as Array<[EquipmentRarity, number]>).map(([rarity, rate]) => ({
        rarity,
        chancePct: Number((rate * 100).toFixed(4)),
        buffMultiplier: EQUIPMENT_RARITY_BUFF_MULTIPLIER[rarity],
    }));
}

function rollEquipmentRarity(dropRates: Record<EquipmentRarity, number>): EquipmentRarity {
    const pool = (Object.entries(dropRates) as Array<[EquipmentRarity, number]>).map(([value, weight]) => ({
        value,
        weight,
    }));
    return pickByWeight(pool);
}

async function getUnlockedRecipeIds(userId: number): Promise<number[]> {
    const rows = await prisma.$queryRaw<Array<{ recipe_id: number }>>`
        SELECT recipe_id
        FROM user_recipe_unlocks
        WHERE user_id = ${userId}
    `;
    return rows.map((r) => Number(r.recipe_id));
}

async function hasRecipeUnlocked(userId: number, recipeId: number): Promise<boolean> {
    const rows = await prisma.$queryRaw<Array<{ cnt: number | bigint }>>`
        SELECT COUNT(*) as cnt
        FROM user_recipe_unlocks
        WHERE user_id = ${userId} AND recipe_id = ${recipeId}
    `;

    const count = rows[0] ? Number(rows[0].cnt) : 0;
    return count > 0;
}

type ShopItemRuleRow = {
    city_key: string;
    matcher_type: string;
    matcher_value: string;
    required_role: string;
};

type ShopRecipeRuleRow = {
    city_key: string;
    matcher_type: string;
    matcher_value: string;
    required_role: string;
};

let shopCatalogEnsured = false;

function normalizeCityKey(cityKey: string | null | undefined): string {
    const normalized = String(cityKey ?? "").trim().toUpperCase();
    return normalized || "AGRARIA";
}

function getUserRoleTokens(user: {
    first_job_level: number;
    secondary_job_level: number;
}): Set<string> {
    const tokens = new Set<string>(["ANY"]);

    if ((user.first_job_level ?? 0) >= 1) {
        tokens.add("PROVIDER");
    }
    if ((user.secondary_job_level ?? 0) >= 1) {
        tokens.add("CHEF");
    }

    return tokens;
}

function roleRuleMatches(requiredRole: string | null | undefined, userRoles: Set<string>): boolean {
    const required = String(requiredRole ?? "ANY").toUpperCase();
    if (!required || required === "ANY") return true;
    return userRoles.has(required);
}

function sqlLikePatternToRegex(pattern: string): RegExp {
    const escaped = pattern
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        .replace(/%/g, ".*")
        .replace(/_/g, ".");
    return new RegExp(`^${escaped}$`, "i");
}

function itemRuleMatches(item: { id: number; name: string; type: string }, rule: ShopItemRuleRow): boolean {
    const matcherType = String(rule.matcher_type || "").toUpperCase();
    const value = String(rule.matcher_value ?? "");

    if (matcherType === "ITEM_ID") {
        return String(item.id) === value;
    }
    if (matcherType === "ITEM_TYPE") {
        return String(item.type).toUpperCase() === value.toUpperCase();
    }
    if (matcherType === "ITEM_NAME") {
        return item.name.toLowerCase() === value.toLowerCase();
    }
    if (matcherType === "ITEM_NAME_LIKE") {
        return sqlLikePatternToRegex(value).test(item.name);
    }

    return false;
}

function recipeRuleMatches(
    recipe: { id: number; name: string; output_item?: { type: string } | null },
    rule: ShopRecipeRuleRow,
): boolean {
    const matcherType = String(rule.matcher_type || "").toUpperCase();
    const value = String(rule.matcher_value ?? "");

    if (matcherType === "RECIPE_ID") {
        return String(recipe.id) === value;
    }
    if (matcherType === "RECIPE_NAME") {
        return recipe.name.toLowerCase() === value.toLowerCase();
    }
    if (matcherType === "RECIPE_NAME_LIKE") {
        return sqlLikePatternToRegex(value).test(recipe.name);
    }
    if (matcherType === "OUTPUT_ITEM_TYPE") {
        return String(recipe.output_item?.type ?? "").toUpperCase() === value.toUpperCase();
    }

    return false;
}

async function ensureShopCatalogSchemaAndDefaults() {
    if (shopCatalogEnsured) return;
    // Master data is seeded by prisma/seed.ts.
    shopCatalogEnsured = true;
}

async function getCityItemRules(cityKey: string): Promise<ShopItemRuleRow[]> {
    return prisma.$queryRaw<ShopItemRuleRow[]>`
        SELECT city_key, matcher_type, matcher_value, required_role
        FROM city_shop_item_rules
        WHERE city_key = ${cityKey}
          AND is_enabled = 1
    `;
}

async function getCityRecipeRules(cityKey: string): Promise<ShopRecipeRuleRow[]> {
    return prisma.$queryRaw<ShopRecipeRuleRow[]>`
        SELECT city_key, matcher_type, matcher_value, required_role
        FROM city_shop_recipe_rules
        WHERE city_key = ${cityKey}
          AND is_enabled = 1
    `;
}

async function getAllowedShopItemsForUser(
    cityKey: string,
    user: { first_job_level: number; secondary_job_level: number },
) {
    const rules = await getCityItemRules(cityKey);
    const userRoles = getUserRoleTokens(user);

    if (rules.length === 0) {
        const fallbackTypes: string[] = [];
        if (user.first_job_level >= 1) fallbackTypes.push("SEED");
        if (user.secondary_job_level >= 1) fallbackTypes.push("INGREDIENT");
        if (fallbackTypes.length === 0) return [];

        return prisma.item.findMany({
            where: {
                buy_price: { not: null },
                type: { in: fallbackTypes as any },
            },
            orderBy: [{ type: "asc" }, { name: "asc" }],
        });
    }

    const buyableItems = await prisma.item.findMany({
        where: { buy_price: { not: null } },
        orderBy: [{ type: "asc" }, { name: "asc" }],
    });

    return buyableItems.filter((item) =>
        rules.some((rule) => roleRuleMatches(rule.required_role, userRoles) && itemRuleMatches(item as any, rule))
    );
}

async function getAllowedRecipeCatalogForUser(
    cityKey: string,
    user: { first_job_level: number; secondary_job_level: number },
) {
    if (user.secondary_job_level < 1) return [];

    const rules = await getCityRecipeRules(cityKey);
    const userRoles = getUserRoleTokens(user);

    const allRecipes = await prisma.recipe.findMany({
        include: {
            output_item: true,
            ingredients: { include: { item: true } },
        },
        orderBy: ({ unlock_price: "asc" } as any),
    });

    if (rules.length === 0) {
        return allRecipes;
    }

    return allRecipes.filter((recipe) =>
        rules.some((rule) => roleRuleMatches(rule.required_role, userRoles) && recipeRuleMatches(recipe as any, rule))
    );
}

/**
 * GET /game/shop — List items available for purchase from NPC shop
 * Filtered by user's unlocked occupations:
 *   Provider (first_job_level >= 1) → SEED items
 *   Chef (secondary_job_level >= 1) → INGREDIENT items
 */
export const getShop = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        await ensureShopCatalogSchemaAndDefaults();

        const user = await prisma.user.findUnique({ where: { id: req.userId! } }) as any;
        const pricing = await getGamePricing();
        const city = await getUserCityProfile(req.userId!);
        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }

        const cityKey = normalizeCityKey(city.city_key);
        const items = await getAllowedShopItemsForUser(cityKey, {
            first_job_level: Number(user.first_job_level ?? 0),
            secondary_job_level: Number(user.secondary_job_level ?? 0),
        });

        const pricedItems = items.map((item) => ({
            ...item,
            buy_price: getEffectiveNpcBuyPrice(item.buy_price, pricing.npcShopMultiplier),
        }));

        res.json({ items: pricedItems });
    } catch (error) {
        console.error("getShop error:", error);
        res.status(500).json({ error: "Failed to fetch shop" });
    }
};

/**
 * POST /game/shop/buy — Buy items from NPC shop
 * Body: { itemId: number, quantity: number }
 */
export const buyFromShop = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        await ensureShopCatalogSchemaAndDefaults();

        const { itemId, quantity = 1 } = req.body;
        const pricing = await getGamePricing();
        const city = await getUserCityProfile(req.userId!);

        if (!itemId || quantity <= 0) {
            res.status(400).json({ error: "Invalid purchase parameters" });
            return;
        }

        const item = await prisma.item.findUnique({ where: { id: itemId } });
        if (!item || !item.buy_price) {
            res.status(400).json({ error: "Item not available in shop" });
            return;
        }

        // Verify user has the occupation to buy this item type
        const user = await prisma.user.findUnique({ where: { id: req.userId! } }) as any;
        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }

        const cityKey = normalizeCityKey(city.city_key);
        const allowedItems = await getAllowedShopItemsForUser(cityKey, {
            first_job_level: Number(user.first_job_level ?? 0),
            secondary_job_level: Number(user.secondary_job_level ?? 0),
        });

        const isAllowed = allowedItems.some((shopItem) => shopItem.id === item.id);
        if (!isAllowed) {
            res.status(403).json({ error: "This item is not available in your current city NPC Shop." });
            return;
        }

        const effectiveUnitPrice = getEffectiveNpcBuyPrice(item.buy_price, pricing.npcShopMultiplier);
        if (!effectiveUnitPrice) {
            res.status(400).json({ error: "Item not available in shop" });
            return;
        }
        const totalCost = effectiveUnitPrice * quantity;

        if (user.money < totalCost) {
            res.status(400).json({ error: `Not enough credits. Need ${totalCost}, have ${user.money}` });
            return;
        }

        const effects = await getUserEquipmentEffects(req.userId!);
        const effectiveMaxStack = getEffectiveMaxStack(item.type, item.max_stack, effects);

        const purchaseOk = await prisma.$transaction(async (tx) => {
            const placed = await addItemToInventoryTx(tx, req.userId!, itemId, quantity, effectiveMaxStack);
            if (!placed) {
                return false;
            }

            await tx.user.update({
                where: { id: req.userId! },
                data: { money: { decrement: totalCost } },
            });

            return true;
        });

        if (!purchaseOk) {
            res.status(400).json({ error: "Inventory full for requested quantity" });
            return;
        }

        // Return updated data
        const updatedUser = await prisma.user.findUnique({ where: { id: req.userId! } }) as any;
        const slots = await prisma.inventorySlot.findMany({
            where: { user_id: req.userId! },
            include: { item: true },
            orderBy: { slot: "asc" },
        });

        res.json({
            message: `Bought ${quantity}x ${item.name} for ${totalCost} credits`,
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
            slots,
        });
    } catch (error) {
        console.error("buyFromShop error:", error);
        res.status(500).json({ error: "Failed to buy from shop" });
    }
};

/**
 * GET /game/shop/equipment-box — Box info + odds
 */
export const getEquipmentBoxInfo = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const user = await prisma.user.findUnique({ where: { id: req.userId! } }) as any;
        const pricing = await getGamePricing();
        const equipmentDropRates = await getGameEquipmentRarityConfig();
        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }

        const odds = buildEquipmentOdds();
        res.json({
            box: {
                name: "Equipment Box",
                price: pricing.equipmentBoxPrice,
                description: "Open 1 box to receive 1 random equipment item.",
            },
            formula: {
                slotWeights: SLOT_WEIGHTS,
                note: "Final chance = slot_weight",
            },
            odds,
            rarityOdds: buildRarityOdds(equipmentDropRates),
        });
    } catch (error) {
        console.error("getEquipmentBoxInfo error:", error);
        res.status(500).json({ error: "Failed to fetch equipment box info" });
    }
};

/**
 * POST /game/shop/equipment-box/open — Spend credits and roll one equipment
 */
export const openEquipmentBox = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const user = await prisma.user.findUnique({ where: { id: req.userId! } }) as any;
        const pricing = await getGamePricing();
        const equipmentDropRates = await getGameEquipmentRarityConfig();
        const boxPrice = pricing.equipmentBoxPrice;
        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }

        if (user.money < boxPrice) {
            res.status(400).json({ error: `Not enough credits. Need ${boxPrice}, have ${user.money}` });
            return;
        }

        const rolledSlot = pickByWeight(
            Object.entries(SLOT_WEIGHTS).map(([slot, weight]) => ({ value: slot, weight }))
        );

        const candidates = await prisma.$queryRaw<Array<{ id: number }>>`
            SELECT id
            FROM items
            WHERE type = 'EQUIPMENT'
              AND equipment_slot = ${rolledSlot}
        `;

        let rolledItemId = candidates[0]?.id;
        if (!rolledItemId) {
            const fallback = await prisma.$queryRaw<Array<{ id: number }>>`
                SELECT id
                FROM items
                WHERE type = 'EQUIPMENT'
                ORDER BY RAND()
                LIMIT 1
            `;
            rolledItemId = fallback[0]?.id;
        }

        if (!rolledItemId) {
            res.status(500).json({ error: "No equipment configured" });
            return;
        }

        const rolledRarity = rollEquipmentRarity(equipmentDropRates);
        const added = await addItemToInventory(req.userId!, Number(rolledItemId), 1, rolledRarity);
        if (!added) {
            res.status(400).json({ error: "Inventory full" });
            return;
        }

        await prisma.user.update({
            where: { id: req.userId! },
            data: { money: { decrement: boxPrice } },
        });

        const rolledItem = await prisma.item.findUnique({ where: { id: Number(rolledItemId) } });
        const updatedUser = await prisma.user.findUnique({ where: { id: req.userId! } }) as any;
        const slots = await prisma.inventorySlot.findMany({
            where: { user_id: req.userId! },
            include: { item: true },
            orderBy: { slot: "asc" },
        });

        res.json({
            message: `Opened Equipment Box and got ${rolledRarity} ${rolledItem?.name ?? "equipment"}!`,
            boxPrice,
            rolled: {
                slot: rolledSlot,
                rarity: rolledRarity,
                buffMultiplier: getEquipmentRarityBuffMultiplier(rolledRarity),
                item: rolledItem,
            },
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
            slots,
            odds: buildEquipmentOdds(),
            rarityOdds: buildRarityOdds(equipmentDropRates),
        });
    } catch (error) {
        console.error("openEquipmentBox error:", error);
        res.status(500).json({ error: "Failed to open equipment box" });
    }
};

/**
 * GET /game/recipes — List all recipes (for users with Chef occupation)
 */
export const getRecipes = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        await ensureShopCatalogSchemaAndDefaults();

        const user = await prisma.user.findUnique({ where: { id: req.userId! } }) as any;
        if (!user || user.secondary_job_level < 1) {
            res.json({ recipes: [] });
            return;
        }

        const city = await getUserCityProfile(req.userId!);
        const cityKey = normalizeCityKey(city.city_key);
        const allowedCatalog = await getAllowedRecipeCatalogForUser(cityKey, {
            first_job_level: Number(user.first_job_level ?? 0),
            secondary_job_level: Number(user.secondary_job_level ?? 0),
        });
        const allowedRecipeIds = new Set(allowedCatalog.map((r) => r.id));

        const unlockedRecipeIds = await getUnlockedRecipeIds(req.userId!);
        const visibleUnlocked = unlockedRecipeIds.filter((id) => allowedRecipeIds.has(id));

        if (visibleUnlocked.length === 0) {
            res.json({ recipes: [] });
            return;
        }

        const recipes = await prisma.recipe.findMany({
            where: { id: { in: visibleUnlocked } },
            include: {
                output_item: true,
                ingredients: { include: { item: true } },
            },
            orderBy: ({ unlock_price: "asc" } as any),
        });

        res.json({ recipes });
    } catch (error) {
        console.error("getRecipes error:", error);
        res.status(500).json({ error: "Failed to fetch recipes" });
    }
};

/**
 * GET /game/shop/recipes — List locked recipes available to buy from NPC shop
 */
export const getRecipeShop = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        await ensureShopCatalogSchemaAndDefaults();

        const user = await prisma.user.findUnique({ where: { id: req.userId! } }) as any;
        if (!user || user.secondary_job_level < 1) {
            res.json({ recipes: [] });
            return;
        }

        const city = await getUserCityProfile(req.userId!);
        const cityKey = normalizeCityKey(city.city_key);
        const allowedCatalog = await getAllowedRecipeCatalogForUser(cityKey, {
            first_job_level: Number(user.first_job_level ?? 0),
            secondary_job_level: Number(user.secondary_job_level ?? 0),
        });

        const unlockedRecipeIds = await getUnlockedRecipeIds(req.userId!);

        const recipes = allowedCatalog.filter((recipe) => !unlockedRecipeIds.includes(recipe.id));

        res.json({ recipes });
    } catch (error) {
        console.error("getRecipeShop error:", error);
        res.status(500).json({ error: "Failed to fetch recipe shop" });
    }
};

/**
 * POST /game/shop/recipes/buy — Buy and unlock a recipe
 * Body: { recipeId: number }
 */
export const buyRecipeUnlock = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        await ensureShopCatalogSchemaAndDefaults();

        const { recipeId } = req.body as { recipeId?: number };

        if (!recipeId || recipeId <= 0) {
            res.status(400).json({ error: "Invalid recipe ID" });
            return;
        }

        const user = await prisma.user.findUnique({ where: { id: req.userId! } }) as any;
        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }

        if (user.secondary_job_level < 1) {
            res.status(403).json({ error: "You need the Chef occupation to unlock recipes" });
            return;
        }

        const city = await getUserCityProfile(req.userId!);
        const cityKey = normalizeCityKey(city.city_key);
        const allowedCatalog = await getAllowedRecipeCatalogForUser(cityKey, {
            first_job_level: Number(user.first_job_level ?? 0),
            secondary_job_level: Number(user.secondary_job_level ?? 0),
        });
        const allowedRecipeIds = new Set(allowedCatalog.map((r) => r.id));

        const recipe = await prisma.recipe.findUnique({
            where: { id: recipeId },
            include: {
                output_item: true,
                ingredients: { include: { item: true } },
            },
        });

        if (!recipe) {
            res.status(404).json({ error: "Recipe not found" });
            return;
        }

        if (!allowedRecipeIds.has(recipe.id)) {
            res.status(403).json({ error: "This recipe is not available in your current city NPC Shop." });
            return;
        }

        const existing = await hasRecipeUnlocked(req.userId!, recipeId);

        if (existing) {
            res.status(400).json({ error: "Recipe already unlocked" });
            return;
        }

        const unlockPrice = (recipe as any).unlock_price ?? 300;

        if (user.money < unlockPrice) {
            res.status(400).json({ error: `Not enough credits. Need ${unlockPrice}, have ${user.money}` });
            return;
        }

        await prisma.$transaction([
            prisma.user.update({
                where: { id: req.userId! },
                data: { money: { decrement: unlockPrice } },
            }),
            prisma.$executeRaw`
                INSERT INTO user_recipe_unlocks (user_id, recipe_id, unlocked_at)
                VALUES (${req.userId!}, ${recipeId}, NOW())
            `,
        ]);

        const updatedUser = await prisma.user.findUnique({ where: { id: req.userId! } }) as any;

        res.json({
            message: `Unlocked recipe: ${recipe.name} for ${unlockPrice} credits`,
            recipe,
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
        console.error("buyRecipeUnlock error:", error);
        res.status(500).json({ error: "Failed to unlock recipe" });
    }
};
