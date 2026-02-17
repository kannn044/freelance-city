// ─── Game Constants ──────────────────────────────────────

/**
 * Real-time minutes that represent 1 in-game day.
 * Higher value = slower daily loop.
 */
export const GAME_DAY_MINUTES = 180; // 1 game day = 3 real hours

/**
 * Player hunger cap (kcal-style resource).
 * Most hunger calculations are normalized against this value.
 */
export const MAX_HUNGER = 2400;

/**
 * Passive hunger drain per real minute.
 * Derived from MAX_HUNGER and GAME_DAY_MINUTES.
 */
export const HUNGER_DECAY_PER_MIN = MAX_HUNGER / GAME_DAY_MINUTES; // ~13.33 Kcal/min

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

/**
 * Harvest material rarity drop weights.
 * Used for farm-produced RAW materials (Vegetable, Chicken Meat, Beef Meat).
 */
export const HARVEST_ITEM_RARITY_DROP_RATES: Record<EquipmentRarity, number> = {
    NORMAL: 80,
    RARE: 28,
    EPIC: 1.9,
    LEGENDARY: 0.1,
};

/**
 * Initial total inventory slots for each user.
 */
export const INVENTORY_SLOTS = 8;

// ─── Equipment Rarity ───────────────────────────────────

export type EquipmentRarity = "NORMAL" | "RARE" | "EPIC" | "LEGENDARY";

/**
 * Drop rates for equipment box rarity.
 * Sum must equal 1.0
 */
export const EQUIPMENT_RARITY_DROP_RATES: Record<EquipmentRarity, number> = {
    NORMAL: 0.95,
    RARE: 0.045,
    EPIC: 0.0045,
    LEGENDARY: 0.0005,
};

/**
 * Buff scaler by rarity.
 * Legendary keeps current baseline stats (1.0).
 */
export const EQUIPMENT_RARITY_BUFF_MULTIPLIER: Record<EquipmentRarity, number> = {
    NORMAL: 0.25,
    RARE: 0.5,
    EPIC: 0.75,
    LEGENDARY: 1.0,
};

export function getEquipmentRarityBuffMultiplier(rarity: EquipmentRarity): number {
    return EQUIPMENT_RARITY_BUFF_MULTIPLIER[rarity] ?? 1.0;
}

/**
 * Meal buff multiplier by rarity tier.
 * Applied to `buff_pct` when consuming meal items.
 */
export const FOOD_RARITY_BUFF_MULTIPLIER: Record<EquipmentRarity, number> = {
    NORMAL: 1.0,
    RARE: 1.2,
    EPIC: 1.5,
    LEGENDARY: 2.0,
};

export function getFoodRarityBuffMultiplier(rarity: EquipmentRarity): number {
    return FOOD_RARITY_BUFF_MULTIPLIER[rarity] ?? 1.0;
}

export interface CookRarityMixRule {
    key: `${EquipmentRarity}+${EquipmentRarity}`;
    outcomes: Array<{ rarity: EquipmentRarity; chance: number }>;
}

/**
 * Chef ingredient-mix rarity rules (unordered pair; 10 total cases for 4 tiers).
 * Chance values are weights and do not need to sum to 1.
 */
export const COOK_INGREDIENT_RARITY_MIX_RULES: CookRarityMixRule[] = [
    { key: "NORMAL+NORMAL", outcomes: [{ rarity: "NORMAL", chance: 1 }] },
    { key: "NORMAL+RARE", outcomes: [{ rarity: "NORMAL", chance: 0.7 }, { rarity: "RARE", chance: 0.3 }] },
    { key: "NORMAL+EPIC", outcomes: [{ rarity: "NORMAL", chance: 0.8 }, { rarity: "RARE", chance: 0.2 }] },
    { key: "NORMAL+LEGENDARY", outcomes: [{ rarity: "NORMAL", chance: 0.9 }, { rarity: "RARE", chance: 0.1 }] },
    { key: "RARE+RARE", outcomes: [{ rarity: "RARE", chance: 0.5 }, { rarity: "NORMAL", chance: 0.5 }] },
    { key: "RARE+EPIC", outcomes: [{ rarity: "NORMAL", chance: 0.35 }, { rarity: "RARE", chance: 0.55 }, { rarity: "EPIC", chance: 0.1 }] },
    { key: "RARE+LEGENDARY", outcomes: [{ rarity: "NORMAL", chance: 0.35 }, { rarity: "RARE", chance: 0.6 }, { rarity: "EPIC", chance: 0.05 }] },
    { key: "EPIC+EPIC", outcomes: [{ rarity: "NORMAL", chance: 0.25 }, { rarity: "RARE", chance: 0.35 }, { rarity: "EPIC", chance: 0.4 }] },
    { key: "EPIC+LEGENDARY", outcomes: [{ rarity: "NORMAL", chance: 0.2 }, { rarity: "RARE", chance: 0.35 }, { rarity: "EPIC", chance: 0.45 }] },
    { key: "LEGENDARY+LEGENDARY", outcomes: [{ rarity: "NORMAL", chance: 0.1 }, { rarity: "RARE", chance: 0.2 }, { rarity: "EPIC", chance: 0.35 }, { rarity: "LEGENDARY", chance: 0.35 }] },
];

