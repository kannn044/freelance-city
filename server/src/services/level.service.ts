import { prisma } from "../lib/prisma";
import {
    MAX_HUNGER,
    getLevelFromExp,
} from "../config/game.config";

/**
 * Determine which occupation should receive EXP based on item type.
 * SEED / RAW → provider_exp
 * INGREDIENT / MEAL → chef_exp
 */
function getOccupationForItem(itemType: string): "provider" | "chef" {
    if (itemType === "SEED" || itemType === "RAW") return "provider";
    return "chef"; // INGREDIENT, MEAL
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
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("User not found");

    const item = await prisma.item.findUnique({ where: { id: itemId } });
    if (!item) throw new Error("Item not found");

    // Calculate EXP
    const hungerRatio = Math.max(0, user.hunger / MAX_HUNGER);
    const expGained = Math.floor(hungerRatio * item.exp_value * salePrice);

    if (expGained <= 0) {
        return { expGained: 0, levelUp: false };
    }

    const occupation = getOccupationForItem(item.type);
    const levelField = occupation === "provider" ? "provider_level" : "chef_level";
    const expField = occupation === "provider" ? "provider_exp" : "chef_exp";

    // Only award EXP if the occupation is unlocked (level >= 1)
    if (user[levelField] < 1) {
        return { expGained: 0, levelUp: false };
    }

    const oldLevel = user[levelField];
    const newExp = user[expField] + expGained;
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
