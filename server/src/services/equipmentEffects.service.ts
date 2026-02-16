import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { getEquipmentRarityBuffMultiplier, type EquipmentRarity } from "../config/game.config";

type DbClient = Prisma.TransactionClient | typeof prisma;

export interface EquipmentEffectSummary {
    hungerPenaltyTierReduction: number;
    cookSecondaryIngredientSaveChance: number;
    maxHungerBonus: number;
    extraSatietyBuffPct: number;
    rawStackBonus: number;
    ingredientStackBonus: number;
    farmTimeReductionPct: number;
    cookTimeReductionPct: number;
    farmDoubleYieldChance: number;
    gourmetChance: number;
    hungerDecayReductionPerMin: number;
    cookStateHungerDecayReductionPct: number;
}

const EMPTY: EquipmentEffectSummary = {
    hungerPenaltyTierReduction: 0,
    cookSecondaryIngredientSaveChance: 0,
    maxHungerBonus: 0,
    extraSatietyBuffPct: 0,
    rawStackBonus: 0,
    ingredientStackBonus: 0,
    farmTimeReductionPct: 0,
    cookTimeReductionPct: 0,
    farmDoubleYieldChance: 0,
    gourmetChance: 0,
    hungerDecayReductionPerMin: 0,
    cookStateHungerDecayReductionPct: 0,
};

const clamp = (v: number, min = 0, max = 0.95) => Math.max(min, Math.min(max, v));

export async function getUserEquipmentEffects(userId: number, db: DbClient = prisma): Promise<EquipmentEffectSummary> {
    const rows = await db.$queryRaw<Array<{ effect_key: string | null; effect_value: number | null; effect_value2: number | null; item_rarity: EquipmentRarity | null }>>`
        SELECT i.effect_key, i.effect_value, i.effect_value2, ue.item_rarity
        FROM user_equipments ue
        JOIN items i ON i.id = ue.item_id
        WHERE ue.user_id = ${userId}
          AND ue.item_id IS NOT NULL
          AND i.type = 'EQUIPMENT'
    `;

    const effects = { ...EMPTY };

    for (const row of rows) {
        const key = row.effect_key ?? "";
        const multiplier = getEquipmentRarityBuffMultiplier((row.item_rarity ?? "NORMAL") as EquipmentRarity);
        const v = Number(row.effect_value ?? 0) * multiplier;
        const v2 = Number(row.effect_value2 ?? 0) * multiplier;

        if (key === "hunger_penalty_tier_reduction") effects.hungerPenaltyTierReduction += v;
        if (key === "cook_secondary_ingredient_save_chance") effects.cookSecondaryIngredientSaveChance += v;
        if (key === "max_hunger_bonus") effects.maxHungerBonus += v;
        if (key === "max_hunger_and_satiety_bonus") {
            effects.maxHungerBonus += v;
            effects.extraSatietyBuffPct += v2;
        }
        if (key === "raw_stack_bonus") effects.rawStackBonus += v;
        if (key === "ingredient_stack_bonus") effects.ingredientStackBonus += v;
        if (key === "farm_time_reduction_pct") effects.farmTimeReductionPct += v;
        if (key === "cook_time_reduction_pct") effects.cookTimeReductionPct += v;
        if (key === "farm_double_yield_chance") effects.farmDoubleYieldChance += v;
        if (key === "gourmet_chance") effects.gourmetChance += v;
        if (key === "hunger_decay_reduction_per_min") effects.hungerDecayReductionPerMin += v;
        if (key === "cook_state_hunger_decay_reduction_pct") effects.cookStateHungerDecayReductionPct += v;
    }

    effects.cookSecondaryIngredientSaveChance = clamp(effects.cookSecondaryIngredientSaveChance, 0, 0.9);
    effects.farmTimeReductionPct = clamp(effects.farmTimeReductionPct, 0, 0.8);
    effects.cookTimeReductionPct = clamp(effects.cookTimeReductionPct, 0, 0.8);
    effects.farmDoubleYieldChance = clamp(effects.farmDoubleYieldChance, 0, 0.9);
    effects.gourmetChance = clamp(effects.gourmetChance, 0, 0.9);
    effects.cookStateHungerDecayReductionPct = clamp(effects.cookStateHungerDecayReductionPct, 0, 0.9);
    effects.extraSatietyBuffPct = clamp(effects.extraSatietyBuffPct, 0, 0.9);

    return effects;
}

export function getEffectiveMaxStack(
    itemType: string,
    baseMaxStack: number,
    effects: EquipmentEffectSummary
): number {
    if (itemType === "RAW") {
        return Math.max(1, baseMaxStack + Math.floor(effects.rawStackBonus));
    }
    if (itemType === "INGREDIENT") {
        return Math.max(1, baseMaxStack + Math.floor(effects.ingredientStackBonus));
    }
    return Math.max(1, baseMaxStack);
}
