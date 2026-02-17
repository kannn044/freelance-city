import { prisma } from "../lib/prisma";
import {
    CHEF_MARKET_EXP_MULTIPLIER,
    CHEF_WORK_EXP_MULTIPLIER,
    EQUIPMENT_RARITY_DROP_RATES,
    HARVEST_ITEM_RARITY_DROP_RATES,
    HUNGER_TASK_DECAY_PER_SEC,
    PROVIDER_MARKET_EXP_MULTIPLIER,
    PROVIDER_WORK_EXP_MULTIPLIER,
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
    providerTaskTimeMultiplier: number;
    chefTaskTimeMultiplier: number;
}

export interface GameExpConfig {
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
    providerTaskTimeMultiplier: 1,
    chefTaskTimeMultiplier: 1,
};

const DEFAULT_EXP: GameExpConfig = {
    providerWorkExpMultiplier: PROVIDER_WORK_EXP_MULTIPLIER,
    chefWorkExpMultiplier: CHEF_WORK_EXP_MULTIPLIER,
    providerMarketExpMultiplier: PROVIDER_MARKET_EXP_MULTIPLIER,
    chefMarketExpMultiplier: CHEF_MARKET_EXP_MULTIPLIER,
};

const DEFAULT_RARITY: GameRarityConfig = {
    harvestDropRates: { ...HARVEST_ITEM_RARITY_DROP_RATES },
    equipmentDropRates: { ...EQUIPMENT_RARITY_DROP_RATES },
};

let tableEnsured = false;

async function ensureGameSettingsTable() {
    if (tableEnsured) return;
    await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS game_settings (
            setting_key VARCHAR(64) NOT NULL PRIMARY KEY,
            setting_value VARCHAR(255) NOT NULL,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    `);
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
    let providerTaskTimeMultiplier = DEFAULT_TASK_TIME.providerTaskTimeMultiplier;
    let chefTaskTimeMultiplier = DEFAULT_TASK_TIME.chefTaskTimeMultiplier;

    for (const row of rows) {
        if (row.setting_key === "task_time_provider_multiplier") {
            const n = Number(row.setting_value);
            if (Number.isFinite(n) && n > 0) providerTaskTimeMultiplier = clamp(n, 0.1, 10);
        }
        if (row.setting_key === "task_time_chef_multiplier") {
            const n = Number(row.setting_value);
            if (Number.isFinite(n) && n > 0) chefTaskTimeMultiplier = clamp(n, 0.1, 10);
        }
    }

    return { providerTaskTimeMultiplier, chefTaskTimeMultiplier };
}

function parseExp(rows: Array<{ setting_key: string; setting_value: string }>): GameExpConfig {
    let providerWorkExpMultiplier = DEFAULT_EXP.providerWorkExpMultiplier;
    let chefWorkExpMultiplier = DEFAULT_EXP.chefWorkExpMultiplier;
    let providerMarketExpMultiplier = DEFAULT_EXP.providerMarketExpMultiplier;
    let chefMarketExpMultiplier = DEFAULT_EXP.chefMarketExpMultiplier;

    for (const row of rows) {
        if (row.setting_key === "exp_provider_work_multiplier") {
            const n = Number(row.setting_value);
            if (Number.isFinite(n)) providerWorkExpMultiplier = clamp(n, 0, 10);
        }
        if (row.setting_key === "exp_chef_work_multiplier") {
            const n = Number(row.setting_value);
            if (Number.isFinite(n)) chefWorkExpMultiplier = clamp(n, 0, 10);
        }
        if (row.setting_key === "exp_provider_market_multiplier") {
            const n = Number(row.setting_value);
            if (Number.isFinite(n)) providerMarketExpMultiplier = clamp(n, 0, 10);
        }
        if (row.setting_key === "exp_chef_market_multiplier") {
            const n = Number(row.setting_value);
            if (Number.isFinite(n)) chefMarketExpMultiplier = clamp(n, 0, 10);
        }
    }

    return {
        providerWorkExpMultiplier,
        chefWorkExpMultiplier,
        providerMarketExpMultiplier,
        chefMarketExpMultiplier,
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
            'task_time_provider_multiplier',
            'task_time_chef_multiplier',
            'exp_provider_work_multiplier',
            'exp_chef_work_multiplier',
            'exp_provider_market_multiplier',
            'exp_chef_market_multiplier',
            'harvest_rarity_normal',
            'harvest_rarity_rare',
            'harvest_rarity_epic',
            'harvest_rarity_legendary',
            'equipment_rarity_normal',
            'equipment_rarity_rare',
            'equipment_rarity_epic',
            'equipment_rarity_legendary'
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
    };
}

export async function getGameTaskTimeConfig(): Promise<GameTaskTimeConfig> {
    await ensureGameSettingsTable();

    const rows = await prisma.$queryRaw<Array<{ setting_key: string; setting_value: string }>>`
        SELECT setting_key, setting_value
        FROM game_settings
        WHERE setting_key IN ('task_time_provider_multiplier', 'task_time_chef_multiplier')
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
            'exp_chef_market_multiplier'
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
    providerTaskTimeMultiplier?: number;
    chefTaskTimeMultiplier?: number;
    providerWorkExpMultiplier?: number;
    chefWorkExpMultiplier?: number;
    providerMarketExpMultiplier?: number;
    chefMarketExpMultiplier?: number;
    harvestNormalRate?: number;
    harvestRareRate?: number;
    harvestEpicRate?: number;
    harvestLegendaryRate?: number;
    equipmentNormalRate?: number;
    equipmentRareRate?: number;
    equipmentEpicRate?: number;
    equipmentLegendaryRate?: number;
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

    if (input.providerTaskTimeMultiplier != null) {
        const v = clamp(Number(input.providerTaskTimeMultiplier), 0.1, 10);
        await upsertSetting("task_time_provider_multiplier", String(v));
    }

    if (input.chefTaskTimeMultiplier != null) {
        const v = clamp(Number(input.chefTaskTimeMultiplier), 0.1, 10);
        await upsertSetting("task_time_chef_multiplier", String(v));
    }

    if (input.providerWorkExpMultiplier != null) {
        const v = clamp(Number(input.providerWorkExpMultiplier), 0, 10);
        await upsertSetting("exp_provider_work_multiplier", String(v));
    }

    if (input.chefWorkExpMultiplier != null) {
        const v = clamp(Number(input.chefWorkExpMultiplier), 0, 10);
        await upsertSetting("exp_chef_work_multiplier", String(v));
    }

    if (input.providerMarketExpMultiplier != null) {
        const v = clamp(Number(input.providerMarketExpMultiplier), 0, 10);
        await upsertSetting("exp_provider_market_multiplier", String(v));
    }

    if (input.chefMarketExpMultiplier != null) {
        const v = clamp(Number(input.chefMarketExpMultiplier), 0, 10);
        await upsertSetting("exp_chef_market_multiplier", String(v));
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

    return getGameRuntimeConfig();
}

export function getEffectiveNpcBuyPrice(basePrice: number | null | undefined, multiplier: number): number | null {
    if (basePrice == null) return null;
    return Math.max(1, Math.round(basePrice * multiplier));
}
