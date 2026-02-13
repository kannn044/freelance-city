import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { syncHunger } from "../services/hunger.service";
import { getHungerTier, getLevelFromExp } from "../config/game.config";

interface AuthRequest extends Request {
    userId?: number;
}

async function isRecipeUnlocked(userId: number, recipeId: number): Promise<boolean> {
    const rows = await prisma.$queryRaw<Array<{ cnt: number | bigint }>>`
        SELECT COUNT(*) as cnt
        FROM user_recipe_unlocks
        WHERE user_id = ${userId} AND recipe_id = ${recipeId}
    `;
    const count = rows[0] ? Number(rows[0].cnt) : 0;
    return count > 0;
}

type DbClient = Prisma.TransactionClient | typeof prisma;

async function getOrderOutput(order: { type: "FARM" | "COOK"; item_id: number; quantity: number }, db: DbClient) {
    if (order.type === "FARM") {
        const seedItem = await db.item.findUnique({ where: { id: order.item_id } });
        if (!seedItem?.yield_item_id) {
            throw new Error("Seed has no yield configured");
        }
        return {
            outputItemId: seedItem.yield_item_id,
            outputQty: (seedItem.yield_qty ?? 1) * order.quantity,
        };
    }

    return {
        outputItemId: order.item_id,
        outputQty: order.quantity,
    };
}

