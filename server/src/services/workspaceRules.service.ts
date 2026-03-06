import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

type DbClient = Prisma.TransactionClient | typeof prisma;
const MINING_PERMIT_NAME = "Ferrum Mining Permit";

type JobSlot = "first_job" | "secondary_job";
type WorkType = "FARM" | "COOK" | "MINE" | "SMELT" | "EXTRACT" | "REFINE" | "GATHER" | "SEW" | "FORAGE" | "BREW";

type WorkspaceRuleRow = {
    id: number;
    city_key: string;
    job_slot: JobSlot;
    work_type: WorkType;
    workspace_mode: string | null;
    matcher_type: string;
    matcher_value: string | null;
    required_item_name: string;
    must_be_equipped: number | boolean;
    error_code: string;
    error_message: string;
};

export type WorkspaceRequirementContext = {
    userId: number;
    cityKey: string | null | undefined;
    jobSlot: JobSlot;
    workType: WorkType;
    workspaceMode?: string | null;
    itemId?: number | null;
    itemName?: string | null;
    itemType?: string | null;
    recipeId?: number | null;
    recipeName?: string | null;
};

export type WorkspaceRequirementValidationResult =
    | { ok: true }
    | {
        ok: false;
        statusCode: number;
        errorCode: string;
        errorMessage: string;
        requiredItemName: string;
        mustBeEquipped: boolean;
        matchedRuleId: number;
    };

function normalize(v: string | null | undefined): string {
    return String(v ?? "").trim();
}

function normalizeUpper(v: string | null | undefined): string {
    return normalize(v).toUpperCase();
}

function sqlLikePatternToRegex(pattern: string): RegExp {
    const escaped = pattern
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        .replace(/%/g, ".*")
        .replace(/_/g, ".");
    return new RegExp(`^${escaped}$`, "i");
}

function matcherMatches(rule: WorkspaceRuleRow, ctx: WorkspaceRequirementContext): boolean {
    const matcherType = normalizeUpper(rule.matcher_type);
    const matcherValue = normalize(rule.matcher_value);

    if (!matcherType || matcherType === "ALWAYS") {
        return true;
    }

    if (matcherType === "WORKSPACE_MODE") {
        return normalizeUpper(ctx.workspaceMode) === normalizeUpper(matcherValue);
    }

    if (matcherType === "ITEM_ID") {
        if (ctx.itemId == null) return false;
        return String(ctx.itemId) === matcherValue;
    }

    if (matcherType === "ITEM_NAME") {
        return normalizeUpper(ctx.itemName) === normalizeUpper(matcherValue);
    }

    if (matcherType === "ITEM_NAME_LIKE") {
        return sqlLikePatternToRegex(matcherValue).test(normalize(ctx.itemName));
    }

    if (matcherType === "ITEM_TYPE") {
        return normalizeUpper(ctx.itemType) === normalizeUpper(matcherValue);
    }

    if (matcherType === "RECIPE_ID") {
        if (ctx.recipeId == null) return false;
        return String(ctx.recipeId) === matcherValue;
    }

    if (matcherType === "RECIPE_NAME") {
        return normalizeUpper(ctx.recipeName) === normalizeUpper(matcherValue);
    }

    if (matcherType === "RECIPE_NAME_LIKE") {
        return sqlLikePatternToRegex(matcherValue).test(normalize(ctx.recipeName));
    }

    return false;
}

async function hasEquippedItem(userId: number, itemName: string, db: DbClient): Promise<boolean> {
    const rows = await db.$queryRaw<Array<{ cnt: number | bigint }>>`
        SELECT COUNT(*) as cnt
        FROM user_equipments ue
        INNER JOIN items i ON i.id = ue.item_id
        WHERE ue.user_id = ${userId}
          AND LOWER(i.name) = LOWER(${itemName})
    `;
    return Number(rows[0]?.cnt ?? 0) > 0;
}

async function hasUsableEquippedItem(userId: number, itemName: string, db: DbClient): Promise<boolean> {
    const rows = await db.$queryRaw<Array<{ cnt: number | bigint }>>`
        SELECT COUNT(*) as cnt
        FROM user_equipments ue
        INNER JOIN items i ON i.id = ue.item_id
        WHERE ue.user_id = ${userId}
          AND LOWER(i.name) = LOWER(${itemName})
          AND COALESCE(ue.durability, 0) > 0
    `;
    return Number(rows[0]?.cnt ?? 0) > 0;
}

async function hasItemInInventory(userId: number, itemName: string, db: DbClient): Promise<boolean> {
    const rows = await db.$queryRaw<Array<{ cnt: number | bigint }>>`
        SELECT COUNT(*) as cnt
        FROM inventory_slots s
        INNER JOIN items i ON i.id = s.item_id
        WHERE s.user_id = ${userId}
          AND s.quantity > 0
          AND LOWER(i.name) = LOWER(${itemName})
    `;
    return Number(rows[0]?.cnt ?? 0) > 0;
}

