import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { syncHunger } from "../services/hunger.service";
import {
    type EquipmentRarity,
    getSecondaryJobSkillConcurrentCookSlots,
    getSecondaryJobSkillCookTimeReduction,
    getSecondaryJobSkillPrimarySaveChance,
    getSecondaryJobSkillSecondarySaveChance,
    getHungerTier,
    getLevelFromExp,
    getFirstJobSkillPlotCount,
    getFirstJobSkillTimeReduction,
    HUNGER_TIERS,
    resolveCookMealRarityByPair,
} from "../config/game.config";
import { getEffectiveMaxStack, getUserEquipmentEffects } from "../services/equipmentEffects.service";
import { getFerrumMiningConfig, getGameExpConfig, getGameHarvestRarityConfig, getGameTaskTimeConfig } from "../services/gamePricing.service";
import { getUserCityProfile } from "../services/city.service";
import { reconcileWorkspaceOrderPausesForUser, validateWorkspaceRequirements } from "../services/workspaceRules.service";
import { toJobPayload } from "../lib/userPayload";
import { syncDurability, getBrokenEquipmentSlots } from "../services/durability.service";

interface AuthRequest extends Request {
    userId?: number;
}

type IngredientSelectionInput = {
    slotId: number;
    quantity: number;
};

// Small tolerance to avoid client/server clock drift causing false "Not ready yet".
const READY_GRACE_MS = 5000;

// All supported work types
type WorkType = "FARM" | "COOK" | "MINE" | "SMELT" | "EXTRACT" | "REFINE" | "GATHER" | "SEW" | "FORAGE" | "BREW";

const FIRST_JOB_WORK_TYPES = new Set<WorkType>(["FARM", "MINE", "EXTRACT", "GATHER", "FORAGE"]);
const SECONDARY_JOB_WORK_TYPES = new Set<WorkType>(["COOK", "SMELT", "REFINE", "SEW", "BREW"]);
const ALL_WORK_TYPES = new Set<WorkType>([...FIRST_JOB_WORK_TYPES, ...SECONDARY_JOB_WORK_TYPES]);

function isFirstJobWorkType(type: string): type is WorkType {
    return FIRST_JOB_WORK_TYPES.has(type as WorkType);
}
function isSecondaryJobWorkType(type: string): type is WorkType {
    return SECONDARY_JOB_WORK_TYPES.has(type as WorkType);
}
function isValidWorkType(type: string): type is WorkType {
    return ALL_WORK_TYPES.has(type as WorkType);
}

let workOrderRarityColumnEnsured = false;

const MINING_PERMIT_NAME = "Ferrum Mining Permit";
type MiningLayer = "SURFACE" | "DEEP" | "CORE";

const LAYER_CODE: Record<MiningLayer, number> = {
    SURFACE: 1,
    DEEP: 2,
    CORE: 3,
};

function codeToLayer(code: number | null | undefined): MiningLayer {
    if (code === 2) return "DEEP";
    if (code === 3) return "CORE";
    return "SURFACE";
}

async function ensureWorkOrderRarityColumn() {
    if (workOrderRarityColumnEnsured) return;

    const rows = await prisma.$queryRaw<Array<{ cnt: number | bigint }>>`
        SELECT COUNT(*) as cnt
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'work_orders'
          AND COLUMN_NAME = 'output_rarity'
    `;

    const exists = Number(rows[0]?.cnt ?? 0) > 0;
    if (!exists) {
        await prisma.$executeRawUnsafe(`
            ALTER TABLE work_orders
            ADD COLUMN output_rarity ENUM('NORMAL','RARE','EPIC','LEGENDARY') NULL
        `);
    }

    workOrderRarityColumnEnsured = true;
}

type SecondaryJobSkillLevels = {
    prep: number;
    economy: number;
    market: number;
};

type BranchLevels = {
    branch1: number;
    branch2: number;
    branch3: number;
};

async function getJobBranchLevels(
    userId: number,
    jobSlot: "first_job" | "secondary_job",
    db: DbClient = prisma,
): Promise<BranchLevels> {
    const rows = await db.$queryRaw<Array<{ branch_slot: number; level: number }>>`
        SELECT b.branch_slot,
               COALESCE(usp.level, 0) as level
        FROM user_job_progress ujp
        JOIN occupation_skill_branch_catalog b
          ON b.occupation_key = ujp.occupation_key
        LEFT JOIN user_skill_progress usp
          ON usp.user_id = ujp.user_id
         AND usp.job_slot = ujp.job_slot
         AND usp.branch_key = b.branch_key
        WHERE ujp.user_id = ${userId}
          AND ujp.job_slot = ${jobSlot}
        ORDER BY b.branch_slot ASC
    `;

    if (rows.length <= 0) {
        return { branch1: 0, branch2: 0, branch3: 0 };
    }

    const bySlot = new Map<number, number>();
    for (const row of rows) {
        bySlot.set(Number(row.branch_slot ?? 0), Number(row.level ?? 0));
    }

    return {
        branch1: Number(bySlot.get(1) ?? 0),
        branch2: Number(bySlot.get(2) ?? 0),
        branch3: Number(bySlot.get(3) ?? 0),
    };
}

async function getSecondaryJobSkillLevels(userId: number, db: DbClient = prisma): Promise<SecondaryJobSkillLevels> {
    const levels = await getJobBranchLevels(userId, "secondary_job", db);
    return {
        prep: levels.branch1,
        economy: levels.branch2,
        market: levels.branch3,
    };
}

async function setWorkOrderOutputRarity(orderId: number, rarity: EquipmentRarity | null, db: DbClient = prisma) {
    await ensureWorkOrderRarityColumn();
    await db.$executeRaw`
        UPDATE work_orders
        SET output_rarity = ${rarity}
        WHERE id = ${orderId}
    `;
}