async function placeOutputInInventory(
    userId: number,
    outputItemId: number,
    outputQty: number,
    db: DbClient
): Promise<boolean> {
    const outputItem = await db.item.findUnique({ where: { id: outputItemId } });
    if (!outputItem) throw new Error("Output item not found");

    const slots = await db.inventorySlot.findMany({
        where: { user_id: userId },
        orderBy: { slot: "asc" },
    });

    const maxStack = outputItem.max_stack;
    const stackCapacity = slots
        .filter((s) => s.item_id === outputItemId)
        .reduce((sum, s) => sum + Math.max(0, maxStack - s.quantity), 0);
    const emptySlots = slots.filter((s) => s.item_id === null).length;
    const totalCapacity = stackCapacity + emptySlots * maxStack;

    if (totalCapacity < outputQty) return false;

    let remaining = outputQty;

    // Fill existing stacks first
    for (const slot of slots) {
        if (remaining <= 0) break;
        if (slot.item_id !== outputItemId) continue;

        const canAdd = Math.max(0, maxStack - slot.quantity);
        if (canAdd <= 0) continue;

        const add = Math.min(canAdd, remaining);
        remaining -= add;

        await db.inventorySlot.update({
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

        await db.inventorySlot.update({
            where: { id: slot.id },
            data: { item_id: outputItemId, quantity: put },
        });
    }

    return remaining === 0;
}

async function awardOrderExp(
    userId: number,
    orderType: "FARM" | "COOK",
    outputItem: { exp_value: number; name: string },
    outputQty: number,
    db: DbClient
) {
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("User not found");

    const occupation = orderType === "FARM" ? "provider" : "chef";
    const levelField = occupation === "provider" ? "provider_level" : "chef_level";
    const expField = occupation === "provider" ? "provider_exp" : "chef_exp";

    let expGained = 0;
    let levelUp = false;
    let newLevel = user[levelField];

    if (user[levelField] >= 1) {
        expGained = Math.floor(outputItem.exp_value * outputQty * 10);
        if (expGained > 0) {
            const newExp = user[expField] + expGained;
            newLevel = getLevelFromExp(newExp);
            levelUp = newLevel > user[levelField];

            const updateData: Record<string, number> = {
                [expField]: newExp,
                [levelField]: newLevel,
            };

            await db.user.update({
                where: { id: userId },
                data: updateData,
            });
        }
    }

    return { expGained, levelUp, newLevel };
}

async function collectSingleReadyOrder(userId: number, orderId: number) {
    return prisma.$transaction(async (tx) => {
        const order = await tx.workOrder.findFirst({
            where: { id: orderId, user_id: userId, collected: false },
        });

        if (!order) {
            return { ok: false as const, reason: "not_found" as const };
        }

        if (new Date() < order.completes_at) {
            return { ok: false as const, reason: "not_ready" as const };
        }

        const { outputItemId, outputQty } = await getOrderOutput(order, tx);
        const outputItem = await tx.item.findUnique({ where: { id: outputItemId } });
        if (!outputItem) {
            return { ok: false as const, reason: "output_missing" as const };
        }

        const placed = await placeOutputInInventory(userId, outputItemId, outputQty, tx);
        if (!placed) {
            return { ok: false as const, reason: "inventory_full" as const, itemName: outputItem.name, qty: outputQty };
        }

        await tx.workOrder.update({
            where: { id: orderId },
            data: { collected: true },
        });

        const exp = await awardOrderExp(userId, order.type, outputItem, outputQty, tx);

        return {
            ok: true as const,
            itemName: outputItem.name,
            qty: outputQty,
            expGained: exp.expGained,
            levelUp: exp.levelUp,
            newLevel: exp.newLevel,
        };
    });
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

            const recipeUnlocked = await isRecipeUnlocked(req.userId!, recipeId);

            if (!recipeUnlocked) {
                res.status(403).json({ error: "Recipe is locked. Buy it from NPC recipe shop first" });
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
        const result = await collectSingleReadyOrder(req.userId!, orderId);

        if (!result.ok) {
            if (result.reason === "not_found") {
                res.status(404).json({ error: "Work order not found" });
                return;
            }
            if (result.reason === "not_ready") {
                res.status(400).json({ error: "Not ready yet." });
                return;
            }
            if (result.reason === "inventory_full") {
                res.status(400).json({ error: `Inventory full. Not enough space for ${result.qty}x ${result.itemName}.` });
                return;
            }
            res.status(500).json({ error: "Failed to collect work" });
            return;
        }

        const expMessage = result.expGained > 0 ? ` (+${result.expGained} EXP)` : "";
        const levelUpMessage = result.levelUp ? ` 🎉 Level up! Now Lvl ${result.newLevel}!` : "";

        // Return updated inventory + user
        const slots = await prisma.inventorySlot.findMany({
            where: { user_id: req.userId! },
            include: { item: true },
            orderBy: { slot: "asc" },
        });

        const updatedUser = await prisma.user.findUnique({ where: { id: req.userId! } });

        res.json({
            message: `Collected ${result.qty}x ${result.itemName}!${expMessage}${levelUpMessage}`,
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

/**
 * POST /game/workspace/collect-ready — Collect all ready orders if inventory has space
 */
export const collectReadyWork = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const readyOrders = await prisma.workOrder.findMany({
            where: {
                user_id: req.userId!,
                collected: false,
                completes_at: { lte: new Date() },
            },
            orderBy: { completes_at: "asc" },
        });

        if (readyOrders.length === 0) {
            res.json({ message: "No ready orders to collect." });
            return;
        }

        let collectedCount = 0;
        let blockedByInventory: string | null = null;

        for (const order of readyOrders) {
            const result = await collectSingleReadyOrder(req.userId!, order.id);
            if (!result.ok) {
                if (result.reason === "inventory_full") {
                    blockedByInventory = `Stopped: not enough inventory space for ${result.qty}x ${result.itemName}.`;
                    break;
                }
                continue;
            }
            collectedCount += 1;
        }

        const slots = await prisma.inventorySlot.findMany({
            where: { user_id: req.userId! },
            include: { item: true },
            orderBy: { slot: "asc" },
        });

        const updatedUser = await prisma.user.findUnique({ where: { id: req.userId! } });

        const message = collectedCount > 0
            ? `Collected ${collectedCount} ready order(s).${blockedByInventory ? ` ${blockedByInventory}` : ""}`
            : blockedByInventory ?? "No orders were collected.";

        res.json({
            message,
            collectedCount,
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
        console.error("collectReadyWork error:", error);
        res.status(500).json({ error: "Failed to collect ready work" });
    }
};
