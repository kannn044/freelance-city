import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import {
    CHEF_SKILL_MAX_LEVEL,
    CHEF_SKILL_TREE_CONFIG,
    PROVIDER_SKILL_MAX_LEVEL,
    PROVIDER_SKILL_TREE_CONFIG,
    getChefSkillConcurrentCookSlots,
    getChefSkillCookTimeReduction,
    getProviderSkillTimeReduction,
} from "../config/game.config";

interface AuthRequest extends Request {
    userId?: number;
}

type ProviderBranch = "VEGETABLE" | "CHICKEN" | "BEEF";
type SecondaryBranchKey = string;
type SecondaryStorageField = "chef_skill_prep" | "chef_skill_economy" | "chef_skill_market";
type SecondaryEffectKind = "TIME_AND_QUEUE" | "RESOURCE_EFFICIENCY" | "OUTPUT_MASTERY";

type SecondaryBranchProfile = {
    key: SecondaryBranchKey;
    storageField: SecondaryStorageField;
    effectKind: SecondaryEffectKind;
    title: string;
    color: string;
    effects: {
        level1: string;
        level2: string;
        level3: string;
        level4: string;
    };
};

type SecondarySkillProfile = {
    treeTitle: string;
    occupationLabel: string;
    timeEffectLabel: string;
    queueLabel: string;
    branches: SecondaryBranchProfile[];
};

const FERRUM_MINER_SKILL_TREE_CONFIG: Record<ProviderBranch, {
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
        title: "Drill Prep",
        color: "#38bdf8",
        effects: {
            level1: "Lv.1: Reduce mining expedition time by 5%",
            level2: "Lv.2: Improve layer handling consistency",
            level3: "Lv.3: Reduce mining expedition time by another 5% (10% total)",
            level4: "Lv.4: Expert drilling flow for faster cycle",
        },
    },
    CHICKEN: {
        title: "Ore Efficiency",
        color: "#f59e0b",
        effects: {
            level1: "Lv.1: Better ore extraction discipline",
            level2: "Lv.2: Better by-product consistency",
            level3: "Lv.3: Improved handling under pressure",
            level4: "Lv.4: Master ore management",
        },
    },
    BEEF: {
        title: "Market Logistics",
        color: "#ef4444",
        effects: {
            level1: "Lv.1: Better outbound logistics",
            level2: "Lv.2: Better queue discipline",
            level3: "Lv.3: Better shipment planning",
            level4: "Lv.4: Master market routing",
        },
    },
};

const DEFAULT_SECONDARY_SKILL_PROFILE: SecondarySkillProfile = {
    treeTitle: "Chef Skill Tree",
    occupationLabel: "Chef",
    timeEffectLabel: "cook-time",
    queueLabel: "queue",
    branches: [
        {
            key: "PREP_MASTER",
            storageField: "chef_skill_prep",
            effectKind: "TIME_AND_QUEUE",
            title: CHEF_SKILL_TREE_CONFIG.PREP_MASTER.title,
            color: CHEF_SKILL_TREE_CONFIG.PREP_MASTER.color,
            effects: CHEF_SKILL_TREE_CONFIG.PREP_MASTER.effects,
        },
        {
            key: "KITCHEN_ECONOMY",
            storageField: "chef_skill_economy",
            effectKind: "RESOURCE_EFFICIENCY",
            title: CHEF_SKILL_TREE_CONFIG.KITCHEN_ECONOMY.title,
            color: CHEF_SKILL_TREE_CONFIG.KITCHEN_ECONOMY.color,
            effects: CHEF_SKILL_TREE_CONFIG.KITCHEN_ECONOMY.effects,
        },
        {
            key: "MARKET_INTEL",
            storageField: "chef_skill_market",
            effectKind: "OUTPUT_MASTERY",
            title: CHEF_SKILL_TREE_CONFIG.MARKET_INTEL.title,
            color: CHEF_SKILL_TREE_CONFIG.MARKET_INTEL.color,
            effects: CHEF_SKILL_TREE_CONFIG.MARKET_INTEL.effects,
        },
    ],
};

