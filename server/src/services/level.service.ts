import { prisma } from "../lib/prisma";
import {
    MAX_HUNGER,
    getLevelFromExp,
} from "../config/game.config";
import { getGameExpConfig } from "./gamePricing.service";
import { getUserEquipmentEffects } from "./equipmentEffects.service";

type LegacyProgressUser = {
    first_job_level: number;
    secondary_job_level: number;
    first_job_exp: number;
    secondary_job_exp: number;
};

/**
 * Determine which occupation should receive EXP based on item type.
 * SEED / RAW → first_job_exp
 * INGREDIENT / MEAL → secondary_job_exp
 */
function getOccupationForItem(itemType: string): "first_job" | "secondary_job" {
    if (itemType === "SEED" || itemType === "RAW") return "first_job";
    return "secondary_job"; // INGREDIENT, MEAL
}

/**
 * Award EXP to a user after a market sale.
 * Formula: (currentHunger / MAX_HUNGER) × item.exp_value × salePrice
 */
export async function awardSaleExp(
    userId: number,
    itemId: number,
    salePrice: number
): Promise<{ expGained: number; levelUp: boolean }> {
    const expConfig = await getGameExpConfig();
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("User not found");

    const item = await prisma.item.findUnique({ where: { id: itemId } });
    if (!item) throw new Error("Item not found");

    // Calculate EXP
    const hungerRatio = Math.max(0, user.hunger / MAX_HUNGER);
    const occupation = getOccupationForItem(item.type);
    const expMultiplier = occupation === "first_job"
        ? expConfig.firstJobMarketExpMultiplier
        : expConfig.secondaryJobMarketExpMultiplier;

    // enchant_exp_gain_pct: boost EXP gained from market sales
    const enchantEffects = await getUserEquipmentEffects(userId);
    const enchantExpMultiplier = 1 + Math.max(0, enchantEffects.enchantExpGainPct ?? 0);

    const expGained = Math.floor(hungerRatio * item.exp_value * salePrice * expMultiplier * enchantExpMultiplier);

    if (expGained <= 0) {
        return { expGained: 0, levelUp: false };
    }

    const levelField = occupation === "first_job" ? "first_job_level" : "secondary_job_level";
    const expField = occupation === "first_job" ? "first_job_exp" : "secondary_job_exp";
    const progressUser = user as unknown as LegacyProgressUser;

    // Only award EXP if the occupation is unlocked (level >= 1)
    if (progressUser[levelField] < 1) {
        return { expGained: 0, levelUp: false };
    }

    const oldLevel = progressUser[levelField];
    const newExp = progressUser[expField] + expGained;
    const newLevel = getLevelFromExp(newExp);
    const levelUp = newLevel > oldLevel;

    await prisma.user.update({
        where: { id: userId },
        data: {
            [expField]: newExp,
            [levelField]: newLevel,
        },
    });

    return { expGained, levelUp };
}