async function getWorkOrderOutputRarity(orderId: number, db: DbClient = prisma): Promise<EquipmentRarity | null> {
    await ensureWorkOrderRarityColumn();
    const rows = await db.$queryRaw<Array<{ output_rarity: EquipmentRarity | null }>>`
        SELECT output_rarity
        FROM work_orders
        WHERE id = ${orderId}
        LIMIT 1
    `;
    return rows[0]?.output_rarity ?? null;
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

async function ensureFerrumCatalog(db: DbClient = prisma) {
    const getItemByName = async (name: string) => {
        const item = await db.item.findUnique({ where: { name } });
        if (!item) {
            throw new Error(`Missing master data item: ${name}. Please run prisma seed.`);
        }
        return item;
    };

    const miningPermit = await getItemByName(MINING_PERMIT_NAME);
    const ironOre = await getItemByName("Iron Ore");
    const copperOre = await getItemByName("Copper Ore");
    const steelOre = await getItemByName("Steel Ore");
    const stone = await getItemByName("Stone");
    const coal = await getItemByName("Coal");
    const gem = await getItemByName("Gem");

    return {
        miningPermitId: miningPermit.id,
        oreItemIds: {
            ironOreId: ironOre.id,
            copperOreId: copperOre.id,
            steelOreId: steelOre.id,
            stoneId: stone.id,
            coalId: coal.id,
            gemId: gem.id,
        },
    };
}

type DbClient = Prisma.TransactionClient | typeof prisma;

function applyTierReduction(baseHunger: number, tierReduction: number) {
    const baseTier = getHungerTier(baseHunger);
    const idx = HUNGER_TIERS.findIndex((t) => t.state === baseTier.state);
    if (idx < 0 || tierReduction <= 0) return baseTier;
    const reducedIdx = Math.max(0, idx - Math.floor(tierReduction));
    return HUNGER_TIERS[reducedIdx];
}

const TIERED_HARVEST_ITEM_NAMES = new Set(["Vegetable", "Chicken Meat", "Beef Meat", "Medicinal Herb", "Luminous Mushroom", "Chemical Ore", "Raw Cotton", "Sheep Wool"]);

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

type WeightedItemDrop = {
    itemId: number;
    weight: number;
};

function randomIntInclusive(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function rollWeightedItemId(weights: WeightedItemDrop[]): number {
    const totalWeight = weights.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);
    if (totalWeight <= 0) {
        return weights[0]?.itemId ?? 0;
    }

    let cursor = Math.random() * totalWeight;
    for (const entry of weights) {
        const w = Math.max(0, entry.weight);
        if (cursor <= w) return entry.itemId;
        cursor -= w;
    }

    return weights[weights.length - 1]?.itemId ?? 0;
}

function buildExtractStoneOutputs(
    harvestDropRates: Record<EquipmentRarity, number>,
    oreWeights: WeightedItemDrop[]
): OutputReward[] {
    const totalQty = randomIntInclusive(1, 5);
    const tally = new Map<number, number>();

    for (let i = 0; i < totalQty; i++) {
        const itemId = rollWeightedItemId(oreWeights);
        if (itemId <= 0) continue;
        tally.set(itemId, (tally.get(itemId) ?? 0) + 1);
    }

    const outputs: OutputReward[] = [];
    for (const [itemId, qty] of tally.entries()) {
        const raritySplits = splitByHarvestRarity(qty, harvestDropRates);
        for (const split of raritySplits) {
            outputs.push({
                outputItemId: itemId,
                outputQty: split.qty,
                outputRarity: split.rarity,
            });
        }
    }

    if (outputs.length === 0 && oreWeights.length > 0) {
        outputs.push({
            outputItemId: oreWeights[0].itemId,
            outputQty: 1,
            outputRarity: rollHarvestRarity(harvestDropRates),
        });
    }

    return outputs;
}

function getBlacksmithAlloyMasteryBonusChance(level: number): number {
    if (level >= 4) return 0.15;
    if (level >= 3) return 0.10;
    if (level >= 2) return 0.06;
    if (level >= 1) return 0.03;
    return 0;
}

type OutputReward = {
    outputItemId: number;
    outputQty: number;
    outputRarity: EquipmentRarity | null;
};

type OutputSummary = {
    itemId: number;
    itemName: string;
    qty: number;
};

function formatOutputSummary(summary: OutputSummary[]): string {
    if (summary.length <= 0) return "Unknown output";
    return summary
        .map((entry) => `${entry.qty}x ${entry.itemName}`)
        .join(", ");
}

async function getOrderOutput(
    order: { id: number; type: WorkType; item_id: number; quantity: number; recipe_id?: number | null },
    userId: number,
    db: DbClient,
    harvestDropRates: Record<EquipmentRarity, number>
): Promise<OutputReward[]> {
    const ferrumCatalog = await ensureFerrumCatalog(db);
    const effects = await getUserEquipmentEffects(userId, db);

    if ((order.type === "FARM" || order.type === "MINE") && order.item_id === ferrumCatalog.miningPermitId) {
        const miningConfig = await getFerrumMiningConfig();
        const rows = await db.$queryRaw<Array<{ recipe_id: number | null }>>`
            SELECT recipe_id
            FROM work_orders
            WHERE id = ${order.id}
            LIMIT 1
        `;
        const layer = codeToLayer(rows[0]?.recipe_id ?? 1);
        const drop = layer === "SURFACE"
            ? miningConfig.dropRates.surface
            : layer === "DEEP"
                ? miningConfig.dropRates.deep
                : miningConfig.dropRates.core;

        const outputs: OutputReward[] = [];
        const rollQty = (chance: number, min = 1, max = 1) => (Math.random() < chance ? min + Math.floor(Math.random() * (max - min + 1)) : 0);

        const pushTiered = (itemId: number, qty: number) => {
            if (qty <= 0) return;
            const splits = splitByHarvestRarity(qty, harvestDropRates);
            for (const s of splits) {
                outputs.push({
                    outputItemId: itemId,
                    outputQty: s.qty,
                    outputRarity: s.rarity,
                });
            }
        };

        const ironQty = rollQty(drop.ironOre, 1, 2);
        const copperQty = rollQty(drop.copperOre, 1, 2);
        const steelQty = rollQty(drop.steelOre, 1, 1);
        const stoneQty = rollQty(drop.stone, 1, 2);
        const coalQty = rollQty(drop.coal, 1, 2);
        const gemQty = rollQty(drop.gem, 1, 1);

        pushTiered(ferrumCatalog.oreItemIds.ironOreId, ironQty);
        pushTiered(ferrumCatalog.oreItemIds.copperOreId, copperQty);
        pushTiered(ferrumCatalog.oreItemIds.steelOreId, steelQty);
        pushTiered(ferrumCatalog.oreItemIds.stoneId, stoneQty);
        pushTiered(ferrumCatalog.oreItemIds.coalId, coalQty);
        pushTiered(ferrumCatalog.oreItemIds.gemId, gemQty);

        if (outputs.length === 0) {
            pushTiered(ferrumCatalog.oreItemIds.stoneId, 1);
        }

        return outputs;
    }

    if (isFirstJobWorkType(order.type)) {
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

    if (!isSecondaryJobWorkType(order.type)) {
        throw new Error(`Unsupported work type for output resolution: ${order.type}`);
    }

    const cookedItem = await db.item.findUnique({ where: { id: order.item_id } });
    if (!cookedItem) {
        throw new Error("Cook output item not found");
    }

    if (order.recipe_id) {
        const recipe = await db.recipe.findUnique({
            where: { id: order.recipe_id },
            select: { name: true },
        });

        if (recipe?.name === "Extract stone") {
            return buildExtractStoneOutputs(harvestDropRates, [
                { itemId: ferrumCatalog.oreItemIds.copperOreId, weight: 70 },
                { itemId: ferrumCatalog.oreItemIds.ironOreId, weight: 20 },
                { itemId: ferrumCatalog.oreItemIds.steelOreId, weight: 10 },
            ]);
        }
    }

    let outputQty = order.quantity;
    if (effects.gourmetChance > 0 && Math.random() < effects.gourmetChance) {
        outputQty += 1;
    }

    const city = await getUserCityProfile(userId);
    if (String(city.city_key ?? "").toUpperCase() === "FERRUM") {
        const skill = await getSecondaryJobSkillLevels(userId, db);
        const bonusChance = getBlacksmithAlloyMasteryBonusChance(skill.market);
        if (bonusChance > 0 && Math.random() < bonusChance) {
            outputQty += 1;
        }
    }

    // Chef meal rarity follows harvest drop-rate profile for consistent tier economy.
    if (cookedItem.type === "MEAL") {
        const hintedRarity = await getWorkOrderOutputRarity(order.id, db);
        if (hintedRarity) {
            return [
                {
                    outputItemId: cookedItem.id,
                    outputQty,
                    outputRarity: hintedRarity,
                },
            ];
        }

        return splitByHarvestRarity(outputQty, harvestDropRates).map((entry) => ({
            outputItemId: cookedItem.id,
            outputQty: entry.qty,
            outputRarity: entry.rarity,
        }));
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
    orderType: WorkType,
    outputRewards: Array<{ expValue: number; qty: number }>,
    db: DbClient,
    expConfig: { firstJobWorkExpMultiplier: number; secondaryJobWorkExpMultiplier: number }
) {
    if (!isValidWorkType(orderType)) {
        return { expGained: 0, levelUp: false, newLevel: 0, secondaryJobUnlocked: false };
    }

    const userRows = await db.$queryRaw<Array<{
        first_job_level: number;
        first_job_exp: number;
        secondary_job_level: number;
        secondary_job_exp: number;
    }>>`
        SELECT first_job_level, first_job_exp, secondary_job_level, secondary_job_exp
        FROM users
        WHERE id = ${userId}
        LIMIT 1
    `;
    const user = userRows[0];
    if (!user) throw new Error("User not found");

    const occupation = isFirstJobWorkType(orderType) ? "first_job" : "secondary_job";
    const currentLevel = occupation === "first_job"
        ? Number(user.first_job_level ?? 0)
        : Number(user.secondary_job_level ?? 0);
    const currentExp = occupation === "first_job"
        ? Number(user.first_job_exp ?? 0)
        : Number(user.secondary_job_exp ?? 0);

    let expGained = 0;
    let levelUp = false;
    let newLevel = currentLevel;
    let secondaryJobUnlocked = false;
    const workExpMultiplier = occupation === "first_job"
        ? expConfig.firstJobWorkExpMultiplier
        : expConfig.secondaryJobWorkExpMultiplier;

    if (currentLevel >= 1) {
        const expBase = outputRewards.reduce((sum, reward) => {
            const expValue = Number(reward.expValue ?? 0);
            const qty = Number(reward.qty ?? 0);
            if (expValue <= 0 || qty <= 0) return sum;
            return sum + expValue * qty;
        }, 0);

        expGained = Math.floor(expBase * 10 * workExpMultiplier);
        if (expGained > 0) {
            const newExp = currentExp + expGained;
            newLevel = getLevelFromExp(newExp);
            levelUp = newLevel > currentLevel;

            if (occupation === "first_job") {
                await db.$executeRaw`
                    UPDATE users
                    SET first_job_exp = ${newExp},
                        first_job_level = ${newLevel}
                    WHERE id = ${userId}
                `;
            } else {
                await db.$executeRaw`
                    UPDATE users
                    SET secondary_job_exp = ${newExp},
                        secondary_job_level = ${newLevel}
                    WHERE id = ${userId}
                `;
            }

            if (occupation === "first_job" && newLevel >= 5 && user.secondary_job_level < 1) {
                const cityRows = await db.$queryRaw<Array<{ city_key: string | null }>>`
                    SELECT city_key
                    FROM users
                    WHERE id = ${userId}
                    LIMIT 1
                `;
                const cityKey = cityRows[0]?.city_key ?? null;

                const SECONDARY_JOB_STARTER_RECIPES: Record<string, string[]> = {
                    FERRUM: ["Iron Ingot Smelt", "Copper Ingot Smelt", "Steel Ingot Smelt", "Extract stone"],
                    TEXTILIS: ["Sew Fiber Hood", "Sew Cargo Shorts", "Sew Wool Mittens"],
                    MEDICO: ["Healing Potion", "Growth Elixir"],
                };

                const starterRecipeNames = SECONDARY_JOB_STARTER_RECIPES[cityKey ?? ""] ?? [];
                if (starterRecipeNames.length > 0 || cityKey === "AGRARIA" || cityKey === "VOLTARA") {
                    await db.$executeRaw`
                        UPDATE users
                        SET secondary_job_level = 1
                        WHERE id = ${userId}
                    `;

                    if (starterRecipeNames.length > 0) {
                        const starterRecipes = await db.recipe.findMany({
                            where: { name: { in: starterRecipeNames } },
                            select: { id: true },
                        });
                        for (const r of starterRecipes) {
                            await db.userRecipeUnlock.upsert({
                                where: { user_id_recipe_id: { user_id: userId, recipe_id: r.id } },
                                update: {},
                                create: { user_id: userId, recipe_id: r.id },
                            });
                        }
                    }

                    secondaryJobUnlocked = true;
                }
            }
        }
    }

    return { expGained, levelUp, newLevel, secondaryJobUnlocked };
}

async function getUserJobPayloadRow(userId: number, db: DbClient = prisma) {
    const rows = await db.$queryRaw<Array<{
        id: number;
        email: string;
        role: string;
        money: number;
        hunger: number;
        satiety_buff: number;
        first_job_level: number;
        first_job_exp: number;
        secondary_job_level: number;
        secondary_job_exp: number;
    }>>`
        SELECT id, email, role, money, hunger, satiety_buff,
               first_job_level, first_job_exp, secondary_job_level, secondary_job_exp
        FROM users
        WHERE id = ${userId}
        LIMIT 1
    `;
    return rows[0] ?? null;
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
        const outputQty = outputs.reduce((sum, o) => sum + o.outputQty, 0);
        if (outputQty <= 0) {
            return { ok: false as const, reason: "output_missing" as const };
        }

        const outputByItemId = new Map<number, number>();
        for (const output of outputs) {
            if (output.outputQty <= 0) continue;
            outputByItemId.set(output.outputItemId, (outputByItemId.get(output.outputItemId) ?? 0) + output.outputQty);
        }

        const itemIds = Array.from(outputByItemId.keys());
        const outputItems = itemIds.length > 0
            ? await tx.item.findMany({
                where: { id: { in: itemIds } },
                select: { id: true, name: true, exp_value: true },
            })
            : [];

        if (outputItems.length <= 0) {
            return { ok: false as const, reason: "output_missing" as const };
        }

        const itemById = new Map(outputItems.map((item) => [item.id, item]));
        const outputSummary: OutputSummary[] = itemIds
            .map((id) => {
                const item = itemById.get(id);
                if (!item) return null;
                return {
                    itemId: id,
                    itemName: item.name,
                    qty: Number(outputByItemId.get(id) ?? 0),
                } satisfies OutputSummary;
            })
            .filter((entry): entry is OutputSummary => entry !== null && entry.qty > 0)
            .sort((a, b) => b.qty - a.qty || a.itemName.localeCompare(b.itemName));

        if (outputSummary.length <= 0) {
            return { ok: false as const, reason: "output_missing" as const };
        }

        const outputSummaryText = formatOutputSummary(outputSummary);
        const primaryOutput = outputSummary[0];

        const placed = await placeOutputInInventory(userId, outputs, tx);
        if (!placed) {
            return { ok: false as const, reason: "inventory_full" as const, itemName: primaryOutput.itemName, qty: outputQty };
        }

        await tx.workOrder.update({
            where: { id: orderId },
            data: { collected: true },
        });

        const exp = await awardOrderExp(
            userId,
            order.type,
            outputSummary.map((entry) => {
                const item = itemById.get(entry.itemId);
                return {
                    expValue: Number(item?.exp_value ?? 0),
                    qty: entry.qty,
                };
            }),
            tx,
            {
                firstJobWorkExpMultiplier: expConfig.firstJobWorkExpMultiplier,
                secondaryJobWorkExpMultiplier: expConfig.secondaryJobWorkExpMultiplier,
            }
        );

        return {
            ok: true as const,
            itemName: primaryOutput.itemName,
            qty: outputQty,
            outputSummaryText,
            expGained: exp.expGained,
            levelUp: exp.levelUp,
            newLevel: exp.newLevel,
            blacksmithUnlocked: exp.secondaryJobUnlocked,
        };
    });
}

async function buildCancelRefundOutputs(
    order: { type: WorkType; item_id: number; quantity: number; recipe_id: number | null },
    db: DbClient,
): Promise<OutputReward[]> {
    if (!isValidWorkType(order.type)) {
        return [];
    }

    if (isFirstJobWorkType(order.type)) {
        const ferrumCatalog = await ensureFerrumCatalog(db);
        if (order.item_id === ferrumCatalog.miningPermitId) {
            return [];
        }
        return [{ outputItemId: order.item_id, outputQty: Math.max(1, order.quantity), outputRarity: null }];
    }

    if (!order.recipe_id) {
        throw new Error("Recipe is missing on COOK order");
    }

    const recipe = await db.recipe.findUnique({
        where: { id: order.recipe_id },
        include: { ingredients: true },
    });

    if (!recipe) {
        throw new Error("Recipe not found for this order");
    }

    return recipe.ingredients
        .filter((ing) => ing.quantity > 0)
        .map((ing) => ({
            outputItemId: ing.item_id,
            outputQty: ing.quantity,
            outputRarity: null,
        }));
}

async function rescheduleSecondaryJobQueueAfterCancel(userId: number, db: DbClient) {
    const now = Date.now();
    const secondaryJobSkills = await getSecondaryJobSkillLevels(userId, db);
    const maxParallel = Math.max(1, getSecondaryJobSkillConcurrentCookSlots(secondaryJobSkills.prep));
    const remaining = await db.workOrder.findMany({
        where: {
            user_id: userId,
            type: { in: ["COOK", "SMELT", "REFINE", "SEW", "BREW"] },
            collected: false,
        },
        orderBy: [{ started_at: "asc" }, { id: "asc" }],
    });

    if (remaining.length === 0) return;

    const laneAvailableAt = Array.from({ length: maxParallel }, () => now);

    for (const order of remaining) {
        const startMs = new Date(order.started_at).getTime();
        const endMs = new Date(order.completes_at).getTime();
        const durationMs = Math.max(1000, endMs - startMs);

        let laneIndex = 0;
        for (let i = 1; i < laneAvailableAt.length; i++) {
            if (laneAvailableAt[i] < laneAvailableAt[laneIndex]) laneIndex = i;
        }

        const nextStartMs = Math.max(now, startMs, laneAvailableAt[laneIndex]);
        const nextEndMs = nextStartMs + durationMs;
        laneAvailableAt[laneIndex] = nextEndMs;

        if (nextStartMs !== startMs || nextEndMs !== endMs) {
            await db.workOrder.update({
                where: { id: order.id },
                data: {
                    started_at: new Date(nextStartMs),
                    completes_at: new Date(nextEndMs),
                },
            });
        }
    }
}

async function rescheduleFerrumMiningQueueAfterCancel(userId: number, db: DbClient) {
    const ferrumCatalog = await ensureFerrumCatalog(db);
    const now = Date.now();

    const remaining = await db.workOrder.findMany({
        where: {
            user_id: userId,
            type: { in: ["FARM", "MINE"] },
            item_id: ferrumCatalog.miningPermitId,
            collected: false,
        },
        orderBy: [{ started_at: "asc" }, { id: "asc" }],
    });

    if (remaining.length === 0) return;

    let laneAvailableAt = now;
    for (const order of remaining) {
        const currentStart = new Date(order.started_at).getTime();
        const currentEnd = new Date(order.completes_at).getTime();
        const durationMs = Math.max(1000, currentEnd - currentStart);

        // If this order is already in-progress, preserve its timing entirely.
        if (currentStart <= now && currentEnd > now) {
            laneAvailableAt = currentEnd;
            continue;
        }

        // Only reschedule queued (not-yet-started) orders to fill the gap.
        const nextStartMs = Math.max(now, laneAvailableAt);
        const nextEndMs = nextStartMs + durationMs;
        laneAvailableAt = nextEndMs;

        if (nextStartMs !== currentStart || nextEndMs !== currentEnd) {
            await db.workOrder.update({
                where: { id: order.id },
                data: {
                    started_at: new Date(nextStartMs),
                    completes_at: new Date(nextEndMs),
                },
            });
        }
    }
}

/**
 * GET /game/workspace — Get active work orders
 */
export const getWorkOrders = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        await syncHunger(req.userId!);
        const cityProfile = await getUserCityProfile(req.userId!);
        await syncDurability(req.userId!);
        await reconcileWorkspaceOrderPausesForUser(req.userId!, cityProfile.city_key);

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
        const { type, itemId, recipeId, quantity = 1, selectedIngredients, mode, layer } = req.body as {
            type: "FARM" | "COOK" | "EXTRACT" | "REFINE" | "GATHER" | "SEW" | "FORAGE" | "BREW";
            itemId?: number;
            recipeId?: number;
            quantity?: number;
            selectedIngredients?: IngredientSelectionInput[];
            mode?: "MINE" | "EXTRACT";
            layer?: MiningLayer;
        };
        const user = await syncHunger(req.userId!);
        const cityProfile = await getUserCityProfile(req.userId!);
        await syncDurability(req.userId!);
        await reconcileWorkspaceOrderPausesForUser(req.userId!, cityProfile.city_key);
        const isFerrum = cityProfile.city_key === "FERRUM";
        const isVoltara = cityProfile.city_key === "VOLTARA";
        const isTextilis = cityProfile.city_key === "TEXTILIS";
        const isMedico = cityProfile.city_key === "MEDICO";
        const taskTimeConfig = await getGameTaskTimeConfig();
        const ferrumMining = await getFerrumMiningConfig();
        const ferrumCatalog = await ensureFerrumCatalog(prisma);

        const equipmentEffects = await getUserEquipmentEffects(req.userId!);

        // Block task start if any equipped item has 0 durability (broken)
        const brokenSlots = await getBrokenEquipmentSlots(req.userId!);
        if (brokenSlots.length > 0) {
            const names = brokenSlots.map((s) => s.item_name ?? s.slot).join(", ");
            res.status(400).json({
                error: `Your equipment is broken and must be repaired before working: ${names}`,
                code: "EQUIPMENT_BROKEN",
            });
            return;
        }

        if (type === "FARM" || type === "EXTRACT" || type === "GATHER" || type === "FORAGE") {
            if (isFerrum) {
                if (user.first_job_level < 1) {
                    res.status(403).json({ error: "Ferrum requires Miner occupation to run expeditions" });
                    return;
                }

                if (mode !== "MINE") {
                    res.status(400).json({ error: "Ferrum FARM mode must be MINE" });
                    return;
                }

                const ferrumWorkspaceRequirement = await validateWorkspaceRequirements({
                    userId: req.userId!,
                    cityKey: cityProfile.city_key,
                    jobSlot: "first_job",
                    workType: "MINE",
                    workspaceMode: "MINE",
                });

                if (!ferrumWorkspaceRequirement.ok) {
                    res.status(ferrumWorkspaceRequirement.statusCode).json({
                        error: ferrumWorkspaceRequirement.errorMessage,
                        code: ferrumWorkspaceRequirement.errorCode,
                        requirement: {
                            requiredItemName: ferrumWorkspaceRequirement.requiredItemName,
                            mustBeEquipped: ferrumWorkspaceRequirement.mustBeEquipped,
                        },
                    });
                    return;
                }

                const miningLayer: MiningLayer = layer === "DEEP" || layer === "CORE" ? layer : "SURFACE";
                const baseMins = miningLayer === "SURFACE"
                    ? ferrumMining.layerTimeMins.surface
                    : miningLayer === "DEEP"
                        ? ferrumMining.layerTimeMins.deep
                        : ferrumMining.layerTimeMins.core;

                // First-job branch #1 controls time/queue in dynamic skill design.
                const firstJobBranchLevels = await getJobBranchLevels(req.userId!, "first_job");
                const minerPrepLevel = Number(firstJobBranchLevels.branch1 ?? 0);
                const minerTimeReduction = getSecondaryJobSkillCookTimeReduction(minerPrepLevel);

                const tier = applyTierReduction(user.hunger, equipmentEffects.hungerPenaltyTierReduction);
                const growMins = baseMins * tier.multiplier * (1 - minerTimeReduction) * taskTimeConfig.firstJobTaskTimeMultiplier;
                // Use Math.ceil to match the displayed effectiveLayerTimeMins shown in WorkspacePanel
                const durationMs = Math.max(1000, Math.ceil(growMins) * 60 * 1000);

                const MINING_PLOT_SIZE = 3;

                // All mining tasks run concurrently — fetch only orders for this specific layer
                const sameLayerOrders = await prisma.workOrder.findMany({
                    where: {
                        user_id: req.userId!,
                        type: "MINE",
                        item_id: ferrumCatalog.miningPermitId,
                        recipe_id: LAYER_CODE[miningLayer],
                        collected: false,
                    },
                    orderBy: [{ started_at: "asc" }, { id: "asc" }],
                });

                if (sameLayerOrders.length >= MINING_PLOT_SIZE) {
                    res.status(400).json({ error: `${miningLayer} plot is full. Collect existing expeditions before starting more.` });
                    return;
                }

                const nowMs = Date.now();

                // Tasks run concurrently: every new order starts immediately
                const order = await prisma.workOrder.create({
                    data: {
                        user_id: req.userId!,
                        type: "MINE",
                        item_id: ferrumCatalog.miningPermitId,
                        quantity: 1,
                        recipe_id: LAYER_CODE[miningLayer],
                        started_at: new Date(nowMs),
                        completes_at: new Date(nowMs + durationMs),
                    },
                    include: { item: true },
                });

                const allLayerOrders = [...sameLayerOrders, order];
                const newLayerCount = allLayerOrders.length;
                let message = `Started ${miningLayer.toLowerCase()} expedition. Ready in ${Math.ceil(growMins)} min.`;

                // Recalculate plot: when adding to a partial plot, average all remaining times.
                // When the plot fills (MINING_PLOT_SIZE), also apply a -10% bonus reduction.
                if (sameLayerOrders.length > 0) {
                    const remainingMsList = allLayerOrders.map((o) =>
                        o.id === order.id ? durationMs : Math.max(0, new Date(o.completes_at).getTime() - nowMs)
                    );
                    const avgRemainingMs = remainingMsList.reduce((sum, ms) => sum + ms, 0) / remainingMsList.length;
                    const isFullPlot = newLayerCount === MINING_PLOT_SIZE;
                    const finalMs = isFullPlot
                        ? Math.max(1000, Math.floor(avgRemainingMs * 0.9))
                        : Math.max(1000, Math.floor(avgRemainingMs));
                    const bonusAt = new Date(nowMs + finalMs);

                    await prisma.workOrder.updateMany({
                        where: { id: { in: allLayerOrders.map((o) => o.id) } },
                        data: { completes_at: bonusAt },
                    });

                    message = isFullPlot
                        ? `Started ${miningLayer.toLowerCase()} expedition. Plot full (${MINING_PLOT_SIZE}/${MINING_PLOT_SIZE}) — timers averaged and reduced by 10% (ready in ~${Math.ceil(finalMs / 60000)} min each).`
                        : `Started ${miningLayer.toLowerCase()} expedition. Added to plot (${newLayerCount}/${MINING_PLOT_SIZE}) — timers averaged (ready in ~${Math.ceil(finalMs / 60000)} min each).`;
                }

                res.json({ message, order });
                return;
            }

            if (!itemId || !Number.isInteger(Number(itemId))) {
                res.status(400).json({ error: "itemId is required for FARM" });
                return;
            }

            // Requires first-job occupation
            if (user.first_job_level < 1) {
                res.status(403).json({ error: "You need the first-job occupation to farm" });
                return;
            }

            const firstJobWorkType: WorkType = isVoltara ? "EXTRACT" : isTextilis ? "GATHER" : isMedico ? "FORAGE" : "FARM";
            const firstJobWorkspaceMode: string | null = isFerrum ? "MINE" : isVoltara ? "EXTRACT" : isTextilis ? "GATHER" : isMedico ? "FORAGE" : null;

            const farmWorkspaceRequirement = await validateWorkspaceRequirements({
                userId: req.userId!,
                cityKey: cityProfile.city_key,
                jobSlot: "first_job",
                workType: firstJobWorkType,
                workspaceMode: firstJobWorkspaceMode,
                itemId: Number(itemId),
            });

            if (!farmWorkspaceRequirement.ok) {
                res.status(farmWorkspaceRequirement.statusCode).json({
                    error: farmWorkspaceRequirement.errorMessage,
                    code: farmWorkspaceRequirement.errorCode,
                    requirement: {
                        requiredItemName: farmWorkspaceRequirement.requiredItemName,
                        mustBeEquipped: farmWorkspaceRequirement.mustBeEquipped,
                    },
                });
                return;
            }

            const firstJobType: WorkType = firstJobWorkType;

            const activeFarmOrders = await prisma.workOrder.findMany({
                where: {
                    user_id: req.userId!,
                    type: firstJobType,
                    collected: false,
                },
                orderBy: { started_at: "asc" },
            });

            // Find the seed item in inventory
            const slot = await prisma.inventorySlot.findFirst({
                where: {
                    user_id: req.userId!,
                    item_id: Number(itemId),
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

            const firstJobBranchLevels = await getJobBranchLevels(req.userId!, "first_job");
            const branchSkillLevel = Number(firstJobBranchLevels.branch1 ?? 0);

            // Plot limit is controlled by game.config helper.
            // Textilis uses 6 tasks per plot (2x3); Medico uses 6 tasks per plot (pentagon);
            // other cities use 9 (3x3).
            const plotSize = (isTextilis || isMedico) ? 6 : 9;
            const branchOrders = activeFarmOrders.filter((o) => o.item_id === itemId);
            const maxPlots = getFirstJobSkillPlotCount(branchSkillLevel);
            const maxOrders = maxPlots * plotSize;
            if (branchOrders.length >= maxOrders) {
                res.status(400).json({
                    error: `Plot limit reached for ${slot.item.name}. Max ${maxPlots} plot(s) (${maxOrders} tasks).`,
                });
                return;
            }

            // Apply hunger penalty to grow time
            const tier = applyTierReduction(user.hunger, equipmentEffects.hungerPenaltyTierReduction);
            const skillReduction = getFirstJobSkillTimeReduction(branchSkillLevel);
            const equipmentTimeMultiplier = 1 - equipmentEffects.farmTimeReductionPct;
            const skillTimeMultiplier = 1 - skillReduction;
            const growMins = slot.item.grow_mins
                * tier.multiplier
                * skillTimeMultiplier
                * equipmentTimeMultiplier
                * taskTimeConfig.firstJobTaskTimeMultiplier;
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
                    type: firstJobType as any,
                    item_id: Number(itemId),
                    quantity,
                    completes_at: completesAt,
                },
                include: { item: true },
            });

            let message = `Started farming ${slot.item.name}. Ready in ${Math.ceil(growMins)} minutes.`;

            // Plot recalculation: when adding to an existing partial plot, average all remaining
            // times across every order in that plot (including the new one).
            // When the plot fills completely, also apply a -10% full-plot bonus.
            // Textilis: 6 tasks per plot, others: 9 tasks per plot.
            const sameSeedFarmOrders = activeFarmOrders.filter((o) => o.item_id === itemId);
            // positionInCurrentPlot: 0 = first task in a brand-new plot (no averaging needed)
            const positionInCurrentPlot = sameSeedFarmOrders.length % plotSize;
            if (positionInCurrentPlot > 0) {
                const now = Date.now();
                // The last `positionInCurrentPlot` existing orders belong to the current partial plot
                const ordersInCurrentPlot = sameSeedFarmOrders.slice(-positionInCurrentPlot);
                const currentPlotOrders = [...ordersInCurrentPlot, order];
                const remainingMsList = currentPlotOrders.map((o) =>
                    Math.max(0, new Date(o.completes_at).getTime() - now)
                );
                const avgRemainingMs = remainingMsList.reduce((sum, ms) => sum + ms, 0) / remainingMsList.length;
                const isFullPlot = (positionInCurrentPlot + 1) === plotSize;
                const finalMs = isFullPlot
                    ? Math.max(1000, Math.floor(avgRemainingMs * 0.9))
                    : Math.max(1000, Math.floor(avgRemainingMs));
                const bonusCompletesAt = new Date(now + finalMs);
                const plotIndex = Math.floor(sameSeedFarmOrders.length / plotSize) + 1;

                await prisma.workOrder.updateMany({
                    where: { id: { in: currentPlotOrders.map((o) => o.id) } },
                    data: { completes_at: bonusCompletesAt },
                });

                order = await prisma.workOrder.findUnique({
                    where: { id: order.id },
                    include: { item: true },
                }) as typeof order;

                message = isFullPlot
                    ? `Started farming ${slot.item.name}. Plot ${plotIndex} (${plotSize}/${plotSize}) full bonus activated: timers averaged and reduced by 10% (ready in ~${Math.ceil(finalMs / 60000)} minutes).`
                    : `Started farming ${slot.item.name}. Plot ${plotIndex} (${positionInCurrentPlot + 1}/${plotSize}) — timers averaged (ready in ~${Math.ceil(finalMs / 60000)} minutes).`;
            }

            res.json({
                message,
                order,
            });
        } else if (type === "COOK" || type === "REFINE" || type === "SEW" || type === "BREW") {

            if (!recipeId || !Number.isInteger(Number(recipeId))) {
                res.status(400).json({ error: "recipeId is required for COOK" });
                return;
            }

            // Requires secondary-job occupation
            if (user.secondary_job_level < 1) {
                res.status(403).json({ error: "You need the secondary-job occupation to cook" });
                return;
            }

            const recipeUnlocked = await isRecipeUnlocked(req.userId!, Number(recipeId));

            if (!recipeUnlocked) {
                res.status(403).json({ error: "Recipe is locked. Buy it from NPC recipe shop first" });
                return;
            }

            // Find recipe
            const recipe = await prisma.recipe.findUnique({
                where: { id: Number(recipeId) },
                include: {
                    ingredients: { include: { item: true } },
                    output_item: true,
                },
            });

            if (!recipe) {
                res.status(400).json({ error: "Recipe not found" });
                return;
            }

            if (isFerrum) {
                const outName = String(recipe.output_item?.name ?? "").toLowerCase();
                const recipeName = String(recipe.name ?? "").toLowerCase();
                const isExtractStoneRecipe = recipeName === "extract stone";
                if (!outName.includes("ingot") && !isExtractStoneRecipe) {
                    res.status(403).json({ error: "Ferrum Blacksmith can only smelt ingot recipes or Extract stone" });
                    return;
                }
            }

            // Validate workspace equipment requirements (e.g. Hammer for SMELT, Spatula for COOK)
            const cityWkMap: Record<string, WorkType> = { FERRUM: "SMELT", VOLTARA: "REFINE", TEXTILIS: "SEW", MEDICO: "BREW" };
            const cookWorkType: WorkType = cityWkMap[cityProfile.city_key ?? ""] ?? "COOK";
            const cookWorkspaceRequirement = await validateWorkspaceRequirements({
                userId: req.userId!,
                cityKey: cityProfile.city_key,
                jobSlot: "secondary_job",
                workType: cookWorkType,
                workspaceMode: cookWorkType,
                itemId: recipe.output_item_id,
                itemName: recipe.output_item?.name,
                recipeId: Number(recipeId),
                recipeName: recipe.name,
            });

            if (!cookWorkspaceRequirement.ok) {
                res.status(cookWorkspaceRequirement.statusCode).json({
                    error: cookWorkspaceRequirement.errorMessage,
                    code: cookWorkspaceRequirement.errorCode,
                    requirement: {
                        requiredItemName: cookWorkspaceRequirement.requiredItemName,
                        mustBeEquipped: cookWorkspaceRequirement.mustBeEquipped,
                    },
                });
                return;
            }

            // Check all ingredients in inventory
            const userSlots = await prisma.inventorySlot.findMany({
                where: { user_id: req.userId! },
                include: { item: true },
            });

            const secondaryJobSkills = await getSecondaryJobSkillLevels(req.userId!);
            const secondaryJobCookTimeReductionPct = getSecondaryJobSkillCookTimeReduction(secondaryJobSkills.prep);
            const secondaryJobParallelSlots = Math.max(1, getSecondaryJobSkillConcurrentCookSlots(secondaryJobSkills.prep));
            const secondaryJobSecondarySaveChance = getSecondaryJobSkillSecondarySaveChance(secondaryJobSkills.economy);
            const secondaryJobPrimarySaveChance = getSecondaryJobSkillPrimarySaveChance(secondaryJobSkills.economy);

            const selectedList = Array.isArray(selectedIngredients)
                ? selectedIngredients
                    .map((x) => ({
                        slotId: Number(x.slotId),
                        quantity: Math.floor(Number(x.quantity)),
                    }))
                    .filter((x) => Number.isInteger(x.slotId) && x.slotId > 0 && Number.isInteger(x.quantity) && x.quantity > 0)
                : [];

            const selectedMode = selectedList.length > 0;

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

            const consumedIngredientRarities: EquipmentRarity[] = [];

            if (selectedMode) {
                const slotMap = new Map(userSlots.map((s) => [s.id, s]));
                const requiredByItem = new Map<number, number>();
                for (const ing of recipe.ingredients) {
                    requiredByItem.set(ing.item_id, ing.quantity);
                }

                const selectedByItem = new Map<number, number>();
                for (const pick of selectedList) {
                    const slot = slotMap.get(pick.slotId);
                    if (!slot || !slot.item_id) {
                        res.status(400).json({ error: "Invalid selected ingredient slot" });
                        return;
                    }
                    if (!requiredByItem.has(slot.item_id)) {
                        res.status(400).json({ error: "Selected ingredient does not match recipe" });
                        return;
                    }
                    if (slot.quantity < pick.quantity) {
                        res.status(400).json({ error: "Selected ingredient quantity exceeds slot amount" });
                        return;
                    }

                    selectedByItem.set(slot.item_id, (selectedByItem.get(slot.item_id) ?? 0) + pick.quantity);
                }

                for (const [itemId, requiredQty] of requiredByItem.entries()) {
                    const pickedQty = selectedByItem.get(itemId) ?? 0;
                    if (pickedQty !== requiredQty) {
                        const item = recipe.ingredients.find((r) => r.item_id === itemId)?.item;
                        res.status(400).json({
                            error: `Selected quantity mismatch for ${item?.name ?? `item ${itemId}`}. Need ${requiredQty}, selected ${pickedQty}`,
                        });
                        return;
                    }
                }

                for (const ingredient of recipe.ingredients) {
                    const picksForItem = selectedList.filter((p) => {
                        const slot = slotMap.get(p.slotId);
                        return slot?.item_id === ingredient.item_id;
                    });

                    let consumeUnits = 0;
                    for (let i = 0; i < ingredient.quantity; i++) {
                        const isSecondary = recipe.ingredients.findIndex((x) => x.item_id === ingredient.item_id) > 0;
                        const saveChance = isSecondary
                            ? Math.min(0.7, Math.max(0, equipmentEffects.cookSecondaryIngredientSaveChance + secondaryJobSecondarySaveChance))
                            : Math.min(0.4, Math.max(0, secondaryJobPrimarySaveChance));
                        const saved = saveChance > 0 && Math.random() < saveChance;
                        if (!saved) consumeUnits += 1;
                    }

                    let remainingConsume = consumeUnits;
                    for (const pick of picksForItem) {
                        if (remainingConsume <= 0) break;
                        const slot = slotMap.get(pick.slotId)!;
                        const take = Math.min(pick.quantity, remainingConsume);
                        remainingConsume -= take;

                        const rarity = ((slot as any).equipment_rarity as EquipmentRarity | null) ?? "NORMAL";
                        for (let c = 0; c < take; c++) {
                            consumedIngredientRarities.push(rarity);
                        }

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
                            await prisma.$executeRaw`
                                UPDATE inventory_slots
                                SET equipment_rarity = NULL
                                WHERE id = ${slot.id}
                            `;
                            slot.quantity = 0;
                            slot.item_id = null;
                        }
                    }
                }
            } else {
                // Backward-compatible auto consume mode
                for (let idx = 0; idx < recipe.ingredients.length; idx++) {
                    const ingredient = recipe.ingredients[idx];
                    const isSecondary = idx > 0;
                    const saveChance = isSecondary
                        ? Math.min(0.7, Math.max(0, equipmentEffects.cookSecondaryIngredientSaveChance + secondaryJobSecondarySaveChance))
                        : Math.min(0.4, Math.max(0, secondaryJobPrimarySaveChance));

                    let remaining = 0;
                    for (let i = 0; i < ingredient.quantity; i++) {
                        const saved = saveChance > 0 && Math.random() < saveChance;
                        if (!saved) remaining += 1;
                    }

                    for (const slot of userSlots) {
                        if (slot.item_id !== ingredient.item_id || remaining <= 0) continue;

                        const take = Math.min(slot.quantity, remaining);
                        remaining -= take;

                        const rarity = ((slot as any).equipment_rarity as EquipmentRarity | null) ?? "NORMAL";
                        for (let c = 0; c < take; c++) {
                            consumedIngredientRarities.push(rarity);
                        }

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
                            await prisma.$executeRaw`
                                UPDATE inventory_slots
                                SET equipment_rarity = NULL
                                WHERE id = ${slot.id}
                            `;
                            slot.quantity = 0;
                            slot.item_id = null;
                        }
                    }
                }
            }

            // Apply hunger penalty to cook time
            const tier = applyTierReduction(user.hunger, equipmentEffects.hungerPenaltyTierReduction);
            const equipmentCookMultiplier = 1 - equipmentEffects.cookTimeReductionPct;
            const secondaryJobCookMultiplier = 1 - secondaryJobCookTimeReductionPct;
            const cookMins = recipe.cook_mins
                * tier.multiplier
                * equipmentCookMultiplier
                * secondaryJobCookMultiplier
                * taskTimeConfig.secondaryJobTaskTimeMultiplier;

            // Secondary-job queue logic with PREP_MASTER parallel slots.
            const nowMs = Date.now();
            const durationMs = Math.max(1000, Math.floor(cookMins * 60 * 1000));
            const pendingCooks = await prisma.workOrder.findMany({
                where: {
                    user_id: req.userId!,
                    type: { in: ["COOK", "SMELT", "REFINE", "SEW", "BREW"] as any[] },
                    collected: false,
                },
                orderBy: [{ started_at: "asc" }, { id: "asc" }],
            });

            const laneAvailableAt = Array.from({ length: secondaryJobParallelSlots }, () => nowMs);
            for (const order of pendingCooks) {
                const currentStart = new Date(order.started_at).getTime();
                const currentEnd = new Date(order.completes_at).getTime();
                const existingDurationMs = Math.max(1000, currentEnd - currentStart);

                let laneIndex = 0;
                for (let i = 1; i < laneAvailableAt.length; i++) {
                    if (laneAvailableAt[i] < laneAvailableAt[laneIndex]) laneIndex = i;
                }

                const normalizedStart = Math.max(nowMs, currentStart, laneAvailableAt[laneIndex]);
                laneAvailableAt[laneIndex] = normalizedStart + existingDurationMs;
            }

            let targetLane = 0;
            for (let i = 1; i < laneAvailableAt.length; i++) {
                if (laneAvailableAt[i] < laneAvailableAt[targetLane]) targetLane = i;
            }

            const startMs = Math.max(nowMs, laneAvailableAt[targetLane]);
            const startsAt = new Date(startMs);
            const completesAt = new Date(startMs + durationMs);

            const workType: WorkType = cookWorkType;

            const order = await prisma.workOrder.create({
                data: {
                    user_id: req.userId!,
                    type: workType as any,
                    item_id: recipe.output_item_id,
                    recipe_id: Number(recipeId),
                    quantity: recipe.output_qty,
                    started_at: startsAt,
                    completes_at: completesAt,
                },
                include: { item: true },
            });

            // Ingredient-based meal rarity rule:
            // Rare+Rare => 50% Rare, 50% Normal (generalized to any same non-NORMAL tier ingredients).
            if (recipe.output_item.type === "MEAL") {
                const rank: Record<EquipmentRarity, number> = {
                    NORMAL: 0,
                    RARE: 1,
                    EPIC: 2,
                    LEGENDARY: 3,
                };

                const sorted = [...consumedIngredientRarities].sort((a, b) => rank[b] - rank[a]);
                const first = sorted[0] ?? "NORMAL";
                const second = sorted[1] ?? "NORMAL";
                const outputRarity: EquipmentRarity = resolveCookMealRarityByPair(first, second);

                await setWorkOrderOutputRarity(order.id, outputRarity);
            }

            res.json({
                message: startsAt.getTime() > nowMs
                    ? `Queued cooking ${recipe.name}. It will start when a secondary-job slot is available and finish in ${Math.ceil(cookMins)} minutes once started.`
                    : `Started cooking ${recipe.name}. Ready in ${Math.ceil(cookMins)} minutes.`,
                order,
            });
        } else {
            res.status(400).json({ error: 'Invalid work type. Use "FARM" or "COOK" (or city-specific types)' });
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
        const cityProfile = await getUserCityProfile(req.userId!);
        await syncDurability(req.userId!);
        await reconcileWorkspaceOrderPausesForUser(req.userId!, cityProfile.city_key);

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
        const levelUpMessage = result.levelUp ? ` Level up! Now Lvl ${result.newLevel}!` : "";
        const unlockMessage = result.blacksmithUnlocked ? " Blacksmith unlocked in Ferrum!" : "";

        // Return updated inventory + user
        const slots = await prisma.inventorySlot.findMany({
            where: { user_id: req.userId! },
            include: { item: true },
            orderBy: { slot: "asc" },
        });

        const updatedUser = await getUserJobPayloadRow(req.userId!);
        if (!updatedUser) {
            res.status(404).json({ error: "User not found" });
            return;
        }

        res.json({
            message: `Collected ${result.outputSummaryText}!${expMessage}${levelUpMessage}${unlockMessage}`,
            slots,
            user: toJobPayload({
                id: updatedUser!.id,
                email: updatedUser.email,
                role: updatedUser.role,
                money: updatedUser.money,
                hunger: updatedUser.hunger,
                first_job_level: updatedUser.first_job_level,
                first_job_exp: updatedUser.first_job_exp,
                secondary_job_level: updatedUser.secondary_job_level,
                secondary_job_exp: updatedUser.secondary_job_exp,
                satiety_buff: updatedUser.satiety_buff,
            }),
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
        const cityProfile = await getUserCityProfile(req.userId!);
        await syncDurability(req.userId!);
        await reconcileWorkspaceOrderPausesForUser(req.userId!, cityProfile.city_key);

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

        const updatedUser = await getUserJobPayloadRow(req.userId!);
        if (!updatedUser) {
            res.status(404).json({ error: "User not found" });
            return;
        }

        const message = collectedCount > 0
            ? `Collected ${collectedCount} ready order(s).${blockedByInventory ? ` ${blockedByInventory}` : ""}`
            : blockedByInventory ?? "No orders were collected.";

        res.json({
            message,
            collectedCount,
            slots,
            user: toJobPayload({
                id: updatedUser!.id,
                email: updatedUser.email,
                role: updatedUser.role,
                money: updatedUser.money,
                hunger: updatedUser.hunger,
                first_job_level: updatedUser.first_job_level,
                first_job_exp: updatedUser.first_job_exp,
                secondary_job_level: updatedUser.secondary_job_level,
                secondary_job_exp: updatedUser.secondary_job_exp,
                satiety_buff: updatedUser.satiety_buff,
            }),
        });
    } catch (error) {
        console.error("collectReadyWork error:", error);
        res.status(500).json({ error: "Failed to collect ready work" });
    }
};

/**
 * POST /game/workspace/cancel/:orderId — Cancel active order and refund input materials
 */
export const cancelWork = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        await syncHunger(req.userId!);
        const cityProfile = await getUserCityProfile(req.userId!);
        await syncDurability(req.userId!);
        await reconcileWorkspaceOrderPausesForUser(req.userId!, cityProfile.city_key);

        if (typeof req.params.orderId !== "string") {
            res.status(400).json({ error: "Invalid order ID" });
            return;
        }

        const orderId = parseInt(req.params.orderId);
        if (!Number.isInteger(orderId) || orderId <= 0) {
            res.status(400).json({ error: "Invalid order ID" });
            return;
        }

        const now = Date.now();

        const result = await prisma.$transaction(async (tx) => {
            const order = await tx.workOrder.findFirst({
                where: {
                    id: orderId,
                    user_id: req.userId!,
                    collected: false,
                },
                include: { item: true },
            });

            if (!order) {
                return { ok: false as const, reason: "not_found" as const };
            }

            if (new Date(order.completes_at).getTime() <= now) {
                return { ok: false as const, reason: "already_ready" as const };
            }

            const refunds = await buildCancelRefundOutputs(order, tx);
            const refundableQty = refunds.reduce((sum, r) => sum + Math.max(0, r.outputQty), 0);

            if (refundableQty > 0) {
                const canPlaceRefund = await placeOutputInInventory(req.userId!, refunds, tx);
                if (!canPlaceRefund) {
                    return { ok: false as const, reason: "inventory_full" as const };
                }
            }

            // Before deleting, check if this FARM-type order was in a complete plot
            // so we can revert the 10% time bonus on the remaining 8 orders.
            // Query by the same type as the cancelled order (FARM for Agaria, EXTRACT for Voltara)
            // to match how activeFarmOrders is scoped when the bonus is applied.
            const FIRST_JOB_FARM_TYPES = ["FARM", "EXTRACT", "GATHER", "FORAGE"];
            let plotBonusRevertOrders: Array<{ id: number; completes_at: Date }> = [];
            if (FIRST_JOB_FARM_TYPES.includes(order.type)) {
                const allSameSeedOrders = await tx.workOrder.findMany({
                    where: {
                        user_id: req.userId!,
                        type: order.type as any,
                        item_id: order.item_id,
                        collected: false,
                    },
                    orderBy: [{ started_at: "asc" }, { id: "asc" }],
                });

                const totalCount = allSameSeedOrders.length;
                const cancelledIndex = allSameSeedOrders.findIndex((o) => o.id === order.id);
                if (cancelledIndex !== -1) {
                    // Plot size is 6 for Textilis (GATHER) and Medico (FORAGE), 9 for all other cities
                    const cancelPlotSize = (order.type === "GATHER" || order.type === "FORAGE") ? 6 : 9;
                    const plotGroup = Math.floor(cancelledIndex / cancelPlotSize); // 0-based
                    const totalCompletePlots = Math.floor(totalCount / cancelPlotSize);
                    // Only revert if the cancelled order was inside a complete plot
                    if (plotGroup < totalCompletePlots) {
                        const plotStart = plotGroup * cancelPlotSize;
                        const plotOrders = allSameSeedOrders.slice(plotStart, plotStart + cancelPlotSize);
                        const remainingPlotOrders = plotOrders.filter((o) => o.id !== order.id);
                        const cancelNow = Date.now();
                        plotBonusRevertOrders = remainingPlotOrders.map((o) => {
                            const remainingMs = Math.max(0, new Date(o.completes_at).getTime() - cancelNow);
                            // Undo the 10% reduction: original = reduced / 0.9
                            const revertedMs = Math.floor(remainingMs / 0.9);
                            return { id: o.id, completes_at: new Date(cancelNow + revertedMs) };
                        });
                    }
                }
            }

            await tx.workOrder.delete({ where: { id: order.id } });

            // Revert the plot bonus for remaining orders in the same complete plot
            for (const revert of plotBonusRevertOrders) {
                await tx.workOrder.update({
                    where: { id: revert.id },
                    data: { completes_at: revert.completes_at },
                });
            }

            if (isSecondaryJobWorkType(order.type)) {
                await rescheduleSecondaryJobQueueAfterCancel(req.userId!, tx);
            } else if (isFirstJobWorkType(order.type)) {
                const ferrumCatalog = await ensureFerrumCatalog(tx);
                if (order.item_id === ferrumCatalog.miningPermitId) {
                    await rescheduleFerrumMiningQueueAfterCancel(req.userId!, tx);
                }
            }

            return {
                ok: true as const,
                orderType: order.type,
                orderItemName: order.item.name,
            };
        });

        if (!result.ok) {
            if (result.reason === "not_found") {
                res.status(404).json({ error: "Work order not found" });
                return;
            }
            if (result.reason === "already_ready") {
                res.status(400).json({ error: "This order is already ready. Please collect it instead." });
                return;
            }
            if (result.reason === "inventory_full") {
                res.status(400).json({ error: "Inventory is full. Free up slots or stacks before cancelling." });
                return;
            }
            res.status(500).json({ error: "Failed to cancel work" });
            return;
        }

        const [orders, slots] = await Promise.all([
            prisma.workOrder.findMany({
                where: { user_id: req.userId!, collected: false },
                include: { item: true },
                orderBy: { started_at: "desc" },
            }),
            prisma.inventorySlot.findMany({
                where: { user_id: req.userId! },
                include: { item: true },
                orderBy: { slot: "asc" },
            }),
        ]);

        res.json({
            message: `Cancelled ${result.orderType} order: ${result.orderItemName}. Materials refunded.`,
            orders,
            slots,
        });
    } catch (error) {
        console.error("cancelWork error:", error);
        res.status(500).json({ error: "Failed to cancel work" });
    }
};