const FERRUM_BLACKSMITH_SKILL_PROFILE: SecondarySkillProfile = {
    treeTitle: "Blacksmith Skill Tree",
    occupationLabel: "Blacksmith",
    timeEffectLabel: "smelting-time",
    queueLabel: "smelting queue",
    branches: [
        {
            key: "SMELTING_SPEED",
            storageField: "chef_skill_prep",
            effectKind: "TIME_AND_QUEUE",
            title: "Smelting Speed",
            color: "#f97316",
            effects: {
                level1: "Lv.1: Reduce smelting time by 5%",
                level2: "Lv.2: Increase concurrent smelting queue to 2",
                level3: "Lv.3: Reduce smelting time by another 5% (10% total)",
                level4: "Lv.4: Increase concurrent smelting queue to 3",
            },
        },
        {
            key: "FUEL_EFFICIENCY",
            storageField: "chef_skill_economy",
            effectKind: "RESOURCE_EFFICIENCY",
            title: "Fuel Efficiency",
            color: "#22c55e",
            effects: {
                level1: "Lv.1: Secondary smelting ingredient save chance +6%",
                level2: "Lv.2: Secondary smelting ingredient save chance +6% (12% total)",
                level3: "Lv.3: Primary smelting ingredient save chance +5%",
                level4: "Lv.4: Primary smelting ingredient save chance +10%",
            },
        },
        {
            key: "ALLOY_MASTERY",
            storageField: "chef_skill_market",
            effectKind: "OUTPUT_MASTERY",
            title: "Alloy Mastery",
            color: "#a78bfa",
            effects: {
                level1: "Lv.1: +3% chance to produce +1 extra ingot",
                level2: "Lv.2: +6% chance to produce +1 extra ingot",
                level3: "Lv.3: +10% chance to produce +1 extra ingot",
                level4: "Lv.4: +15% chance to produce +1 extra ingot",
            },
        },
    ],
};

const CITY_SECONDARY_SKILL_PROFILES: Record<string, SecondarySkillProfile> = {
    FERRUM: FERRUM_BLACKSMITH_SKILL_PROFILE,
};

function resolveSecondarySkillProfile(cityKey?: string | null): SecondarySkillProfile {
    const key = String(cityKey ?? "").toUpperCase();
    return CITY_SECONDARY_SKILL_PROFILES[key] ?? DEFAULT_SECONDARY_SKILL_PROFILE;
}

let chefSkillColumnsEnsured = false;

async function ensureChefSkillColumns() {
    if (chefSkillColumnsEnsured) return;

    const columns = [
        "chef_skill_prep",
        "chef_skill_economy",
        "chef_skill_market",
    ];

    for (const column of columns) {
        const rows = await prisma.$queryRaw<Array<{ cnt: number | bigint }>>`
            SELECT COUNT(*) as cnt
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'users'
              AND COLUMN_NAME = ${column}
        `;

        const exists = Number(rows[0]?.cnt ?? 0) > 0;
        if (!exists) {
            await prisma.$executeRawUnsafe(`
                ALTER TABLE users
                ADD COLUMN ${column} INT NOT NULL DEFAULT 0
            `);
        }
    }

    chefSkillColumnsEnsured = true;
}

async function getSmeltingRecipeIds(): Promise<Set<number>> {
    const rows = await prisma.$queryRaw<Array<{ id: number }>>`
        SELECT r.id
        FROM recipes r
        JOIN items i ON i.id = r.output_item_id
        WHERE LOWER(r.name) LIKE '%smelt%'
           OR LOWER(i.name) LIKE '%ingot%'
    `;
    return new Set(rows.map((r) => Number(r.id)).filter((id) => Number.isFinite(id) && id > 0));
}

function getSeedNameByBranch(branch: ProviderBranch): string {
    if (branch === "VEGETABLE") return "Vegetable Seed";
    if (branch === "CHICKEN") return "Chicken Egg";
    return "Beef Calf";
}

