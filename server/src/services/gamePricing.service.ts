import { prisma } from "../lib/prisma";
import {
    EQUIPMENT_RARITY_DROP_RATES,
    FIRST_JOB_MARKET_EXP_MULTIPLIER,
    FIRST_JOB_WORK_EXP_MULTIPLIER,
    HARVEST_ITEM_RARITY_DROP_RATES,
    HUNGER_TASK_DECAY_PER_SEC,
    SECONDARY_JOB_MARKET_EXP_MULTIPLIER,
    SECONDARY_JOB_WORK_EXP_MULTIPLIER,
    type EquipmentRarity,
} from "../config/game.config";

export interface GamePricingConfig {
    npcShopMultiplier: number;
    equipmentBoxPrice: number;
}

export interface GameTaskDecayConfig {
    farmPerPlot: number;
    cookPerMenu: number;
}

export interface GameTaskTimeConfig {
    firstJobTaskTimeMultiplier: number;
    secondaryJobTaskTimeMultiplier: number;

    // Legacy aliases (kept for compatibility)
    providerTaskTimeMultiplier: number;
    chefTaskTimeMultiplier: number;
}

export interface GameExpConfig {
    firstJobWorkExpMultiplier: number;
    secondaryJobWorkExpMultiplier: number;
    firstJobMarketExpMultiplier: number;
    secondaryJobMarketExpMultiplier: number;

    // Legacy aliases (kept for compatibility)
    providerWorkExpMultiplier: number;
    chefWorkExpMultiplier: number;
    providerMarketExpMultiplier: number;
    chefMarketExpMultiplier: number;
}

export interface GameRarityConfig {
    harvestDropRates: Record<EquipmentRarity, number>;
    equipmentDropRates: Record<EquipmentRarity, number>;
}

export interface GameRuntimeConfig {
    pricing: GamePricingConfig;
    taskDecay: GameTaskDecayConfig;
    taskTime: GameTaskTimeConfig;
    exp: GameExpConfig;
    rarity: GameRarityConfig;
    ferrumMining: FerrumMiningConfig;
}

export interface FerrumMiningConfig {
    hungerCostPerExpedition: number;
    layerTimeMins: {
        surface: number;
        deep: number;
        core: number;
    };
    dropRates: {
        surface: {
            ironOre: number;
            copperOre: number;
            steelOre: number;
            stone: number;
            coal: number;
            gem: number;
        };
        deep: {
            ironOre: number;
            copperOre: number;
            steelOre: number;
            stone: number;
            coal: number;
            gem: number;
        };
        core: {
            ironOre: number;
            copperOre: number;
            steelOre: number;
            stone: number;
            coal: number;
            gem: number;
        };
    };
}

const DEFAULT_PRICING: GamePricingConfig = {
    npcShopMultiplier: 1,
    equipmentBoxPrice: 420,
};

const DEFAULT_TASK_DECAY: GameTaskDecayConfig = {
    farmPerPlot: HUNGER_TASK_DECAY_PER_SEC.FARM_PER_PLOT,
    cookPerMenu: HUNGER_TASK_DECAY_PER_SEC.COOK_PER_MENU,
};

const DEFAULT_TASK_TIME: GameTaskTimeConfig = {
    firstJobTaskTimeMultiplier: 1,
    secondaryJobTaskTimeMultiplier: 1,
    providerTaskTimeMultiplier: 1,
    chefTaskTimeMultiplier: 1,
};

const DEFAULT_EXP: GameExpConfig = {
    firstJobWorkExpMultiplier: FIRST_JOB_WORK_EXP_MULTIPLIER,
    secondaryJobWorkExpMultiplier: SECONDARY_JOB_WORK_EXP_MULTIPLIER,
    firstJobMarketExpMultiplier: FIRST_JOB_MARKET_EXP_MULTIPLIER,
    secondaryJobMarketExpMultiplier: SECONDARY_JOB_MARKET_EXP_MULTIPLIER,

    providerWorkExpMultiplier: FIRST_JOB_WORK_EXP_MULTIPLIER,
    chefWorkExpMultiplier: SECONDARY_JOB_WORK_EXP_MULTIPLIER,
    providerMarketExpMultiplier: FIRST_JOB_MARKET_EXP_MULTIPLIER,
    chefMarketExpMultiplier: SECONDARY_JOB_MARKET_EXP_MULTIPLIER,
};

