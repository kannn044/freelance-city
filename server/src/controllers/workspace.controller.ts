import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { syncHunger } from "../services/hunger.service";
import {
    type EquipmentRarity,
    getChefSkillConcurrentCookSlots,
    getChefSkillCookTimeReduction,
    getChefSkillPrimarySaveChance,
    getChefSkillSecondarySaveChance,
    getHungerTier,
    getLevelFromExp,
    getProviderSkillPlotCount,
    getProviderSkillTimeReduction,
    HUNGER_TIERS,
    resolveCookMealRarityByPair,
} from "../config/game.config";
import { getEffectiveMaxStack, getUserEquipmentEffects } from "../services/equipmentEffects.service";
import { getFerrumMiningConfig, getGameExpConfig, getGameHarvestRarityConfig, getGameTaskTimeConfig } from "../services/gamePricing.service";
import { getUserCityProfile } from "../services/city.service";

interface AuthRequest extends Request {
    userId?: number;
}

type IngredientSelectionInput = {
    slotId: number;
    quantity: number;
};

// Small tolerance to avoid client/server clock drift causing false "Not ready yet".
const READY_GRACE_MS = 5000;

type ProviderBranch = "VEGETABLE" | "CHICKEN" | "BEEF";

let workOrderRarityColumnEnsured = false;
let chefSkillColumnsEnsured = false;

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

async function ensureChefSkillColumns(db: DbClient = prisma) {
    if (chefSkillColumnsEnsured) return;

    const columns = [
        "chef_skill_prep",
        "chef_skill_economy",
        "chef_skill_market",
    ];

    for (const column of columns) {
        const rows = await db.$queryRaw<Array<{ cnt: number | bigint }>>`
            SELECT COUNT(*) as cnt
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'users'
              AND COLUMN_NAME = ${column}
        `;

        const exists = Number(rows[0]?.cnt ?? 0) > 0;
        if (!exists) {
            await db.$executeRawUnsafe(`
                ALTER TABLE users
                ADD COLUMN ${column} INT NOT NULL DEFAULT 0
            `);
        }
    }

    chefSkillColumnsEnsured = true;
}

type ChefSkillLevels = {
    prep: number;
    economy: number;
    market: number;
};

