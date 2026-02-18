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
type ChefBranch = "PREP_MASTER" | "KITCHEN_ECONOMY" | "MARKET_INTEL";

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
): Promise<number> {
    const oldReduction = getChefSkillCookTimeReduction(oldLevel);
    const newReduction = getChefSkillCookTimeReduction(newLevel);

    if (newReduction <= oldReduction) return 0;

    const oldMultiplier = 1 - oldReduction;
    const newMultiplier = 1 - newReduction;
    if (oldMultiplier <= 0 || newMultiplier <= 0) return 0;

    const remainingScale = newMultiplier / oldMultiplier;

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

async function rebalanceChefQueueSlots(userId: number, prepLevel: number): Promise<number> {
    const maxParallel = Math.max(1, getChefSkillConcurrentCookSlots(prepLevel));
    const now = Date.now();

    return prisma.$transaction(async (tx) => {
        const orders = await tx.workOrder.findMany({
            where: {
                user_id: userId,
                type: "COOK",
                collected: false,
            },
            orderBy: [{ started_at: "asc" }, { id: "asc" }],
        });

        if (orders.length === 0) return 0;

        const laneAvailableAt = Array.from({ length: maxParallel }, () => now);
        let updated = 0;

        for (const order of orders) {
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
                chef_skill_market
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
                chef_exp
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

function buildProviderSkillTree(user: {
    provider_level: number;
    provider_skill_veg: number;
    provider_skill_chicken: number;
    provider_skill_beef: number;
}) {
    const spent =
        user.provider_skill_veg +
        user.provider_skill_chicken +
        user.provider_skill_beef;
    const total = Math.max(0, user.provider_level);
    const available = Math.max(0, total - spent);

    return {
        points: {
            total,
            spent,
            available,
        },
        branches: {
            VEGETABLE: {
                level: user.provider_skill_veg,
                title: PROVIDER_SKILL_TREE_CONFIG.VEGETABLE.title,
                color: PROVIDER_SKILL_TREE_CONFIG.VEGETABLE.color,
                effects: PROVIDER_SKILL_TREE_CONFIG.VEGETABLE.effects,
            },
            CHICKEN: {
                level: user.provider_skill_chicken,
                title: PROVIDER_SKILL_TREE_CONFIG.CHICKEN.title,
                color: PROVIDER_SKILL_TREE_CONFIG.CHICKEN.color,
                effects: PROVIDER_SKILL_TREE_CONFIG.CHICKEN.effects,
            },
            BEEF: {
                level: user.provider_skill_beef,
                title: PROVIDER_SKILL_TREE_CONFIG.BEEF.title,
                color: PROVIDER_SKILL_TREE_CONFIG.BEEF.color,
                effects: PROVIDER_SKILL_TREE_CONFIG.BEEF.effects,
            },
        },
    };
}

function buildChefSkillTree(user: {
    chef_level: number;
    chef_skill_prep: number;
    chef_skill_economy: number;
    chef_skill_market: number;
}) {
    const spent =
        user.chef_skill_prep +
        user.chef_skill_economy +
        user.chef_skill_market;
    const total = Math.max(0, user.chef_level);
    const available = Math.max(0, total - spent);

    return {
        points: {
            total,
            spent,
            available,
        },
        branches: {
            PREP_MASTER: {
                level: user.chef_skill_prep,
                title: CHEF_SKILL_TREE_CONFIG.PREP_MASTER.title,
                color: CHEF_SKILL_TREE_CONFIG.PREP_MASTER.color,
                effects: CHEF_SKILL_TREE_CONFIG.PREP_MASTER.effects,
            },
            KITCHEN_ECONOMY: {
                level: user.chef_skill_economy,
                title: CHEF_SKILL_TREE_CONFIG.KITCHEN_ECONOMY.title,
                color: CHEF_SKILL_TREE_CONFIG.KITCHEN_ECONOMY.color,
                effects: CHEF_SKILL_TREE_CONFIG.KITCHEN_ECONOMY.effects,
            },
            MARKET_INTEL: {
                level: user.chef_skill_market,
                title: CHEF_SKILL_TREE_CONFIG.MARKET_INTEL.title,
                color: CHEF_SKILL_TREE_CONFIG.MARKET_INTEL.color,
                effects: CHEF_SKILL_TREE_CONFIG.MARKET_INTEL.effects,
            },
        },
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

        res.json({ skillTree: buildProviderSkillTree(user) });
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
        const adjustedOrders = await applyImmediateProviderTimeReduction(
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
            skillTree: buildProviderSkillTree(updated),
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

        res.json({ skillTree: buildChefSkillTree(user) });
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
        const branch = String(req.body?.branch ?? "") as ChefBranch;
        if (!["PREP_MASTER", "KITCHEN_ECONOMY", "MARKET_INTEL"].includes(branch)) {
            res.status(400).json({ error: "Invalid branch" });
            return;
        }

        const user = await getProviderSkillUserRow(req.userId!);
        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }

        if (user.chef_level < 1) {
            res.status(403).json({ error: "Chef occupation is required" });
            return;
        }

        const spent = user.chef_skill_prep + user.chef_skill_economy + user.chef_skill_market;
        const available = Math.max(0, user.chef_level - spent);
        if (available < 1) {
            res.status(400).json({ error: "Not enough skill points" });
            return;
        }

        const fieldMap: Record<ChefBranch, "chef_skill_prep" | "chef_skill_economy" | "chef_skill_market"> = {
            PREP_MASTER: "chef_skill_prep",
            KITCHEN_ECONOMY: "chef_skill_economy",
            MARKET_INTEL: "chef_skill_market",
        };

        const targetField = fieldMap[branch];
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

        if (branch === "PREP_MASTER") {
            const nextLevel = currentLevel + 1;
            adjustedOrders = await applyImmediateChefPrepReduction(req.userId!, currentLevel, nextLevel);
            rebalancedOrders = await rebalanceChefQueueSlots(req.userId!, nextLevel);
        }

        const updated = await getProviderSkillUserRow(req.userId!);
        if (!updated) {
            res.status(404).json({ error: "User not found after update" });
            return;
        }

        const nextLevel = currentLevel + 1;
        const message = branch === "PREP_MASTER"
            ? `Upgraded ${branch} to level ${nextLevel}. Applied cook-time buff to ${adjustedOrders} order(s), rebalanced ${rebalancedOrders} queue order(s).`
            : `Upgraded ${branch} to level ${nextLevel}.`;

        res.json({
            message,
            skillTree: buildChefSkillTree(updated),
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