function sortPair(a: EquipmentRarity, b: EquipmentRarity): `${EquipmentRarity}+${EquipmentRarity}` {
    const rank: Record<EquipmentRarity, number> = {
        NORMAL: 0,
        RARE: 1,
        EPIC: 2,
        LEGENDARY: 3,
    };
    return rank[a] <= rank[b] ? `${a}+${b}` : `${b}+${a}`;
}

export function resolveCookMealRarityByPair(a: EquipmentRarity, b: EquipmentRarity): EquipmentRarity {
    const key = sortPair(a, b);
    const rule = COOK_INGREDIENT_RARITY_MIX_RULES.find((r) => r.key === key);
    if (!rule || rule.outcomes.length === 0) return "NORMAL";

    const total = rule.outcomes.reduce((sum, o) => sum + Math.max(0, o.chance), 0);
    if (total <= 0) return "NORMAL";

    let roll = Math.random() * total;
    for (const o of rule.outcomes) {
        const w = Math.max(0, o.chance);
        if (roll <= w) return o.rarity;
        roll -= w;
    }

    return rule.outcomes[rule.outcomes.length - 1].rarity;
}

// ─── EXP Balance ───────────────────────────────────────

/**
 * Occupation EXP tuning multipliers.
 * Lowering Provider values helps slow early Provider leveling pace.
 */
export const PROVIDER_WORK_EXP_MULTIPLIER = 0.2;
export const CHEF_WORK_EXP_MULTIPLIER = 0.4;
export const PROVIDER_MARKET_EXP_MULTIPLIER = 0.2;
export const CHEF_MARKET_EXP_MULTIPLIER = 0.4;

// ─── Market Bot ─────────────────────────────────────────

export interface MarketBotTuningConfig {
    /** Enable/disable market bot buying logic globally. */
    enabled: boolean;
    /** Bot decision interval in milliseconds. */
    tickMs: number;
    /** Chance (0..1) that bot will attempt purchases each tick. */
    buyChancePerTick: number;
    /** Max number of listings bot can process in one tick. */
    maxListingsPerTick: number;
    /** Max quantity bot can buy from one listing per tick. */
    maxQtyPerListing: number;
    /** Anti-overprice guard: max accepted unit price ratio vs reference price. */
    maxUnitPriceRatio: number;
    /** Minimum listing age before bot can buy (milliseconds). */
    minListingAgeMs: number;
}

/**
 * Default economy tuning for market bot.
 * These are safe baseline values to avoid aggressive buy pressure.
 */
export const MARKET_BOT_CONFIG: MarketBotTuningConfig = {
    // Turn bot economy simulation on/off.
    enabled: true,
    // Run approximately every 30 seconds.
    tickMs: 30_000,
    // 30% chance to execute buy behavior each tick.
    buyChancePerTick: 0.3,
    // At most 2 listings handled per tick.
    maxListingsPerTick: 2,
    // At most 5 units purchased from one listing per tick.
    maxQtyPerListing: 5,
    // Bot ignores listings priced above 150% of reference unit price.
    maxUnitPriceRatio: 1.50,
    // Avoid instant bot buy right after user lists an item.
    minListingAgeMs: 60_000,
};

// ─── Provider Skill Tree ───────────────────────────────

