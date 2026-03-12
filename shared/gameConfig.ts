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
    FARM: 0.005,
    COOK: 0.015,
    MINE: 0.01,
    SMELT: 0.015,
    EXTRACT: 0.01,
    REFINE: 0.015,
    GATHER: 0.01,
    SEW: 0.015,
    FORAGE: 0.01,
    BREW: 0.015,
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

// ─── Enchantment System ──────────────────────────────────────────────────────

export const ENCHANT_SUCCESS_RATES: Record<number, number> = {
    1: 0.90, 2: 0.80, 3: 0.50, 4: 0.40, 5: 0.30,
    6: 0.10, 7: 0.08, 8: 0.04, 9: 0.01,
    10: 0.005, 11: 0.0001, 12: 0.00005,
};

export const ENCHANT_BONUS_MULTIPLIER: Record<number, number> = {
    0: 0, 1: 0.05, 2: 0.10, 3: 0.18, 4: 0.25,
    5: 0.33, 6: 0.44, 7: 0.55, 8: 0.68,
    9: 0.83, 10: 1.00, 11: 1.20, 12: 1.50,
};

export const ENCHANT_MILESTONES = [3, 6, 9, 12] as const;

export const ENCHANT_FAILURE_DROP: Record<number, number> = {
    1: 1, 2: 1, 3: 1, 4: 1, 5: 1,
    6: 1, 7: 1, 8: 1, 9: 1,
    10: 2, 11: 2, 12: 2,
};

export const ENCHANT_LEVEL_FLOOR      = 1;
export const ENCHANT_DESTROY_ZONE_MIN = 6;
export const ENCHANT_DESTROY_CHANCE   = 0.50;
export const ENCHANT_MAX_LEVEL        = 12;

export type EquipmentSlotKey = "HEAD" | "UPPER_BODY" | "LOWER_BODY" | "ARM" | "GLOVE" | "SHOE";

export interface EnchantMaterialTier {
    itemName: string;
    forLevels: [number, number];
}

export interface CityEnchantConfig {
    cityKey: string;
    workshopLabel: string;
    craftWorkType: string;
    uiTheme: {
        primaryColor: string;
        icon: string;
        gradientFrom: string;
        gradientTo: string;
    };
    applicableSlots: EquipmentSlotKey[];
    materialChain: EnchantMaterialTier[];
    materialCost: Record<number, { qty: number; gold: number }>;
    specialStatPool: string[];
}

export const CITY_ENCHANT_CONFIGS: Record<string, CityEnchantConfig> = {

    textilis: {
        cityKey: "textilis",
        workshopLabel: "Enchantment Loom",
        craftWorkType: "SEW",
        uiTheme: {
            primaryColor: "#a78bfa",
            icon: "Sparkles",
            gradientFrom: "#4c1d95",
            gradientTo: "#7c3aed",
        },
        applicableSlots: ["HEAD", "UPPER_BODY", "LOWER_BODY", "GLOVE", "SHOE"],
        materialChain: [
            { itemName: "Enchant Stone",  forLevels: [1, 5] },
            { itemName: "Rune Shard",     forLevels: [6, 9] },
            { itemName: "Arcane Crystal", forLevels: [10, 12] },
        ],
        materialCost: {
            1:  { qty: 3,  gold: 500   },
            2:  { qty: 5,  gold: 1000  },
            3:  { qty: 10, gold: 2000  },
            4:  { qty: 15, gold: 4000  },
            5:  { qty: 30, gold: 8000  },
            6:  { qty: 10, gold: 12000 },
            7:  { qty: 20, gold: 18000 },
            8:  { qty: 30, gold: 24000 },
            9:  { qty: 10, gold: 28000 },
            10: { qty: 20, gold: 40000 },
            11: { qty: 30, gold: 90000 },
        },
        specialStatPool: [
            "enchant_exp_gain_pct", "enchant_durability_protect_pct", "enchant_rare_drop_pct",
            "enchant_first_job_qty_bonus", "enchant_market_tax_discount_pct", "enchant_task_hunger_cost_pct",
            "enchant_max_hunger_flat", "enchant_secondary_job_double_chance_pct", "enchant_satiety_buff_duration_pct",
            "enchant_ingredient_save_extra_pct", "enchant_work_speed_pct", "enchant_gourmet_chance_pct",
        ],
    },

    ferrum: {
        cityKey: "ferrum",
        workshopLabel: "Upgrade Forge",
        craftWorkType: "SMELT",
        uiTheme: {
            primaryColor: "#fb923c",
            icon: "Flame",
            gradientFrom: "#7c2d12",
            gradientTo: "#c2410c",
        },
        applicableSlots: ["ARM"],
        materialChain: [
            { itemName: "Metal Dust",  forLevels: [1, 5] },
            { itemName: "Rune Ingot",  forLevels: [6, 9] },
            { itemName: "Chaos Core",  forLevels: [10, 12] },
        ],
        materialCost: {
            1:  { qty: 3,  gold: 500   },
            2:  { qty: 5,  gold: 1000  },
            3:  { qty: 10, gold: 2000  },
            4:  { qty: 15, gold: 4000  },
            5:  { qty: 30, gold: 8000  },
            6:  { qty: 10, gold: 12000 },
            7:  { qty: 20, gold: 18000 },
            8:  { qty: 30, gold: 24000 },
            9:  { qty: 10, gold: 28000 },
            10: { qty: 20, gold: 40000 },
            11: { qty: 30, gold: 90000 },
        },
        specialStatPool: [
            "enchant_first_job_speed_pct", "enchant_first_job_double_chance_pct", "enchant_rare_find_pct",
            "enchant_secondary_job_speed_pct", "enchant_secondary_job_bonus_pct", "enchant_deep_hunger_reduction_pct",
            "enchant_tool_durability_protect_pct", "enchant_first_job_yield_flat",
        ],
    },

};

