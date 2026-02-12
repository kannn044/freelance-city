// ─── Game Constants ──────────────────────────────────────

export const GAME_DAY_MINUTES = 180; // 1 game day = 3 real hours
export const MAX_HUNGER = 2400;       // Max Kcal
export const HUNGER_DECAY_PER_MIN = MAX_HUNGER / GAME_DAY_MINUTES; // ~13.33 Kcal/min
export const INVENTORY_SLOTS = 8;

// ─── Hunger Penalty Tiers ────────────────────────────────

export interface HungerTier {
    minPercent: number;
    maxPercent: number;
    state: string;
    multiplier: number;
    effect: string;
}

export const HUNGER_TIERS: HungerTier[] = [
    { minPercent: 80, maxPercent: 100, state: "Fit", multiplier: 1.0, effect: "Normal Speed" },
    { minPercent: 40, maxPercent: 79, state: "Normal", multiplier: 1.2, effect: "Slightly Slower" },
    { minPercent: 20, maxPercent: 39, state: "Hungry", multiplier: 1.5, effect: "Slower" },
    { minPercent: 0, maxPercent: 19, state: "Starving", multiplier: 2.5, effect: "Very Slow" },
];

export function getHungerTier(hunger: number): HungerTier {
    const percent = (hunger / MAX_HUNGER) * 100;
    return (
        HUNGER_TIERS.find(
            (t) => percent >= t.minPercent && percent <= t.maxPercent
        ) ?? HUNGER_TIERS[HUNGER_TIERS.length - 1]
    );
}

// ─── Occupation Leveling ─────────────────────────────────

export const MAX_LEVEL = 50;
export const UNLOCK_SECOND_OCCUPATION_LEVEL = 5;

/**
 * Total EXP required to reach each level (index = level).
 * Formula: level^2 × 100  (quadratic growth)
 *   Level  1 →       0 EXP
 *   Level  2 →     400 EXP
 *   Level  5 →   2,500 EXP
 *   Level 10 →  10,000 EXP  — unlock second occupation
 *   Level 25 →  62,500 EXP
 *   Level 50 → 250,000 EXP
 */
export const LEVEL_THRESHOLDS: number[] = Array.from(
    { length: MAX_LEVEL + 1 },
    (_, i) => (i <= 1 ? 0 : i * i * 100)
);

export function getLevelFromExp(exp: number): number {
    for (let i = LEVEL_THRESHOLDS.length - 1; i >= 1; i--) {
        if (exp >= LEVEL_THRESHOLDS[i]) return i;
    }
    return 1;
}

export function getExpForNextLevel(level: number): number | null {
    if (level >= MAX_LEVEL) return null; // max level
    return LEVEL_THRESHOLDS[level + 1];
}