export type ProviderBranch = "VEGETABLE" | "CHICKEN" | "BEEF";

export const PROVIDER_SKILL_MAX_LEVEL = 4;

/**
 * Time reduction buff by branch skill level.
 * Lv1: 5% total, Lv3: 10% total.
 */
export function getProviderSkillTimeReduction(level: number): number {
    if (level >= 3) return 0.10;
    if (level >= 1) return 0.05;
    return 0;
}

/**
 * Plot count unlocked by branch skill level.
 * Base: 1 plot, Lv2: 2 plots, Lv4: 3 plots.
 */
export function getProviderSkillPlotCount(level: number): number {
    if (level >= 4) return 3;
    if (level >= 2) return 2;
    return 1;
}

export const PROVIDER_SKILL_TREE_CONFIG: Record<ProviderBranch, {
    title: string;
    color: string;
    effects: {
        level1: string;
        level2: string;
        level3: string;
        level4: string;
    };
}> = {
    VEGETABLE: {
        title: "Vegetable Farming",
        color: "#34d399",
        effects: {
            level1: "Lv.1: Reduce task waiting time by 5%",
            level2: "Lv.2: Increase task plot capacity to 2 (base is 1)",
            level3: "Lv.3: Reduce task waiting time by another 5% (10% total)",
            level4: "Lv.4: Increase task plot capacity to 3",
        },
    },
    CHICKEN: {
        title: "Chicken Farming",
        color: "#facc15",
        effects: {
            level1: "Lv.1: Reduce task waiting time by 5%",
            level2: "Lv.2: Increase task plot capacity to 2 (base is 1)",
            level3: "Lv.3: Reduce task waiting time by another 5% (10% total)",
            level4: "Lv.4: Increase task plot capacity to 3",
        },
    },
    BEEF: {
        title: "Beef Farming",
        color: "#f87171",
        effects: {
            level1: "Lv.1: Reduce task waiting time by 5%",
            level2: "Lv.2: Increase task plot capacity to 2 (base is 1)",
            level3: "Lv.3: Reduce task waiting time by another 5% (10% total)",
            level4: "Lv.4: Increase task plot capacity to 3",
        },
    },
};

// ─── Hunger Penalty Tiers ────────────────────────────────

export interface HungerTier {
    /** Inclusive lower bound of hunger percent for this tier. */
    minPercent: number;
    /** Inclusive upper bound of hunger percent for this tier. */
    maxPercent: number;
    /** UI label for this hunger state. */
    state: string;
    /** Time multiplier applied to work speed (higher = slower). */
    multiplier: number;
    /** Human-readable effect description. */
    effect: string;
}

export const HUNGER_TIERS: HungerTier[] = [
    { minPercent: 80, maxPercent: 100, state: "Fit", multiplier: 1.0, effect: "Normal Speed" },
    { minPercent: 40, maxPercent: 79, state: "Normal", multiplier: 1.2, effect: "Slightly Slower" },
    { minPercent: 20, maxPercent: 39, state: "Hungry", multiplier: 1.5, effect: "Slower" },
    { minPercent: 0, maxPercent: 19, state: "Starving", multiplier: 2.5, effect: "Very Slow" },
];

export function getHungerTier(hunger: number): HungerTier {
    // Convert absolute hunger to percentage and map into configured tier.
    const percent = (hunger / MAX_HUNGER) * 100;
    return (
        HUNGER_TIERS.find(
            (t) => percent >= t.minPercent && percent <= t.maxPercent
        ) ?? HUNGER_TIERS[HUNGER_TIERS.length - 1]
    );
}

// ─── Occupation Leveling ─────────────────────────────────

/** Current hard cap for occupation levels. */
export const MAX_LEVEL = 50;

/**
 * Minimum level in primary occupation required to unlock second occupation.
 */
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
    // Scan backward for fastest lookup of highest unlocked level.
    for (let i = LEVEL_THRESHOLDS.length - 1; i >= 1; i--) {
        if (exp >= LEVEL_THRESHOLDS[i]) return i;
    }
    return 1;
}

export function getExpForNextLevel(level: number): number | null {
    // Return null when already at max level.
    if (level >= MAX_LEVEL) return null; // max level
    return LEVEL_THRESHOLDS[level + 1];
}