async function applyImmediateProviderTimeReduction(
    userId: number,
    branch: ProviderBranch,
    oldLevel: number,
    newLevel: number,
): Promise<number> {
    const oldReduction = getProviderSkillTimeReduction(oldLevel);
    const newReduction = getProviderSkillTimeReduction(newLevel);

    if (newReduction <= oldReduction) return 0;

    const oldMultiplier = 1 - oldReduction;
    const newMultiplier = 1 - newReduction;
    if (oldMultiplier <= 0 || newMultiplier <= 0) return 0;

    const remainingScale = newMultiplier / oldMultiplier;
    const seedName = getSeedNameByBranch(branch);

    return prisma.$transaction(async (tx) => {
        const seed = await tx.item.findFirst({
            where: { name: seedName },
            select: { id: true },
        });

        if (!seed) return 0;

        const orders = await tx.workOrder.findMany({
            where: {
                user_id: userId,
                type: "FARM",
                item_id: seed.id,
                collected: false,
            },
            select: {
                id: true,
                completes_at: true,
            },
        });

        const nowMs = Date.now();
        let adjusted = 0;

        for (const order of orders) {
            const remainingMs = Math.max(0, new Date(order.completes_at).getTime() - nowMs);
            if (remainingMs <= 0) continue;

            const nextRemainingMs = Math.max(1000, Math.floor(remainingMs * remainingScale));
            if (nextRemainingMs >= remainingMs) continue;

            await tx.workOrder.update({
                where: { id: order.id },
                data: { completes_at: new Date(nowMs + nextRemainingMs) },
            });
            adjusted += 1;
        }

        return adjusted;
    });
}

async function applyImmediateChefPrepReduction(
    userId: number,
    oldLevel: number,
    newLevel: number,
    cityKey?: string | null,
): Promise<number> {
    const oldReduction = getChefSkillCookTimeReduction(oldLevel);
    const newReduction = getChefSkillCookTimeReduction(newLevel);

    if (newReduction <= oldReduction) return 0;

    const oldMultiplier = 1 - oldReduction;
    const newMultiplier = 1 - newReduction;
    if (oldMultiplier <= 0 || newMultiplier <= 0) return 0;

    const remainingScale = newMultiplier / oldMultiplier;

    const isFerrum = String(cityKey ?? "").toUpperCase() === "FERRUM";
    const smeltingRecipeIds = isFerrum ? await getSmeltingRecipeIds() : null;

    return prisma.$transaction(async (tx) => {
        const orders = await tx.workOrder.findMany({
            where: {
                user_id: userId,
                type: "COOK",
                collected: false,
            },
            select: {
                id: true,
                completes_at: true,
                recipe_id: true,
            },
        });

        const nowMs = Date.now();
        let adjusted = 0;

        for (const order of orders) {
            if (smeltingRecipeIds && !smeltingRecipeIds.has(Number(order.recipe_id ?? -1))) {
                continue;
            }

            const remainingMs = Math.max(0, new Date(order.completes_at).getTime() - nowMs);
            if (remainingMs <= 0) continue;

            const nextRemainingMs = Math.max(1000, Math.floor(remainingMs * remainingScale));
            if (nextRemainingMs >= remainingMs) continue;

            await tx.workOrder.update({
                where: { id: order.id },
                data: { completes_at: new Date(nowMs + nextRemainingMs) },
            });
            adjusted += 1;
        }

        return adjusted;
    });
}

