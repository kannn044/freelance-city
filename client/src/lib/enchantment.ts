import {
    ENCHANT_SUCCESS_RATES,
    ENCHANT_BONUS_MULTIPLIER,
    ENCHANT_MILESTONES,
    ENCHANT_DESTROY_ZONE_MIN,
    ENCHANT_MAX_LEVEL,
    SPECIAL_STAT_DEFINITIONS,
    type CityEnchantConfig,
} from '../../../shared/gameConfig';
import { getMaterialForLevel } from '../../../shared/enchantmentUtils';
import type { InventorySlot } from '../stores/gameStore';

export { ENCHANT_BONUS_MULTIPLIER, ENCHANT_SUCCESS_RATES, ENCHANT_MILESTONES, ENCHANT_MAX_LEVEL, SPECIAL_STAT_DEFINITIONS, getMaterialForLevel };

export const ENCHANT_LEVEL_COLOR: Record<number, string> = {
    0:  "rgba(255,255,255,0.3)",
    1:  "#a3e635", 2:  "#a3e635", 3:  "#34d399",
    4:  "#38bdf8", 5:  "#38bdf8", 6:  "#818cf8",
    7:  "#a78bfa", 8:  "#a78bfa", 9:  "#f472b6",
    10: "#fb923c", 11: "#fb923c", 12: "#facc15",
};

export function getEnchantColor(level: number): string {
    return ENCHANT_LEVEL_COLOR[level] ?? ENCHANT_LEVEL_COLOR[0];
}

export function getFailureZoneLabel(targetLevel: number): string {
    if (targetLevel >= 10) return "Extreme Zone — Drop 2 lvls + 50% DESTROY";
    if (targetLevel >= 6)  return "Danger Zone — Drop 1 lvl + 50% DESTROY";
    if (targetLevel > 1)   return `Safe Zone — Drop to +${targetLevel - 1}`;
    return "Safe Zone — Floor at +1";
}

export function formatSuccessRate(rate: number): string {
    if (rate >= 0.01) return `${(rate * 100).toFixed(0)}%`;
    return `${(rate * 100).toFixed(3)}%`;
}

/** Returns the enchant level of a slot (0 if no enchant). */
export function getSlotEnchantLevel(slot: InventorySlot): number {
    return (slot as any).enchant_level ?? 0;
}

/** Returns all non-null special stats for a slot. */
export function getSlotSpecialStats(slot: InventorySlot): string[] {
    return [
        (slot as any).special_stat_1,
        (slot as any).special_stat_2,
        (slot as any).special_stat_3,
        (slot as any).special_stat_4,
    ].filter(Boolean) as string[];
}

/** Returns the label for a special stat key, with its value. */
export function formatSpecialStatLabel(key: string): string {
    const def = SPECIAL_STAT_DEFINITIONS[key];
    if (!def) return key;
    const numericVal = def.unit.includes("qty") || def.unit.includes("Kcal")
        ? def.value.toString()
        : `${(def.value * 100).toFixed(0)}`;
    return `${def.label}: ${def.unit.startsWith("+") || def.unit.startsWith("−") ? "" : ""}${def.unit.replace("%", "")}${numericVal}${def.unit.endsWith("%") ? "%" : ""}`;
}

export function isMilestoneLevel(level: number): boolean {
    return (ENCHANT_MILESTONES as readonly number[]).includes(level);
}

export function isDestroyZone(level: number): boolean {
    return level >= ENCHANT_DESTROY_ZONE_MIN;
}

/** Preview info derived purely on the client (for display before server call). */
export function buildEnchantPreview(slot: InventorySlot, cfg: CityEnchantConfig) {
    const currentLevel = getSlotEnchantLevel(slot);
    const targetLevel = currentLevel + 1;
    if (targetLevel > ENCHANT_MAX_LEVEL) return null;

    const cost = cfg.materialCost[targetLevel];
    if (!cost) return null;

    const materialName = getMaterialForLevel(cfg, targetLevel);
    const successRate = ENCHANT_SUCCESS_RATES[targetLevel] ?? 0;

    return {
        currentLevel,
        targetLevel,
        materialName,
        materialQty: cost.qty,
        goldCost: cost.gold,
        successRate,
    };
}
