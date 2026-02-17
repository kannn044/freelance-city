import { prisma } from "../lib/prisma";
import { HUNGER_TASK_DECAY_PER_SEC } from "../config/game.config";

export interface GamePricingConfig {
    npcShopMultiplier: number;
    equipmentBoxPrice: number;
}

export interface GameTaskDecayConfig {
    farmPerPlot: number;
    cookPerMenu: number;
}

export interface GameRuntimeConfig {
    pricing: GamePricingConfig;
    taskDecay: GameTaskDecayConfig;
}

const DEFAULT_PRICING: GamePricingConfig = {
    npcShopMultiplier: 1,
    equipmentBoxPrice: 420,
};

const DEFAULT_TASK_DECAY: GameTaskDecayConfig = {
    farmPerPlot: HUNGER_TASK_DECAY_PER_SEC.FARM_PER_PLOT,
    cookPerMenu: HUNGER_TASK_DECAY_PER_SEC.COOK_PER_MENU,
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
            'task_decay_cook_per_menu'
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
    };
}

export async function updateGamePricing(input: Partial<GamePricingConfig>) {
    await ensureGameSettingsTable();

    if (input.npcShopMultiplier != null) {
        const v = clamp(Number(input.npcShopMultiplier), 0.1, 10);
        await prisma.$executeRaw`
            INSERT INTO game_settings (setting_key, setting_value)
            VALUES ('npc_shop_multiplier', ${String(v)})
            ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)
        `;
    }

    if (input.equipmentBoxPrice != null) {
        const v = clamp(Math.floor(Number(input.equipmentBoxPrice)), 1, 1_000_000);
        await prisma.$executeRaw`
            INSERT INTO game_settings (setting_key, setting_value)
            VALUES ('equipment_box_price', ${String(v)})
            ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)
        `;
    }

    return getGamePricing();
}

export async function updateGameRuntimeConfig(input: {
    npcShopMultiplier?: number;
    equipmentBoxPrice?: number;
    farmPerPlot?: number;
    cookPerMenu?: number;
}) {
    await ensureGameSettingsTable();

    if (input.npcShopMultiplier != null) {
        const v = clamp(Number(input.npcShopMultiplier), 0.1, 10);
        await prisma.$executeRaw`
            INSERT INTO game_settings (setting_key, setting_value)
            VALUES ('npc_shop_multiplier', ${String(v)})
            ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)
        `;
    }

    if (input.equipmentBoxPrice != null) {
        const v = clamp(Math.floor(Number(input.equipmentBoxPrice)), 1, 1_000_000);
        await prisma.$executeRaw`
            INSERT INTO game_settings (setting_key, setting_value)
            VALUES ('equipment_box_price', ${String(v)})
            ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)
        `;
    }

    if (input.farmPerPlot != null) {
        const v = clamp(Number(input.farmPerPlot), 0, 10);
        await prisma.$executeRaw`
            INSERT INTO game_settings (setting_key, setting_value)
            VALUES ('task_decay_farm_per_plot', ${String(v)})
            ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)
        `;
    }

    if (input.cookPerMenu != null) {
        const v = clamp(Number(input.cookPerMenu), 0, 10);
        await prisma.$executeRaw`
            INSERT INTO game_settings (setting_key, setting_value)
            VALUES ('task_decay_cook_per_menu', ${String(v)})
            ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)
        `;
    }

    return getGameRuntimeConfig();
}

export function getEffectiveNpcBuyPrice(basePrice: number | null | undefined, multiplier: number): number | null {
    if (basePrice == null) return null;
    return Math.max(1, Math.round(basePrice * multiplier));
}
