// ─── Client Game Constants ──────────────────────────────
// Re-exports shared config as single source of truth.
// Client-specific additions can be added below.

export {
    MAX_LEVEL,
    UNLOCK_SECOND_OCCUPATION_LEVEL,
    UNLOCK_SECONDARY_JOB_LEVEL,
    INVENTORY_SLOTS,
    MAX_DURABILITY,
    HUNGER_TASK_DECAY_PER_SEC,
    DEFAULT_HUNGER_TASK_DECAY_PER_SEC,
    DURABILITY_DECAY_PER_SEC,
    DEFAULT_DURABILITY_DECAY_PER_SEC,
    LEVEL_THRESHOLDS,
    getLevelFromExp,
    getExpForNextLevel,
    getExpProgress,
    DEFAULT_FERRUM_MINING_CONFIG,
} from '@shared/gameConfig';

export type {
    HungerTaskDecayConfig,
    DurabilityDecayConfig,
    ExpProgress,
    FerrumMiningDropRates,
    FerrumMiningConfig,
} from '@shared/gameConfig';