export async function validateWorkspaceRequirements(
    ctx: WorkspaceRequirementContext,
    db: DbClient = prisma,
): Promise<WorkspaceRequirementValidationResult> {
    const cityKey = normalizeUpper(ctx.cityKey);
    if (!cityKey) return { ok: true };

    const rules = await db.$queryRaw<WorkspaceRuleRow[]>`
        SELECT
            id,
            city_key,
            job_slot,
            work_type,
            workspace_mode,
            matcher_type,
            matcher_value,
            required_item_name,
            must_be_equipped,
            error_code,
            error_message
        FROM city_workspace_rules
        WHERE city_key = ${cityKey}
          AND job_slot = ${ctx.jobSlot}
          AND work_type = ${ctx.workType}
          AND is_enabled = 1
        ORDER BY id ASC
    `;

    if (rules.length <= 0) {
        return { ok: true };
    }

    for (const rule of rules) {
        const scopeMode = normalizeUpper(rule.workspace_mode);
        if (scopeMode && scopeMode !== normalizeUpper(ctx.workspaceMode)) {
            continue;
        }

        if (!matcherMatches(rule, ctx)) {
            continue;
        }

        const requiredItemName = normalize(rule.required_item_name);
        const mustBeEquipped = Boolean(Number(rule.must_be_equipped));

        const equipped = await hasEquippedItem(ctx.userId, requiredItemName, db);
        if (mustBeEquipped) {
            const usableEquipped = equipped
                ? await hasUsableEquippedItem(ctx.userId, requiredItemName, db)
                : false;

            if (!usableEquipped) {
                return {
                    ok: false,
                    statusCode: 400,
                    errorCode: normalizeUpper(rule.error_code) || "WORKSPACE_REQUIREMENT_FAILED",
                    errorMessage: normalize(rule.error_message) || "Workspace requirement failed",
                    requiredItemName,
                    mustBeEquipped,
                    matchedRuleId: Number(rule.id),
                };
            }
            continue;
        }

        if (equipped) {
            continue;
        }

        const inInventory = await hasItemInInventory(ctx.userId, requiredItemName, db);
        if (!inInventory) {
            return {
                ok: false,
                statusCode: 400,
                errorCode: normalizeUpper(rule.error_code) || "WORKSPACE_REQUIREMENT_FAILED",
                errorMessage: normalize(rule.error_message) || "Workspace requirement failed",
                requiredItemName,
                mustBeEquipped,
                matchedRuleId: Number(rule.id),
            };
        }
    }

    return { ok: true };
}

type ActiveOrderRow = {
    id: number;
    type: WorkType;
    item_id: number;
    recipe_id: number | null;
    started_at: Date;
    completes_at: Date;
    paused_at: Date | null;
    item_name: string;
    item_type: string;
};

function resolveOrderRequirementContext(
    cityKey: string,
    row: ActiveOrderRow,
): { jobSlot: JobSlot; workType: WorkType; workspaceMode: string | null } {
    const upperType = normalizeUpper(row.type) as WorkType;

    if (upperType === "COOK" || upperType === "SMELT" || upperType === "REFINE" || upperType === "SEW" || upperType === "BREW") {
        return { jobSlot: "secondary_job", workType: upperType, workspaceMode: upperType };
    }

    if (upperType === "MINE" || upperType === "EXTRACT" || upperType === "GATHER" || upperType === "FORAGE") {
        return { jobSlot: "first_job", workType: upperType, workspaceMode: upperType };
    }

    if (normalizeUpper(cityKey) === "FERRUM" && normalizeUpper(row.item_name) === normalizeUpper(MINING_PERMIT_NAME)) {
        return { jobSlot: "first_job", workType: "MINE", workspaceMode: "MINE" };
    }

    return { jobSlot: "first_job", workType: "FARM", workspaceMode: "FARM" };
}

export async function reconcileWorkspaceOrderPausesForUser(
    userId: number,
    cityKeyRaw: string | null | undefined,
    db: DbClient = prisma,
): Promise<void> {
    const cityKey = normalizeUpper(cityKeyRaw);
    if (!cityKey) return;

    const orders = await db.$queryRaw<ActiveOrderRow[]>`
        SELECT
            w.id,
            w.type,
            w.item_id,
            w.recipe_id,
            w.started_at,
            w.completes_at,
            w.paused_at,
            i.name as item_name,
            i.type as item_type
        FROM work_orders w
        INNER JOIN items i ON i.id = w.item_id
        WHERE w.user_id = ${userId}
          AND w.collected = 0
        ORDER BY w.id ASC
    `;

    if (orders.length <= 0) return;

    const now = Date.now();

    for (const order of orders) {
        const ctx = resolveOrderRequirementContext(cityKey, order);
        const validation = await validateWorkspaceRequirements(
            {
                userId,
                cityKey,
                jobSlot: ctx.jobSlot,
                workType: ctx.workType,
                workspaceMode: ctx.workspaceMode,
                itemId: order.item_id,
                itemName: order.item_name,
                itemType: order.item_type,
                recipeId: order.recipe_id,
            },
            db,
        );

        const shouldPause = !validation.ok && validation.mustBeEquipped;
        const isPaused = Boolean(order.paused_at);

        if (!shouldPause && !isPaused) {
            continue;
        }

        const pausedAtMs = order.paused_at ? new Date(order.paused_at).getTime() : now;
        const deltaMs = Math.max(0, now - pausedAtMs);

        if (shouldPause) {
            if (!isPaused) {
                await db.$executeRaw`
                    UPDATE work_orders
                    SET paused_at = ${new Date(now)}
                    WHERE id = ${order.id}
                `;
                continue;
            }

            const nextStarted = new Date(new Date(order.started_at).getTime() + deltaMs);
            const nextCompletes = new Date(new Date(order.completes_at).getTime() + deltaMs);

            await db.$executeRaw`
                UPDATE work_orders
                SET started_at = ${nextStarted},
                    completes_at = ${nextCompletes},
                    paused_at = ${new Date(now)}
                WHERE id = ${order.id}
            `;
            continue;
        }

        const nextStarted = new Date(new Date(order.started_at).getTime() + deltaMs);
        const nextCompletes = new Date(new Date(order.completes_at).getTime() + deltaMs);

        await db.$executeRaw`
            UPDATE work_orders
            SET started_at = ${nextStarted},
                completes_at = ${nextCompletes},
                paused_at = NULL
            WHERE id = ${order.id}
        `;
    }
}
