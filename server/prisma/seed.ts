/// <reference types="node" />
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

type MasterDataItem = {
    name: string;
    type: string;
    buy_price?: number | null;
    sell_price?: number | null;
    kcal?: number | null;
    buff_pct?: number | null;
    buff_mins?: number | null;
    max_stack: number;
    grow_mins?: number | null;
    exp_value: number;
    icon: string;
    equipment_slot?: string | null;
    effect_key?: string | null;
    effect_value?: number | null;
    effect_value2?: number | null;
};

type MasterDataYieldLink = {
    seedItemName: string;
    yieldItemName: string;
    yield_qty: number;
};

type MasterDataRecipe = {
    name: string;
    outputItemName: string;
    output_qty: number;
    cook_mins: number;
    unlock_price: number;
    ingredients: Array<{ itemName: string; quantity: number }>;
};

type ShopRule = {
    cityKey: string;
    matcherType: string;
    matcherValue: string;
    requiredRole?: string;
};

type WorkspaceRule = {
    cityKey: string;
    jobSlot: "first_job" | "secondary_job";
    workType: "FARM" | "COOK" | "MINE" | "SMELT";
    workspaceMode?: string;
    matcherType?: string;
    matcherValue?: string;
    requiredItemName: string;
    mustBeEquipped?: boolean;
    errorCode?: string;
    errorMessage: string;
    isEnabled?: boolean;
};

type MasterData = {
    gameSettings: Array<{ key: string; value: string }>;
    items: MasterDataItem[];
    yieldLinks: MasterDataYieldLink[];
    recipes: MasterDataRecipe[];
    shopRules: {
        itemRules: ShopRule[];
        recipeRules: ShopRule[];
    };
    workspaceRules?: WorkspaceRule[];
};

