import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { syncHunger } from "../services/hunger.service";
import { getHungerTier, getLevelFromExp } from "../config/game.config";

interface AuthRequest extends Request {
    userId?: number;
}

/**
 * GET /game/workspace — Get active work orders
 */
export const getWorkOrders = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const orders = await prisma.workOrder.findMany({
            where: { user_id: req.userId!, collected: false },
            include: { item: true },
            orderBy: { started_at: "desc" },
        });

        res.json({ orders });
    } catch (error) {
        console.error("getWorkOrders error:", error);
        res.status(500).json({ error: "Failed to fetch work orders" });
    }
};

/**
 * POST /game/workspace/start — Start a farm or cook task
 * Body: { type: "FARM", itemId: number, quantity?: number }
 *    or { type: "COOK", recipeId: number }
 */
export const startWork = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { type, itemId, recipeId, quantity = 1 } = req.body;
        const user = await syncHunger(req.userId!);

        if (type === "FARM") {
            // Requires Provider occupation
            if (user.provider_level < 1) {
                res.status(403).json({ error: "You need the Provider occupation to farm" });
                return;
            }

            // Find the seed item in inventory
            const slot = await prisma.inventorySlot.findFirst({
                where: {
                    user_id: req.userId!,
                    item_id: itemId,
                    quantity: { gte: quantity },
                },
                include: { item: true },
            });

            if (!slot || !slot.item) {
                res.status(400).json({ error: "You don't have enough of this seed" });
                return;
            }

            if (slot.item.type !== "SEED" || !slot.item.grow_mins) {
                res.status(400).json({ error: "This item cannot be farmed" });
                return;
            }

            // Apply hunger penalty to grow time
            const tier = getHungerTier(user.hunger);
            const growMins = slot.item.grow_mins * tier.multiplier;
            const completesAt = new Date(Date.now() + growMins * 60 * 1000);

            // Reduce seed from inventory
            if (slot.quantity > quantity) {
                await prisma.inventorySlot.update({
                    where: { id: slot.id },
                    data: { quantity: slot.quantity - quantity },
                });
            } else {
                await prisma.inventorySlot.update({
                    where: { id: slot.id },
                    data: { item_id: null, quantity: 0 },
                });
            }

            // Create work order
            const order = await prisma.workOrder.create({
                data: {
                    user_id: req.userId!,
                    type: "FARM",
                    item_id: itemId,
                    quantity,
                    completes_at: completesAt,
                },
                include: { item: true },
            });

            res.json({
                message: `Started farming ${slot.item.name}. Ready in ${Math.ceil(growMins)} minutes.`,
                order,
            });
        } else if (type === "COOK") {
            // Requires Chef occupation
            if (user.chef_level < 1) {
                res.status(403).json({ error: "You need the Chef occupation to cook" });
                return;
            }

            // Find recipe
            const recipe = await prisma.recipe.findUnique({
                where: { id: recipeId },
                include: {
                    ingredients: { include: { item: true } },
                    output_item: true,
                },
            });

            if (!recipe) {
                res.status(400).json({ error: "Recipe not found" });
                return;
            }

            // Check all ingredients in inventory
            const userSlots = await prisma.inventorySlot.findMany({
                where: { user_id: req.userId! },
                include: { item: true },
            });

            for (const ingredient of recipe.ingredients) {
                const totalQty = userSlots
                    .filter((s) => s.item_id === ingredient.item_id)
                    .reduce((sum, s) => sum + s.quantity, 0);

                if (totalQty < ingredient.quantity) {
                    res.status(400).json({
                        error: `Not enough ${ingredient.item.name}. Need ${ingredient.quantity}, have ${totalQty}`,
                    });
                    return;
                }
            }

            // Deduct ingredients from inventory
            for (const ingredient of recipe.ingredients) {
                let remaining = ingredient.quantity;
                for (const slot of userSlots) {
                    if (slot.item_id !== ingredient.item_id || remaining <= 0) continue;

                    const take = Math.min(slot.quantity, remaining);
                    remaining -= take;

                    if (slot.quantity - take > 0) {
                        await prisma.inventorySlot.update({
                            where: { id: slot.id },
                            data: { quantity: slot.quantity - take },
                        });
                        slot.quantity -= take;
                    } else {
                        await prisma.inventorySlot.update({
                            where: { id: slot.id },
                            data: { item_id: null, quantity: 0 },
                        });
                        slot.quantity = 0;
                        slot.item_id = null;
                    }
                }
            }

            // Apply hunger penalty to cook time
            const tier = getHungerTier(user.hunger);
            const cookMins = recipe.cook_mins * tier.multiplier;
            const completesAt = new Date(Date.now() + cookMins * 60 * 1000);

            const order = await prisma.workOrder.create({
                data: {
                    user_id: req.userId!,
                    type: "COOK",
                    item_id: recipe.output_item_id,
                    recipe_id: recipeId,
                    quantity: recipe.output_qty,
                    completes_at: completesAt,
                },
                include: { item: true },
            });

            res.json({
                message: `Started cooking ${recipe.name}. Ready in ${Math.ceil(cookMins)} minutes.`,
                order,
            });
        } else {
            res.status(400).json({ error: 'Invalid work type. Use "FARM" or "COOK"' });
        }
    } catch (error) {
        console.error("startWork error:", error);
        res.status(500).json({ error: "Failed to start work" });
    }
};