async function rebalanceChefQueueSlots(userId: number, prepLevel: number): Promise<number> {
    const maxParallel = Math.max(1, getChefSkillConcurrentCookSlots(prepLevel));
    const now = Date.now();

    const cityRows = await prisma.$queryRaw<Array<{ city_key: string | null }>>`
        SELECT city_key
        FROM users
        WHERE id = ${userId}
        LIMIT 1
    `;
    const isFerrum = String(cityRows[0]?.city_key ?? "").toUpperCase() === "FERRUM";
    const smeltingRecipeIds = isFerrum ? await getSmeltingRecipeIds() : null;

    return prisma.$transaction(async (tx) => {
        const orders = await tx.workOrder.findMany({
            where: {
                user_id: userId,
                type: "COOK",
                collected: false,
            },
            orderBy: [{ started_at: "asc" }, { id: "asc" }],
        });

        const scopedOrders = smeltingRecipeIds
            ? orders.filter((o) => smeltingRecipeIds.has(Number(o.recipe_id ?? -1)))
            : orders;

        if (scopedOrders.length === 0) return 0;

        const laneAvailableAt = Array.from({ length: maxParallel }, () => now);
        let updated = 0;

        for (const order of scopedOrders) {
            const currentStart = new Date(order.started_at).getTime();
            const currentEnd = new Date(order.completes_at).getTime();
            const durationMs = Math.max(1000, currentEnd - currentStart);

            let laneIndex = 0;
            for (let i = 1; i < laneAvailableAt.length; i++) {
                if (laneAvailableAt[i] < laneAvailableAt[laneIndex]) laneIndex = i;
            }

            const nextStartMs = Math.max(now, laneAvailableAt[laneIndex]);
            const nextEndMs = nextStartMs + durationMs;
            laneAvailableAt[laneIndex] = nextEndMs;

            if (nextStartMs !== currentStart || nextEndMs !== currentEnd) {
                await tx.workOrder.update({
                    where: { id: order.id },
                    data: {
                        started_at: new Date(nextStartMs),
                        completes_at: new Date(nextEndMs),
                    },
                });
                updated += 1;
            }
        }

        return updated;
    });
}

interface ProviderSkillUserRow {
    id: number;
    email: string;
    role: string;
    money: number;
    hunger: number;
    hunger_updated_at: Date;
    satiety_buff: number;
    buff_expires_at: Date | null;
    provider_level: number;
    provider_exp: number;
    provider_skill_veg: number;
    provider_skill_chicken: number;
    provider_skill_beef: number;
    chef_level: number;
    chef_exp: number;
    chef_skill_prep: number;
    chef_skill_economy: number;
    chef_skill_market: number;
    city_key: string | null;
}

async function getProviderSkillUserRow(userId: number): Promise<ProviderSkillUserRow | null> {
    await ensureChefSkillColumns();

    try {
        const rows = await prisma.$queryRaw<ProviderSkillUserRow[]>`
            SELECT
                id,
                email,
                role,
                money,
                hunger,
                hunger_updated_at,
                satiety_buff,
                buff_expires_at,
                provider_level,
                provider_exp,
                provider_skill_veg,
                provider_skill_chicken,
                provider_skill_beef,
                chef_level,
                chef_exp,
                chef_skill_prep,
                chef_skill_economy,
                chef_skill_market,
                city_key
            FROM users
            WHERE id = ${userId}
            LIMIT 1
        `;

        return rows[0] ?? null;
    } catch (error: any) {
        // Backward compatibility: DB migration for provider_skill_* columns may not be applied yet.
        const msg = String(error?.message ?? "");
        if (!msg.toLowerCase().includes("unknown column")) {
            throw error;
        }

        const legacyRows = await prisma.$queryRaw<Array<
            Omit<ProviderSkillUserRow, "provider_skill_veg" | "provider_skill_chicken" | "provider_skill_beef" | "chef_skill_prep" | "chef_skill_economy" | "chef_skill_market">
        >>`
            SELECT
                id,
                email,
                role,
                money,
                hunger,
                hunger_updated_at,
                satiety_buff,
                buff_expires_at,
                provider_level,
                provider_exp,
                chef_level,
                chef_exp,
                city_key
            FROM users
            WHERE id = ${userId}
            LIMIT 1
        `;

        const row = legacyRows[0];
        if (!row) return null;

        return {
            ...row,
            provider_skill_veg: 0,
            provider_skill_chicken: 0,
            provider_skill_beef: 0,
            chef_skill_prep: 0,
            chef_skill_economy: 0,
            chef_skill_market: 0,
        };
    }
}

