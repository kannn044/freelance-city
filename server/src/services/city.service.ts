import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

export type CityKey = "AGRARIA" | "FERRUM" | "VOLTARA" | "TEXTILIS" | "MEDICO";

type DbClient = Prisma.TransactionClient | typeof prisma;

const DEFAULT_TAX_BP = 300; // 3%
const TAX_MIN_BP = 0;
const TAX_MAX_BP = 1200;
const TAX_STEP_BP = 50;
const ELECTION_CYCLE_DAYS = 7;
const GLOBAL_CYCLE_ANCHOR_ISO = "2026-01-01T00:00:00.000Z";

const CITY_CATALOG: Array<{
    key: CityKey;
    name: string;
    playable: boolean;
    description: string;
    occupations: string[];
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

    await db.$executeRawUnsafe(`
        CREATE INDEX idx_users_city_key ON users(city_key)
    `).catch(() => undefined);

    const { cycleStart, cycleEnd } = getCurrentElectionCycle();
    for (const city of CITY_CATALOG) {
        await db.$executeRaw`
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
                ${DEFAULT_TAX_BP},
                ${DEFAULT_TAX_BP},
                ${DEFAULT_TAX_BP},
                NULL,
                ${cycleStart},
                ${cycleEnd}
            )
            ON DUPLICATE KEY UPDATE
                display_name = VALUES(display_name)
        `;
    }

    schemaEnsured = true;
}

export async function syncCityElectionCycle(db: DbClient = prisma) {
    await ensureCitySchema(db);
    const { cycleStart, cycleEnd } = getCurrentElectionCycle();

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
    role: "NONE" | "PROVIDER" | "CHEF";
}) {
    await ensureCitySchema(prisma);
    const city = await getUserCityProfile(user.id);
    if (city.city_key) return city;

    if (user.role !== "NONE") {
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
        role: "NONE" | "PROVIDER" | "CHEF";
        provider_level: number;
    }>>`
        SELECT id, money, city_key, role, provider_level
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

        // Ferrum phase-1 starts with Miner path (mapped to Provider for current system)
        updates.push("role = CASE WHEN role = 'NONE' THEN 'PROVIDER' ELSE role END");
        updates.push("provider_level = CASE WHEN provider_level < 1 THEN 1 ELSE provider_level END");

        await tx.$executeRawUnsafe(
            `UPDATE users SET ${updates.join(", ")} WHERE id = ?`,
            ...values,
            userId
        );

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

    return {
        key: row.city_key,
        name: row.display_name,
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
