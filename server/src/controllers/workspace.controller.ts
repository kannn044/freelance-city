import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { syncHunger } from "../services/hunger.service";
import {
    type EquipmentRarity,
    getHungerTier,
    getLevelFromExp,
    getProviderSkillPlotCount,
    getProviderSkillTimeReduction,
    HUNGER_TIERS,
} from "../config/game.config";
import { getEffectiveMaxStack, getUserEquipmentEffects } from "../services/equipmentEffects.service";
import { getGameExpConfig, getGameHarvestRarityConfig, getGameTaskTimeConfig } from "../services/gamePricing.service";

interface AuthRequest extends Request {
    userId?: number;
}

// Small tolerance to avoid client/server clock drift causing false "Not ready yet".
const READY_GRACE_MS = 5000;

type ProviderBranch = "VEGETABLE" | "CHICKEN" | "BEEF";

function getProviderBranchBySeedName(seedName: string): ProviderBranch | null {
    if (seedName === "Vegetable Seed") return "VEGETABLE";
    if (seedName === "Chicken Egg") return "CHICKEN";
    if (seedName === "Beef Calf") return "BEEF";
    return null;
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

function applyTierReduction(baseHunger: number, tierReduction: number) {
    const baseTier = getHungerTier(baseHunger);
    const idx = HUNGER_TIERS.findIndex((t) => t.state === baseTier.state);
    if (idx < 0 || tierReduction <= 0) return baseTier;
    const reducedIdx = Math.max(0, idx - Math.floor(tierReduction));
    return HUNGER_TIERS[reducedIdx];
}

const TIERED_HARVEST_ITEM_NAMES = new Set(["Vegetable", "Chicken Meat", "Beef Meat"]);

function isTieredHarvestItem(item: { type: string; name: string }) {
    return item.type === "RAW" && TIERED_HARVEST_ITEM_NAMES.has(item.name);
}

function rollHarvestRarity(dropRates: Record<EquipmentRarity, number>): EquipmentRarity {
    const entries = Object.entries(dropRates) as Array<[EquipmentRarity, number]>;
    const totalWeight = entries.reduce((sum, [, w]) => sum + Math.max(0, Number(w) || 0), 0);
    if (totalWeight <= 0) return "NORMAL";

    let cursor = Math.random() * totalWeight;
    for (const [rarity, weight] of entries) {
        const w = Math.max(0, Number(weight) || 0);
        if (cursor <= w) return rarity;
        cursor -= w;
    }

    return "NORMAL";
}

function splitByHarvestRarity(
    totalQty: number,
    dropRates: Record<EquipmentRarity, number>
): Array<{ rarity: EquipmentRarity; qty: number }> {
    const tally: Record<EquipmentRarity, number> = {
        NORMAL: 0,
        RARE: 0,
        EPIC: 0,
        LEGENDARY: 0,
    };

    for (let i = 0; i < totalQty; i++) {
        tally[rollHarvestRarity(dropRates)] += 1;
    }

    return (Object.entries(tally) as Array<[EquipmentRarity, number]>)
        .filter(([, qty]) => qty > 0)
        .map(([rarity, qty]) => ({ rarity, qty }));
}

type OutputReward = {
    outputItemId: number;
    outputQty: number;
    outputRarity: EquipmentRarity | null;
};

async function getOrderOutput(
    order: { type: "FARM" | "COOK"; item_id: number; quantity: number },
    userId: number,
    db: DbClient,
    harvestDropRates: Record<EquipmentRarity, number>
): Promise<OutputReward[]> {
    const effects = await getUserEquipmentEffects(userId, db);

    if (order.type === "FARM") {
        const seedItem = await db.item.findUnique({ where: { id: order.item_id } });
        if (!seedItem?.yield_item_id) {
            throw new Error("Seed has no yield configured");
        }

        let outputQty = (seedItem.yield_qty ?? 1) * order.quantity;
        if (effects.farmDoubleYieldChance > 0 && Math.random() < effects.farmDoubleYieldChance) {
            outputQty *= 2;
        }

        const outputItem = await db.item.findUnique({ where: { id: seedItem.yield_item_id } });
        if (!outputItem) {
            throw new Error("Output item not found");
        }

        if (isTieredHarvestItem(outputItem)) {
            return splitByHarvestRarity(outputQty, harvestDropRates).map((entry) => ({
                outputItemId: outputItem.id,
                outputQty: entry.qty,
                outputRarity: entry.rarity,
            }));
        }

        return [
            {
                outputItemId: seedItem.yield_item_id,
                outputQty,
                outputRarity: null,
            },
        ];
    }

    let outputQty = order.quantity;
    if (effects.gourmetChance > 0 && Math.random() < effects.gourmetChance) {
        outputQty += 1;
    }

    return [
        {
            outputItemId: order.item_id,
            outputQty,
            outputRarity: null,
        },
    ];
}

async function placeOutputInInventory(
    userId: number,
    outputs: OutputReward[],
    db: DbClient
): Promise<boolean> {
    if (outputs.length === 0) return true;

    const effects = await getUserEquipmentEffects(userId, db);

    const slots = await db.inventorySlot.findMany({
        where: { user_id: userId },
        orderBy: { slot: "asc" },
    });

    const uniqueItemIds = Array.from(new Set(outputs.map((o) => o.outputItemId)));
    const itemMap = new Map<number, { id: number; type: string; max_stack: number }>();
    for (const itemId of uniqueItemIds) {
        const item = await db.item.findUnique({ where: { id: itemId } });
        if (!item) throw new Error("Output item not found");
        itemMap.set(itemId, { id: item.id, type: item.type, max_stack: item.max_stack });
    }

    const draftSlots = slots.map((s) => ({
        id: s.id,
        item_id: s.item_id,
        quantity: s.quantity,
        equipment_rarity: (s as any).equipment_rarity ?? null,
    }));

    for (const output of outputs) {
        if (output.outputQty <= 0) continue;
        const outputItem = itemMap.get(output.outputItemId);
        if (!outputItem) throw new Error("Output item not found");

        const maxStack = getEffectiveMaxStack(outputItem.type as any, outputItem.max_stack, effects);
        const stackCapacity = draftSlots
            .filter((s) => s.item_id === output.outputItemId && (s.equipment_rarity ?? null) === (output.outputRarity ?? null))
            .reduce((sum, s) => sum + Math.max(0, maxStack - s.quantity), 0);
        const emptySlots = draftSlots.filter((s) => s.item_id === null).length;
        const totalCapacity = stackCapacity + emptySlots * maxStack;

        if (totalCapacity < output.outputQty) return false;

        let remaining = output.outputQty;

        for (const slot of draftSlots) {
            if (remaining <= 0) break;
            if (slot.item_id !== output.outputItemId) continue;
            if ((slot.equipment_rarity ?? null) !== (output.outputRarity ?? null)) continue;

            const canAdd = Math.max(0, maxStack - slot.quantity);
            if (canAdd <= 0) continue;

            const add = Math.min(canAdd, remaining);
            remaining -= add;
            slot.quantity += add;
        }

        for (const slot of draftSlots) {
            if (remaining <= 0) break;
            if (slot.item_id !== null) continue;

            const put = Math.min(maxStack, remaining);
            remaining -= put;
            slot.item_id = output.outputItemId;
            slot.quantity = put;
            slot.equipment_rarity = output.outputRarity;
        }
    }

    for (let i = 0; i < slots.length; i++) {
        const prev = slots[i];
        const next = draftSlots[i];
        const prevRarity = (prev as any).equipment_rarity ?? null;
        const nextRarity = next.equipment_rarity ?? null;

        if (
            prev.item_id === next.item_id
            && prev.quantity === next.quantity
            && prevRarity === nextRarity
        ) {
            continue;
        }

        await db.inventorySlot.update({
            where: { id: prev.id },
            data: {
                item_id: next.item_id,
                quantity: next.quantity,
            },
        });
        await db.$executeRaw`
            UPDATE inventory_slots
            SET equipment_rarity = ${nextRarity}
            WHERE id = ${prev.id}
        `;
    }

    return true;
}

async function awardOrderExp(
    userId: number,
    orderType: "FARM" | "COOK",
    outputItem: { exp_value: number; name: string },
    outputQty: number,
    db: DbClient,
    expConfig: { providerWorkExpMultiplier: number; chefWorkExpMultiplier: number }
) {
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("User not found");

    const occupation = orderType === "FARM" ? "provider" : "chef";
    const levelField = occupation === "provider" ? "provider_level" : "chef_level";
    const expField = occupation === "provider" ? "provider_exp" : "chef_exp";

    let expGained = 0;
    let levelUp = false;
    let newLevel = user[levelField];
    const workExpMultiplier = occupation === "provider"
        ? expConfig.providerWorkExpMultiplier
        : expConfig.chefWorkExpMultiplier;

    if (user[levelField] >= 1) {
        expGained = Math.floor(outputItem.exp_value * outputQty * 10 * workExpMultiplier);
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
        const [harvestDropRates, expConfig] = await Promise.all([
            getGameHarvestRarityConfig(),
            getGameExpConfig(),
        ]);

        const order = await tx.workOrder.findFirst({
            where: { id: orderId, user_id: userId, collected: false },
        });

        if (!order) {
            return { ok: false as const, reason: "not_found" as const };
        }

        if (Date.now() + READY_GRACE_MS < order.completes_at.getTime()) {
            return { ok: false as const, reason: "not_ready" as const };
        }

        const outputs = await getOrderOutput(order, userId, tx, harvestDropRates);
        const outputItemId = outputs[0]?.outputItemId;
        const outputQty = outputs.reduce((sum, o) => sum + o.outputQty, 0);
        if (!outputItemId || outputQty <= 0) {
            return { ok: false as const, reason: "output_missing" as const };
        }
        const outputItem = await tx.item.findUnique({ where: { id: outputItemId } });
        if (!outputItem) {
            return { ok: false as const, reason: "output_missing" as const };
        }

        const placed = await placeOutputInInventory(userId, outputs, tx);
        if (!placed) {
            return { ok: false as const, reason: "inventory_full" as const, itemName: outputItem.name, qty: outputQty };
        }

        await tx.workOrder.update({
            where: { id: orderId },
            data: { collected: true },
        });

        const exp = await awardOrderExp(userId, order.type, outputItem, outputQty, tx, {
            providerWorkExpMultiplier: expConfig.providerWorkExpMultiplier,
            chefWorkExpMultiplier: expConfig.chefWorkExpMultiplier,
        });

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
        await syncHunger(req.userId!);

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
        const taskTimeConfig = await getGameTaskTimeConfig();

        const equipmentEffects = await getUserEquipmentEffects(req.userId!);

        if (type === "FARM") {
            // Requires Provider occupation
            if (user.provider_level < 1) {
                res.status(403).json({ error: "You need the Provider occupation to farm" });
                return;
            }

            const activeFarmOrders = await prisma.workOrder.findMany({
                where: {
                    user_id: req.userId!,
                    type: "FARM",
                    collected: false,
                },
                orderBy: { started_at: "asc" },
            });

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

            const branch = getProviderBranchBySeedName(slot.item.name);
            const providerUser = user as any;
            const branchSkillLevel = branch === "VEGETABLE"
                ? Number(providerUser.provider_skill_veg ?? 0)
                : branch === "CHICKEN"
                    ? Number(providerUser.provider_skill_chicken ?? 0)
                    : branch === "BEEF"
                        ? Number(providerUser.provider_skill_beef ?? 0)
                        : 0;

            // Plot limit is controlled by game.config helper.
            // Each plot holds 9 tasks.
            const branchOrders = activeFarmOrders.filter((o) => o.item_id === itemId);
            const maxPlots = getProviderSkillPlotCount(branchSkillLevel);
            const maxOrders = maxPlots * 9;
            if (branchOrders.length >= maxOrders) {
                res.status(400).json({
                    error: `Plot limit reached for ${slot.item.name}. Max ${maxPlots} plot(s) (${maxOrders} tasks).`,
                });
                return;
            }

            // Apply hunger penalty to grow time
            const tier = applyTierReduction(user.hunger, equipmentEffects.hungerPenaltyTierReduction);
            const skillReduction = getProviderSkillTimeReduction(branchSkillLevel);
            const equipmentTimeMultiplier = 1 - equipmentEffects.farmTimeReductionPct;
            const skillTimeMultiplier = 1 - skillReduction;
            const growMins = slot.item.grow_mins
                * tier.multiplier
                * skillTimeMultiplier
                * equipmentTimeMultiplier
                * taskTimeConfig.providerTaskTimeMultiplier;
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
            let order = await prisma.workOrder.create({
                data: {
                    user_id: req.userId!,
                    type: "FARM",
                    item_id: itemId,
                    quantity,
                    completes_at: completesAt,
                },
                include: { item: true },
            });

            let message = `Started farming ${slot.item.name}. Ready in ${Math.ceil(growMins)} minutes.`;

            // 3x3 full-plot bonus per seed type:
            // when same-seed active orders reach a multiple of 9,
            // apply bonus to the newest 9 orders of that seed plot
            const sameSeedFarmOrders = activeFarmOrders.filter((o) => o.item_id === itemId);
            if ((sameSeedFarmOrders.length + 1) % 9 === 0) {
                const now = Date.now();
                const allOrders = [...sameSeedFarmOrders, order];
                const plotOrders = allOrders.slice(-9);
                const remainingMsList = plotOrders.map((o) => Math.max(0, new Date(o.completes_at).getTime() - now));
                const avgRemainingMs = remainingMsList.reduce((sum, ms) => sum + ms, 0) / remainingMsList.length;
                const reducedAvgMs = Math.max(1000, Math.floor(avgRemainingMs * 0.9));
                const bonusCompletesAt = new Date(now + reducedAvgMs);
                const plotIndex = Math.ceil((sameSeedFarmOrders.length + 1) / 9);

                await prisma.workOrder.updateMany({
                    where: { id: { in: plotOrders.map((o) => o.id) } },
                    data: { completes_at: bonusCompletesAt },
                });

                order = await prisma.workOrder.findUnique({
                    where: { id: order.id },
                    include: { item: true },
                }) as typeof order;

                message = `Started farming ${slot.item.name}. Plot ${plotIndex} (9/9) full bonus activated: timers averaged and reduced by 10% (ready in ~${Math.ceil(reducedAvgMs / 60000)} minutes).`;
            }

            res.json({
                message,
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
            for (let idx = 0; idx < recipe.ingredients.length; idx++) {
                const ingredient = recipe.ingredients[idx];
                const isSecondary = idx > 0;
                const savedByEffect = isSecondary
                    && equipmentEffects.cookSecondaryIngredientSaveChance > 0
                    && Math.random() < equipmentEffects.cookSecondaryIngredientSaveChance;

                if (savedByEffect) {
                    continue;
                }

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
            const tier = applyTierReduction(user.hunger, equipmentEffects.hungerPenaltyTierReduction);
            const equipmentCookMultiplier = 1 - equipmentEffects.cookTimeReductionPct;
            const cookMins = recipe.cook_mins
                * tier.multiplier
                * equipmentCookMultiplier
                * taskTimeConfig.chefTaskTimeMultiplier;

            // Chef queue logic: run one menu at a time, FIFO by task creation order.
            const now = new Date();
            const lastPendingCook = await prisma.workOrder.findFirst({
                where: {
                    user_id: req.userId!,
                    type: "COOK",
                    collected: false,
                },
                orderBy: { completes_at: "desc" },
            });

            const startsAt = lastPendingCook && lastPendingCook.completes_at > now
                ? lastPendingCook.completes_at
                : now;
            const completesAt = new Date(startsAt.getTime() + cookMins * 60 * 1000);

            const order = await prisma.workOrder.create({
                data: {
                    user_id: req.userId!,
                    type: "COOK",
                    item_id: recipe.output_item_id,
                    recipe_id: recipeId,
                    quantity: recipe.output_qty,
                    started_at: startsAt,
                    completes_at: completesAt,
                },
                include: { item: true },
            });

            res.json({
                message: startsAt.getTime() > now.getTime()
                    ? `Queued cooking ${recipe.name}. It will start after current menu and finish in ${Math.ceil(cookMins)} minutes once started.`
                    : `Started cooking ${recipe.name}. Ready in ${Math.ceil(cookMins)} minutes.`,
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
        await syncHunger(req.userId!);

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
        await syncHunger(req.userId!);

        const readyOrders = await prisma.workOrder.findMany({
            where: {
                user_id: req.userId!,
                collected: false,
                completes_at: { lte: new Date(Date.now() + READY_GRACE_MS) },
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