async function applyImmediateFerrumMinerTimeReduction(
    userId: number,
    oldLevel: number,
    newLevel: number,
): Promise<number> {
    const oldReduction = getChefSkillCookTimeReduction(oldLevel);
    const newReduction = getChefSkillCookTimeReduction(newLevel);

    if (newReduction <= oldReduction) return 0;

    const oldMultiplier = 1 - oldReduction;
    const newMultiplier = 1 - newReduction;
    if (oldMultiplier <= 0 || newMultiplier <= 0) return 0;

    const remainingScale = newMultiplier / oldMultiplier;

    return prisma.$transaction(async (tx) => {
        const permit = await tx.item.findFirst({ where: { name: "Ferrum Mining Permit" }, select: { id: true } });
        if (!permit) return 0;

        const orders = await tx.workOrder.findMany({
            where: {
                user_id: userId,
                type: "FARM",
                item_id: permit.id,
                collected: false,
            },
            select: { id: true, completes_at: true },
        });

        const nowMs = Date.now();
        let adjusted = 0;

        for (const order of orders) {
            const remainingMs = Math.max(0, new Date(order.completes_at).getTime() - nowMs);
            if (remainingMs <= 0) continue;

            const nextRemainingMs = Math.max(1000, Math.floor(remainingMs * remainingScale));
            if (nextRemainingMs >= remainingMs) continue;

            await tx.workOrder.update({
                where: { id: order.id },
                data: { completes_at: new Date(nowMs + nextRemainingMs) },
            });
            adjusted += 1;
        }

        return adjusted;
    });
}

function buildProviderSkillTree(user: {
    provider_level: number;
    provider_skill_veg: number;
    provider_skill_chicken: number;
    provider_skill_beef: number;
}, cityKey?: string | null) {
    const spent =
        user.provider_skill_veg +
        user.provider_skill_chicken +
        user.provider_skill_beef;
    const total = Math.max(0, user.provider_level);
    const available = Math.max(0, total - spent);

    const cfg = cityKey === "FERRUM" ? FERRUM_MINER_SKILL_TREE_CONFIG : PROVIDER_SKILL_TREE_CONFIG;

    return {
        points: {
            total,
            spent,
            available,
        },
        branches: {
            VEGETABLE: {
                level: user.provider_skill_veg,
                title: cfg.VEGETABLE.title,
                color: cfg.VEGETABLE.color,
                effects: cfg.VEGETABLE.effects,
            },
            CHICKEN: {
                level: user.provider_skill_chicken,
                title: cfg.CHICKEN.title,
                color: cfg.CHICKEN.color,
                effects: cfg.CHICKEN.effects,
            },
            BEEF: {
                level: user.provider_skill_beef,
                title: cfg.BEEF.title,
                color: cfg.BEEF.color,
                effects: cfg.BEEF.effects,
            },
        },
    };
}

function buildChefSkillTree(user: {
    chef_level: number;
    chef_skill_prep: number;
    chef_skill_economy: number;
    chef_skill_market: number;
}, cityKey?: string | null) {
    const profile = resolveSecondarySkillProfile(cityKey);
    const spent =
        user.chef_skill_prep +
        user.chef_skill_economy +
        user.chef_skill_market;
    const total = Math.max(0, user.chef_level);
    const available = Math.max(0, total - spent);

    const readLevel = (field: SecondaryStorageField): number => {
        if (field === "chef_skill_prep") return Number(user.chef_skill_prep ?? 0);
        if (field === "chef_skill_economy") return Number(user.chef_skill_economy ?? 0);
        return Number(user.chef_skill_market ?? 0);
    };

    const branches = Object.fromEntries(
        profile.branches.map((branch) => [
            branch.key,
            {
                level: readLevel(branch.storageField),
                title: branch.title,
                color: branch.color,
                effects: branch.effects,
            },
        ])
    );

    return {
        treeTitle: profile.treeTitle,
        occupationLabel: profile.occupationLabel,
        points: {
            total,
            spent,
            available,
        },
        branches,
    };
}

/**
 * GET /game/skills/provider
 */
