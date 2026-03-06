// ─── Shared Game Config ─────────────────────────────────
// Single source of truth for constants used by both client and server.
// All values here are authoritative — do NOT duplicate in client or server code.

// ─── Occupation Leveling ─────────────────────────────────

/** Current hard cap for occupation levels. */
export const MAX_LEVEL = 50;

/**
 * Minimum level in first job required to unlock secondary job.
 */
export const UNLOCK_SECONDARY_JOB_LEVEL = 5;
export const UNLOCK_SECOND_OCCUPATION_LEVEL = UNLOCK_SECONDARY_JOB_LEVEL;

/**
 * Initial total inventory slots for each user.
 */
export const INVENTORY_SLOTS = 16;

/**
 * Maximum durability for equipment items.
 */
export const MAX_DURABILITY = 100;

// ─── Hunger Task Decay ──────────────────────────────────

/**
 * Task-driven hunger decay (kcal/sec).
 * Separate tuning for each task type so balance can be adjusted independently.
 */
export const HUNGER_TASK_DECAY_PER_SEC = {
    /** FARM: decay per active plot (1 plot = up to 9 same-seed farm tasks) */
    FARM_PER_PLOT: 0.01,
    /** COOK: decay per active cooking menu */
    COOK_PER_MENU: 0.25,
} as const;

/** Alias for client-side fallback usage */
export const DEFAULT_HUNGER_TASK_DECAY_PER_SEC = HUNGER_TASK_DECAY_PER_SEC;

export type HungerTaskDecayConfig = {
    farmPerPlot: number;
    cookPerMenu: number;
};

// ─── Durability Decay ───────────────────────────────────

/**
 * Durability decay per second per active task, by task type.
 * Values are configurable at runtime via game_settings table.
 */
export const DURABILITY_DECAY_PER_SEC = {
    FARM: 0.1,
    COOK: 0.15,
    MINE: 0.1,
    SMELT: 0.15,
    EXTRACT: 0.1,
    REFINE: 0.15,
    GATHER: 0.1,
    SEW: 0.15,
    FORAGE: 0.1,
    BREW: 0.15,
} as const;

/** Alias for client-side fallback usage */
export const DEFAULT_DURABILITY_DECAY_PER_SEC = DURABILITY_DECAY_PER_SEC;

export type DurabilityDecayConfig = {
    farm: number;
    cook: number;
    mine: number;
    smelt: number;
    extract: number;
    refine: number;
    gather: number;
    sew: number;
    forage: number;
    brew: number;
};

// ─── Level Thresholds ───────────────────────────────────

/**
 * Total EXP required to reach each level (index = level).
 * Formula: level^2 × 100  (quadratic growth)
 *   Level  1 →       0 EXP
 *   Level  2 →     400 EXP
 *   Level  5 →   2,500 EXP
 *   Level 10 →  10,000 EXP
 *   Level 25 →  62,500 EXP
 *   Level 50 → 250,000 EXP
 */
export const LEVEL_THRESHOLDS: number[] = Array.from(
    { length: MAX_LEVEL + 1 },
    (_, i) => (i <= 1 ? 0 : i * i * 100)
);

export function getLevelFromExp(exp: number): number {
    // Scan backward for fastest lookup of highest unlocked level.
    for (let i = LEVEL_THRESHOLDS.length - 1; i >= 1; i--) {
        if (exp >= LEVEL_THRESHOLDS[i]) return i;
    }
    return 1;
}

export function getExpForNextLevel(level: number): number | null {
    // Return null when already at max level.
    if (level >= MAX_LEVEL) return null;
    return LEVEL_THRESHOLDS[level + 1];
}

// ─── EXP Progress (for client UI display) ───────────────

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

// ─── Ferrum Mining ──────────────────────────────────────

export interface FerrumMiningDropRates {
    ironOre: number;
    copperOre: number;
    steelOre: number;
    stone: number;
    coal: number;
    gem: number;
}

export interface FerrumMiningConfig {
    layerTimeMins: {
        surface: number;
        deep: number;
        core: number;
    };
    /** Effective layer times computed per-user (with hunger, skill, equipment multipliers). */
    effectiveLayerTimeMins?: {
        surface: number;
        deep: number;
        core: number;
    };
    dropRates: {
        surface: FerrumMiningDropRates;
        deep: FerrumMiningDropRates;
        core: FerrumMiningDropRates;
    };
}

/**
 * Default Ferrum Mining configuration.
 * These values are overridable at runtime via the game_settings table.
 */
export const DEFAULT_FERRUM_MINING_CONFIG: FerrumMiningConfig = {
    layerTimeMins: {
        surface: 6,
        deep: 11,
        core: 16,
    },
    dropRates: {
        surface: { ironOre: 0.65, copperOre: 0.3, steelOre: 0.0, stone: 0.7, coal: 0.45, gem: 0.02 },
        deep: { ironOre: 0.45, copperOre: 0.45, steelOre: 0.18, stone: 0.55, coal: 0.6, gem: 0.05 },
        core: { ironOre: 0.3, copperOre: 0.35, steelOre: 0.35, stone: 0.45, coal: 0.7, gem: 0.09 },
    },
};
