import {
    CITY_ENCHANT_CONFIGS,
    ENCHANT_MILESTONES,
    type CityEnchantConfig,
    type EquipmentSlotKey,
} from "./gameConfig";

/** Returns the config for whichever city enchants the given equipment slot. */
export function getCityEnchantConfigForSlot(slot: EquipmentSlotKey): CityEnchantConfig | undefined {
    return Object.values(CITY_ENCHANT_CONFIGS).find((cfg) =>
        cfg.applicableSlots.includes(slot)
    );
}

/** Returns the material name for a given target level within a config. */
export function getMaterialForLevel(cfg: CityEnchantConfig, targetLevel: number): string {
    const tier = cfg.materialChain.find(
        (t) => targetLevel >= t.forLevels[0] && targetLevel <= t.forLevels[1]
    );
    return tier?.itemName ?? "Unknown Material";
}

/** Maps milestone level to the stat column name. */
export function milestoneToStatKey(level: number): string {
    const map: Record<number, string> = { 3: "special_stat_1", 6: "special_stat_2", 9: "special_stat_3", 12: "special_stat_4" };
    return map[level] ?? "special_stat_1";
}

/** Picks a random stat from pool excluding already-assigned ones. Returns null if pool exhausted. */
export function pickRandomStat(pool: string[], existing: string[]): string | null {
    const available = pool.filter((s) => !existing.includes(s));
    if (available.length === 0) return null;
    return available[Math.floor(Math.random() * available.length)];
}

/** Returns partial update object that clears special stats for milestones above newLevel. */
export function clearStatsAboveLevel(
    slot: { special_stat_1?: string | null; special_stat_2?: string | null; special_stat_3?: string | null; special_stat_4?: string | null },
    newLevel: number
): Record<string, null> {
    const cleared: Record<string, null> = {};
    const milestones = ENCHANT_MILESTONES as readonly number[];
    if (newLevel < milestones[3] && slot.special_stat_4) cleared["special_stat_4"] = null;
    if (newLevel < milestones[2] && slot.special_stat_3) cleared["special_stat_3"] = null;
    if (newLevel < milestones[1] && slot.special_stat_2) cleared["special_stat_2"] = null;
    if (newLevel < milestones[0] && slot.special_stat_1) cleared["special_stat_1"] = null;
    return cleared;
}