export const getProviderSkills = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const user = await getProviderSkillUserRow(req.userId!);
        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }

        res.json({ skillTree: buildProviderSkillTree(user, user.city_key) });
    } catch (error) {
        console.error("getProviderSkills error:", error);
        res.status(500).json({ error: "Failed to fetch provider skill tree" });
    }
};

/**
 * POST /game/skills/provider/upgrade
 * Body: { branch: "VEGETABLE" | "CHICKEN" | "BEEF" }
 */
export const upgradeProviderSkill = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const branch = String(req.body?.branch ?? "") as ProviderBranch;
        if (!["VEGETABLE", "CHICKEN", "BEEF"].includes(branch)) {
            res.status(400).json({ error: "Invalid branch" });
            return;
        }

        const user = await getProviderSkillUserRow(req.userId!);
        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }

        if (user.provider_level < 1) {
            res.status(403).json({ error: "Provider occupation is required" });
            return;
        }

        const spent = user.provider_skill_veg + user.provider_skill_chicken + user.provider_skill_beef;
        const available = Math.max(0, user.provider_level - spent);
        if (available < 1) {
            res.status(400).json({ error: "Not enough skill points" });
            return;
        }

        const fieldMap: Record<ProviderBranch, "provider_skill_veg" | "provider_skill_chicken" | "provider_skill_beef"> = {
            VEGETABLE: "provider_skill_veg",
            CHICKEN: "provider_skill_chicken",
            BEEF: "provider_skill_beef",
        };

        const targetField = fieldMap[branch];
        const currentLevel = Number(user[targetField] ?? 0);

        if (currentLevel >= PROVIDER_SKILL_MAX_LEVEL) {
            res.status(400).json({ error: "This branch is already max level" });
            return;
        }

        await prisma.$executeRawUnsafe(
            `UPDATE users SET ${targetField} = ${targetField} + 1 WHERE id = ?`,
            req.userId!
        );

        const nextLevel = currentLevel + 1;
        const adjustedOrders = user.city_key === "FERRUM"
            ? (branch === "VEGETABLE"
                ? await applyImmediateFerrumMinerTimeReduction(req.userId!, currentLevel, nextLevel)
                : 0)
            : await applyImmediateProviderTimeReduction(
                req.userId!,
                branch,
                currentLevel,
                nextLevel,
            );

        const updated = await getProviderSkillUserRow(req.userId!);
        if (!updated) {
            res.status(404).json({ error: "User not found after update" });
            return;
        }

        res.json({
            message: adjustedOrders > 0
                ? `Upgraded ${branch} branch to level ${nextLevel}. Skill buff applied to ${adjustedOrders} active task(s).`
                : `Upgraded ${branch} branch to level ${nextLevel}`,
            skillTree: buildProviderSkillTree(updated, updated.city_key),
            user: {
                id: updated.id,
                email: updated.email,
                role: updated.role,
                money: updated.money,
                hunger: updated.hunger,
                hunger_updated_at: updated.hunger_updated_at,
                satiety_buff: updated.satiety_buff,
                buff_expires_at: updated.buff_expires_at,
                provider_level: updated.provider_level,
                provider_exp: updated.provider_exp,
                provider_skill_veg: updated.provider_skill_veg,
                provider_skill_chicken: updated.provider_skill_chicken,
                provider_skill_beef: updated.provider_skill_beef,
                chef_level: updated.chef_level,
                chef_exp: updated.chef_exp,
                chef_skill_prep: updated.chef_skill_prep,
                chef_skill_economy: updated.chef_skill_economy,
                chef_skill_market: updated.chef_skill_market,
            },
        });
    } catch (error: any) {
        const msg = String(error?.message ?? "").toLowerCase();
        if (msg.includes("unknown column")) {
            res.status(400).json({
                error: "Provider skill columns are missing in database. Please run Prisma migration first.",
            });
            return;
        }
        console.error("upgradeProviderSkill error:", error);
        res.status(500).json({ error: "Failed to upgrade provider skill" });
    }
};

/**
 * GET /game/skills/chef
 */