async function getChefSkillLevels(userId: number, db: DbClient = prisma): Promise<ChefSkillLevels> {
    try {
        await ensureChefSkillColumns(db);
        const rows = await db.$queryRaw<Array<{
            chef_skill_prep: number;
            chef_skill_economy: number;
            chef_skill_market: number;
        }>>`
            SELECT chef_skill_prep, chef_skill_economy, chef_skill_market
            FROM users
            WHERE id = ${userId}
            LIMIT 1
        `;

        const row = rows[0];
        return {
            prep: Number(row?.chef_skill_prep ?? 0),
            economy: Number(row?.chef_skill_economy ?? 0),
            market: Number(row?.chef_skill_market ?? 0),
        };
    } catch {
        return { prep: 0, economy: 0, market: 0 };
    }
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

async function ensureFerrumCatalog(db: DbClient = prisma) {
    const upsertItem = async (name: string, data: any) => {
        return db.item.upsert({ where: { name }, update: data, create: { name, ...data } as any });
    };

    const miningPermit = await upsertItem(MINING_PERMIT_NAME, {
        type: "SEED",
        buy_price: null,
        sell_price: null,
        max_stack: 1,
        grow_mins: 1,
        exp_value: 0,
        icon: "mining_permit",
    });

    await upsertItem("Mattock", {
        type: "EQUIPMENT",
        buy_price: 650,
        sell_price: 220,
        max_stack: 1,
        exp_value: 0,
        icon: "mattock",
        equipment_role: "PROVIDER",
        equipment_slot: "ARM",
    });

    const ironOre = await upsertItem("Iron Ore", { type: "RAW", max_stack: 20, sell_price: 45, exp_value: 0.8, icon: "iron_ore" });
    const copperOre = await upsertItem("Copper Ore", { type: "RAW", max_stack: 20, sell_price: 55, exp_value: 0.9, icon: "copper_ore" });
    const steelOre = await upsertItem("Steel Ore", { type: "RAW", max_stack: 20, sell_price: 75, exp_value: 1.1, icon: "steel_ore" });
    const stone = await upsertItem("Stone", { type: "RAW", max_stack: 30, sell_price: 12, exp_value: 0.4, icon: "stone" });
    const coal = await upsertItem("Coal", { type: "INGREDIENT", max_stack: 30, sell_price: 20, exp_value: 0.5, icon: "coal" });
    const gem = await upsertItem("Gem", { type: "RAW", max_stack: 10, sell_price: 200, exp_value: 2.5, icon: "gem" });
    const flux = await upsertItem("Flux", { type: "INGREDIENT", max_stack: 20, sell_price: 65, buy_price: null, exp_value: 0.8, icon: "flux" });
    const oil = await upsertItem("Oil", { type: "INGREDIENT", max_stack: 20, sell_price: 90, buy_price: null, exp_value: 1.0, icon: "oil" });

    const ironIngot = await upsertItem("Iron Ingot", { type: "INGREDIENT", max_stack: 20, sell_price: 220, exp_value: 1.6, icon: "iron_ingot" });
    const copperIngot = await upsertItem("Copper Ingot", { type: "INGREDIENT", max_stack: 20, sell_price: 250, exp_value: 1.8, icon: "copper_ingot" });
    const steelIngot = await upsertItem("Steel Ingot", { type: "INGREDIENT", max_stack: 20, sell_price: 340, exp_value: 2.3, icon: "steel_ingot" });

    const upsertRecipe = async (name: string, outputId: number, cookMins: number) => {
        return db.recipe.upsert({
            where: { name },
            update: { output_item_id: outputId, output_qty: 1, cook_mins: cookMins, unlock_price: 0 },
            create: { name, output_item_id: outputId, output_qty: 1, cook_mins: cookMins, unlock_price: 0 },
        });
    };

    const ironRecipe = await upsertRecipe("Iron Ingot Smelt", ironIngot.id, 7);
    const copperRecipe = await upsertRecipe("Copper Ingot Smelt", copperIngot.id, 8);
    const steelRecipe = await upsertRecipe("Steel Ingot Smelt", steelIngot.id, 10);

    const upsertIngredient = async (recipeId: number, itemId: number, quantity: number) => {
        await db.recipeIngredient.upsert({
            where: { recipe_id_item_id: { recipe_id: recipeId, item_id: itemId } },
            update: { quantity },
            create: { recipe_id: recipeId, item_id: itemId, quantity },
        });
    };

    // User-defined formula: ore + flux + coal + oil
    await upsertIngredient(ironRecipe.id, ironOre.id, 2);
    await upsertIngredient(ironRecipe.id, flux.id, 1);
    await upsertIngredient(ironRecipe.id, coal.id, 2);
    await upsertIngredient(ironRecipe.id, oil.id, 1);

    await upsertIngredient(copperRecipe.id, copperOre.id, 2);
    await upsertIngredient(copperRecipe.id, flux.id, 1);
    await upsertIngredient(copperRecipe.id, coal.id, 2);
    await upsertIngredient(copperRecipe.id, oil.id, 1);

    await upsertIngredient(steelRecipe.id, steelOre.id, 2);
    await upsertIngredient(steelRecipe.id, flux.id, 1);
    await upsertIngredient(steelRecipe.id, coal.id, 2);
    await upsertIngredient(steelRecipe.id, oil.id, 1);

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

async function getOrderOutput(
    order: { id: number; type: "FARM" | "COOK"; item_id: number; quantity: number },
    userId: number,
    db: DbClient,
    harvestDropRates: Record<EquipmentRarity, number>
): Promise<OutputReward[]> {
    const ferrumCatalog = await ensureFerrumCatalog(db);
    const effects = await getUserEquipmentEffects(userId, db);

    if (order.type === "FARM" && order.item_id === ferrumCatalog.miningPermitId) {
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

    const cookedItem = await db.item.findUnique({ where: { id: order.item_id } });
    if (!cookedItem) {
        throw new Error("Cook output item not found");
    }

    let outputQty = order.quantity;
    if (effects.gourmetChance > 0 && Math.random() < effects.gourmetChance) {
        outputQty += 1;
    }

    const city = await getUserCityProfile(userId);
    if (String(city.city_key ?? "").toUpperCase() === "FERRUM") {
        const skill = await getChefSkillLevels(userId, db);
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
    let blacksmithUnlocked = false;
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

            if (occupation === "provider" && newLevel >= 5 && user.chef_level < 1) {
                const cityRows = await db.$queryRaw<Array<{ city_key: string | null }>>`
                    SELECT city_key
                    FROM users
                    WHERE id = ${userId}
                    LIMIT 1
                `;
                const cityKey = cityRows[0]?.city_key ?? null;

                if (cityKey === "FERRUM") {
                    await db.user.update({ where: { id: userId }, data: { chef_level: 1 } });

                    const smeltRecipes = await db.recipe.findMany({
                        where: { name: { in: ["Iron Ingot Smelt", "Copper Ingot Smelt", "Steel Ingot Smelt"] } },
                        select: { id: true },
                    });
                    for (const r of smeltRecipes) {
                        await db.userRecipeUnlock.upsert({
                            where: { user_id_recipe_id: { user_id: userId, recipe_id: r.id } },
                            update: {},
                            create: { user_id: userId, recipe_id: r.id },
                        });
                    }

                    blacksmithUnlocked = true;
                }
            }
        }
    }

    return { expGained, levelUp, newLevel, blacksmithUnlocked };
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
            blacksmithUnlocked: exp.blacksmithUnlocked,
        };
    });
}

