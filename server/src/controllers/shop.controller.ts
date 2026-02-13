import { Request, Response } from "express";
import { prisma } from "../lib/prisma";

interface AuthRequest extends Request {
    userId?: number;
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

        // Build filter based on unlocked occupations
        const typeFilters: string[] = [];
        if (user.provider_level >= 1) typeFilters.push("SEED");
        if (user.chef_level >= 1) typeFilters.push("INGREDIENT");

        if (typeFilters.length === 0) {
            res.json({ items: [] });
            return;
        }

        const items = await prisma.item.findMany({
            where: {
                buy_price: { not: null },
                type: { in: typeFilters as any },
            },
            orderBy: { type: "asc" },
        });

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
