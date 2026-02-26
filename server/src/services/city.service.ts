import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

export type CityKey = "AGRARIA" | "FERRUM" | "VOLTARA" | "TEXTILIS" | "MEDICO";
type JobSlot = "first_job" | "secondary_job";
type SkillEffectType = "TIME_QUEUE" | "CRAFT_COST" | "OUTPUT_BONUS";
type OccupationKey =
    | "FARMER"
    | "CHEF"
    | "MINER"
    | "BLACKSMITH"
    | "TECHNICIAN"
    | "ENGINEER"
    | "WEAVER"
    | "TAILOR"
    | "GATHERER"
    | "ALCHEMIST";

type DbClient = Prisma.TransactionClient | typeof prisma;

const DEFAULT_TAX_BP = 300; // 3%
const TAX_MIN_BP = 0;
const TAX_MAX_BP = 1200;
const TAX_STEP_BP = 50;
const ELECTION_CYCLE_DAYS = 7;
const GLOBAL_CYCLE_ANCHOR_ISO = "2026-01-01T00:00:00.000Z";
const CITIZEN_ROLE = "CITIZEN";
const MAYOR_ROLE = "MAYOR";

const JOB_SLOT_VALUES: JobSlot[] = ["first_job", "secondary_job"];

const CITY_CATALOG: Array<{
    key: CityKey;
    name: string;
    playable: boolean;
    description: string;
    occupations: string[];
    occupation_labels: {
        first_job: string;
        secondary_job: string;
    };
    workspace_modes: {
        first_job: "FARM" | "MINE" | "EXTRACT" | "GATHER" | "FORAGE";
        secondary_job: "COOK" | "SMELT" | "REFINE" | "SEW" | "BREW";
    };
    first_job_special_task_item_name?: string;
}> = [
        {
            key: "AGRARIA",
            name: "Agraria",
            playable: true,
            description: "เกษตร & อาหาร: ปากท้องของโลก",
            occupations: [
                "Farmer: ปลูกผัก เลี้ยงสัตว์ (ผลิตวัตถุดิบสด)",
                "Chef: ปรุงอาหาร (เปลี่ยนวัตถุดิบเป็นพลังงานให้คนทั้งเซิร์ฟเวอร์)",
            ],
            occupation_labels: {
                first_job: "Farmer",
                secondary_job: "Chef",
            },
            workspace_modes: {
                first_job: "FARM",
                secondary_job: "COOK",
            },
        },
        {
            key: "FERRUM",
            name: "Ferrum",
            playable: true,
            description: "อุตสาหกรรม & เครื่องมือ: กระดูกสันหลังการผลิต",
            occupations: [
                "Miner: ขุดแร่เหล็ก หิน (แลกแรงกายกับทรัพยากรหนัก)",
                "Blacksmith: ถลุงแร่ ตีเครื่องมือเกษตร/เครื่องครัว",
            ],
            occupation_labels: {
                first_job: "Miner",
                secondary_job: "Blacksmith",
            },
            workspace_modes: {
                first_job: "MINE",
                secondary_job: "SMELT",
            },
            first_job_special_task_item_name: "Ferrum Mining Permit",
        },
        {
            key: "VOLTARA",
            name: "Voltara",
            playable: true,
            description: "พลังงาน & เชื้อเพลิง: เลือดหล่อเลี้ยงเครื่องจักร",
            occupations: [
                "Technician: ขุดเจาะน้ำมันดิบ ดูแลเครื่องปั่นไฟ",
                "Engineer: กลั่นก๊าซหุงต้มและน้ำมันเชื้อเพลิง",
            ],
            occupation_labels: {
                first_job: "Technician",
                secondary_job: "Engineer",
            },
            workspace_modes: {
                first_job: "EXTRACT",
                secondary_job: "REFINE",
            },
            first_job_special_task_item_name: "Voltara Drill Permit",
        },
        {
            key: "TEXTILIS",
            name: "Textilis",
            playable: true,
            description: "สิ่งทอ & แฟชั่น: เกราะป้องกันและช่องเก็บของ",
            occupations: [
                "Weaver: ปลูกฝ้าย เลี้ยงแกะเก็บขน",
                "Tailor: ตัดเย็บชุดทำงานและกระเป๋าเป้ขยายช่องเก็บของ",
            ],
            occupation_labels: {
                first_job: "Weaver",
                secondary_job: "Tailor",
            },
            workspace_modes: {
                first_job: "GATHER",
                secondary_job: "SEW",
            },
        },
        {
            key: "MEDICO",
            name: "Medico",
            playable: true,
            description: "วิทยาการ & เคมี: ตัวเร่งปฏิกิริยา",
            occupations: [
                "Gatherer: เก็บสมุนไพร หาแร่เคมี",
                "Alchemist: ปรุงปุ๋ย น้ำยา Flux และยารักษา",
            ],
            occupation_labels: {
                first_job: "Gatherer",
                secondary_job: "Alchemist",
            },
            workspace_modes: {
                first_job: "FORAGE",
                secondary_job: "BREW",
            },
        },
    ];

