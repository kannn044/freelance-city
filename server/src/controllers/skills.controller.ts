import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import {
    getSecondaryJobSkillConcurrentCookSlots as getSecondaryJobConcurrentQueueSlots,
    getSecondaryJobSkillCookTimeReduction as getSecondaryJobTimeReduction,
    getFirstJobSkillTimeReduction as getFirstJobTimeReduction,
} from "../config/game.config";
import { toJobPayload } from "../lib/userPayload";
import { ensureCitySchema } from "../services/city.service";

interface AuthRequest extends Request {
    userId?: number;
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

async function applyImmediateSecondaryJobTimeReduction(
    userId: number,
    oldLevel: number,
    newLevel: number,
    cityKey?: string | null,
): Promise<number> {
    const oldReduction = getSecondaryJobTimeReduction(oldLevel);
    const newReduction = getSecondaryJobTimeReduction(newLevel);

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

async function rebalanceSecondaryJobQueueSlots(userId: number, prepLevel: number): Promise<number> {
    const maxParallel = Math.max(1, getSecondaryJobConcurrentQueueSlots(prepLevel));
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

interface JobSkillUserRow {
    id: number;
    email: string;
    role: string;
    money: number;
    hunger: number;
    hunger_updated_at: Date;
    satiety_buff: number;
    buff_expires_at: Date | null;
    first_job_level: number;
    first_job_exp: number;
    secondary_job_level: number;
    secondary_job_exp: number;
    city_key: string | null;
}

async function getJobSkillUserRow(userId: number): Promise<JobSkillUserRow | null> {
    const rows = await prisma.$queryRaw<JobSkillUserRow[]>`
        SELECT
            id,
            email,
            role,
            money,
            hunger,
            hunger_updated_at,
            satiety_buff,
            buff_expires_at,
            first_job_level,
            first_job_exp,
            secondary_job_level,
            secondary_job_exp,
            city_key
        FROM users
        WHERE id = ${userId}
        LIMIT 1
    `;

    return rows[0] ?? null;
}

type JobSlotKey = "first_job" | "secondary_job";

type DynamicBranchRow = {
    branch_slot: number;
    branch_key: string;
    branch_name: string;
    effect_type: "TIME_QUEUE" | "CRAFT_COST" | "OUTPUT_BONUS" | string;
    max_level: number;
    effect_config_json: unknown;
    level: number;
};

type DynamicSlotState = {
    user: JobSkillUserRow;
    cityKey: string;
    jobSlot: JobSlotKey;
    occupationKey: string;
    occupationLabel: string;
    total: number;
    exp: number;
    branches: DynamicBranchRow[];
};

const BRANCH_COLORS: Record<string, string> = {
    TIME_QUEUE: "#38bdf8",
    CRAFT_COST: "#22c55e",
    OUTPUT_BONUS: "#a78bfa",
};

const parseJsonObject = (input: unknown): Record<string, any> => {
    if (input && typeof input === "object") return input as Record<string, any>;
    if (typeof input === "string") {
        try {
            const parsed = JSON.parse(input);
            return parsed && typeof parsed === "object" ? parsed : {};
        } catch {
            return {};
        }
    }
    return {};
};

function buildBranchEffects(branch: DynamicBranchRow) {
    const cfg = parseJsonObject(branch.effect_config_json);

    if (branch.effect_type === "TIME_QUEUE") {
        const reduction = Array.isArray(cfg.timeReductionPctByLevel) ? cfg.timeReductionPctByLevel : [5, 10, 15, 20, 25];
        const queue = Array.isArray(cfg.queueLimitByLevel) ? cfg.queueLimitByLevel : [1, 1, 2, 2, 3];
        return {
            level1: `Lv.1: Work time -${reduction[0] ?? 5}% / Queue ${queue[0] ?? 1}`,
            level2: `Lv.2: Work time -${reduction[1] ?? 10}% / Queue ${queue[1] ?? 1}`,
            level3: `Lv.3: Work time -${reduction[2] ?? 15}% / Queue ${queue[2] ?? 2}`,
            level4: `Lv.4: Work time -${reduction[3] ?? 20}% / Queue ${queue[3] ?? 2}`,
            level5: `Lv.5: Work time -${reduction[4] ?? 25}% / Queue ${queue[4] ?? 3}`,
        };
    }

    if (branch.effect_type === "CRAFT_COST") {
        const save = Array.isArray(cfg.saveAllIngredientsChancePctByLevel)
            ? cfg.saveAllIngredientsChancePctByLevel
            : [6, 12, 18, 24, 30];
        return {
            level1: `Lv.1: ${save[0] ?? 6}% chance to save all ingredients`,
            level2: `Lv.2: ${save[1] ?? 12}% chance to save all ingredients`,
            level3: `Lv.3: ${save[2] ?? 18}% chance to save all ingredients`,
            level4: `Lv.4: ${save[3] ?? 24}% chance to save all ingredients`,
            level5: `Lv.5: ${save[4] ?? 30}% chance to save all ingredients`,
        };
    }

    const chance = Array.isArray(cfg.bonusOutputChancePctByLevel)
        ? cfg.bonusOutputChancePctByLevel
        : [4, 8, 12, 16, 20];
    const qty = Number(cfg.bonusOutputQty ?? 1);
    return {
        level1: `Lv.1: ${chance[0] ?? 4}% chance for +${qty} output`,
        level2: `Lv.2: ${chance[1] ?? 8}% chance for +${qty} output`,
        level3: `Lv.3: ${chance[2] ?? 12}% chance for +${qty} output`,
        level4: `Lv.4: ${chance[3] ?? 16}% chance for +${qty} output`,
        level5: `Lv.5: ${chance[4] ?? 20}% chance for +${qty} output`,
    };
}

async function ensureDynamicSkillRows(user: JobSkillUserRow): Promise<void> {
    await ensureCitySchema(prisma);
    const cityKey = String(user.city_key ?? "").toUpperCase();
    if (!cityKey) return;

    const occupationRows = await prisma.$queryRaw<Array<{ occupation_key: string; job_slot: JobSlotKey }>>`
        SELECT occupation_key, job_slot
        FROM occupation_catalog
        WHERE city_key = ${cityKey}
    `;

    const occupationBySlot = new Map<JobSlotKey, string>();
    for (const row of occupationRows) {
        occupationBySlot.set(row.job_slot, row.occupation_key);
    }

    for (const slot of ["first_job", "secondary_job"] as JobSlotKey[]) {
        const occupationKey = occupationBySlot.get(slot);
        if (!occupationKey) continue;
        const level = slot === "first_job"
            ? Math.max(1, Number(user.first_job_level ?? 1))
            : Math.max(1, Number(user.secondary_job_level ?? 1));
        const exp = slot === "first_job"
            ? Math.max(0, Number(user.first_job_exp ?? 0))
            : Math.max(0, Number(user.secondary_job_exp ?? 0));

        await prisma.$executeRaw`
            INSERT INTO user_job_progress (user_id, job_slot, occupation_key, level, exp)
            VALUES (${user.id}, ${slot}, ${occupationKey}, ${level}, ${exp})
            ON DUPLICATE KEY UPDATE
                occupation_key = VALUES(occupation_key)
        `;

        await prisma.$executeRaw`
            INSERT INTO user_skill_progress (user_id, job_slot, occupation_key, branch_key, level)
            SELECT ${user.id}, ${slot}, ${occupationKey}, branch_key, 0
            FROM occupation_skill_branch_catalog
            WHERE occupation_key = ${occupationKey}
            ON DUPLICATE KEY UPDATE
                occupation_key = VALUES(occupation_key)
        `;
    }
}

async function getDynamicSlotState(userId: number, jobSlot: JobSlotKey): Promise<DynamicSlotState | null> {
    const user = await getJobSkillUserRow(userId);
    if (!user) return null;

    await ensureDynamicSkillRows(user);

    const cityKey = String(user.city_key ?? "").toUpperCase();
    if (!cityKey) return null;

    const progressRows = await prisma.$queryRaw<Array<{
        occupation_key: string;
        level: number;
        exp: number;
        display_name: string;
    }>>`
        SELECT ujp.occupation_key, ujp.level, ujp.exp, oc.display_name
        FROM user_job_progress ujp
        JOIN occupation_catalog oc ON oc.occupation_key = ujp.occupation_key
        WHERE ujp.user_id = ${userId} AND ujp.job_slot = ${jobSlot}
        LIMIT 1
    `;

    const progress = progressRows[0];
    if (!progress) return null;

    const branchRows = await prisma.$queryRaw<Array<DynamicBranchRow>>`
        SELECT b.branch_slot,
               b.branch_key,
               b.branch_name,
               b.effect_type,
               b.max_level,
               b.effect_config_json,
               COALESCE(usp.level, 0) AS level
        FROM occupation_skill_branch_catalog b
        LEFT JOIN user_skill_progress usp
          ON usp.user_id = ${userId}
         AND usp.job_slot = ${jobSlot}
         AND usp.branch_key = b.branch_key
        WHERE b.occupation_key = ${progress.occupation_key}
        ORDER BY b.branch_slot ASC
    `;

    return {
        user,
        cityKey,
        jobSlot,
        occupationKey: progress.occupation_key,
        occupationLabel: progress.display_name,
        total: Number(progress.level ?? 0),
        exp: Number(progress.exp ?? 0),
        branches: branchRows.map((row) => ({
            ...row,
            level: Number(row.level ?? 0),
            max_level: Number(row.max_level ?? 5),
        })),
    };
}

function buildDynamicSkillTree(state: DynamicSlotState) {
    const spent = state.branches.reduce((sum, branch) => sum + Math.max(0, Number(branch.level ?? 0)), 0);
    const total = Math.max(0, Number(state.total ?? 0));
    const available = Math.max(0, total - spent);

    const branches = Object.fromEntries(
        state.branches.map((branch) => [
            branch.branch_key,
            {
                level: Number(branch.level ?? 0),
                title: branch.branch_name,
                color: BRANCH_COLORS[branch.effect_type] ?? "#60a5fa",
                effects: buildBranchEffects(branch),
            },
        ])
    );

    return {
        treeTitle: `${state.occupationLabel} Skill Tree`,
        occupationLabel: state.occupationLabel,
        points: {
            total,
            spent,
            available,
        },
        branches,
    };
}

function readBranchTriplet(branches: DynamicBranchRow[]): [number, number, number] {
    const values: [number, number, number] = [0, 0, 0];
    for (const branch of branches) {
        const idx = Number(branch.branch_slot ?? 0) - 1;
        if (idx >= 0 && idx < 3) values[idx] = Number(branch.level ?? 0);
    }
    return values;
}

async function applyFirstJobTimeReduction(userId: number, oldLevel: number, newLevel: number): Promise<number> {
    const oldReduction = getFirstJobTimeReduction(oldLevel);
    const newReduction = getFirstJobTimeReduction(newLevel);
    if (newReduction <= oldReduction) return 0;

    const oldMultiplier = 1 - oldReduction;
    const newMultiplier = 1 - newReduction;
    if (oldMultiplier <= 0 || newMultiplier <= 0) return 0;

    const remainingScale = newMultiplier / oldMultiplier;

    return prisma.$transaction(async (tx) => {
        const orders = await tx.workOrder.findMany({
            where: {
                user_id: userId,
                type: "FARM",
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

/**
 * GET /game/skills/first-job
 */
export const getFirstJobSkills = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const state = await getDynamicSlotState(req.userId!, "first_job");
        if (!state) {
            res.status(404).json({ error: "User not found" });
            return;
        }

        res.json({ skillTree: buildDynamicSkillTree(state) });
    } catch (error) {
        console.error("getFirstJobSkills error:", error);
        res.status(500).json({ error: "Failed to fetch first job skill tree" });
    }
};

/**
 * POST /game/skills/first-job/upgrade
 * Body: { branch: string }
 */
export const upgradeFirstJobSkill = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const branchKey = String(req.body?.branch ?? "").trim();
        if (!branchKey) {
            res.status(400).json({ error: "Invalid branch" });
            return;
        }

        const state = await getDynamicSlotState(req.userId!, "first_job");
        if (!state) {
            res.status(404).json({ error: "User not found" });
            return;
        }

        if (state.total < 1) {
            res.status(403).json({ error: "First job occupation is required" });
            return;
        }

        const targetBranch = state.branches.find((branch) => branch.branch_key === branchKey);
        if (!targetBranch) {
            res.status(400).json({ error: "Branch not found in selected occupation" });
            return;
        }

        const spent = state.branches.reduce((sum, branch) => sum + Number(branch.level ?? 0), 0);
        const available = Math.max(0, state.total - spent);
        if (available < 1) {
            res.status(400).json({ error: "Not enough skill points" });
            return;
        }

        const currentLevel = Number(targetBranch.level ?? 0);
        if (currentLevel >= Number(targetBranch.max_level ?? 5)) {
            res.status(400).json({ error: "This branch is already max level" });
            return;
        }

        await prisma.$executeRaw`
            UPDATE user_skill_progress
            SET level = LEAST(level + 1, ${Number(targetBranch.max_level ?? 5)})
            WHERE user_id = ${req.userId!}
              AND job_slot = 'first_job'
              AND branch_key = ${targetBranch.branch_key}
        `;

        const nextLevel = currentLevel + 1;
        const adjustedOrders = targetBranch.effect_type === "TIME_QUEUE"
            ? await applyFirstJobTimeReduction(req.userId!, currentLevel, nextLevel)
            : 0;

        const updatedFirst = await getDynamicSlotState(req.userId!, "first_job");
        const updatedSecond = await getDynamicSlotState(req.userId!, "secondary_job");
        if (!updatedFirst || !updatedSecond) {
            res.status(404).json({ error: "User not found after update" });
            return;
        }

        const updatedUser = await getJobSkillUserRow(req.userId!);
        if (!updatedUser) {
            res.status(404).json({ error: "User not found after update" });
            return;
        }

        const [firstVeg, firstChicken, firstBeef] = readBranchTriplet(updatedFirst.branches);
        const [secondVeg, secondChicken, secondBeef] = readBranchTriplet(updatedSecond.branches);

        res.json({
            message: adjustedOrders > 0
                ? `Upgraded ${targetBranch.branch_name} to level ${nextLevel}. Applied buff to ${adjustedOrders} active task(s).`
                : `Upgraded ${targetBranch.branch_name} to level ${nextLevel}`,
            skillTree: buildDynamicSkillTree(updatedFirst),
            user: toJobPayload({
                id: updatedUser.id,
                email: updatedUser.email,
                role: updatedUser.role,
                money: updatedUser.money,
                hunger: updatedUser.hunger,
                hunger_updated_at: updatedUser.hunger_updated_at,
                satiety_buff: updatedUser.satiety_buff,
                buff_expires_at: updatedUser.buff_expires_at,
                first_job_level: updatedUser.first_job_level,
                first_job_exp: updatedUser.first_job_exp,
                first_job_skill_veg: firstVeg,
                first_job_skill_chicken: firstChicken,
                first_job_skill_beef: firstBeef,
                secondary_job_level: updatedUser.secondary_job_level,
                secondary_job_exp: updatedUser.secondary_job_exp,
                secondary_job_skill_veg: secondVeg,
                secondary_job_skill_chicken: secondChicken,
                secondary_job_skill_beef: secondBeef,
            }),
        });
    } catch (error: any) {
        console.error("upgradeFirstJobSkill error:", error);
        res.status(500).json({ error: "Failed to upgrade first job skill" });
    }
};

/**
 * GET /game/skills/secondary-job
 */
export const getSecondaryJobSkills = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const state = await getDynamicSlotState(req.userId!, "secondary_job");
        if (!state) {
            res.status(404).json({ error: "User not found" });
            return;
        }

        res.json({
            skillTree: buildDynamicSkillTree(state),
            profile: {
                treeTitle: `${state.occupationLabel} Skill Tree`,
                occupationLabel: state.occupationLabel,
            },
        });
    } catch (error) {
        console.error("getSecondaryJobSkills error:", error);
        res.status(500).json({ error: "Failed to fetch secondary job skill tree" });
    }
};

/**
 * POST /game/skills/secondary-job/upgrade
 * Body: { branch: string }
 */
export const upgradeSecondaryJobSkill = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const branchKey = String(req.body?.branch ?? "").trim();
        if (!branchKey) {
            res.status(400).json({ error: "Invalid branch" });
            return;
        }

        const state = await getDynamicSlotState(req.userId!, "secondary_job");
        if (!state) {
            res.status(404).json({ error: "User not found" });
            return;
        }

        const targetBranch = state.branches.find((branch) => branch.branch_key === branchKey);
        if (!targetBranch) {
            res.status(400).json({ error: "Branch not found in selected occupation" });
            return;
        }

        if (state.total < 1) {
            res.status(403).json({ error: `${state.occupationLabel} occupation is required` });
            return;
        }

        const spent = state.branches.reduce((sum, branch) => sum + Number(branch.level ?? 0), 0);
        const available = Math.max(0, state.total - spent);
        if (available < 1) {
            res.status(400).json({ error: "Not enough skill points" });
            return;
        }

        const currentLevel = Number(targetBranch.level ?? 0);
        if (currentLevel >= Number(targetBranch.max_level ?? 5)) {
            res.status(400).json({ error: "This branch is already max level" });
            return;
        }

        await prisma.$executeRaw`
            UPDATE user_skill_progress
            SET level = LEAST(level + 1, ${Number(targetBranch.max_level ?? 5)})
            WHERE user_id = ${req.userId!}
              AND job_slot = 'secondary_job'
              AND branch_key = ${targetBranch.branch_key}
        `;

        let adjustedOrders = 0;
        let rebalancedOrders = 0;

        if (targetBranch.effect_type === "TIME_QUEUE") {
            const nextLevel = currentLevel + 1;
            adjustedOrders = await applyImmediateSecondaryJobTimeReduction(req.userId!, currentLevel, nextLevel, state.cityKey);
            rebalancedOrders = await rebalanceSecondaryJobQueueSlots(req.userId!, nextLevel);
        }

        const updatedFirst = await getDynamicSlotState(req.userId!, "first_job");
        const updatedSecond = await getDynamicSlotState(req.userId!, "secondary_job");
        if (!updatedFirst || !updatedSecond) {
            res.status(404).json({ error: "User not found after update" });
            return;
        }

        const updatedUser = await getJobSkillUserRow(req.userId!);
        if (!updatedUser) {
            res.status(404).json({ error: "User not found after update" });
            return;
        }

        const [firstVeg, firstChicken, firstBeef] = readBranchTriplet(updatedFirst.branches);
        const [secondVeg, secondChicken, secondBeef] = readBranchTriplet(updatedSecond.branches);

        const nextLevel = currentLevel + 1;
        const message = targetBranch.effect_type === "TIME_QUEUE"
            ? `Upgraded ${targetBranch.branch_name} to level ${nextLevel}. Applied buff to ${adjustedOrders} order(s), rebalanced ${rebalancedOrders} queue order(s).`
            : `Upgraded ${targetBranch.branch_name} to level ${nextLevel}.`;

        res.json({
            message,
            skillTree: buildDynamicSkillTree(updatedSecond),
            user: toJobPayload({
                id: updatedUser.id,
                email: updatedUser.email,
                role: updatedUser.role,
                money: updatedUser.money,
                hunger: updatedUser.hunger,
                hunger_updated_at: updatedUser.hunger_updated_at,
                satiety_buff: updatedUser.satiety_buff,
                buff_expires_at: updatedUser.buff_expires_at,
                first_job_level: updatedUser.first_job_level,
                first_job_exp: updatedUser.first_job_exp,
                first_job_skill_veg: firstVeg,
                first_job_skill_chicken: firstChicken,
                first_job_skill_beef: firstBeef,
                secondary_job_level: updatedUser.secondary_job_level,
                secondary_job_exp: updatedUser.secondary_job_exp,
                secondary_job_skill_veg: secondVeg,
                secondary_job_skill_chicken: secondChicken,
                secondary_job_skill_beef: secondBeef,
            }),
        });
    } catch (error: any) {
        console.error("upgradeSecondaryJobSkill error:", error);
        res.status(500).json({ error: "Failed to upgrade secondary job skill" });
    }
};