function isTruthy(v: string | undefined): boolean {
    if (!v) return false;
    const normalized = v.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

const SYNC_DELETE_MODE = isTruthy(process.env.SEED_SYNC_DELETE);

function loadMasterData(): MasterData {
    const filePath = path.resolve(__dirname, "master-data.json");
    const raw = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(raw) as MasterData;

    if (!Array.isArray(data.items) || data.items.length === 0) {
        throw new Error("master-data.json: items is required and must not be empty");
    }
    if (!Array.isArray(data.recipes)) {
        throw new Error("master-data.json: recipes must be an array");
    }
    if (!Array.isArray(data.yieldLinks)) {
        throw new Error("master-data.json: yieldLinks must be an array");
    }

    if (!Array.isArray(data.workspaceRules)) {
        data.workspaceRules = [];
    }

    return data;
}

const GLOBAL_CYCLE_ANCHOR_ISO = "2026-01-01T00:00:00.000Z";
const ELECTION_CYCLE_DAYS = 7;

const CITY_CATALOG = [
    {
        key: "AGRARIA",
        name: "Agraria",
        occupations: {
            first: { key: "FARMER", displayName: "Farmer", workspaceMode: "FARM" },
            secondary: { key: "CHEF", displayName: "Chef", workspaceMode: "COOK" },
        },
    },
    {
        key: "FERRUM",
        name: "Ferrum",
        occupations: {
            first: { key: "MINER", displayName: "Miner", workspaceMode: "MINE" },
            secondary: { key: "BLACKSMITH", displayName: "Blacksmith", workspaceMode: "SMELT" },
        },
    },
    {
        key: "VOLTARA",
        name: "Voltara",
        occupations: {
            first: { key: "TECHNICIAN", displayName: "Technician", workspaceMode: "EXTRACT" },
            secondary: { key: "ENGINEER", displayName: "Engineer", workspaceMode: "REFINE" },
        },
    },
    {
        key: "TEXTILIS",
        name: "Textilis",
        occupations: {
            first: { key: "WEAVER", displayName: "Weaver", workspaceMode: "GATHER" },
            secondary: { key: "TAILOR", displayName: "Tailor", workspaceMode: "SEW" },
        },
    },
    {
        key: "MEDICO",
        name: "Medico",
        occupations: {
            first: { key: "GATHERER", displayName: "Gatherer", workspaceMode: "FORAGE" },
            secondary: { key: "ALCHEMIST", displayName: "Alchemist", workspaceMode: "BREW" },
        },
    },
] as const;

const SKILL_BRANCH_TEMPLATE = [
    {
        branchSlot: 1,
        branchKey: "TIME_QUEUE",
        branchName: "Workflow Mastery",
        effectType: "TIME_QUEUE",
        maxLevel: 5,
        effectConfig: {
            timeReductionPctByLevel: [5, 10, 15, 20, 25],
            queueLimitByLevel: [1, 1, 2, 2, 3],
        },
    },
    {
        branchSlot: 2,
        branchKey: "CRAFT_COST",
        branchName: "Resource Efficiency",
        effectType: "CRAFT_COST",
        maxLevel: 5,
        effectConfig: {
            saveAllIngredientsChancePctByLevel: [6, 12, 18, 24, 30],
        },
    },
    {
        branchSlot: 3,
        branchKey: "OUTPUT_BONUS",
        branchName: "Output Mastery",
        effectType: "OUTPUT_BONUS",
        maxLevel: 5,
        effectConfig: {
            bonusOutputChancePctByLevel: [4, 8, 12, 16, 20],
            bonusOutputQty: 1,
        },
    },
] as const;

function getCurrentElectionCycle(now: Date = new Date()) {
    const anchorMs = new Date(GLOBAL_CYCLE_ANCHOR_ISO).getTime();
    const cycleMs = ELECTION_CYCLE_DAYS * 24 * 60 * 60 * 1000;
    const diff = Math.max(0, now.getTime() - anchorMs);
    const cycleId = Math.floor(diff / cycleMs);
    const cycleStart = new Date(anchorMs + cycleId * cycleMs);
    const cycleEnd = new Date(cycleStart.getTime() + cycleMs);
    return { cycleStart, cycleEnd };
}

async function ensureMasterTables() {
    await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS game_settings (
            setting_key VARCHAR(64) NOT NULL PRIMARY KEY,
            setting_value VARCHAR(255) NOT NULL,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    `);

    // Legacy compatibility: older table may have updated_at without default.
    await prisma.$executeRawUnsafe(`
        ALTER TABLE game_settings
        MODIFY COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    `).catch(() => undefined);

    await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS city_states (
            city_key VARCHAR(32) NOT NULL PRIMARY KEY,
            display_name VARCHAR(64) NOT NULL,
            treasury BIGINT NOT NULL DEFAULT 0,
            tier INT NOT NULL DEFAULT 1,
            domestic_trade_tax_bp INT NOT NULL DEFAULT 300,
            export_tax_bp INT NOT NULL DEFAULT 300,
            import_tax_bp INT NOT NULL DEFAULT 300,
            mayor_user_id INT NULL,
            cycle_started_at DATETIME NOT NULL,
            cycle_ends_at DATETIME NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    `);

    await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS user_city_transfer_cycles (
            user_id INT NOT NULL,
            cycle_id INT NOT NULL,
            target_city_key VARCHAR(32) NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, cycle_id)
        )
    `);

    await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS city_mayor_votes (
            city_key VARCHAR(32) NOT NULL,
            cycle_id INT NOT NULL,
            voter_user_id INT NOT NULL,
            candidate_user_id INT NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (city_key, cycle_id, voter_user_id),
            KEY idx_city_mayor_votes_candidate (city_key, cycle_id, candidate_user_id)
        )
    `);

    await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS occupation_catalog (
            occupation_key VARCHAR(64) NOT NULL PRIMARY KEY,
            city_key VARCHAR(32) NOT NULL,
            job_slot ENUM('first_job','secondary_job') NOT NULL,
            display_name VARCHAR(64) NOT NULL,
            workspace_mode VARCHAR(32) NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_occupation_catalog_city_slot (city_key, job_slot),
            KEY idx_occupation_catalog_city_slot (city_key, job_slot)
        )
    `);

    await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS occupation_skill_branch_catalog (
            id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            occupation_key VARCHAR(64) NOT NULL,
            branch_slot TINYINT NOT NULL,
            branch_key VARCHAR(128) NOT NULL,
            branch_name VARCHAR(128) NOT NULL,
            effect_type VARCHAR(32) NOT NULL,
            max_level TINYINT NOT NULL DEFAULT 5,
            effect_config_json JSON NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_occupation_branch_slot (occupation_key, branch_slot),
            UNIQUE KEY uq_occupation_branch_key (occupation_key, branch_key),
            KEY idx_skill_branch_occupation (occupation_key)
        )
    `);

    await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS user_job_progress (
            id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            job_slot ENUM('first_job','secondary_job') NOT NULL,
            occupation_key VARCHAR(64) NOT NULL,
            level INT NOT NULL DEFAULT 1,
            exp INT NOT NULL DEFAULT 0,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_user_job_slot (user_id, job_slot),
            KEY idx_user_job_occupation (occupation_key)
        )
    `);

    await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS user_skill_progress (
            id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            job_slot ENUM('first_job','secondary_job') NOT NULL,
            occupation_key VARCHAR(64) NOT NULL,
            branch_key VARCHAR(128) NOT NULL,
            level TINYINT NOT NULL DEFAULT 0,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_user_skill_branch (user_id, job_slot, branch_key),
            KEY idx_user_skill_occupation (occupation_key)
        )
    `);

    await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS city_shop_item_rules (
            id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            city_key VARCHAR(32) NOT NULL,
            matcher_type VARCHAR(32) NOT NULL,
            matcher_value VARCHAR(191) NOT NULL,
            required_role VARCHAR(32) NOT NULL DEFAULT 'ANY',
            is_enabled TINYINT(1) NOT NULL DEFAULT 1,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_city_shop_item_rule (city_key, matcher_type, matcher_value, required_role)
        )
    `);

    await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS city_shop_recipe_rules (
            id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            city_key VARCHAR(32) NOT NULL,
            matcher_type VARCHAR(32) NOT NULL,
            matcher_value VARCHAR(191) NOT NULL,
            required_role VARCHAR(32) NOT NULL DEFAULT 'ANY',
            is_enabled TINYINT(1) NOT NULL DEFAULT 1,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_city_shop_recipe_rule (city_key, matcher_type, matcher_value, required_role)
        )
    `);

    await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS city_workspace_rules (
            id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            city_key VARCHAR(32) NOT NULL,
            job_slot ENUM('first_job','secondary_job') NOT NULL,
            work_type ENUM('FARM','COOK','MINE','SMELT') NOT NULL,
            workspace_mode VARCHAR(32) NOT NULL DEFAULT '',
            matcher_type VARCHAR(32) NOT NULL,
            matcher_value VARCHAR(191) NOT NULL DEFAULT '',
            required_item_name VARCHAR(191) NOT NULL,
            must_be_equipped TINYINT(1) NOT NULL DEFAULT 1,
            error_code VARCHAR(64) NOT NULL DEFAULT 'WORKSPACE_REQUIREMENT_FAILED',
            error_message VARCHAR(255) NOT NULL,
            is_enabled TINYINT(1) NOT NULL DEFAULT 1,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_city_workspace_rule (city_key, job_slot, work_type, workspace_mode, matcher_type, matcher_value, required_item_name),
            KEY idx_city_workspace_rule_lookup (city_key, job_slot, work_type, is_enabled)
        )
    `);

    const auditTables = [
        "city_states",
        "city_mayor_votes",
        "occupation_catalog",
        "occupation_skill_branch_catalog",
        "user_job_progress",
        "user_skill_progress",
        "city_shop_item_rules",
        "city_shop_recipe_rules",
        "city_workspace_rules",
    ];

    for (const tableName of auditTables) {
        await prisma.$executeRawUnsafe(`
            ALTER TABLE ${tableName}
            MODIFY COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            MODIFY COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        `).catch(() => undefined);
    }
}

async function upsertSetting(key: string, value: string) {
    await prisma.$executeRaw`
        INSERT INTO game_settings (setting_key, setting_value)
        VALUES (${key}, ${value})
        ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)
    `;
}

async function seedCitiesAndOccupations() {
    const { cycleStart, cycleEnd } = getCurrentElectionCycle();

    for (const city of CITY_CATALOG) {
        await prisma.$executeRaw`
            INSERT INTO city_states (
                city_key,
                display_name,
                treasury,
                tier,
                domestic_trade_tax_bp,
                export_tax_bp,
                import_tax_bp,
                mayor_user_id,
                cycle_started_at,
                cycle_ends_at
            ) VALUES (
                ${city.key},
                ${city.name},
                0,
                1,
                300,
                300,
                300,
                NULL,
                ${cycleStart},
                ${cycleEnd}
            )
            ON DUPLICATE KEY UPDATE
                display_name = VALUES(display_name)
        `;

        await prisma.$executeRaw`
            INSERT INTO occupation_catalog (occupation_key, city_key, job_slot, display_name, workspace_mode)
            VALUES (${city.occupations.first.key}, ${city.key}, 'first_job', ${city.occupations.first.displayName}, ${city.occupations.first.workspaceMode})
            ON DUPLICATE KEY UPDATE
                city_key = VALUES(city_key),
                job_slot = VALUES(job_slot),
                display_name = VALUES(display_name),
                workspace_mode = VALUES(workspace_mode)
        `;

        await prisma.$executeRaw`
            INSERT INTO occupation_catalog (occupation_key, city_key, job_slot, display_name, workspace_mode)
            VALUES (${city.occupations.secondary.key}, ${city.key}, 'secondary_job', ${city.occupations.secondary.displayName}, ${city.occupations.secondary.workspaceMode})
            ON DUPLICATE KEY UPDATE
                city_key = VALUES(city_key),
                job_slot = VALUES(job_slot),
                display_name = VALUES(display_name),
                workspace_mode = VALUES(workspace_mode)
        `;

        const occupationKeys = [city.occupations.first, city.occupations.secondary];
        for (const occupation of occupationKeys) {
            for (const branch of SKILL_BRANCH_TEMPLATE) {
                const branchKey = `${occupation.key}_${branch.branchKey}`;
                const branchName = `${occupation.displayName} ${branch.branchName}`;
                await prisma.$executeRaw`
                    INSERT INTO occupation_skill_branch_catalog
                        (occupation_key, branch_slot, branch_key, branch_name, effect_type, max_level, effect_config_json)
                    VALUES
                        (
                            ${occupation.key},
                            ${branch.branchSlot},
                            ${branchKey},
                            ${branchName},
                            ${branch.effectType},
                            ${branch.maxLevel},
                            ${JSON.stringify(branch.effectConfig)}
                        )
                    ON DUPLICATE KEY UPDATE
                        branch_name = VALUES(branch_name),
                        effect_type = VALUES(effect_type),
                        max_level = VALUES(max_level),
                        effect_config_json = VALUES(effect_config_json)
                `;
            }
        }
    }
}

async function seedGameSettings(settings: Array<{ key: string; value: string }>) {
    for (const setting of settings) {
        await upsertSetting(setting.key, setting.value);
    }

    if (SYNC_DELETE_MODE) {
        const activeKeys = new Set(settings.map((s) => s.key));
        const rows = await prisma.$queryRaw<Array<{ setting_key: string }>>`
            SELECT setting_key
            FROM game_settings
        `;
        const staleKeys = rows
            .map((r) => String(r.setting_key ?? ""))
            .filter((key) => key && !activeKeys.has(key));

        if (staleKeys.length > 0) {
            const placeholders = staleKeys.map(() => "?").join(",");
            await prisma.$executeRawUnsafe(
                `DELETE FROM game_settings WHERE setting_key IN (${placeholders})`,
                ...staleKeys,
            );
            console.log(`Removed stale game settings: ${staleKeys.length}`);
        }
    }
}

async function seedItemsAndRecipes(data: MasterData) {
    const itemIdByName = new Map<string, number>();
    const sourceItemNames = new Set(data.items.map((i) => i.name));
    const sourceRecipeNames = new Set(data.recipes.map((r) => r.name));

    for (const item of data.items) {
        const payload = {
            type: item.type as any,
            buy_price: item.buy_price ?? null,
            sell_price: item.sell_price ?? null,
            kcal: item.kcal ?? null,
            buff_pct: item.buff_pct ?? null,
            buff_mins: item.buff_mins ?? null,
            max_stack: item.max_stack,
            grow_mins: item.grow_mins ?? null,
            exp_value: item.exp_value,
            icon: item.icon,
            equipment_slot: item.equipment_slot ?? null,
            effect_key: item.effect_key ?? null,
            effect_value: item.effect_value ?? null,
            effect_value2: item.effect_value2 ?? null,
        };

        const row = await prisma.item.upsert({
            where: { name: item.name },
            update: payload as any,
            create: { name: item.name, ...payload } as any,
        });

        itemIdByName.set(item.name, row.id);
    }

    for (const link of data.yieldLinks) {
        const seedItemId = itemIdByName.get(link.seedItemName);
        const yieldItemId = itemIdByName.get(link.yieldItemName);
        if (!seedItemId || !yieldItemId) {
            throw new Error(`Invalid yield link: ${link.seedItemName} -> ${link.yieldItemName}`);
        }
        await prisma.item.update({
            where: { id: seedItemId },
            data: { yield_item_id: yieldItemId, yield_qty: link.yield_qty },
        });
    }

    for (const recipe of data.recipes) {
        const outputItemId = itemIdByName.get(recipe.outputItemName);
        if (!outputItemId) {
            throw new Error(`Recipe ${recipe.name} references missing output item: ${recipe.outputItemName}`);
        }

        const recipeRow = await prisma.recipe.upsert({
            where: { name: recipe.name },
            update: {
                output_item_id: outputItemId,
                output_qty: recipe.output_qty,
                cook_mins: recipe.cook_mins,
                unlock_price: recipe.unlock_price,
            },
            create: {
                name: recipe.name,
                output_item_id: outputItemId,
                output_qty: recipe.output_qty,
                cook_mins: recipe.cook_mins,
                unlock_price: recipe.unlock_price,
            },
        });

        const activeIngredientIds = new Set<number>();

        for (const ingredient of recipe.ingredients) {
            const ingredientId = itemIdByName.get(ingredient.itemName);
            if (!ingredientId) {
                throw new Error(`Recipe ${recipe.name} references missing ingredient item: ${ingredient.itemName}`);
            }
            activeIngredientIds.add(ingredientId);
            await prisma.recipeIngredient.upsert({
                where: { recipe_id_item_id: { recipe_id: recipeRow.id, item_id: ingredientId } },
                update: { quantity: ingredient.quantity },
                create: { recipe_id: recipeRow.id, item_id: ingredientId, quantity: ingredient.quantity },
            });
        }

        const staleIngredients = await prisma.recipeIngredient.findMany({
            where: {
                recipe_id: recipeRow.id,
                item_id: { notIn: Array.from(activeIngredientIds) },
            },
            select: { id: true },
        });

        if (staleIngredients.length > 0) {
            await prisma.recipeIngredient.deleteMany({
                where: { id: { in: staleIngredients.map((r) => r.id) } },
            });
        }
    }

    if (SYNC_DELETE_MODE) {
        const existingRecipes = await prisma.recipe.findMany({
            select: { id: true, name: true },
        });

        const staleRecipes = existingRecipes.filter((r) => !sourceRecipeNames.has(r.name));
        for (const recipe of staleRecipes) {
            await prisma.$transaction(async (tx) => {
                await tx.userRecipeUnlock.deleteMany({ where: { recipe_id: recipe.id } });
                await tx.recipeIngredient.deleteMany({ where: { recipe_id: recipe.id } });
                await tx.recipe.delete({ where: { id: recipe.id } });
            });
        }
        if (staleRecipes.length > 0) {
            console.log(`Removed stale recipes: ${staleRecipes.length}`);
        }

        const existingItems = await prisma.item.findMany({
            select: { id: true, name: true },
        });
        const staleItems = existingItems.filter((i) => !sourceItemNames.has(i.name));
        const staleItemIds = staleItems.map((i) => i.id);

        if (staleItemIds.length > 0) {
            await prisma.item.updateMany({
                where: { yield_item_id: { in: staleItemIds } },
                data: { yield_item_id: null, yield_qty: null },
            });
        }

        let deletedItems = 0;
        let skippedItems = 0;

        for (const item of staleItems) {
            const [
                inventoryRefs,
                workOrderRefs,
                recipeOutputRefs,
                recipeIngredientRefs,
                marketRefs,
                userEquipRefs,
                yieldRefs,
            ] = await Promise.all([
                prisma.inventorySlot.count({ where: { item_id: item.id } }),
                prisma.workOrder.count({ where: { item_id: item.id } }),
                prisma.recipe.count({ where: { output_item_id: item.id } }),
                prisma.recipeIngredient.count({ where: { item_id: item.id } }),
                prisma.marketListing.count({ where: { item_id: item.id } }),
                prisma.userEquipment.count({ where: { item_id: item.id } }),
                prisma.item.count({ where: { yield_item_id: item.id } }),
            ]);

            const totalRefs =
                inventoryRefs +
                workOrderRefs +
                recipeOutputRefs +
                recipeIngredientRefs +
                marketRefs +
                userEquipRefs +
                yieldRefs;

            if (totalRefs > 0) {
                skippedItems += 1;
                continue;
            }

            await prisma.item.delete({ where: { id: item.id } });
            deletedItems += 1;
        }

        if (deletedItems > 0 || skippedItems > 0) {
            console.log(`Stale items cleanup: deleted=${deletedItems}, skipped=${skippedItems}`);
        }
    }

    const miningPermitId = itemIdByName.get("Ferrum Mining Permit");
    const oreIds = [
        itemIdByName.get("Iron Ore"),
        itemIdByName.get("Copper Ore"),
        itemIdByName.get("Steel Ore"),
        itemIdByName.get("Stone"),
        itemIdByName.get("Coal"),
        itemIdByName.get("Gem"),
    ].filter((id): id is number => typeof id === "number");

    if (miningPermitId) {
        console.log(`Ferrum permit ready: ${miningPermitId}, ores: ${oreIds.join(",")}`);
    }
}

async function upsertShopItemRule(cityKey: string, matcherType: string, matcherValue: string, requiredRole = "ANY") {
    await prisma.$executeRaw`
        INSERT INTO city_shop_item_rules (city_key, matcher_type, matcher_value, required_role, is_enabled)
        VALUES (${cityKey}, ${matcherType}, ${matcherValue}, ${requiredRole}, 1)
        ON DUPLICATE KEY UPDATE
            is_enabled = VALUES(is_enabled),
            required_role = VALUES(required_role)
    `;
}

async function upsertShopRecipeRule(cityKey: string, matcherType: string, matcherValue: string, requiredRole = "ANY") {
    await prisma.$executeRaw`
        INSERT INTO city_shop_recipe_rules (city_key, matcher_type, matcher_value, required_role, is_enabled)
        VALUES (${cityKey}, ${matcherType}, ${matcherValue}, ${requiredRole}, 1)
        ON DUPLICATE KEY UPDATE
            is_enabled = VALUES(is_enabled),
            required_role = VALUES(required_role)
    `;
}

async function seedShopRules(shopRules: MasterData["shopRules"]) {
    if (SYNC_DELETE_MODE) {
        await prisma.$executeRawUnsafe(`DELETE FROM city_shop_item_rules`);
        await prisma.$executeRawUnsafe(`DELETE FROM city_shop_recipe_rules`);
    }

    for (const rule of shopRules.itemRules) {
        await upsertShopItemRule(rule.cityKey, rule.matcherType, rule.matcherValue, rule.requiredRole ?? "ANY");
    }

    for (const rule of shopRules.recipeRules) {
        await upsertShopRecipeRule(rule.cityKey, rule.matcherType, rule.matcherValue, rule.requiredRole ?? "ANY");
    }
}

async function upsertWorkspaceRule(rule: WorkspaceRule) {
    const workspaceMode = String(rule.workspaceMode ?? "").trim().toUpperCase();
    const matcherType = String(rule.matcherType ?? "ALWAYS").trim().toUpperCase() || "ALWAYS";
    const matcherValue = String(rule.matcherValue ?? "").trim();
    const cityKey = String(rule.cityKey ?? "").trim().toUpperCase();
    const requiredItemName = String(rule.requiredItemName ?? "").trim();
    const errorCode = String(rule.errorCode ?? "WORKSPACE_REQUIREMENT_FAILED").trim().toUpperCase();
    const errorMessage = String(rule.errorMessage ?? "Workspace requirement failed").trim();
    const isEnabled = rule.isEnabled === undefined ? true : Boolean(rule.isEnabled);
    const mustBeEquipped = rule.mustBeEquipped === undefined ? true : Boolean(rule.mustBeEquipped);

    if (!cityKey || !requiredItemName || !errorMessage) {
        throw new Error(`Invalid workspace rule: ${JSON.stringify(rule)}`);
    }

    await prisma.$executeRaw`
        INSERT INTO city_workspace_rules (
            city_key,
            job_slot,
            work_type,
            workspace_mode,
            matcher_type,
            matcher_value,
            required_item_name,
            must_be_equipped,
            error_code,
            error_message,
            is_enabled
        ) VALUES (
            ${cityKey},
            ${rule.jobSlot},
            ${rule.workType},
            ${workspaceMode},
            ${matcherType},
            ${matcherValue},
            ${requiredItemName},
            ${mustBeEquipped ? 1 : 0},
            ${errorCode},
            ${errorMessage},
            ${isEnabled ? 1 : 0}
        )
        ON DUPLICATE KEY UPDATE
            must_be_equipped = VALUES(must_be_equipped),
            error_code = VALUES(error_code),
            error_message = VALUES(error_message),
            is_enabled = VALUES(is_enabled),
            updated_at = CURRENT_TIMESTAMP
    `;
}

async function seedWorkspaceRules(workspaceRules: WorkspaceRule[]) {
    if (SYNC_DELETE_MODE) {
        await prisma.$executeRawUnsafe(`DELETE FROM city_workspace_rules`);
    }

    for (const rule of workspaceRules) {
        await upsertWorkspaceRule(rule);
    }
}

async function main() {
    const masterData = loadMasterData();
    console.log(`Seed mode: ${SYNC_DELETE_MODE ? "sync-delete" : "upsert-only"}`);

    console.log("Seeding master tables...");
    await ensureMasterTables();
    await seedGameSettings(masterData.gameSettings);
    await seedCitiesAndOccupations();

    console.log("Seeding items and recipes...");
    await seedItemsAndRecipes(masterData);

    console.log("Seeding shop rules...");
    await seedShopRules(masterData.shopRules);

    console.log("Seeding workspace rules...");
    await seedWorkspaceRules(masterData.workspaceRules ?? []);

    console.log("Seed complete!");
}

main()
    .catch((e) => {
        console.error(e);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