const OCCUPATION_BY_CITY: Record<CityKey, Record<JobSlot, { key: OccupationKey; displayName: string }>> = {
    AGRARIA: {
        first_job: { key: "FARMER", displayName: "Farmer" },
        secondary_job: { key: "CHEF", displayName: "Chef" },
    },
    FERRUM: {
        first_job: { key: "MINER", displayName: "Miner" },
        secondary_job: { key: "BLACKSMITH", displayName: "Blacksmith" },
    },
    VOLTARA: {
        first_job: { key: "TECHNICIAN", displayName: "Technician" },
        secondary_job: { key: "ENGINEER", displayName: "Engineer" },
    },
    TEXTILIS: {
        first_job: { key: "WEAVER", displayName: "Weaver" },
        secondary_job: { key: "TAILOR", displayName: "Tailor" },
    },
    MEDICO: {
        first_job: { key: "GATHERER", displayName: "Gatherer" },
        secondary_job: { key: "ALCHEMIST", displayName: "Alchemist" },
    },
};

const SKILL_BRANCH_TEMPLATE: Array<{
    branchSlot: number;
    branchKey: string;
    branchName: string;
    effectType: SkillEffectType;
    maxLevel: number;
    effectConfig: Record<string, unknown>;
}> = [
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
    ];

const CITY_TIER_THRESHOLDS = [
    0,
    20_000_000,
    40_000_000,
    70_000_000,
    120_000_000,
    250_000_000,
    400_000_000,
    600_000_000,
    850_000_000,
    1_100_000_000,
];

let schemaEnsured = false;

function clampTaxBp(value: number) {
    if (!Number.isFinite(value)) return DEFAULT_TAX_BP;
    const rounded = Math.round(value / TAX_STEP_BP) * TAX_STEP_BP;
    return Math.max(TAX_MIN_BP, Math.min(TAX_MAX_BP, rounded));
}

export function getCurrentElectionCycle(now: Date = new Date()) {
    const anchorMs = new Date(GLOBAL_CYCLE_ANCHOR_ISO).getTime();
    const cycleMs = ELECTION_CYCLE_DAYS * 24 * 60 * 60 * 1000;
    const diff = Math.max(0, now.getTime() - anchorMs);
    const cycleId = Math.floor(diff / cycleMs);
    const cycleStart = new Date(anchorMs + cycleId * cycleMs);
    const cycleEnd = new Date(cycleStart.getTime() + cycleMs);
    return { cycleId, cycleStart, cycleEnd };
}

function resolveTierByTreasury(treasury: number) {
    let tier = 1;
    for (let i = 0; i < CITY_TIER_THRESHOLDS.length; i++) {
        if (treasury >= CITY_TIER_THRESHOLDS[i]) tier = i + 1;
    }
    return Math.max(1, Math.min(10, tier));
}

export function getCityTierBonuses(tier: number) {
    const safeTier = Math.max(1, Math.min(10, Math.floor(tier)));
    const rank = safeTier - 1;
    return {
        task_time_reduction_pct: Math.min(9, rank * 1.0),
        npc_shop_discount_pct: Math.min(4.5, rank * 0.5),
        market_fee_discount_pct: Math.min(6.75, rank * 0.75),
        rare_drop_bonus_pct: Math.min(2.7, rank * 0.3),
    };
}

function getCityCatalogByKey(cityKey: CityKey) {
    return CITY_CATALOG.find((city) => city.key === cityKey);
}

function resolveCityOccupations(cityKey: CityKey) {
    const mapping = OCCUPATION_BY_CITY[cityKey];
    if (!mapping) {
        throw new Error(`Missing occupation mapping for city ${cityKey}`);
    }
    return mapping;
}

async function seedOccupationCatalog(db: DbClient) {
    for (const city of CITY_CATALOG) {
        const occupationMap = resolveCityOccupations(city.key);
        for (const slot of JOB_SLOT_VALUES) {
            const occupation = occupationMap[slot];
            const workspaceMode = city.workspace_modes[slot];
            await db.$executeRaw`
                INSERT INTO occupation_catalog (occupation_key, city_key, job_slot, display_name, workspace_mode)
                VALUES (${occupation.key}, ${city.key}, ${slot}, ${occupation.displayName}, ${workspaceMode})
                ON DUPLICATE KEY UPDATE
                    city_key = VALUES(city_key),
                    job_slot = VALUES(job_slot),
                    display_name = VALUES(display_name),
                    workspace_mode = VALUES(workspace_mode)
            `;
        }
    }
}