export const SPECIAL_STAT_DEFINITIONS: Record<string, { label: string; value: number; unit: string }> = {
    // Textilis (T-01 to T-12)
    enchant_exp_gain_pct:                      { label: "EXP Gain",             value: 0.08,  unit: "+%" },
    enchant_durability_protect_pct:            { label: "Durability Loss",      value: 0.12,  unit: "−%" },
    enchant_rare_drop_pct:                     { label: "Rare Drop",             value: 0.03,  unit: "+%" },
    enchant_first_job_qty_bonus:               { label: "Harvest Qty",           value: 1,     unit: "+qty" },
    enchant_market_tax_discount_pct:           { label: "Market Tax",            value: 0.02,  unit: "−%" },
    enchant_task_hunger_cost_pct:              { label: "Task Hunger Cost",      value: 0.08,  unit: "−%" },
    enchant_max_hunger_flat:                   { label: "Max Hunger",            value: 150,   unit: "+Kcal" },
    enchant_secondary_job_double_chance_pct:   { label: "Double Item",           value: 0.04,  unit: "+%" },
    enchant_satiety_buff_duration_pct:         { label: "Buff Duration",         value: 0.15,  unit: "+%" },
    enchant_ingredient_save_extra_pct:         { label: "Ingredient Save",       value: 0.05,  unit: "+%" },
    enchant_work_speed_pct:                    { label: "Work Speed",            value: 0.04,  unit: "+%" },
    enchant_gourmet_chance_pct:                { label: "Gourmet Chance",        value: 0.03,  unit: "+%" },
    // Ferrum (F-01 to F-08)
    enchant_first_job_speed_pct:               { label: "Expedition Speed",      value: 0.10,  unit: "−%" },
    enchant_first_job_double_chance_pct:       { label: "Double Item",           value: 0.06,  unit: "+%" },
    enchant_rare_find_pct:                     { label: "Rare Drop",             value: 0.04,  unit: "+%" },
    enchant_secondary_job_speed_pct:           { label: "Secondary Job Speed",   value: 0.08,  unit: "−%" },
    enchant_secondary_job_bonus_pct:           { label: "Double Item",           value: 0.05,  unit: "+%" },
    enchant_deep_hunger_reduction_pct:         { label: "Deep Task Hunger",      value: 0.10,  unit: "−%" },
    enchant_tool_durability_protect_pct:       { label: "Tool Durability Loss",  value: 0.15,  unit: "−%" },
    enchant_first_job_yield_flat:              { label: "Farm Yield",            value: 2,     unit: "+qty" },
};

// ─── Shipment System ────────────────────────────────────

export const CARGO_BOX_CONFIG = {
    sizes: {
        S: { capacity: 5,  price: 50  },
        M: { capacity: 10, price: 100 },
        L: { capacity: 15, price: 200 },
    },
    maxBoxesPerPlayer: 5,
} as const;

export const SHIP_CONFIG = {
    public: {
        capacity: 10,
        departureIntervalMin: 5,
    },
    private: {
        sizes: {
            S: { capacity: 3,  fuelCost: 1, rpsSlots: 3 },
            M: { capacity: 5,  fuelCost: 2, rpsSlots: 5 },
            L: { capacity: 10, fuelCost: 3, rpsSlots: 7 },
        },
    },
    pirate: {
        sizes: {
            S: { fuelCost: 1, creditCost: 500,  rpsSlots: 3 },
            M: { fuelCost: 2, creditCost: 1000, rpsSlots: 5 },
            L: { fuelCost: 3, creditCost: 2000, rpsSlots: 7 },
        },
        cooldownMinutes: 30,
    },
} as const;

export const PURCHASE_ORDER_TIMEOUT_MIN = 10;

export type CargoBoxSizeKey = keyof typeof CARGO_BOX_CONFIG.sizes;
export type ShipSizeKey = keyof typeof SHIP_CONFIG.private.sizes;
