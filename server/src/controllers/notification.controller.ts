import { Request, Response } from "express";
import { prisma } from "../lib/prisma";

interface AuthRequest extends Request {
    userId?: number;
}

/** GET /game/notifications */
export const getNotifications = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.userId!;
        const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
        const offset = parseInt(req.query.offset as string) || 0;

        const notifications = await prisma.notification.findMany({
            where: { user_id: userId },
            orderBy: { created_at: "desc" },
            take: limit,
            skip: offset,
        });

        res.json({ notifications });
    } catch (err: any) {
        console.error("getNotifications error:", err);
        res.status(500).json({ error: "Failed to fetch notifications" });
    }
};

/** GET /game/notifications/unread-count */
export const getUnreadCount = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.userId!;
        const count = await prisma.notification.count({
            where: { user_id: userId, is_read: false },
        });
        res.json({ count });
    } catch (err: any) {
        console.error("getUnreadCount error:", err);
        res.status(500).json({ error: "Failed to fetch unread count" });
    }
};

/** POST /game/notifications/read */
export const markAsRead = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.userId!;
        const { ids } = req.body as { ids: number[] };

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            res.status(400).json({ error: "ids array is required" });
            return;
        }

        await prisma.notification.updateMany({
            where: { id: { in: ids }, user_id: userId },
            data: { is_read: true },
        });

        res.json({ success: true });
    } catch (err: any) {
        console.error("markAsRead error:", err);
        res.status(500).json({ error: "Failed to mark notifications as read" });
    }
};

/** POST /game/notifications/read-all */
export const markAllAsRead = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.userId!;

        await prisma.notification.updateMany({
            where: { user_id: userId, is_read: false },
            data: { is_read: true },
        });

        res.json({ success: true });
    } catch (err: any) {
        console.error("markAllAsRead error:", err);
        res.status(500).json({ error: "Failed to mark all as read" });
    }
};
