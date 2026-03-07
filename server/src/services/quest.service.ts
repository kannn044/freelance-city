import { prisma } from "../lib/prisma";

/**
 * Returns the UTC midnight Date for the current day (today's quest date key).
 */
export function getTodayUTC(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Returns or creates today's 6 PlayerDailyQuest rows for the given user in their city.
 * Quests are linked to DailyQuestTemplate records for the user's city_key.
 */
export async function getOrCreateDailyQuestsForUser(userId: number, cityKey: string) {
    const today = getTodayUTC();
    const upperCity = cityKey.toUpperCase();

    // Fetch templates for this city (only active)
    const templates = await prisma.dailyQuestTemplate.findMany({
        where: { city_key: upperCity, is_active: true },
        include: {
            requirements: {
                include: { item: true },
            },
        },
        orderBy: { id: "asc" },
    });

    if (templates.length === 0) {
        return [];
    }

    // Ensure PlayerDailyQuest rows exist for today
    for (const template of templates) {
        await prisma.playerDailyQuest.upsert({
            where: {
                user_id_template_id_quest_date: {
                    user_id: userId,
                    template_id: template.id,
                    quest_date: today,
                },
            },
            create: {
                user_id: userId,
                template_id: template.id,
                quest_date: today,
                completed: false,
            },
            update: {},
        });
    }

    // Fetch the final quest rows with template + requirements
    const playerQuests = await prisma.playerDailyQuest.findMany({
        where: {
            user_id: userId,
            quest_date: today,
            template: { city_key: upperCity },
        },
        include: {
            template: {
                include: {
                    requirements: {
                        include: { item: true },
                    },
                },
            },
        },
        orderBy: { template_id: "asc" },
    });

    return playerQuests;
}

/**
 * Attempts to submit (complete) a daily quest.
 * Deducts the required items from the player's inventory and grants credits + exp.
 */
export async function submitDailyQuest(userId: number, playerQuestId: number) {
    return prisma.$transaction(async (tx) => {
        // Load the quest and lock it for update
        const quest = await tx.playerDailyQuest.findUnique({
            where: { id: playerQuestId },
            include: {
                template: {
                    include: {
                        requirements: {
                            include: { item: true },
                        },
                    },
                },
            },
        });

        if (!quest) throw new Error("QUEST_NOT_FOUND");
        if (quest.user_id !== userId) throw new Error("QUEST_NOT_FOUND");
        if (quest.completed) throw new Error("QUEST_ALREADY_COMPLETED");

        // Validate the quest belongs to today
        const today = getTodayUTC();
        if (quest.quest_date.getTime() !== today.getTime()) {
            throw new Error("QUEST_EXPIRED");
        }

        const requirements = quest.template.requirements;

        // Check inventory for all required items
        for (const req of requirements) {
            const slots = await tx.inventorySlot.findMany({
                where: { user_id: userId, item_id: req.item_id },
            });
            const totalQty = slots.reduce((sum, s) => sum + s.quantity, 0);
            if (totalQty < req.quantity) {
                throw new Error(`INSUFFICIENT_ITEM:${req.item.name}`);
            }
        }

        // Deduct items from inventory
        for (const req of requirements) {
            let remaining = req.quantity;

            const slots = await tx.inventorySlot.findMany({
                where: { user_id: userId, item_id: req.item_id, quantity: { gt: 0 } },
                orderBy: { slot: "asc" },
            });

            for (const slot of slots) {
                if (remaining <= 0) break;
                const deduct = Math.min(slot.quantity, remaining);
                remaining -= deduct;
                await tx.inventorySlot.update({
                    where: { id: slot.id },
                    data: { quantity: slot.quantity - deduct },
                });
            }
        }

        // Grant credits
        await tx.user.update({
            where: { id: userId },
            data: { money: { increment: quest.template.reward_credits } },
        });

        // Grant exp to both job slots (split evenly)
        const expGrant = quest.template.reward_exp;
        const halfExp = Math.floor(expGrant / 2);

        await tx.user.update({
            where: { id: userId },
            data: {
                first_job_exp: { increment: halfExp },
                secondary_job_exp: { increment: expGrant - halfExp },
            },
        });

        // Mark quest completed
        const completed = await tx.playerDailyQuest.update({
            where: { id: playerQuestId },
            data: { completed: true, completed_at: new Date() },
        });

        return {
            quest: completed,
            rewardCredits: quest.template.reward_credits,
            rewardExp: expGrant,
        };
    });
}