async function seedOccupationSkillBranches(db: DbClient) {
    for (const city of CITY_CATALOG) {
        const occupationMap = resolveCityOccupations(city.key);
        for (const slot of JOB_SLOT_VALUES) {
            const occupation = occupationMap[slot];
            for (const branch of SKILL_BRANCH_TEMPLATE) {
                const branchKey = `${occupation.key}_${branch.branchKey}`;
                const branchName = `${occupation.displayName} ${branch.branchName}`;
                await db.$executeRaw`
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

async function resetUserProgressByCityTx(db: DbClient, userId: number, cityKey: CityKey) {
    const occupationMap = resolveCityOccupations(cityKey);

    for (const slot of JOB_SLOT_VALUES) {
        const occupation = occupationMap[slot];
        await db.$executeRaw`
            INSERT INTO user_job_progress (user_id, job_slot, occupation_key, level, exp)
            VALUES (${userId}, ${slot}, ${occupation.key}, 1, 0)
            ON DUPLICATE KEY UPDATE
                occupation_key = VALUES(occupation_key),
                level = 1,
                exp = 0
        `;
    }

    await db.$executeRaw`
        DELETE FROM user_skill_progress
        WHERE user_id = ${userId}
    `;

    for (const slot of JOB_SLOT_VALUES) {
        const occupation = occupationMap[slot];
        await db.$executeRaw`
            INSERT INTO user_skill_progress (user_id, job_slot, occupation_key, branch_key, level)
            SELECT ${userId}, ${slot}, ${occupation.key}, branch_key, 0
            FROM occupation_skill_branch_catalog
            WHERE occupation_key = ${occupation.key}
            ON DUPLICATE KEY UPDATE
                occupation_key = VALUES(occupation_key),
                level = 0
        `;
    }
}

async function syncExistingUsersJobProgress(db: DbClient) {
    const rows = await db.$queryRaw<Array<{
        id: number;
        city_key: string | null;
        first_job_level: number | null;
        first_job_exp: number | null;
        secondary_job_level: number | null;
        secondary_job_exp: number | null;
    }>>`
        SELECT id, city_key, first_job_level, first_job_exp, secondary_job_level, secondary_job_exp
        FROM users
    `;

    for (const row of rows) {
        const cityKey = String(row.city_key ?? "").toUpperCase() as CityKey;
        if (!cityKey || !getCityCatalogByKey(cityKey)) continue;

        const occupationMap = resolveCityOccupations(cityKey);
        const firstLevel = Math.max(1, Number(row.first_job_level ?? 1));
        const secondaryLevel = Math.max(1, Number(row.secondary_job_level ?? 1));
        const firstExp = Math.max(0, Number(row.first_job_exp ?? 0));
        const secondaryExp = Math.max(0, Number(row.secondary_job_exp ?? 0));

        await db.$executeRaw`
            INSERT INTO user_job_progress (user_id, job_slot, occupation_key, level, exp)
            VALUES (${row.id}, 'first_job', ${occupationMap.first_job.key}, ${firstLevel}, ${firstExp})
            ON DUPLICATE KEY UPDATE
                occupation_key = VALUES(occupation_key)
        `;

        await db.$executeRaw`
            INSERT INTO user_job_progress (user_id, job_slot, occupation_key, level, exp)
            VALUES (${row.id}, 'secondary_job', ${occupationMap.secondary_job.key}, ${secondaryLevel}, ${secondaryExp})
            ON DUPLICATE KEY UPDATE
                occupation_key = VALUES(occupation_key)
        `;

        await db.$executeRaw`
            INSERT INTO user_skill_progress (user_id, job_slot, occupation_key, branch_key, level)
            SELECT ${row.id}, 'first_job', ${occupationMap.first_job.key}, branch_key, 0
            FROM occupation_skill_branch_catalog
            WHERE occupation_key = ${occupationMap.first_job.key}
            ON DUPLICATE KEY UPDATE
                occupation_key = VALUES(occupation_key)
        `;

        await db.$executeRaw`
            INSERT INTO user_skill_progress (user_id, job_slot, occupation_key, branch_key, level)
            SELECT ${row.id}, 'secondary_job', ${occupationMap.secondary_job.key}, branch_key, 0
            FROM occupation_skill_branch_catalog
            WHERE occupation_key = ${occupationMap.secondary_job.key}
            ON DUPLICATE KEY UPDATE
                occupation_key = VALUES(occupation_key)
        `;
    }
}

export async function ensureCitySchema(db: DbClient = prisma) {
    if (schemaEnsured) return;

    await db.$executeRawUnsafe(`
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

    await db.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS user_city_transfer_cycles (
            user_id INT NOT NULL,
            cycle_id INT NOT NULL,
            target_city_key VARCHAR(32) NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, cycle_id)
        )
    `);

    await db.$executeRawUnsafe(`
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

    await db.$executeRawUnsafe(`
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

    // Legacy repair: older schema incorrectly forced city_key to be globally unique,
    // which blocks having both first_job and secondary_job rows per city.
    const legacyCityUniqueIndexes = await db.$queryRaw<Array<{ index_name: string }>>`
        SELECT s.INDEX_NAME as index_name
        FROM information_schema.STATISTICS s
        WHERE s.TABLE_SCHEMA = DATABASE()
          AND s.TABLE_NAME = 'occupation_catalog'
          AND s.NON_UNIQUE = 0
          AND s.INDEX_NAME <> 'PRIMARY'
        GROUP BY s.INDEX_NAME
        HAVING COUNT(*) = 1
           AND MAX(s.COLUMN_NAME) = 'city_key'
    `;

    for (const idx of legacyCityUniqueIndexes) {
        const indexName = String(idx.index_name ?? "").trim();
        if (!indexName) continue;
        await db.$executeRawUnsafe(`ALTER TABLE occupation_catalog DROP INDEX ${indexName}`);
    }

    await db.$executeRawUnsafe(`
        ALTER TABLE occupation_catalog
        ADD UNIQUE KEY uq_occupation_catalog_city_slot (city_key, job_slot)
    `).catch(() => undefined);

    await db.$executeRawUnsafe(`
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

    await db.$executeRawUnsafe(`
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

    await db.$executeRawUnsafe(`
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

    const auditTables = [
        "city_states",
        "city_mayor_votes",
        "occupation_catalog",
        "occupation_skill_branch_catalog",
        "user_job_progress",
        "user_skill_progress",
    ];

    for (const tableName of auditTables) {
        await db.$executeRawUnsafe(`
            ALTER TABLE ${tableName}
            MODIFY COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            MODIFY COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        `).catch(() => undefined);
    }

    const userColumns = [
        { name: "city_key", ddl: "ALTER TABLE users ADD COLUMN city_key VARCHAR(32) NULL" },
        { name: "city_selected_at", ddl: "ALTER TABLE users ADD COLUMN city_selected_at DATETIME NULL" },
    ];

    for (const col of userColumns) {
        const rows = await db.$queryRaw<Array<{ cnt: number | bigint }>>`
            SELECT COUNT(*) as cnt
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'users'
              AND COLUMN_NAME = ${col.name}
        `;
        const exists = Number(rows[0]?.cnt ?? 0) > 0;
        if (!exists) {
            await db.$executeRawUnsafe(col.ddl);
        }
    }

    const roleColumnRows = await db.$queryRaw<Array<{ column_type: string | null }>>`
        SELECT column_type
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'users'
          AND COLUMN_NAME = 'role'
        LIMIT 1
    `;

    const roleColumnType = String(roleColumnRows[0]?.column_type ?? "").toUpperCase();
    const roleIsLegacy = roleColumnType.includes("NONE") || roleColumnType.includes("PROVIDER") || roleColumnType.includes("CHEF");

    if (roleIsLegacy) {
        await db.$executeRawUnsafe(`
            ALTER TABLE users
            MODIFY COLUMN role ENUM('NONE','PROVIDER','CHEF','CITIZEN','MAYOR') NOT NULL DEFAULT 'CITIZEN'
        `);

        await db.$executeRawUnsafe(`
            UPDATE users
            SET role = 'CITIZEN'
            WHERE role IN ('NONE', 'PROVIDER', 'CHEF', '')
               OR role IS NULL
               OR TRIM(CAST(role AS CHAR)) = ''
        `);

        await db.$executeRawUnsafe(`
            ALTER TABLE users
            MODIFY COLUMN role ENUM('CITIZEN','MAYOR') NOT NULL DEFAULT 'CITIZEN'
        `);
    }

    await db.$executeRawUnsafe(`
        UPDATE users
        SET role = 'CITIZEN'
        WHERE role IS NULL
           OR role = ''
           OR TRIM(CAST(role AS CHAR)) = ''
           OR role NOT IN ('CITIZEN', 'MAYOR')
    `);

    await db.$executeRawUnsafe(`
        CREATE INDEX idx_users_city_key ON users(city_key)
    `).catch(() => undefined);

    // Master data defaults are seeded by prisma/seed.ts.
    // Runtime path keeps only schema/compatibility checks.

    schemaEnsured = true;
}

export async function syncCityElectionCycle(db: DbClient = prisma) {
    await ensureCitySchema(db);
    const { cycleStart, cycleEnd } = getCurrentElectionCycle();

    const expiredMayorRows = await db.$queryRaw<Array<{ mayor_user_id: number | null }>>`
        SELECT mayor_user_id
        FROM city_states
        WHERE cycle_ends_at < ${new Date()}
          AND mayor_user_id IS NOT NULL
    `;

    const expiredMayorIds = Array.from(
        new Set(
            expiredMayorRows
                .map((row) => Number(row.mayor_user_id ?? 0))
                .filter((id) => id > 0)
        )
    );

    if (expiredMayorIds.length > 0) {
        await db.$executeRawUnsafe(
            `UPDATE users SET role = '${CITIZEN_ROLE}' WHERE id IN (${expiredMayorIds.map(() => "?").join(",")})`,
            ...expiredMayorIds,
        );
    }

    await db.$executeRaw`
        UPDATE city_states
        SET cycle_started_at = ${cycleStart},
            cycle_ends_at = ${cycleEnd},
            mayor_user_id = CASE
                WHEN cycle_ends_at < ${new Date()} THEN NULL
                ELSE mayor_user_id
            END
    `;
}

export async function getAvailableCities() {
    await ensureCitySchema(prisma);
    await syncCityElectionCycle(prisma);

    const rows = await prisma.$queryRaw<Array<{
        city_key: string;
        display_name: string;
        tier: number;
        treasury: number | bigint;
        domestic_trade_tax_bp: number;
        export_tax_bp: number;
        import_tax_bp: number;
        mayor_user_id: number | null;
    }>>`
        SELECT city_key, display_name, tier, treasury, domestic_trade_tax_bp, export_tax_bp, import_tax_bp, mayor_user_id
        FROM city_states
        WHERE city_key IN ('AGRARIA', 'FERRUM', 'VOLTARA', 'TEXTILIS', 'MEDICO')
        ORDER BY FIELD(city_key, 'AGRARIA', 'FERRUM', 'VOLTARA', 'TEXTILIS', 'MEDICO')
    `;

    const playableSet = new Set(CITY_CATALOG.filter((c) => c.playable).map((c) => c.key));

    return rows.map((r) => {
        const tier = Number(r.tier || 1);
        const catalog = CITY_CATALOG.find((c) => c.key === (r.city_key as CityKey));
        return {
            key: r.city_key as CityKey,
            name: r.display_name,
            playable: playableSet.has(r.city_key as CityKey),
            description: catalog?.description ?? "",
            occupations: catalog?.occupations ?? [],
            occupation_labels: catalog?.occupation_labels ?? { first_job: "First Job", secondary_job: "Secondary Job" },
            workspace_modes: catalog?.workspace_modes ?? { first_job: "FARM", secondary_job: "COOK" },
            first_job_special_task_item_name: catalog?.first_job_special_task_item_name ?? null,
            tier,
            treasury: Number(r.treasury || 0),
            taxes: {
                domesticPct: Number(r.domestic_trade_tax_bp || DEFAULT_TAX_BP) / 100,
                exportPct: Number(r.export_tax_bp || DEFAULT_TAX_BP) / 100,
                importPct: Number(r.import_tax_bp || DEFAULT_TAX_BP) / 100,
            },
            mayorUserId: r.mayor_user_id,
            bonuses: getCityTierBonuses(tier),
        };
    });
}

export async function getUserCityProfile(userId: number) {
    await ensureCitySchema(prisma);
    const rows = await prisma.$queryRaw<Array<{
        city_key: string | null;
        city_selected_at: Date | null;
    }>>`
        SELECT city_key, city_selected_at
        FROM users
        WHERE id = ${userId}
        LIMIT 1
    `;
    return {
        city_key: rows[0]?.city_key ?? null,
        city_selected_at: rows[0]?.city_selected_at ?? null,
    };
}

export async function ensureLegacyCityAssignment(user: {
    id: number;
    first_job_level?: number;
    secondary_job_level?: number;
}) {
    await ensureCitySchema(prisma);
    const city = await getUserCityProfile(user.id);
    if (city.city_key) return city;

    const firstLevel = Number(user.first_job_level ?? 0);
    const secondaryLevel = Number(user.secondary_job_level ?? 0);
    if (firstLevel > 0 || secondaryLevel > 0) {
        await prisma.$executeRaw`
            UPDATE users
            SET city_key = 'AGRARIA', city_selected_at = COALESCE(city_selected_at, NOW())
            WHERE id = ${user.id}
        `;
        return { city_key: "AGRARIA", city_selected_at: new Date() };
    }

    return city;
}

export async function selectUserCity(userId: number, cityKeyRaw: string) {
    await ensureCitySchema(prisma);
    await syncCityElectionCycle(prisma);

    const cityKey = String(cityKeyRaw || "").toUpperCase() as CityKey;
    const city = CITY_CATALOG.find((c) => c.key === cityKey);
    if (!city || !city.playable) {
        throw new Error("Selected city is not available yet");
    }

    const userRows = await prisma.$queryRaw<Array<{
        id: number;
        money: number;
        city_key: string | null;
        first_job_level: number;
    }>>`
        SELECT id, money, city_key, first_job_level AS first_job_level
        FROM users
        WHERE id = ${userId}
        LIMIT 1
    `;

    const user = userRows[0];
    if (!user) throw new Error("User not found");

    const isFirstSelection = !user.city_key;
    const currentCity = user.city_key;

    if (!isFirstSelection && currentCity === cityKey) {
        return { transferred: false, charged: 0, cityKey };
    }

    const { cycleId } = getCurrentElectionCycle();
    let charged = 0;

    if (!isFirstSelection) {
        const transferCost = 1_000_000;
        if (user.money < transferCost) {
            throw new Error("Not enough credits to transfer city (need 1,000,000)");
        }

        const transferRows = await prisma.$queryRaw<Array<{ cnt: number | bigint }>>`
            SELECT COUNT(*) as cnt
            FROM user_city_transfer_cycles
            WHERE user_id = ${userId} AND cycle_id = ${cycleId}
        `;
        const alreadyTransferred = Number(transferRows[0]?.cnt ?? 0) > 0;
        if (alreadyTransferred) {
            throw new Error("You can transfer city only once per election cycle");
        }

        charged = transferCost;
    }

    await prisma.$transaction(async (tx) => {
        const updates: string[] = ["city_key = ?", "city_selected_at = NOW()"];
        const values: any[] = [cityKey];

        if (charged > 0) {
            updates.push("money = money - ?");
            values.push(charged);
        }

        // Canonical city-based occupation reset: both slots unlocked, progression reset.
        updates.push("first_job_level = 1");
        updates.push("secondary_job_level = 1");
        updates.push("first_job_exp = 0");
        updates.push("secondary_job_exp = 0");
        updates.push("first_job_skill_level = 0");
        updates.push("secondary_job_skill_level = 0");

        await tx.$executeRawUnsafe(
            `UPDATE users SET ${updates.join(", ")} WHERE id = ?`,
            ...values,
            userId
        );

        await resetUserProgressByCityTx(tx, userId, cityKey);

        await tx.$executeRaw`
            DELETE FROM work_orders
            WHERE user_id = ${userId}
        `;

        if (charged > 0) {
            await tx.$executeRaw`
                INSERT INTO user_city_transfer_cycles (user_id, cycle_id, target_city_key)
                VALUES (${userId}, ${cycleId}, ${cityKey})
            `;
        }
    });

    return {
        transferred: !isFirstSelection,
        charged,
        cityKey,
    };
}

export async function getCityByKey(cityKey: string) {
    await ensureCitySchema(prisma);
    const rows = await prisma.$queryRaw<Array<{
        city_key: string;
        display_name: string;
        treasury: number | bigint;
        tier: number;
        domestic_trade_tax_bp: number;
        export_tax_bp: number;
        import_tax_bp: number;
        mayor_user_id: number | null;
    }>>`
        SELECT city_key, display_name, treasury, tier, domestic_trade_tax_bp, export_tax_bp, import_tax_bp, mayor_user_id
        FROM city_states
        WHERE city_key = ${cityKey}
        LIMIT 1
    `;

    const row = rows[0];
    if (!row) return null;

    const treasury = Number(row.treasury || 0);
    const tier = resolveTierByTreasury(treasury);

    const normalizedTax = {
        domestic_trade_tax_bp: clampTaxBp(Number(row.domestic_trade_tax_bp || DEFAULT_TAX_BP)),
        export_tax_bp: clampTaxBp(Number(row.export_tax_bp || DEFAULT_TAX_BP)),
        import_tax_bp: clampTaxBp(Number(row.import_tax_bp || DEFAULT_TAX_BP)),
    };

    if (tier !== Number(row.tier || 1)
        || normalizedTax.domestic_trade_tax_bp !== Number(row.domestic_trade_tax_bp)
        || normalizedTax.export_tax_bp !== Number(row.export_tax_bp)
        || normalizedTax.import_tax_bp !== Number(row.import_tax_bp)
    ) {
        await prisma.$executeRaw`
            UPDATE city_states
            SET tier = ${tier},
                domestic_trade_tax_bp = ${normalizedTax.domestic_trade_tax_bp},
                export_tax_bp = ${normalizedTax.export_tax_bp},
                import_tax_bp = ${normalizedTax.import_tax_bp}
            WHERE city_key = ${cityKey}
        `;
    }

    const catalog = CITY_CATALOG.find((c) => c.key === (cityKey as CityKey));

    return {
        key: row.city_key,
        name: row.display_name,
        description: catalog?.description ?? "",
        occupations: catalog?.occupations ?? [],
        occupation_labels: catalog?.occupation_labels ?? { first_job: "First Job", secondary_job: "Secondary Job" },
        workspace_modes: catalog?.workspace_modes ?? { first_job: "FARM", secondary_job: "COOK" },
        first_job_special_task_item_name: catalog?.first_job_special_task_item_name ?? null,
        tier,
        treasury,
        mayorUserId: row.mayor_user_id,
        taxes: {
            domesticPct: normalizedTax.domestic_trade_tax_bp / 100,
            exportPct: normalizedTax.export_tax_bp / 100,
            importPct: normalizedTax.import_tax_bp / 100,
        },
        bonuses: getCityTierBonuses(tier),
    };
}

export async function getUserCityContext(userId: number) {
    const profile = await getUserCityProfile(userId);
    if (!profile.city_key) {
        return {
            city_key: null,
            city_selected_at: profile.city_selected_at,
            city: null,
        };
    }

    return {
        city_key: profile.city_key,
        city_selected_at: profile.city_selected_at,
        city: await getCityByKey(profile.city_key),
    };
}

type MarketTaxComputation = {
    totalTax: number;
    sellerReceives: number;
    buyerPays: number;
    domesticTax: number;
    exportTax: number;
    importTax: number;
    sellerCityKey: string | null;
    buyerCityKey: string | null;
};

async function getUserCityKeyTx(db: DbClient, userId: number): Promise<string | null> {
    const rows = await db.$queryRaw<Array<{ city_key: string | null }>>`
        SELECT city_key
        FROM users
        WHERE id = ${userId}
        LIMIT 1
    `;
    return rows[0]?.city_key ?? null;
}

async function getCityTaxBpByKeyTx(db: DbClient, cityKey: string) {
    const rows = await db.$queryRaw<Array<{
        city_key: string;
        domestic_trade_tax_bp: number;
        export_tax_bp: number;
        import_tax_bp: number;
    }>>`
        SELECT city_key, domestic_trade_tax_bp, export_tax_bp, import_tax_bp
        FROM city_states
        WHERE city_key = ${cityKey}
        LIMIT 1
    `;
    const row = rows[0];
    if (!row) {
        return {
            domestic_trade_tax_bp: DEFAULT_TAX_BP,
            export_tax_bp: DEFAULT_TAX_BP,
            import_tax_bp: DEFAULT_TAX_BP,
        };
    }
    return {
        domestic_trade_tax_bp: clampTaxBp(Number(row.domestic_trade_tax_bp || DEFAULT_TAX_BP)),
        export_tax_bp: clampTaxBp(Number(row.export_tax_bp || DEFAULT_TAX_BP)),
        import_tax_bp: clampTaxBp(Number(row.import_tax_bp || DEFAULT_TAX_BP)),
    };
}

async function creditCityTreasuryTx(db: DbClient, cityKey: string, grossTaxAmount: number) {
    if (!cityKey || grossTaxAmount <= 0) return;
    const treasuryShare = Math.floor(grossTaxAmount * 0.7);
    if (treasuryShare <= 0) return;

    await db.$executeRaw`
        UPDATE city_states
        SET treasury = treasury + ${treasuryShare}
        WHERE city_key = ${cityKey}
    `;

    const rows = await db.$queryRaw<Array<{ treasury: number | bigint; tier: number }>>`
        SELECT treasury, tier
        FROM city_states
        WHERE city_key = ${cityKey}
        LIMIT 1
    `;
    const row = rows[0];
    if (!row) return;

    const nextTier = resolveTierByTreasury(Number(row.treasury || 0));
    if (nextTier !== Number(row.tier || 1)) {
        await db.$executeRaw`
            UPDATE city_states
            SET tier = ${nextTier}
            WHERE city_key = ${cityKey}
        `;
    }
}

export async function computeMarketTradeTaxTx(
    db: DbClient,
    sellerUserId: number,
    buyerUserId: number,
    tradeValue: number,
): Promise<MarketTaxComputation> {
    await ensureCitySchema(db);
    const value = Math.max(0, Math.floor(tradeValue));

    if (value <= 0) {
        return {
            totalTax: 0,
            sellerReceives: 0,
            buyerPays: 0,
            domesticTax: 0,
            exportTax: 0,
            importTax: 0,
            sellerCityKey: null,
            buyerCityKey: null,
        };
    }

    const sellerCityKey = await getUserCityKeyTx(db, sellerUserId);
    const buyerCityKey = await getUserCityKeyTx(db, buyerUserId);

    if (!sellerCityKey || !buyerCityKey) {
        return {
            totalTax: 0,
            sellerReceives: value,
            buyerPays: value,
            domesticTax: 0,
            exportTax: 0,
            importTax: 0,
            sellerCityKey,
            buyerCityKey,
        };
    }

    if (sellerCityKey === buyerCityKey) {
        const taxBp = (await getCityTaxBpByKeyTx(db, sellerCityKey)).domestic_trade_tax_bp;
        const domesticTax = Math.floor(value * (taxBp / 10_000));

        return {
            totalTax: domesticTax,
            sellerReceives: value - domesticTax,
            buyerPays: value,
            domesticTax,
            exportTax: 0,
            importTax: 0,
            sellerCityKey,
            buyerCityKey,
        };
    }

    const sellerTax = await getCityTaxBpByKeyTx(db, sellerCityKey);
    const buyerTax = await getCityTaxBpByKeyTx(db, buyerCityKey);
    const exportTax = Math.floor(value * (sellerTax.export_tax_bp / 10_000));
    const importTax = Math.floor(value * (buyerTax.import_tax_bp / 10_000));
    const totalTax = exportTax + importTax;

    return {
        totalTax,
        sellerReceives: value - exportTax,
        buyerPays: value + importTax,
        domesticTax: 0,
        exportTax,
        importTax,
        sellerCityKey,
        buyerCityKey,
    };
}

export async function applyMarketTradeTaxTx(
    db: DbClient,
    tax: MarketTaxComputation,
) {
    if (tax.domesticTax > 0 && tax.sellerCityKey) {
        await creditCityTreasuryTx(db, tax.sellerCityKey, tax.domesticTax);
    }
    if (tax.exportTax > 0 && tax.sellerCityKey) {
        await creditCityTreasuryTx(db, tax.sellerCityKey, tax.exportTax);
    }
    if (tax.importTax > 0 && tax.buyerCityKey) {
        await creditCityTreasuryTx(db, tax.buyerCityKey, tax.importTax);
    }
}

type CityElectionCandidate = {
    user_id: number;
    email: string;
    votes: number;
    is_mayor: boolean;
};

function toTaxBp(pct: number): number {
    return clampTaxBp(Math.round(Number(pct) * 100));
}

async function setCityMayorTx(
    db: DbClient,
    cityKey: string,
    nextMayorUserId: number | null,
) {
    const cityRows = await db.$queryRaw<Array<{ mayor_user_id: number | null }>>`
        SELECT mayor_user_id
        FROM city_states
        WHERE city_key = ${cityKey}
        LIMIT 1
    `;
    const prevMayorUserId = cityRows[0]?.mayor_user_id ?? null;

    if (prevMayorUserId && prevMayorUserId !== nextMayorUserId) {
        await db.$executeRaw`
            UPDATE users
            SET role = ${CITIZEN_ROLE}
            WHERE id = ${prevMayorUserId}
        `;
    }

    await db.$executeRaw`
        UPDATE city_states
        SET mayor_user_id = ${nextMayorUserId}
        WHERE city_key = ${cityKey}
    `;

    if (nextMayorUserId) {
        await db.$executeRaw`
            UPDATE users
            SET role = ${MAYOR_ROLE}
            WHERE id = ${nextMayorUserId}
        `;
    }
}

async function recalculateCityMayorTx(db: DbClient, cityKey: string, cycleId: number) {
    const rows = await db.$queryRaw<Array<{ candidate_user_id: number; votes: number | bigint }>>`
        SELECT candidate_user_id, COUNT(*) AS votes
        FROM city_mayor_votes
        WHERE city_key = ${cityKey} AND cycle_id = ${cycleId}
        GROUP BY candidate_user_id
        ORDER BY votes DESC, candidate_user_id ASC
    `;

    const winnerUserId = rows[0]?.candidate_user_id ?? null;
    await setCityMayorTx(db, cityKey, winnerUserId);
    return winnerUserId;
}

export async function getCityGovernance(userId: number) {
    await ensureCitySchema(prisma);
    await syncCityElectionCycle(prisma);

    const userRows = await prisma.$queryRaw<Array<{
        id: number;
        role: string;
        city_key: string | null;
    }>>`
        SELECT id, role, city_key
        FROM users
        WHERE id = ${userId}
        LIMIT 1
    `;

    const user = userRows[0];
    if (!user) throw new Error("User not found");

    if (!user.city_key) {
        return {
            city_key: null,
            cycle: getCurrentElectionCycle(),
            taxes: null,
            mayor: null,
            candidates: [] as CityElectionCandidate[],
            canSetTaxes: false,
            userVoteCandidateId: null as number | null,
        };
    }

    const cityRows = await prisma.$queryRaw<Array<{
        city_key: string;
        domestic_trade_tax_bp: number;
        export_tax_bp: number;
        import_tax_bp: number;
        mayor_user_id: number | null;
    }>>`
        SELECT city_key, domestic_trade_tax_bp, export_tax_bp, import_tax_bp, mayor_user_id
        FROM city_states
        WHERE city_key = ${user.city_key}
        LIMIT 1
    `;

    const city = cityRows[0];
    const { cycleId, cycleStart, cycleEnd } = getCurrentElectionCycle();

    const voteRows = await prisma.$queryRaw<Array<{ candidate_user_id: number | null }>>`
        SELECT candidate_user_id
        FROM city_mayor_votes
        WHERE city_key = ${user.city_key}
          AND cycle_id = ${cycleId}
          AND voter_user_id = ${userId}
        LIMIT 1
    `;

    const candidateRows = await prisma.$queryRaw<Array<{ user_id: number; email: string; votes: number | bigint }>>`
        SELECT u.id AS user_id,
               u.email AS email,
               COUNT(v.voter_user_id) AS votes
        FROM users u
        LEFT JOIN city_mayor_votes v
          ON v.city_key = ${user.city_key}
         AND v.cycle_id = ${cycleId}
         AND v.candidate_user_id = u.id
        WHERE u.city_key = ${user.city_key}
        GROUP BY u.id, u.email
        ORDER BY votes DESC, u.id ASC
        LIMIT 20
    `;

    return {
        city_key: user.city_key,
        cycle: { cycleId, cycleStart, cycleEnd },
        taxes: city
            ? {
                domesticPct: clampTaxBp(Number(city.domestic_trade_tax_bp || DEFAULT_TAX_BP)) / 100,
                exportPct: clampTaxBp(Number(city.export_tax_bp || DEFAULT_TAX_BP)) / 100,
                importPct: clampTaxBp(Number(city.import_tax_bp || DEFAULT_TAX_BP)) / 100,
            }
            : null,
        mayor: city?.mayor_user_id
            ? {
                userId: city.mayor_user_id,
            }
            : null,
        candidates: candidateRows.map((row) => ({
            user_id: row.user_id,
            email: row.email,
            votes: Number(row.votes ?? 0),
            is_mayor: Number(city?.mayor_user_id ?? 0) === Number(row.user_id),
        })),
        canSetTaxes: Number(city?.mayor_user_id ?? 0) === Number(userId),
        userVoteCandidateId: voteRows[0]?.candidate_user_id ?? null,
    };
}

export async function castMayorVote(userId: number, candidateUserId: number) {
    await ensureCitySchema(prisma);
    await syncCityElectionCycle(prisma);

    const voterRows = await prisma.$queryRaw<Array<{ city_key: string | null }>>`
        SELECT city_key
        FROM users
        WHERE id = ${userId}
        LIMIT 1
    `;
    const cityKey = voterRows[0]?.city_key ?? null;
    if (!cityKey) {
        throw new Error("You must select a city before voting");
    }

    const candidateRows = await prisma.$queryRaw<Array<{ id: number; city_key: string | null }>>`
        SELECT id, city_key
        FROM users
        WHERE id = ${candidateUserId}
        LIMIT 1
    `;
    const candidate = candidateRows[0];
    if (!candidate || candidate.city_key !== cityKey) {
        throw new Error("Candidate must be in the same city");
    }

    const { cycleId } = getCurrentElectionCycle();

    const mayorUserId = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
            INSERT INTO city_mayor_votes (city_key, cycle_id, voter_user_id, candidate_user_id)
            VALUES (${cityKey}, ${cycleId}, ${userId}, ${candidateUserId})
            ON DUPLICATE KEY UPDATE
                candidate_user_id = VALUES(candidate_user_id)
        `;

        return recalculateCityMayorTx(tx, cityKey, cycleId);
    });

    return {
        cityKey,
        mayorUserId,
    };
}

export async function updateCityTaxesByMayor(
    mayorUserId: number,
    payload: {
        domesticPct?: number;
        exportPct?: number;
        importPct?: number;
    },
) {
    await ensureCitySchema(prisma);
    await syncCityElectionCycle(prisma);

    const mayorRows = await prisma.$queryRaw<Array<{ city_key: string | null }>>`
        SELECT city_key
        FROM users
        WHERE id = ${mayorUserId}
        LIMIT 1
    `;
    const cityKey = mayorRows[0]?.city_key ?? null;
    if (!cityKey) throw new Error("Mayor city not found");

    const cityRows = await prisma.$queryRaw<Array<{ mayor_user_id: number | null }>>`
        SELECT mayor_user_id
        FROM city_states
        WHERE city_key = ${cityKey}
        LIMIT 1
    `;
    if (Number(cityRows[0]?.mayor_user_id ?? 0) !== Number(mayorUserId)) {
        throw new Error("Only current mayor can set taxes");
    }

    const domesticBp = payload.domesticPct != null ? toTaxBp(payload.domesticPct) : null;
    const exportBp = payload.exportPct != null ? toTaxBp(payload.exportPct) : null;
    const importBp = payload.importPct != null ? toTaxBp(payload.importPct) : null;

    if (domesticBp == null && exportBp == null && importBp == null) {
        throw new Error("No tax fields provided");
    }

    await prisma.$executeRaw`
        UPDATE city_states
        SET domestic_trade_tax_bp = COALESCE(${domesticBp}, domestic_trade_tax_bp),
            export_tax_bp = COALESCE(${exportBp}, export_tax_bp),
            import_tax_bp = COALESCE(${importBp}, import_tax_bp)
        WHERE city_key = ${cityKey}
    `;

    return getCityByKey(cityKey);
}