const DEFAULT_RARITY: GameRarityConfig = {
    harvestDropRates: { ...HARVEST_ITEM_RARITY_DROP_RATES },
    equipmentDropRates: { ...EQUIPMENT_RARITY_DROP_RATES },
};

const DEFAULT_FERRUM_MINING: FerrumMiningConfig = {
    hungerCostPerExpedition: 200,
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

let tableEnsured = false;

async function ensureGameSettingsTable() {
    if (tableEnsured) return;
    // Master data/table bootstrap is handled by prisma/seed.ts.
    tableEnsured = true;
}

function clamp(v: number, min: number, max: number) {
    return Math.max(min, Math.min(max, v));
}

async function upsertSetting(key: string, value: string) {
    await prisma.$executeRaw`
        INSERT INTO game_settings (setting_key, setting_value)
        VALUES (${key}, ${value})
        ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)
    `;
}

function parseTaskDecay(rows: Array<{ setting_key: string; setting_value: string }>): GameTaskDecayConfig {
    let farmPerPlot = DEFAULT_TASK_DECAY.farmPerPlot;
    let cookPerMenu = DEFAULT_TASK_DECAY.cookPerMenu;

    for (const row of rows) {
        if (row.setting_key === "task_decay_farm_per_plot") {
            const n = Number(row.setting_value);
            if (Number.isFinite(n)) farmPerPlot = clamp(n, 0, 10);
        }
        if (row.setting_key === "task_decay_cook_per_menu") {
            const n = Number(row.setting_value);
            if (Number.isFinite(n)) cookPerMenu = clamp(n, 0, 10);
        }
    }

    return { farmPerPlot, cookPerMenu };
}

function parseTaskTime(rows: Array<{ setting_key: string; setting_value: string }>): GameTaskTimeConfig {
    let firstJobTaskTimeMultiplier = DEFAULT_TASK_TIME.firstJobTaskTimeMultiplier;
    let secondaryJobTaskTimeMultiplier = DEFAULT_TASK_TIME.secondaryJobTaskTimeMultiplier;

    for (const row of rows) {
        if (row.setting_key === "task_time_first_job_multiplier" || row.setting_key === "task_time_provider_multiplier") {
            const n = Number(row.setting_value);
            if (Number.isFinite(n) && n > 0) firstJobTaskTimeMultiplier = clamp(n, 0.1, 10);
        }
        if (row.setting_key === "task_time_secondary_job_multiplier" || row.setting_key === "task_time_chef_multiplier") {
            const n = Number(row.setting_value);
            if (Number.isFinite(n) && n > 0) secondaryJobTaskTimeMultiplier = clamp(n, 0.1, 10);
        }
    }

    return {
        firstJobTaskTimeMultiplier,
        secondaryJobTaskTimeMultiplier,

        // Legacy aliases
        providerTaskTimeMultiplier: firstJobTaskTimeMultiplier,
        chefTaskTimeMultiplier: secondaryJobTaskTimeMultiplier,
    };
}

function parseExp(rows: Array<{ setting_key: string; setting_value: string }>): GameExpConfig {
    let firstJobWorkExpMultiplier = DEFAULT_EXP.firstJobWorkExpMultiplier;
    let secondaryJobWorkExpMultiplier = DEFAULT_EXP.secondaryJobWorkExpMultiplier;
    let firstJobMarketExpMultiplier = DEFAULT_EXP.firstJobMarketExpMultiplier;
    let secondaryJobMarketExpMultiplier = DEFAULT_EXP.secondaryJobMarketExpMultiplier;

    for (const row of rows) {
        if (row.setting_key === "exp_first_job_work_multiplier" || row.setting_key === "exp_provider_work_multiplier") {
            const n = Number(row.setting_value);
            if (Number.isFinite(n)) firstJobWorkExpMultiplier = clamp(n, 0, 10);
        }
        if (row.setting_key === "exp_secondary_job_work_multiplier" || row.setting_key === "exp_chef_work_multiplier") {
            const n = Number(row.setting_value);
            if (Number.isFinite(n)) secondaryJobWorkExpMultiplier = clamp(n, 0, 10);
        }
        if (row.setting_key === "exp_first_job_market_multiplier" || row.setting_key === "exp_provider_market_multiplier") {
            const n = Number(row.setting_value);
            if (Number.isFinite(n)) firstJobMarketExpMultiplier = clamp(n, 0, 10);
        }
        if (row.setting_key === "exp_secondary_job_market_multiplier" || row.setting_key === "exp_chef_market_multiplier") {
            const n = Number(row.setting_value);
            if (Number.isFinite(n)) secondaryJobMarketExpMultiplier = clamp(n, 0, 10);
        }
    }

    return {
        firstJobWorkExpMultiplier,
        secondaryJobWorkExpMultiplier,
        firstJobMarketExpMultiplier,
        secondaryJobMarketExpMultiplier,

        // Legacy aliases
        providerWorkExpMultiplier: firstJobWorkExpMultiplier,
        chefWorkExpMultiplier: secondaryJobWorkExpMultiplier,
        providerMarketExpMultiplier: firstJobMarketExpMultiplier,
        chefMarketExpMultiplier: secondaryJobMarketExpMultiplier,
    };
}

function parseHarvestRarity(rows: Array<{ setting_key: string; setting_value: string }>): Record<EquipmentRarity, number> {
    const result: Record<EquipmentRarity, number> = { ...DEFAULT_RARITY.harvestDropRates };
    for (const row of rows) {
        if (row.setting_key === "harvest_rarity_normal") result.NORMAL = clamp(Number(row.setting_value), 0, 1000);
        if (row.setting_key === "harvest_rarity_rare") result.RARE = clamp(Number(row.setting_value), 0, 1000);
        if (row.setting_key === "harvest_rarity_epic") result.EPIC = clamp(Number(row.setting_value), 0, 1000);
        if (row.setting_key === "harvest_rarity_legendary") result.LEGENDARY = clamp(Number(row.setting_value), 0, 1000);
    }
    return result;
}

function parseEquipmentRarity(rows: Array<{ setting_key: string; setting_value: string }>): Record<EquipmentRarity, number> {
    const result: Record<EquipmentRarity, number> = { ...DEFAULT_RARITY.equipmentDropRates };
    for (const row of rows) {
        if (row.setting_key === "equipment_rarity_normal") result.NORMAL = clamp(Number(row.setting_value), 0, 1);
        if (row.setting_key === "equipment_rarity_rare") result.RARE = clamp(Number(row.setting_value), 0, 1);
        if (row.setting_key === "equipment_rarity_epic") result.EPIC = clamp(Number(row.setting_value), 0, 1);
        if (row.setting_key === "equipment_rarity_legendary") result.LEGENDARY = clamp(Number(row.setting_value), 0, 1);
    }
    return result;
}

function parseFerrumMining(rows: Array<{ setting_key: string; setting_value: string }>): FerrumMiningConfig {
    const out: FerrumMiningConfig = JSON.parse(JSON.stringify(DEFAULT_FERRUM_MINING));

    const get = (key: string) => rows.find((r) => r.setting_key === key)?.setting_value;
    const num = (key: string, min: number, max: number, fallback: number) => {
        const v = Number(get(key));
        if (!Number.isFinite(v)) return fallback;
        return clamp(v, min, max);
    };

    out.hungerCostPerExpedition = Math.floor(num("ferrum_mining_hunger_cost", 0, 5000, out.hungerCostPerExpedition));
    out.layerTimeMins.surface = num("ferrum_mining_time_surface", 1, 240, out.layerTimeMins.surface);
    out.layerTimeMins.deep = num("ferrum_mining_time_deep", 1, 240, out.layerTimeMins.deep);
    out.layerTimeMins.core = num("ferrum_mining_time_core", 1, 240, out.layerTimeMins.core);

    out.dropRates.surface.ironOre = num("ferrum_drop_surface_iron", 0, 1, out.dropRates.surface.ironOre);
    out.dropRates.surface.copperOre = num("ferrum_drop_surface_copper", 0, 1, out.dropRates.surface.copperOre);
    out.dropRates.surface.steelOre = num("ferrum_drop_surface_steel", 0, 1, out.dropRates.surface.steelOre);
    out.dropRates.surface.stone = num("ferrum_drop_surface_stone", 0, 1, out.dropRates.surface.stone);
    out.dropRates.surface.coal = num("ferrum_drop_surface_coal", 0, 1, out.dropRates.surface.coal);
    out.dropRates.surface.gem = num("ferrum_drop_surface_gem", 0, 1, out.dropRates.surface.gem);

    out.dropRates.deep.ironOre = num("ferrum_drop_deep_iron", 0, 1, out.dropRates.deep.ironOre);
    out.dropRates.deep.copperOre = num("ferrum_drop_deep_copper", 0, 1, out.dropRates.deep.copperOre);
    out.dropRates.deep.steelOre = num("ferrum_drop_deep_steel", 0, 1, out.dropRates.deep.steelOre);
    out.dropRates.deep.stone = num("ferrum_drop_deep_stone", 0, 1, out.dropRates.deep.stone);
    out.dropRates.deep.coal = num("ferrum_drop_deep_coal", 0, 1, out.dropRates.deep.coal);
    out.dropRates.deep.gem = num("ferrum_drop_deep_gem", 0, 1, out.dropRates.deep.gem);

    out.dropRates.core.ironOre = num("ferrum_drop_core_iron", 0, 1, out.dropRates.core.ironOre);
    out.dropRates.core.copperOre = num("ferrum_drop_core_copper", 0, 1, out.dropRates.core.copperOre);
    out.dropRates.core.steelOre = num("ferrum_drop_core_steel", 0, 1, out.dropRates.core.steelOre);
    out.dropRates.core.stone = num("ferrum_drop_core_stone", 0, 1, out.dropRates.core.stone);
    out.dropRates.core.coal = num("ferrum_drop_core_coal", 0, 1, out.dropRates.core.coal);
    out.dropRates.core.gem = num("ferrum_drop_core_gem", 0, 1, out.dropRates.core.gem);

    return out;
}

export async function getGamePricing(): Promise<GamePricingConfig> {
    await ensureGameSettingsTable();

    const rows = await prisma.$queryRaw<Array<{ setting_key: string; setting_value: string }>>`
        SELECT setting_key, setting_value
        FROM game_settings
        WHERE setting_key IN ('npc_shop_multiplier', 'equipment_box_price')
    `;

    let npcShopMultiplier = DEFAULT_PRICING.npcShopMultiplier;
    let equipmentBoxPrice = DEFAULT_PRICING.equipmentBoxPrice;

    for (const row of rows) {
        if (row.setting_key === "npc_shop_multiplier") {
            const n = Number(row.setting_value);
            if (Number.isFinite(n) && n > 0) npcShopMultiplier = clamp(n, 0.1, 10);
        }
        if (row.setting_key === "equipment_box_price") {
            const n = Math.floor(Number(row.setting_value));
            if (Number.isFinite(n) && n > 0) equipmentBoxPrice = clamp(n, 1, 1_000_000);
        }
    }

    return {
        npcShopMultiplier,
        equipmentBoxPrice,
    };
}

export async function getGameTaskDecayConfig(): Promise<GameTaskDecayConfig> {
    await ensureGameSettingsTable();

    const rows = await prisma.$queryRaw<Array<{ setting_key: string; setting_value: string }>>`
        SELECT setting_key, setting_value
        FROM game_settings
        WHERE setting_key IN ('task_decay_farm_per_plot', 'task_decay_cook_per_menu')
    `;

    return parseTaskDecay(rows);
}

export async function getGameRuntimeConfig(): Promise<GameRuntimeConfig> {
    await ensureGameSettingsTable();

    const rows = await prisma.$queryRaw<Array<{ setting_key: string; setting_value: string }>>`
        SELECT setting_key, setting_value
        FROM game_settings
        WHERE setting_key IN (
            'npc_shop_multiplier',
            'equipment_box_price',
            'task_decay_farm_per_plot',
            'task_decay_cook_per_menu',
            'task_time_first_job_multiplier',
            'task_time_secondary_job_multiplier',
            'task_time_provider_multiplier',
            'task_time_chef_multiplier',
            'exp_provider_work_multiplier',
            'exp_chef_work_multiplier',
            'exp_provider_market_multiplier',
            'exp_chef_market_multiplier',
            'exp_first_job_work_multiplier',
            'exp_secondary_job_work_multiplier',
            'exp_first_job_market_multiplier',
            'exp_secondary_job_market_multiplier',
            'harvest_rarity_normal',
            'harvest_rarity_rare',
            'harvest_rarity_epic',
            'harvest_rarity_legendary',
            'equipment_rarity_normal',
            'equipment_rarity_rare',
            'equipment_rarity_epic',
            'equipment_rarity_legendary',
            'ferrum_mining_hunger_cost',
            'ferrum_mining_time_surface',
            'ferrum_mining_time_deep',
            'ferrum_mining_time_core',
            'ferrum_drop_surface_iron',
            'ferrum_drop_surface_copper',
            'ferrum_drop_surface_steel',
            'ferrum_drop_surface_stone',
            'ferrum_drop_surface_coal',
            'ferrum_drop_surface_gem',
            'ferrum_drop_deep_iron',
            'ferrum_drop_deep_copper',
            'ferrum_drop_deep_steel',
            'ferrum_drop_deep_stone',
            'ferrum_drop_deep_coal',
            'ferrum_drop_deep_gem',
            'ferrum_drop_core_iron',
            'ferrum_drop_core_copper',
            'ferrum_drop_core_steel',
            'ferrum_drop_core_stone',
            'ferrum_drop_core_coal',
            'ferrum_drop_core_gem'
        )
    `;

    let npcShopMultiplier = DEFAULT_PRICING.npcShopMultiplier;
    let equipmentBoxPrice = DEFAULT_PRICING.equipmentBoxPrice;

    for (const row of rows) {
        if (row.setting_key === "npc_shop_multiplier") {
            const n = Number(row.setting_value);
            if (Number.isFinite(n) && n > 0) npcShopMultiplier = clamp(n, 0.1, 10);
        }
        if (row.setting_key === "equipment_box_price") {
            const n = Math.floor(Number(row.setting_value));
            if (Number.isFinite(n) && n > 0) equipmentBoxPrice = clamp(n, 1, 1_000_000);
        }
    }

    return {
        pricing: {
            npcShopMultiplier,
            equipmentBoxPrice,
        },
        taskDecay: parseTaskDecay(rows),
        taskTime: parseTaskTime(rows),
        exp: parseExp(rows),
        rarity: {
            harvestDropRates: parseHarvestRarity(rows),
            equipmentDropRates: parseEquipmentRarity(rows),
        },
        ferrumMining: parseFerrumMining(rows),
    };
}

export async function getFerrumMiningConfig(): Promise<FerrumMiningConfig> {
    await ensureGameSettingsTable();
    const rows = await prisma.$queryRaw<Array<{ setting_key: string; setting_value: string }>>`
        SELECT setting_key, setting_value
        FROM game_settings
        WHERE setting_key IN (
            'ferrum_mining_hunger_cost',
            'ferrum_mining_time_surface',
            'ferrum_mining_time_deep',
            'ferrum_mining_time_core',
            'ferrum_drop_surface_iron',
            'ferrum_drop_surface_copper',
            'ferrum_drop_surface_steel',
            'ferrum_drop_surface_stone',
            'ferrum_drop_surface_coal',
            'ferrum_drop_surface_gem',
            'ferrum_drop_deep_iron',
            'ferrum_drop_deep_copper',
            'ferrum_drop_deep_steel',
            'ferrum_drop_deep_stone',
            'ferrum_drop_deep_coal',
            'ferrum_drop_deep_gem',
            'ferrum_drop_core_iron',
            'ferrum_drop_core_copper',
            'ferrum_drop_core_steel',
            'ferrum_drop_core_stone',
            'ferrum_drop_core_coal',
            'ferrum_drop_core_gem'
        )
    `;
    return parseFerrumMining(rows);
}

export async function getGameTaskTimeConfig(): Promise<GameTaskTimeConfig> {
    await ensureGameSettingsTable();

    const rows = await prisma.$queryRaw<Array<{ setting_key: string; setting_value: string }>>`
        SELECT setting_key, setting_value
        FROM game_settings
        WHERE setting_key IN (
            'task_time_first_job_multiplier',
            'task_time_secondary_job_multiplier',
            'task_time_provider_multiplier',
            'task_time_chef_multiplier'
        )
    `;

    return parseTaskTime(rows);
}

export async function getGameExpConfig(): Promise<GameExpConfig> {
    await ensureGameSettingsTable();
    const rows = await prisma.$queryRaw<Array<{ setting_key: string; setting_value: string }>>`
        SELECT setting_key, setting_value
        FROM game_settings
        WHERE setting_key IN (
            'exp_provider_work_multiplier',
            'exp_chef_work_multiplier',
            'exp_provider_market_multiplier',
            'exp_chef_market_multiplier',
            'exp_first_job_work_multiplier',
            'exp_secondary_job_work_multiplier',
            'exp_first_job_market_multiplier',
            'exp_secondary_job_market_multiplier'
        )
    `;
    return parseExp(rows);
}

export async function getGameHarvestRarityConfig(): Promise<Record<EquipmentRarity, number>> {
    await ensureGameSettingsTable();
    const rows = await prisma.$queryRaw<Array<{ setting_key: string; setting_value: string }>>`
        SELECT setting_key, setting_value
        FROM game_settings
        WHERE setting_key IN (
            'harvest_rarity_normal',
            'harvest_rarity_rare',
            'harvest_rarity_epic',
            'harvest_rarity_legendary'
        )
    `;
    return parseHarvestRarity(rows);
}

export async function getGameEquipmentRarityConfig(): Promise<Record<EquipmentRarity, number>> {
    await ensureGameSettingsTable();
    const rows = await prisma.$queryRaw<Array<{ setting_key: string; setting_value: string }>>`
        SELECT setting_key, setting_value
        FROM game_settings
        WHERE setting_key IN (
            'equipment_rarity_normal',
            'equipment_rarity_rare',
            'equipment_rarity_epic',
            'equipment_rarity_legendary'
        )
    `;
    return parseEquipmentRarity(rows);
}

export async function updateGamePricing(input: Partial<GamePricingConfig>) {
    await ensureGameSettingsTable();

    if (input.npcShopMultiplier != null) {
        const v = clamp(Number(input.npcShopMultiplier), 0.1, 10);
        await upsertSetting("npc_shop_multiplier", String(v));
    }

    if (input.equipmentBoxPrice != null) {
        const v = clamp(Math.floor(Number(input.equipmentBoxPrice)), 1, 1_000_000);
        await upsertSetting("equipment_box_price", String(v));
    }

    return getGamePricing();
}

export async function updateGameRuntimeConfig(input: {
    npcShopMultiplier?: number;
    equipmentBoxPrice?: number;
    farmPerPlot?: number;
    cookPerMenu?: number;
    firstJobTaskTimeMultiplier?: number;
    secondaryJobTaskTimeMultiplier?: number;
    providerTaskTimeMultiplier?: number;
    chefTaskTimeMultiplier?: number;
    providerWorkExpMultiplier?: number;
    chefWorkExpMultiplier?: number;
    providerMarketExpMultiplier?: number;
    chefMarketExpMultiplier?: number;
    firstJobWorkExpMultiplier?: number;
    secondaryJobWorkExpMultiplier?: number;
    firstJobMarketExpMultiplier?: number;
    secondaryJobMarketExpMultiplier?: number;
    harvestNormalRate?: number;
    harvestRareRate?: number;
    harvestEpicRate?: number;
    harvestLegendaryRate?: number;
    equipmentNormalRate?: number;
    equipmentRareRate?: number;
    equipmentEpicRate?: number;
    equipmentLegendaryRate?: number;
    ferrumMiningHungerCost?: number;
    ferrumMiningTimeSurface?: number;
    ferrumMiningTimeDeep?: number;
    ferrumMiningTimeCore?: number;
    ferrumDropSurfaceIron?: number;
    ferrumDropSurfaceCopper?: number;
    ferrumDropSurfaceSteel?: number;
    ferrumDropSurfaceStone?: number;
    ferrumDropSurfaceCoal?: number;
    ferrumDropSurfaceGem?: number;
    ferrumDropDeepIron?: number;
    ferrumDropDeepCopper?: number;
    ferrumDropDeepSteel?: number;
    ferrumDropDeepStone?: number;
    ferrumDropDeepCoal?: number;
    ferrumDropDeepGem?: number;
    ferrumDropCoreIron?: number;
    ferrumDropCoreCopper?: number;
    ferrumDropCoreSteel?: number;
    ferrumDropCoreStone?: number;
    ferrumDropCoreCoal?: number;
    ferrumDropCoreGem?: number;
}) {
    await ensureGameSettingsTable();

    if (input.npcShopMultiplier != null) {
        const v = clamp(Number(input.npcShopMultiplier), 0.1, 10);
        await upsertSetting("npc_shop_multiplier", String(v));
    }

    if (input.equipmentBoxPrice != null) {
        const v = clamp(Math.floor(Number(input.equipmentBoxPrice)), 1, 1_000_000);
        await upsertSetting("equipment_box_price", String(v));
    }

    if (input.farmPerPlot != null) {
        const v = clamp(Number(input.farmPerPlot), 0, 10);
        await upsertSetting("task_decay_farm_per_plot", String(v));
    }

    if (input.cookPerMenu != null) {
        const v = clamp(Number(input.cookPerMenu), 0, 10);
        await upsertSetting("task_decay_cook_per_menu", String(v));
    }

    const firstJobTaskTimeInput = input.firstJobTaskTimeMultiplier ?? input.providerTaskTimeMultiplier;
    const secondaryJobTaskTimeInput = input.secondaryJobTaskTimeMultiplier ?? input.chefTaskTimeMultiplier;

    if (firstJobTaskTimeInput != null) {
        const v = clamp(Number(firstJobTaskTimeInput), 0.1, 10);
        await upsertSetting("task_time_provider_multiplier", String(v));
        await upsertSetting("task_time_first_job_multiplier", String(v));
    }

    if (secondaryJobTaskTimeInput != null) {
        const v = clamp(Number(secondaryJobTaskTimeInput), 0.1, 10);
        await upsertSetting("task_time_chef_multiplier", String(v));
        await upsertSetting("task_time_secondary_job_multiplier", String(v));
    }

    const firstJobWorkExpInput = input.firstJobWorkExpMultiplier ?? input.providerWorkExpMultiplier;
    const secondaryJobWorkExpInput = input.secondaryJobWorkExpMultiplier ?? input.chefWorkExpMultiplier;
    const firstJobMarketExpInput = input.firstJobMarketExpMultiplier ?? input.providerMarketExpMultiplier;
    const secondaryJobMarketExpInput = input.secondaryJobMarketExpMultiplier ?? input.chefMarketExpMultiplier;

    if (firstJobWorkExpInput != null) {
        const v = clamp(Number(firstJobWorkExpInput), 0, 10);
        await upsertSetting("exp_provider_work_multiplier", String(v));
        await upsertSetting("exp_first_job_work_multiplier", String(v));
    }

    if (secondaryJobWorkExpInput != null) {
        const v = clamp(Number(secondaryJobWorkExpInput), 0, 10);
        await upsertSetting("exp_chef_work_multiplier", String(v));
        await upsertSetting("exp_secondary_job_work_multiplier", String(v));
    }

    if (firstJobMarketExpInput != null) {
        const v = clamp(Number(firstJobMarketExpInput), 0, 10);
        await upsertSetting("exp_provider_market_multiplier", String(v));
        await upsertSetting("exp_first_job_market_multiplier", String(v));
    }

    if (secondaryJobMarketExpInput != null) {
        const v = clamp(Number(secondaryJobMarketExpInput), 0, 10);
        await upsertSetting("exp_chef_market_multiplier", String(v));
        await upsertSetting("exp_secondary_job_market_multiplier", String(v));
    }

    if (input.harvestNormalRate != null) {
        const v = clamp(Number(input.harvestNormalRate), 0, 1000);
        await upsertSetting("harvest_rarity_normal", String(v));
    }

    if (input.harvestRareRate != null) {
        const v = clamp(Number(input.harvestRareRate), 0, 1000);
        await upsertSetting("harvest_rarity_rare", String(v));
    }

    if (input.harvestEpicRate != null) {
        const v = clamp(Number(input.harvestEpicRate), 0, 1000);
        await upsertSetting("harvest_rarity_epic", String(v));
    }

    if (input.harvestLegendaryRate != null) {
        const v = clamp(Number(input.harvestLegendaryRate), 0, 1000);
        await upsertSetting("harvest_rarity_legendary", String(v));
    }

    if (input.equipmentNormalRate != null) {
        const v = clamp(Number(input.equipmentNormalRate), 0, 1);
        await upsertSetting("equipment_rarity_normal", String(v));
    }

    if (input.equipmentRareRate != null) {
        const v = clamp(Number(input.equipmentRareRate), 0, 1);
        await upsertSetting("equipment_rarity_rare", String(v));
    }

    if (input.equipmentEpicRate != null) {
        const v = clamp(Number(input.equipmentEpicRate), 0, 1);
        await upsertSetting("equipment_rarity_epic", String(v));
    }

    if (input.equipmentLegendaryRate != null) {
        const v = clamp(Number(input.equipmentLegendaryRate), 0, 1);
        await upsertSetting("equipment_rarity_legendary", String(v));
    }

    if (input.ferrumMiningHungerCost != null) await upsertSetting("ferrum_mining_hunger_cost", String(clamp(Math.floor(Number(input.ferrumMiningHungerCost)), 0, 5000)));
    if (input.ferrumMiningTimeSurface != null) await upsertSetting("ferrum_mining_time_surface", String(clamp(Number(input.ferrumMiningTimeSurface), 1, 240)));
    if (input.ferrumMiningTimeDeep != null) await upsertSetting("ferrum_mining_time_deep", String(clamp(Number(input.ferrumMiningTimeDeep), 1, 240)));
    if (input.ferrumMiningTimeCore != null) await upsertSetting("ferrum_mining_time_core", String(clamp(Number(input.ferrumMiningTimeCore), 1, 240)));

    if (input.ferrumDropSurfaceIron != null) await upsertSetting("ferrum_drop_surface_iron", String(clamp(Number(input.ferrumDropSurfaceIron), 0, 1)));
    if (input.ferrumDropSurfaceCopper != null) await upsertSetting("ferrum_drop_surface_copper", String(clamp(Number(input.ferrumDropSurfaceCopper), 0, 1)));
    if (input.ferrumDropSurfaceSteel != null) await upsertSetting("ferrum_drop_surface_steel", String(clamp(Number(input.ferrumDropSurfaceSteel), 0, 1)));
    if (input.ferrumDropSurfaceStone != null) await upsertSetting("ferrum_drop_surface_stone", String(clamp(Number(input.ferrumDropSurfaceStone), 0, 1)));
    if (input.ferrumDropSurfaceCoal != null) await upsertSetting("ferrum_drop_surface_coal", String(clamp(Number(input.ferrumDropSurfaceCoal), 0, 1)));
    if (input.ferrumDropSurfaceGem != null) await upsertSetting("ferrum_drop_surface_gem", String(clamp(Number(input.ferrumDropSurfaceGem), 0, 1)));

    if (input.ferrumDropDeepIron != null) await upsertSetting("ferrum_drop_deep_iron", String(clamp(Number(input.ferrumDropDeepIron), 0, 1)));
    if (input.ferrumDropDeepCopper != null) await upsertSetting("ferrum_drop_deep_copper", String(clamp(Number(input.ferrumDropDeepCopper), 0, 1)));
    if (input.ferrumDropDeepSteel != null) await upsertSetting("ferrum_drop_deep_steel", String(clamp(Number(input.ferrumDropDeepSteel), 0, 1)));
    if (input.ferrumDropDeepStone != null) await upsertSetting("ferrum_drop_deep_stone", String(clamp(Number(input.ferrumDropDeepStone), 0, 1)));
    if (input.ferrumDropDeepCoal != null) await upsertSetting("ferrum_drop_deep_coal", String(clamp(Number(input.ferrumDropDeepCoal), 0, 1)));
    if (input.ferrumDropDeepGem != null) await upsertSetting("ferrum_drop_deep_gem", String(clamp(Number(input.ferrumDropDeepGem), 0, 1)));

    if (input.ferrumDropCoreIron != null) await upsertSetting("ferrum_drop_core_iron", String(clamp(Number(input.ferrumDropCoreIron), 0, 1)));
    if (input.ferrumDropCoreCopper != null) await upsertSetting("ferrum_drop_core_copper", String(clamp(Number(input.ferrumDropCoreCopper), 0, 1)));
    if (input.ferrumDropCoreSteel != null) await upsertSetting("ferrum_drop_core_steel", String(clamp(Number(input.ferrumDropCoreSteel), 0, 1)));
    if (input.ferrumDropCoreStone != null) await upsertSetting("ferrum_drop_core_stone", String(clamp(Number(input.ferrumDropCoreStone), 0, 1)));
    if (input.ferrumDropCoreCoal != null) await upsertSetting("ferrum_drop_core_coal", String(clamp(Number(input.ferrumDropCoreCoal), 0, 1)));
    if (input.ferrumDropCoreGem != null) await upsertSetting("ferrum_drop_core_gem", String(clamp(Number(input.ferrumDropCoreGem), 0, 1)));

    return getGameRuntimeConfig();
}

export function getEffectiveNpcBuyPrice(basePrice: number | null | undefined, multiplier: number): number | null {
    if (basePrice == null) return null;
    return Math.max(1, Math.round(basePrice * multiplier));
}
