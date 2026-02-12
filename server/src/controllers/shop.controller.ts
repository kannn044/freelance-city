import { Request, Response } from "express";
import { prisma } from "../lib/prisma";

interface AuthRequest extends Request {
    userId?: number;
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

        const recipes = await prisma.recipe.findMany({
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
