import { Request, Response } from "express";
import { getOrCreateDailyQuestsForUser, submitDailyQuest } from "../services/quest.service";

interface AuthRequest extends Request {
    userId?: number;
}

/**
 * GET /quests
 * Returns today's 6 daily quests for the authenticated user's city.
 */
export async function getDailyQuests(req: AuthRequest, res: Response) {
    const userId = req.userId!;
    try {
        const user = await (await import("../lib/prisma")).prisma.user.findUnique({
            where: { id: userId },
            select: { city_key: true },
        });

        if (!user?.city_key) {
            return res.status(400).json({ error: "NO_CITY", message: "You must be in a city to view quests." });
        }

        const quests = await getOrCreateDailyQuestsForUser(userId, user.city_key);
        type QuestItem = typeof quests[number];
        type ReqItem = QuestItem["template"]["requirements"][number];

        const payload = quests.map((q: QuestItem) => ({
            id: q.id,
            templateId: q.template_id,
            title: q.template.title,
            description: q.template.description,
            cityKey: q.template.city_key,
            rewardCredits: q.template.reward_credits,
            rewardExp: q.template.reward_exp,
            completed: q.completed,
            completedAt: q.completed_at,
            requirements: q.template.requirements.map((r: ReqItem) => ({
                itemId: r.item_id,
                itemName: r.item.name,
                itemIcon: r.item.icon,
                quantity: r.quantity,
            })),
        }));

        return res.json({ quests: payload });
    } catch (err) {
        console.error("[getDailyQuests]", err);
        return res.status(500).json({ error: "SERVER_ERROR" });
    }
}

/**
 * POST /quests/submit/:questId
 * Submits (completes) a daily quest, consuming required items and granting rewards.
 */
export async function submitQuest(req: AuthRequest, res: Response) {
    const userId = req.userId!;
    const questId = parseInt(String(req.params.questId), 10);

    if (isNaN(questId)) {
        return res.status(400).json({ error: "INVALID_QUEST_ID" });
    }

    try {
        const result = await submitDailyQuest(userId, questId);
        return res.json({
            success: true,
            rewardCredits: result.rewardCredits,
            rewardExp: result.rewardExp,
        });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "SERVER_ERROR";

        if (msg === "QUEST_NOT_FOUND") return res.status(404).json({ error: msg });
        if (msg === "QUEST_ALREADY_COMPLETED") return res.status(409).json({ error: msg });
        if (msg === "QUEST_EXPIRED") return res.status(410).json({ error: msg });
        if (msg.startsWith("INSUFFICIENT_ITEM:")) {
            const itemName = msg.split(":")[1];
            return res.status(400).json({ error: "INSUFFICIENT_ITEM", itemName });
        }

        console.error("[submitQuest]", err);
        return res.status(500).json({ error: "SERVER_ERROR" });
    }
}