export const getChefSkills = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const user = await getProviderSkillUserRow(req.userId!);
        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }

        const profile = resolveSecondarySkillProfile(user.city_key);
        res.json({
            skillTree: buildChefSkillTree(user, user.city_key),
            profile: {
                treeTitle: profile.treeTitle,
                occupationLabel: profile.occupationLabel,
            },
        });
    } catch (error) {
        console.error("getChefSkills error:", error);
        res.status(500).json({ error: "Failed to fetch chef skill tree" });
    }
};

/**
 * POST /game/skills/chef/upgrade
 * Body: { branch: "PREP_MASTER" | "KITCHEN_ECONOMY" | "MARKET_INTEL" }
 */
export const upgradeChefSkill = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const branch = String(req.body?.branch ?? "").trim().toUpperCase();

        const user = await getProviderSkillUserRow(req.userId!);
        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }

        const profile = resolveSecondarySkillProfile(user.city_key);
        const branchProfile = profile.branches.find((b) => b.key === branch);
        if (!branchProfile) {
            res.status(400).json({ error: "Invalid branch" });
            return;
        }

        if (user.chef_level < 1) {
            res.status(403).json({ error: `${profile.occupationLabel} occupation is required` });
            return;
        }

        const spent = user.chef_skill_prep + user.chef_skill_economy + user.chef_skill_market;
        const available = Math.max(0, user.chef_level - spent);
        if (available < 1) {
            res.status(400).json({ error: "Not enough skill points" });
            return;
        }

        const targetField = branchProfile.storageField;
        const currentLevel = Number(user[targetField] ?? 0);
        if (currentLevel >= CHEF_SKILL_MAX_LEVEL) {
            res.status(400).json({ error: "This branch is already max level" });
            return;
        }

        await prisma.$executeRawUnsafe(
            `UPDATE users SET ${targetField} = ${targetField} + 1 WHERE id = ?`,
            req.userId!
        );

        let adjustedOrders = 0;
        let rebalancedOrders = 0;

        if (branchProfile.effectKind === "TIME_AND_QUEUE") {
            const nextLevel = currentLevel + 1;
            adjustedOrders = await applyImmediateChefPrepReduction(req.userId!, currentLevel, nextLevel, user.city_key);
            rebalancedOrders = await rebalanceChefQueueSlots(req.userId!, nextLevel);
        }

        const updated = await getProviderSkillUserRow(req.userId!);
        if (!updated) {
            res.status(404).json({ error: "User not found after update" });
            return;
        }

        const nextLevel = currentLevel + 1;
        const message = branchProfile.effectKind === "TIME_AND_QUEUE"
            ? `Upgraded ${branch} to level ${nextLevel}. Applied ${profile.timeEffectLabel} buff to ${adjustedOrders} order(s), rebalanced ${rebalancedOrders} ${profile.queueLabel} order(s).`
            : `Upgraded ${branch} to level ${nextLevel}.`;

        res.json({
            message,
            skillTree: buildChefSkillTree(updated, updated.city_key),
            user: {
                id: updated.id,
                email: updated.email,
                role: updated.role,
                money: updated.money,
                hunger: updated.hunger,
                hunger_updated_at: updated.hunger_updated_at,
                satiety_buff: updated.satiety_buff,
                buff_expires_at: updated.buff_expires_at,
                provider_level: updated.provider_level,
                provider_exp: updated.provider_exp,
                provider_skill_veg: updated.provider_skill_veg,
                provider_skill_chicken: updated.provider_skill_chicken,
                provider_skill_beef: updated.provider_skill_beef,
                chef_level: updated.chef_level,
                chef_exp: updated.chef_exp,
                chef_skill_prep: updated.chef_skill_prep,
                chef_skill_economy: updated.chef_skill_economy,
                chef_skill_market: updated.chef_skill_market,
            },
        });
    } catch (error: any) {
        const msg = String(error?.message ?? "").toLowerCase();
        if (msg.includes("unknown column")) {
            res.status(400).json({
                error: "Chef skill columns are missing in database and could not be created.",
            });
            return;
        }
        console.error("upgradeChefSkill error:", error);
        res.status(500).json({ error: "Failed to upgrade chef skill" });
    }
};
