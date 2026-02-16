import { prisma } from "../lib/prisma";
import { MAX_HUNGER, HUNGER_DECAY_PER_MIN, getHungerTier } from "../config/game.config";
import { getUserEquipmentEffects } from "./equipmentEffects.service";

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
    const hasActiveCook = (await prisma.workOrder.count({
        where: { user_id: userId, type: "COOK", collected: false },
    })) > 0;

    let effectiveDecayPerMin = HUNGER_DECAY_PER_MIN - effects.hungerDecayReductionPerMin;
    if (hasActiveCook) {
        effectiveDecayPerMin *= (1 - effects.cookStateHungerDecayReductionPct);
    }
    effectiveDecayPerMin = Math.max(0.1, effectiveDecayPerMin);

    const now = new Date();
    const elapsedMinutes = Math.max(0, (now.getTime() - user.hunger_updated_at.getTime()) / 60000);

    // Apply satiety buff if still active
    let satietyRateMultiplier = 1;
    if (user.satiety_buff > 0 && user.buff_expires_at && now < user.buff_expires_at) {
        satietyRateMultiplier = 1 - user.satiety_buff;
    }

    const newHunger = Math.max(0, Math.round((user.hunger - effectiveDecayPerMin * satietyRateMultiplier * elapsedMinutes) * 100) / 100);

    // Clear expired buff
    const buffExpired = user.buff_expires_at && now >= user.buff_expires_at;

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
