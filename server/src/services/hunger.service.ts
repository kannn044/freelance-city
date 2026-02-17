import { prisma } from "../lib/prisma";
import {
    MAX_HUNGER,
    HUNGER_DECAY_PER_MIN,
    HUNGER_TASK_DECAY_PER_SEC,
    getHungerTier,
} from "../config/game.config";
import { getUserEquipmentEffects } from "./equipmentEffects.service";
import type { Prisma } from "@prisma/client";

type DbClient = Prisma.TransactionClient | typeof prisma;

async function shiftPendingOrdersForPause(
    userId: number,
    pauseStartMs: number,
    pauseMs: number,
    db: DbClient = prisma,
) {
    if (pauseMs <= 0) return;

    const ordersToShift = await db.workOrder.findMany({
        where: {
            user_id: userId,
            collected: false,
            completes_at: { gt: new Date(pauseStartMs) },
        },
        select: {
            id: true,
            started_at: true,
            completes_at: true,
        },
    });

    if (ordersToShift.length === 0) return;

    for (const order of ordersToShift) {
        await db.workOrder.update({
            where: { id: order.id },
            data: {
                started_at: new Date(order.started_at.getTime() + pauseMs),
                completes_at: new Date(order.completes_at.getTime() + pauseMs),
            },
        });
    }
}

/**
 * Calculate real-time hunger based on elapsed time since last update.
 * Accounts for satiety buff if active.
 */
export function calculateCurrentHunger(
    hunger: number,
    hungerUpdatedAt: Date,
    satietyBuff: number,
    buffExpiresAt: Date | null
): { hunger: number; state: ReturnType<typeof getHungerTier> } {
    const now = new Date();
    const elapsedMs = now.getTime() - hungerUpdatedAt.getTime();
    const elapsedMinutes = elapsedMs / (1000 * 60);

    if (elapsedMinutes <= 0) {
        return { hunger, state: getHungerTier(hunger) };
    }

    // Apply satiety buff if still active
    let decayRate = HUNGER_DECAY_PER_MIN;
    if (satietyBuff > 0 && buffExpiresAt && now < buffExpiresAt) {
        decayRate *= (1 - satietyBuff); // e.g. 0.05 buff = 5% slower decay
    }

    const decayed = hunger - decayRate * elapsedMinutes;
    const currentHunger = Math.max(0, Math.round(decayed * 100) / 100);

    return { hunger: currentHunger, state: getHungerTier(currentHunger) };
}

/**
 * Sync hunger to DB — called before any action that depends on hunger.
 */
