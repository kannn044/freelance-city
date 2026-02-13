import { Request, Response } from "express";
import { prisma } from "../lib/prisma";

interface AuthRequest extends Request {
    userId?: number;
}

const EQUIPMENT_BOX_PRICE = 420;
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

async function addItemToInventory(userId: number, itemId: number, qty: number): Promise<boolean> {
    const item = await prisma.item.findUnique({ where: { id: itemId } });
    if (!item) return false;

    let remaining = qty;
    const slots = await prisma.inventorySlot.findMany({
        where: { user_id: userId },
        orderBy: { slot: "asc" },
    });

    for (const slot of slots) {
        if (remaining <= 0) break;
        if (slot.item_id !== itemId || slot.quantity >= item.max_stack) continue;

        const add = Math.min(item.max_stack - slot.quantity, remaining);
        remaining -= add;
        await prisma.inventorySlot.update({
            where: { id: slot.id },
            data: { quantity: slot.quantity + add },
        });
    }

    for (const slot of slots) {
        if (remaining <= 0) break;
        if (slot.item_id !== null) continue;

        const put = Math.min(item.max_stack, remaining);
        remaining -= put;
        await prisma.inventorySlot.update({
            where: { id: slot.id },
            data: { item_id: itemId, quantity: put },
        });
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

        res.json({ items });
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

        const totalCost = item.buy_price * quantity;

        if (user.money < totalCost) {
            res.status(400).json({ error: `Not enough credits. Need ${totalCost}, have ${user.money}` });
            return;
        }

        // Check stack limit
        if (quantity > item.max_stack) {
            res.status(400).json({ error: `Cannot buy more than ${item.max_stack} at once` });
            return;
        }

        // Find inventory slot (stack existing or use empty slot)
        let targetSlot = await prisma.inventorySlot.findFirst({
            where: {
                user_id: req.userId!,
                item_id: itemId,
                quantity: { lt: item.max_stack },
            },
        });

        if (targetSlot) {
            const newQty = Math.min(targetSlot.quantity + quantity, item.max_stack);
            const actualBuy = newQty - targetSlot.quantity;

            if (actualBuy <= 0) {
                res.status(400).json({ error: "Slot is full. Use another slot." });
                return;
            }

            const actualCost = item.buy_price * actualBuy;

            await prisma.$transaction([
                prisma.user.update({
                    where: { id: req.userId! },
                    data: { money: { decrement: actualCost } },
                }),
                prisma.inventorySlot.update({
                    where: { id: targetSlot.id },
                    data: { quantity: newQty },
                }),
            ]);
        } else {
            // Find empty slot
            targetSlot = await prisma.inventorySlot.findFirst({
                where: { user_id: req.userId!, item_id: null },
            });

            if (!targetSlot) {
                res.status(400).json({ error: "Inventory full!" });
                return;
            }

            await prisma.$transaction([
                prisma.user.update({
                    where: { id: req.userId! },
                    data: { money: { decrement: totalCost } },
                }),
                prisma.inventorySlot.update({
                    where: { id: targetSlot.id },
                    data: { item_id: itemId, quantity },
                }),
            ]);
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
        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }

        const odds = buildEquipmentOdds(user.role);
        res.json({
            box: {
                name: "Equipment Box",
                price: EQUIPMENT_BOX_PRICE,
                description: "Open 1 box to receive 1 random equipment item.",
            },
            formula: {
                roleBias: getRoleBias(user.role),
                slotWeights: SLOT_WEIGHTS,
                note: "Final chance = role_bias x slot_weight",
            },
            odds,
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
        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }

        if (user.money < EQUIPMENT_BOX_PRICE) {
            res.status(400).json({ error: `Not enough credits. Need ${EQUIPMENT_BOX_PRICE}, have ${user.money}` });
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

        const added = await addItemToInventory(req.userId!, Number(rolledItemId), 1);
        if (!added) {
            res.status(400).json({ error: "Inventory full" });
            return;
        }

        await prisma.user.update({
            where: { id: req.userId! },
            data: { money: { decrement: EQUIPMENT_BOX_PRICE } },
        });

        const rolledItem = await prisma.item.findUnique({ where: { id: Number(rolledItemId) } });
        const updatedUser = await prisma.user.findUnique({ where: { id: req.userId! } });
        const slots = await prisma.inventorySlot.findMany({
            where: { user_id: req.userId! },
            include: { item: true },
            orderBy: { slot: "asc" },
        });

        res.json({
            message: `Opened Equipment Box and got ${rolledItem?.name ?? "equipment"}!`,
            boxPrice: EQUIPMENT_BOX_PRICE,
            rolled: {
                role: rolledRole,
                slot: rolledSlot,
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