async function buildCancelRefundOutputs(
    order: { type: "FARM" | "COOK"; item_id: number; quantity: number; recipe_id: number | null },
    db: DbClient,
): Promise<OutputReward[]> {
    if (order.type === "FARM") {
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

async function rescheduleChefQueueAfterCancel(userId: number, db: DbClient) {
    const now = Date.now();
    const chefSkills = await getChefSkillLevels(userId, db);
    const maxParallel = Math.max(1, getChefSkillConcurrentCookSlots(chefSkills.prep));
    const remaining = await db.workOrder.findMany({
        where: {
            user_id: userId,
            type: "COOK",
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
            type: "FARM",
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
            type: "FARM" | "COOK";
            itemId?: number;
            recipeId?: number;
            quantity?: number;
            selectedIngredients?: IngredientSelectionInput[];
            mode?: "MINE";
            layer?: MiningLayer;
        };
        const user = await syncHunger(req.userId!);
        const cityProfile = await getUserCityProfile(req.userId!);
        const isFerrum = cityProfile.city_key === "FERRUM";
        const taskTimeConfig = await getGameTaskTimeConfig();
        const ferrumMining = await getFerrumMiningConfig();
        const ferrumCatalog = await ensureFerrumCatalog(prisma);

        const equipmentEffects = await getUserEquipmentEffects(req.userId!);

        if (type === "FARM") {
            if (isFerrum) {
                if (user.provider_level < 1) {
                    res.status(403).json({ error: "Ferrum requires Miner occupation to run expeditions" });
                    return;
                }

                if (mode !== "MINE") {
                    res.status(400).json({ error: "Ferrum FARM mode must be MINE" });
                    return;
                }

                const miningLayer: MiningLayer = layer === "DEEP" || layer === "CORE" ? layer : "SURFACE";
                const baseMins = miningLayer === "SURFACE"
                    ? ferrumMining.layerTimeMins.surface
                    : miningLayer === "DEEP"
                        ? ferrumMining.layerTimeMins.deep
                        : ferrumMining.layerTimeMins.core;

                // Ferrum Miner skill logic mirrors Chef PREP branch timing behavior.
                const minerPrepLevel = Number((user as any).provider_skill_veg ?? 0);
                const minerTimeReduction = getChefSkillCookTimeReduction(minerPrepLevel);

                if (user.hunger < ferrumMining.hungerCostPerExpedition) {
                    res.status(400).json({ error: `Not enough hunger for expedition. Need ${ferrumMining.hungerCostPerExpedition}` });
                    return;
                }

                const hasMattock = await prisma.inventorySlot.findFirst({
                    where: {
                        user_id: req.userId!,
                        quantity: { gt: 0 },
                        item: { name: "Mattock" },
                    },
                });
                const equippedMattockRows = await prisma.$queryRaw<Array<{ cnt: number | bigint }>>`
                    SELECT COUNT(*) as cnt
                    FROM user_equipments ue
                    INNER JOIN items i ON i.id = ue.item_id
                    WHERE ue.user_id = ${req.userId!}
                      AND i.name = 'Mattock'
                `;
                const hasEquippedMattock = Number(equippedMattockRows[0]?.cnt ?? 0) > 0;

                if (!hasMattock && !hasEquippedMattock) {
                    res.status(400).json({ error: "Mining requires a Mattock. Buy one from NPC Shop first." });
                    return;
                }

                const tier = applyTierReduction(user.hunger, equipmentEffects.hungerPenaltyTierReduction);
                const growMins = baseMins * tier.multiplier * (1 - minerTimeReduction) * taskTimeConfig.providerTaskTimeMultiplier;
                const durationMs = Math.max(1000, Math.floor(growMins * 60 * 1000));

                const pendingMiningOrders = await prisma.workOrder.findMany({
                    where: {
                        user_id: req.userId!,
                        type: "FARM",
                        item_id: ferrumCatalog.miningPermitId,
                        collected: false,
                    },
                    orderBy: [{ started_at: "asc" }, { id: "asc" }],
                });

                const nowMs = Date.now();
                const lastOrder = pendingMiningOrders[pendingMiningOrders.length - 1];
                const startsAtMs = lastOrder ? Math.max(nowMs, new Date(lastOrder.completes_at).getTime()) : nowMs;
                const startsAt = new Date(startsAtMs);
                const completesAt = new Date(startsAtMs + durationMs);

                await prisma.user.update({
                    where: { id: req.userId! },
                    data: {
                        hunger: Math.max(0, user.hunger - ferrumMining.hungerCostPerExpedition),
                        hunger_updated_at: new Date(),
                    },
                });

                const order = await prisma.workOrder.create({
                    data: {
                        user_id: req.userId!,
                        type: "FARM",
                        item_id: ferrumCatalog.miningPermitId,
                        quantity: 1,
                        recipe_id: LAYER_CODE[miningLayer],
                        started_at: startsAt,
                        completes_at: completesAt,
                    },
                    include: { item: true },
                });

                res.json({
                    message: startsAtMs > nowMs
                        ? `Queued ${miningLayer.toLowerCase()} expedition. Hunger -${ferrumMining.hungerCostPerExpedition}. Starts when previous run completes.`
                        : `Started ${miningLayer.toLowerCase()} expedition. Hunger -${ferrumMining.hungerCostPerExpedition}. Ready in ${Math.ceil(growMins)} min.`,
                    order,
                });
                return;
            }

            if (!itemId || !Number.isInteger(Number(itemId))) {
                res.status(400).json({ error: "itemId is required for FARM" });
                return;
            }

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
                    item_id: Number(itemId),
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
            if (isFerrum && user.provider_level < 5) {
                res.status(403).json({ error: "Blacksmith unlocks at Miner Level 5" });
                return;
            }

            if (!recipeId || !Number.isInteger(Number(recipeId))) {
                res.status(400).json({ error: "recipeId is required for COOK" });
                return;
            }

            // Requires Chef occupation
            if (user.chef_level < 1) {
                res.status(403).json({ error: "You need the Chef occupation to cook" });
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
                if (!outName.includes("ingot")) {
                    res.status(403).json({ error: "Ferrum Blacksmith can only smelt ingot recipes" });
                    return;
                }
            }

            // Check all ingredients in inventory
            const userSlots = await prisma.inventorySlot.findMany({
                where: { user_id: req.userId! },
                include: { item: true },
            });

            const chefSkills = await getChefSkillLevels(req.userId!);
            const chefCookTimeReductionPct = getChefSkillCookTimeReduction(chefSkills.prep);
            const chefParallelSlots = Math.max(1, getChefSkillConcurrentCookSlots(chefSkills.prep));
            const chefSecondarySaveChance = getChefSkillSecondarySaveChance(chefSkills.economy);
            const chefPrimarySaveChance = getChefSkillPrimarySaveChance(chefSkills.economy);

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
                            ? Math.min(0.7, Math.max(0, equipmentEffects.cookSecondaryIngredientSaveChance + chefSecondarySaveChance))
                            : Math.min(0.4, Math.max(0, chefPrimarySaveChance));
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
                        ? Math.min(0.7, Math.max(0, equipmentEffects.cookSecondaryIngredientSaveChance + chefSecondarySaveChance))
                        : Math.min(0.4, Math.max(0, chefPrimarySaveChance));

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
            const chefCookMultiplier = 1 - chefCookTimeReductionPct;
            const cookMins = recipe.cook_mins
                * tier.multiplier
                * equipmentCookMultiplier
                * chefCookMultiplier
                * taskTimeConfig.chefTaskTimeMultiplier;

            // Chef queue logic with PREP_MASTER parallel slots.
            const nowMs = Date.now();
            const durationMs = Math.max(1000, Math.floor(cookMins * 60 * 1000));
            const pendingCooks = await prisma.workOrder.findMany({
                where: {
                    user_id: req.userId!,
                    type: "COOK",
                    collected: false,
                },
                orderBy: [{ started_at: "asc" }, { id: "asc" }],
            });

            const laneAvailableAt = Array.from({ length: chefParallelSlots }, () => nowMs);
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

            const order = await prisma.workOrder.create({
                data: {
                    user_id: req.userId!,
                    type: "COOK",
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
                    ? `Queued cooking ${recipe.name}. It will start when a chef slot is available and finish in ${Math.ceil(cookMins)} minutes once started.`
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
        const levelUpMessage = result.levelUp ? ` Level up! Now Lvl ${result.newLevel}!` : "";
        const unlockMessage = result.blacksmithUnlocked ? " Blacksmith unlocked in Ferrum!" : "";

        // Return updated inventory + user
        const slots = await prisma.inventorySlot.findMany({
            where: { user_id: req.userId! },
            include: { item: true },
            orderBy: { slot: "asc" },
        });

        const updatedUser = await prisma.user.findUnique({ where: { id: req.userId! } });

        res.json({
            message: `Collected ${result.qty}x ${result.itemName}!${expMessage}${levelUpMessage}${unlockMessage}`,
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

/**
 * POST /game/workspace/cancel/:orderId — Cancel active order and refund input materials
 */
export const cancelWork = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        await syncHunger(req.userId!);

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

            await tx.workOrder.delete({ where: { id: order.id } });

            if (order.type === "COOK") {
                await rescheduleChefQueueAfterCancel(req.userId!, tx);
            } else if (order.type === "FARM") {
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
