import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { getEffectiveMaxStack, getUserEquipmentEffects } from "../services/equipmentEffects.service";
import { getEffectiveNpcBuyPrice, getGameEquipmentRarityConfig, getGamePricing } from "../services/gamePricing.service";
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

function getRoleBias(userRole: string) {
    if (userRole === "PROVIDER") return { PROVIDER: 0.7, CHEF: 0.3 };
    if (userRole === "CHEF") return { PROVIDER: 0.3, CHEF: 0.7 };
    return { PROVIDER: 0.5, CHEF: 0.5 };
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

function buildEquipmentOdds(userRole: string) {
    const roleBias = getRoleBias(userRole);
    const slots = Object.entries(SLOT_WEIGHTS);
    return slots.flatMap(([slot, slotWeight]) => [
        {
            role: "PROVIDER",
            slot,
            chancePct: Number(((slotWeight / 100) * roleBias.PROVIDER * 100).toFixed(2)),
        },
        {
            role: "CHEF",
            slot,
            chancePct: Number(((slotWeight / 100) * roleBias.CHEF * 100).toFixed(2)),
        },
    ]);
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

/**
 * GET /game/shop — List items available for purchase from NPC shop
 * Filtered by user's unlocked occupations:
 *   Provider (provider_level >= 1) → SEED items
 *   Chef (chef_level >= 1) → INGREDIENT items
 */
export const getShop = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const user = await prisma.user.findUnique({ where: { id: req.userId! } });
        const pricing = await getGamePricing();
        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }

        const canProvider = user.provider_level >= 1;
        const canChef = user.chef_level >= 1;

        if (!canProvider && !canChef) {
            res.json({ items: [] });
            return;
        }

        const normalTypes: string[] = [];
        if (canProvider) normalTypes.push("SEED");
        if (canChef) normalTypes.push("INGREDIENT");

        const items = normalTypes.length
            ? await prisma.item.findMany({
                where: {
                    buy_price: { not: null },
                    type: { in: normalTypes as any },
                },
                orderBy: { type: "asc" },
            })
            : [];

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
        const { itemId, quantity = 1 } = req.body;
        const pricing = await getGamePricing();

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
        const user = await prisma.user.findUnique({ where: { id: req.userId! } });
        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }

        if (item.type === "SEED" && user.provider_level < 1) {
            res.status(403).json({ error: "You need the Provider occupation to buy seeds" });
            return;
        }
        if (item.type === "INGREDIENT" && user.chef_level < 1) {
            res.status(403).json({ error: "You need the Chef occupation to buy ingredients" });
            return;
        }
        if ((item as any).type === "EQUIPMENT") {
            res.status(400).json({ error: "Equipment cannot be bought directly. Use Equipment Box." });
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
        const updatedUser = await prisma.user.findUnique({ where: { id: req.userId! } });
        const slots = await prisma.inventorySlot.findMany({
            where: { user_id: req.userId! },
            include: { item: true },
            orderBy: { slot: "asc" },
        });

        res.json({
            message: `Bought ${quantity}x ${item.name} for ${totalCost} credits`,
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
        const user = await prisma.user.findUnique({ where: { id: req.userId! } });
        const pricing = await getGamePricing();
        const equipmentDropRates = await getGameEquipmentRarityConfig();
        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }

        const odds = buildEquipmentOdds(user.role);
        res.json({
            box: {
                name: "Equipment Box",
                price: pricing.equipmentBoxPrice,
                description: "Open 1 box to receive 1 random equipment item.",
            },
            formula: {
                roleBias: getRoleBias(user.role),
                slotWeights: SLOT_WEIGHTS,
                note: "Final chance = role_bias x slot_weight",
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
        const user = await prisma.user.findUnique({ where: { id: req.userId! } });
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

        const roleBias = getRoleBias(user.role);
        const rolledRole = pickByWeight([
            { value: "PROVIDER" as const, weight: roleBias.PROVIDER },
            { value: "CHEF" as const, weight: roleBias.CHEF },
        ]);
        const rolledSlot = pickByWeight(
            Object.entries(SLOT_WEIGHTS).map(([slot, weight]) => ({ value: slot, weight }))
        );

        const candidates = await prisma.$queryRaw<Array<{ id: number }>>`
            SELECT id
            FROM items
            WHERE type = 'EQUIPMENT'
              AND equipment_role = ${rolledRole}
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
        const updatedUser = await prisma.user.findUnique({ where: { id: req.userId! } });
        const slots = await prisma.inventorySlot.findMany({
            where: { user_id: req.userId! },
            include: { item: true },
            orderBy: { slot: "asc" },
        });

        res.json({
            message: `Opened Equipment Box and got ${rolledRarity} ${rolledItem?.name ?? "equipment"}!`,
            boxPrice,
            rolled: {
                role: rolledRole,
                slot: rolledSlot,
                rarity: rolledRarity,
                buffMultiplier: getEquipmentRarityBuffMultiplier(rolledRarity),
                item: rolledItem,
            },
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
            slots,
            odds: buildEquipmentOdds(user.role),
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
        const user = await prisma.user.findUnique({ where: { id: req.userId! } });
        if (!user || user.chef_level < 1) {
            res.json({ recipes: [] });
            return;
        }

        const unlockedRecipeIds = await getUnlockedRecipeIds(req.userId!);

        if (unlockedRecipeIds.length === 0) {
            res.json({ recipes: [] });
            return;
        }

        const recipes = await prisma.recipe.findMany({
            where: { id: { in: unlockedRecipeIds } },
            include: {
                output_item: true,
                ingredients: { include: { item: true } },
            },
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
        const user = await prisma.user.findUnique({ where: { id: req.userId! } });
        if (!user || user.chef_level < 1) {
            res.json({ recipes: [] });
            return;
        }

        const unlockedRecipeIds = await getUnlockedRecipeIds(req.userId!);

        const recipes = await prisma.recipe.findMany({
            where: unlockedRecipeIds.length > 0 ? { id: { notIn: unlockedRecipeIds } } : undefined,
            include: {
                output_item: true,
                ingredients: { include: { item: true } },
            },
            orderBy: ({ unlock_price: "asc" } as any),
        });

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
        const { recipeId } = req.body as { recipeId?: number };

        if (!recipeId || recipeId <= 0) {
            res.status(400).json({ error: "Invalid recipe ID" });
            return;
        }

        const user = await prisma.user.findUnique({ where: { id: req.userId! } });
        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }

        if (user.chef_level < 1) {
            res.status(403).json({ error: "You need the Chef occupation to unlock recipes" });
            return;
        }

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

        const updatedUser = await prisma.user.findUnique({ where: { id: req.userId! } });

        res.json({
            message: `Unlocked recipe: ${recipe.name} for ${unlockPrice} credits`,
            recipe,
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
        console.error("buyRecipeUnlock error:", error);
        res.status(500).json({ error: "Failed to unlock recipe" });
    }
};