/**
 * POST /game/workspace/collect/:orderId — Collect completed work
 */
export const collectWork = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        if (typeof req.params.orderId !== 'string') {
            res.status(400).json({ error: "Invalid order ID" });
            return;
        }
        const orderId = parseInt(req.params.orderId);
        const order = await prisma.workOrder.findFirst({
            where: { id: orderId, user_id: req.userId!, collected: false },
            include: { item: true },
        });

        if (!order) {
            res.status(404).json({ error: "Work order not found" });
            return;
        }

        if (new Date() < order.completes_at) {
            const remaining = Math.ceil(
                (order.completes_at.getTime() - Date.now()) / (1000 * 60)
            );
            res.status(400).json({ error: `Not ready yet. ${remaining} minutes remaining.` });
            return;
        }

        // Determine output item
        let outputItemId: number;
        let outputQty: number;

        if (order.type === "FARM") {
            const seedItem = await prisma.item.findUnique({
                where: { id: order.item_id },
            });
            if (!seedItem?.yield_item_id) {
                res.status(500).json({ error: "Seed has no yield configured" });
                return;
            }
            outputItemId = seedItem.yield_item_id;
            outputQty = (seedItem.yield_qty ?? 1) * order.quantity;
        } else {
            outputItemId = order.item_id;
            outputQty = order.quantity;
        }

        // Find a slot to put the output
        const outputItem = await prisma.item.findUnique({ where: { id: outputItemId } });
        if (!outputItem) {
            res.status(500).json({ error: "Output item not found" });
            return;
        }

        // Try to stack into existing slot with same item
        let placed = false;
        const existingSlot = await prisma.inventorySlot.findFirst({
            where: {
                user_id: req.userId!,
                item_id: outputItemId,
                quantity: { lt: outputItem.max_stack },
            },
        });

        if (existingSlot) {
            const newQty = Math.min(existingSlot.quantity + outputQty, outputItem.max_stack);
            await prisma.inventorySlot.update({
                where: { id: existingSlot.id },
                data: { quantity: newQty },
            });
            placed = true;
        }

        if (!placed) {
            // Find empty slot
            const emptySlot = await prisma.inventorySlot.findFirst({
                where: { user_id: req.userId!, item_id: null },
            });

            if (!emptySlot) {
                res.status(400).json({ error: "Inventory full! Free up a slot first." });
                return;
            }

            await prisma.inventorySlot.update({
                where: { id: emptySlot.id },
                data: { item_id: outputItemId, quantity: outputQty },
            });
        }

        // Mark order as collected
        await prisma.workOrder.update({
            where: { id: orderId },
            data: { collected: true },
        });

        // ─── Award EXP ──────────────────────────────────────
        const user = await prisma.user.findUnique({ where: { id: req.userId! } });
        if (!user) {
            res.status(500).json({ error: "User not found" });
            return;
        }

        const occupation = order.type === "FARM" ? "provider" : "chef";
        const levelField = occupation === "provider" ? "provider_level" : "chef_level";
        const expField = occupation === "provider" ? "provider_exp" : "chef_exp";

        let expMessage = "";
        let levelUpMessage = "";

        // Only award EXP if the occupation is unlocked (level >= 1)
        if (user[levelField] >= 1) {
            const expGained = Math.floor(outputItem.exp_value * outputQty * 10);

            if (expGained > 0) {
                const oldLevel = user[levelField];
                const newExp = user[expField] + expGained;
                const newLevel = getLevelFromExp(newExp);
                const levelUp = newLevel > oldLevel;

                const updateData: Record<string, number> = {
                    [expField]: newExp,
                    [levelField]: newLevel,
                };

                await prisma.user.update({
                    where: { id: req.userId! },
                    data: updateData,
                });

                expMessage = ` (+${expGained} EXP)`;
                if (levelUp) {
                    levelUpMessage = ` 🎉 Level up! Now Lvl ${newLevel}!` + levelUpMessage;
                }
            }
        }

        // Return updated inventory + user
        const slots = await prisma.inventorySlot.findMany({
            where: { user_id: req.userId! },
            include: { item: true },
            orderBy: { slot: "asc" },
        });

        const updatedUser = await prisma.user.findUnique({ where: { id: req.userId! } });

        res.json({
            message: `Collected ${outputQty}x ${outputItem.name}!${expMessage}${levelUpMessage}`,
            slots,
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
                satiety_buff: updatedUser!.satiety_buff,
            },
        });
    } catch (error) {
        console.error("collectWork error:", error);
        res.status(500).json({ error: "Failed to collect work" });
    }
};