export async function syncHunger(userId: number) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("User not found");
    const effects = await getUserEquipmentEffects(userId);

    const now = new Date();
    const fromMs = user.hunger_updated_at.getTime();
    const toMs = now.getTime();
    const buffExpired = user.buff_expires_at && now >= user.buff_expires_at;

    if (toMs <= fromMs) {
        return user;
    }

    // Hard pause: if kcal is already empty, all pending tasks are frozen until kcal is restored.
    if (user.hunger <= 0) {
        const updatedUser = await prisma.$transaction(async (tx) => {
            // Atomic claim: only one sync call with this exact timestamp can apply pause shift.
            const claimed = await tx.user.updateMany({
                where: {
                    id: userId,
                    hunger_updated_at: user.hunger_updated_at,
                },
                data: {
                    hunger: 0,
                    hunger_updated_at: now,
                    ...(buffExpired ? { satiety_buff: 0, buff_expires_at: null } : {}),
                },
            });

            if (claimed.count > 0) {
                const pauseMs = toMs - fromMs;
                await shiftPendingOrdersForPause(userId, fromMs, pauseMs, tx);
            }

            return tx.user.findUnique({ where: { id: userId } });
        });

        if (!updatedUser) throw new Error("User not found");
        return updatedUser;
    }

    const orders = await prisma.workOrder.findMany({
        where: {
            user_id: userId,
            collected: false,
            started_at: { lt: now },
            completes_at: { gt: user.hunger_updated_at },
        },
        select: {
            type: true,
            item_id: true,
            started_at: true,
            completes_at: true,
        },
    });

    let providerDecayKcal = 0;
    const farmOrders = orders.filter((o) => o.type === "FARM");

    const farmBySeed = new Map<number, Array<{ startMs: number; endMs: number }>>();
    for (const o of farmOrders) {
        const startMs = Math.max(fromMs, o.started_at.getTime());
        const endMs = Math.min(toMs, o.completes_at.getTime());
        if (endMs <= startMs) continue;
        const arr = farmBySeed.get(o.item_id) ?? [];
        arr.push({ startMs, endMs });
        farmBySeed.set(o.item_id, arr);
    }

    for (const [, intervals] of farmBySeed) {
        const events: Array<{ t: number; d: number }> = [];
        for (const itv of intervals) {
            events.push({ t: itv.startMs, d: +1 });
            events.push({ t: itv.endMs, d: -1 });
        }
        events.sort((a, b) => a.t - b.t || a.d - b.d);

        let active = 0;
        let prev = fromMs;
        let i = 0;

        while (i < events.length) {
            const t = events[i].t;
            if (t > prev && active > 0) {
                const secs = (t - prev) / 1000;
                const activePlots = Math.ceil(active / 9);
                providerDecayKcal += activePlots * HUNGER_TASK_DECAY_PER_SEC.FARM_PER_PLOT * secs;
            }

            while (i < events.length && events[i].t === t) {
                active += events[i].d;
                i += 1;
            }
            prev = t;
        }

        if (toMs > prev && active > 0) {
            const secs = (toMs - prev) / 1000;
            const activePlots = Math.ceil(active / 9);
            providerDecayKcal += activePlots * HUNGER_TASK_DECAY_PER_SEC.FARM_PER_PLOT * secs;
        }
    }

    let chefDecayKcal = 0;
    const cookOrders = orders.filter((o) => o.type === "COOK");
    for (const o of cookOrders) {
        const startMs = Math.max(fromMs, o.started_at.getTime());
        const endMs = Math.min(toMs, o.completes_at.getTime());
        if (endMs <= startMs) continue;
        const secs = (endMs - startMs) / 1000;
        chefDecayKcal += HUNGER_TASK_DECAY_PER_SEC.COOK_PER_MENU * secs;
    }

    // Chef-only equipment reduction should affect only cooking workload part.
    const reducedChefDecay = chefDecayKcal * (1 - Math.max(0, Math.min(0.9, effects.cookStateHungerDecayReductionPct)));
    let totalTaskDecay = providerDecayKcal + reducedChefDecay;

    // Apply satiety buff if still active
    let satietyRateMultiplier = 1;
    if (user.satiety_buff > 0 && user.buff_expires_at && now < user.buff_expires_at) {
        satietyRateMultiplier = 1 - user.satiety_buff;
    }

    totalTaskDecay *= satietyRateMultiplier;

    // Flat decay reduction from equipment (legacy unit: per minute) adapted to elapsed wall time.
    const elapsedMinutes = Math.max(0, (toMs - fromMs) / 60000);
    if (effects.hungerDecayReductionPerMin > 0 && elapsedMinutes > 0) {
        totalTaskDecay = Math.max(0, totalTaskDecay - effects.hungerDecayReductionPerMin * elapsedMinutes);
    }

    const rawNextHunger = user.hunger - totalTaskDecay;
    const newHunger = Math.max(0, Math.round(rawNextHunger * 100) / 100);

    // If hunger reaches zero within this sync window, freeze all remaining timeline after depletion point.
    if (rawNextHunger <= 0 && totalTaskDecay > 0) {
        const elapsedMs = toMs - fromMs;
        const activeRatio = Math.max(0, Math.min(1, user.hunger / totalTaskDecay));
        const pauseStartMs = fromMs + Math.floor(elapsedMs * activeRatio);
        const pauseMs = Math.max(0, toMs - pauseStartMs);
        await shiftPendingOrdersForPause(userId, pauseStartMs, pauseMs);
    }

    const updated = await prisma.user.update({
        where: { id: userId },
        data: {
            hunger: newHunger,
            hunger_updated_at: now,
            ...(buffExpired ? { satiety_buff: 0, buff_expires_at: null } : {}),
        },
    });

    return updated;
}

/**
 * Apply a meal's Kcal and buff to the user.
 */
export async function applyMealEffect(
    userId: number,
    kcal: number,
    buffPct: number | null,
    buffMins: number | null
) {
    // First sync current hunger
    const user = await syncHunger(userId);
    const effects = await getUserEquipmentEffects(userId);

    const maxHunger = MAX_HUNGER + Math.max(0, effects.maxHungerBonus);
    const effectiveBuffPct = Math.max(0, Math.min(0.9, (buffPct ?? 0) + effects.extraSatietyBuffPct));

    const newHunger = Math.min(maxHunger, user.hunger + kcal);
    const now = new Date();

    const data: any = {
        hunger: newHunger,
        hunger_updated_at: now,
    };

    // Apply buff if meal has one
    if (effectiveBuffPct > 0 && buffMins && buffMins > 0) {
        data.satiety_buff = effectiveBuffPct;
        data.buff_expires_at = new Date(now.getTime() + buffMins * 60 * 1000);
    }

    return prisma.user.update({
        where: { id: userId },
        data,
    });
}
