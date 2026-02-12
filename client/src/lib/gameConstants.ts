// ─── Level Thresholds (mirror of server/src/config/game.config.ts) ────

export const MAX_LEVEL = 50;
export const UNLOCK_SECOND_OCCUPATION_LEVEL = 5;

/**
 * Total EXP required to reach each level (index = level).
 * Formula: level^2 × 100  (quadratic growth)
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

export interface ExpProgress {
    level: number;
    currentExp: number;
    expInLevel: number;       // EXP earned within this level
    expNeededForLevel: number; // total EXP span of this level
    nextThreshold: number | null;
    progressPct: number;      // 0–100
    isMaxLevel: boolean;
}

/**
 * Compute EXP progress for display.
 * For a level-0 occupation (not unlocked), returns zeroed-out values.
 */
export function getExpProgress(exp: number, level: number): ExpProgress {
    if (level <= 0) {
        return {
            level: 0,
            currentExp: 0,
            expInLevel: 0,
            expNeededForLevel: 0,
            nextThreshold: null,
            progressPct: 0,
            isMaxLevel: false,
        };
    }

    const actualLevel = getLevelFromExp(exp);
    const isMaxLevel = actualLevel >= MAX_LEVEL;
    const currentThreshold = LEVEL_THRESHOLDS[actualLevel] ?? 0;
    const nextThreshold = isMaxLevel ? null : LEVEL_THRESHOLDS[actualLevel + 1];

    const expInLevel = exp - currentThreshold;
    const expNeededForLevel = nextThreshold !== null
        ? nextThreshold - currentThreshold
        : 0;

    const progressPct = isMaxLevel
        ? 100
        : expNeededForLevel > 0
            ? Math.min(100, (expInLevel / expNeededForLevel) * 100)
            : 0;

    return {
        level: actualLevel,
        currentExp: exp,
        expInLevel,
        expNeededForLevel,
        nextThreshold,
        progressPct,
        isMaxLevel,
    };
}
