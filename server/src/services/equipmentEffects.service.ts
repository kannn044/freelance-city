import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { getEquipmentRarityBuffMultiplier, type EquipmentRarity } from "../config/game.config";
import { ENCHANT_BONUS_MULTIPLIER, SPECIAL_STAT_DEFINITIONS } from "../../../shared/gameConfig";

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

    // Textilis special stats (T-01 to T-12)
    enchantExpGainPct: number;
    enchantDurabilityProtectPct: number;
    enchantRareDropPct: number;
    enchantFirstJobQtyBonus: number;
    enchantMarketTaxDiscountPct: number;
    enchantTaskHungerCostPct: number;
    enchantMaxHungerFlat: number;
    enchantSecondaryJobDoubleChancePct: number;
    enchantSatietyBuffDurationPct: number;
    enchantIngredientSaveExtraPct: number;
    enchantWorkSpeedPct: number;
    enchantGourmetChancePct: number;

    // Ferrum special stats (F-01 to F-08)
    enchantFirstJobSpeedPct: number;
    enchantFirstJobDoubleChancePct: number;
    enchantRareFindPct: number;
    enchantSecondaryJobSpeedPct: number;
    enchantSecondaryJobBonusPct: number;
    enchantDeepHungerReductionPct: number;
    enchantToolDurabilityProtectPct: number;
    enchantFirstJobYieldFlat: number;
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

    enchantExpGainPct: 0,
    enchantDurabilityProtectPct: 0,
    enchantRareDropPct: 0,
    enchantFirstJobQtyBonus: 0,
    enchantMarketTaxDiscountPct: 0,
    enchantTaskHungerCostPct: 0,
    enchantMaxHungerFlat: 0,
    enchantSecondaryJobDoubleChancePct: 0,
    enchantSatietyBuffDurationPct: 0,
    enchantIngredientSaveExtraPct: 0,
    enchantWorkSpeedPct: 0,
    enchantGourmetChancePct: 0,

    enchantFirstJobSpeedPct: 0,
    enchantFirstJobDoubleChancePct: 0,
    enchantRareFindPct: 0,
    enchantSecondaryJobSpeedPct: 0,
    enchantSecondaryJobBonusPct: 0,
    enchantDeepHungerReductionPct: 0,
    enchantToolDurabilityProtectPct: 0,
    enchantFirstJobYieldFlat: 0,
};

const clamp = (v: number, min = 0, max = 0.95) => Math.max(min, Math.min(max, v));

export async function getUserEquipmentEffects(userId: number, db: DbClient = prisma): Promise<EquipmentEffectSummary> {
    const rows = await db.$queryRaw<Array<{
        effect_key: string | null;
        effect_value: number | null;
        effect_value2: number | null;
        item_rarity: EquipmentRarity | null;
        durability: number | null;
        enchant_level: number | null;
        special_stat_1: string | null;
        special_stat_2: string | null;
        special_stat_3: string | null;
        special_stat_4: string | null;
    }>>`
        SELECT i.effect_key, i.effect_value, i.effect_value2, ue.item_rarity, ue.durability,
               ue.enchant_level, ue.special_stat_1, ue.special_stat_2, ue.special_stat_3, ue.special_stat_4
        FROM user_equipments ue
        JOIN items i ON i.id = ue.item_id
        WHERE ue.user_id = ${userId}
          AND ue.item_id IS NOT NULL
          AND i.type = 'EQUIPMENT'
    `;

    const effects = { ...EMPTY };

    for (const row of rows) {
        // Skip broken equipment (durability depleted)
        if (Number(row.durability ?? 0) <= 0) continue;

        const key = row.effect_key ?? "";
        const multiplier = getEquipmentRarityBuffMultiplier((row.item_rarity ?? "NORMAL") as EquipmentRarity);
        const enchantBonus = ENCHANT_BONUS_MULTIPLIER[row.enchant_level ?? 0] ?? 0;
        const v = Number(row.effect_value ?? 0) * multiplier * (1 + enchantBonus);
        const v2 = Number(row.effect_value2 ?? 0) * multiplier * (1 + enchantBonus);

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

        // Accumulate enchantment special stats
        const specialStats = [row.special_stat_1, row.special_stat_2, row.special_stat_3, row.special_stat_4];
        for (const statKey of specialStats) {
            if (!statKey) continue;
            const def = SPECIAL_STAT_DEFINITIONS[statKey];
            if (!def) continue;
            const val = def.value;
            switch (statKey) {
                case "enchant_exp_gain_pct":                    effects.enchantExpGainPct += val; break;
                case "enchant_durability_protect_pct":          effects.enchantDurabilityProtectPct += val; break;
                case "enchant_rare_drop_pct":                   effects.enchantRareDropPct += val; break;
                case "enchant_first_job_qty_bonus":             effects.enchantFirstJobQtyBonus += val; break;
                case "enchant_market_tax_discount_pct":         effects.enchantMarketTaxDiscountPct += val; break;
                case "enchant_task_hunger_cost_pct":            effects.enchantTaskHungerCostPct += val; break;
                case "enchant_max_hunger_flat":                 effects.enchantMaxHungerFlat += val; break;
                case "enchant_secondary_job_double_chance_pct": effects.enchantSecondaryJobDoubleChancePct += val; break;
                case "enchant_satiety_buff_duration_pct":       effects.enchantSatietyBuffDurationPct += val; break;
                case "enchant_ingredient_save_extra_pct":       effects.enchantIngredientSaveExtraPct += val; break;
                case "enchant_work_speed_pct":                  effects.enchantWorkSpeedPct += val; break;
                case "enchant_gourmet_chance_pct":              effects.enchantGourmetChancePct += val; break;
                case "enchant_first_job_speed_pct":             effects.enchantFirstJobSpeedPct += val; break;
                case "enchant_first_job_double_chance_pct":     effects.enchantFirstJobDoubleChancePct += val; break;
                case "enchant_rare_find_pct":                   effects.enchantRareFindPct += val; break;
                case "enchant_secondary_job_speed_pct":         effects.enchantSecondaryJobSpeedPct += val; break;
                case "enchant_secondary_job_bonus_pct":         effects.enchantSecondaryJobBonusPct += val; break;
                case "enchant_deep_hunger_reduction_pct":       effects.enchantDeepHungerReductionPct += val; break;
                case "enchant_tool_durability_protect_pct":     effects.enchantToolDurabilityProtectPct += val; break;
                case "enchant_first_job_yield_flat":            effects.enchantFirstJobYieldFlat += val; break;
            }
        }
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
