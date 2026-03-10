import { prisma } from "../lib/prisma";

export async function createNotification(
    userId: number,
    type: string,
    title: string,
    body: string,
    metadata?: Record<string, any>,
) {
    return prisma.notification.create({
        data: {
            user_id: userId,
            type,
            title,
            body,
            metadata: metadata ? JSON.stringify(metadata) : null,
        },
    });
}

export async function createNotificationTx(
    tx: any,
    userId: number,
    type: string,
    title: string,
    body: string,
    metadata?: Record<string, any>,
) {
    return tx.notification.create({
        data: {
            user_id: userId,
            type,
            title,
            body,
            metadata: metadata ? JSON.stringify(metadata) : null,
        },
    });
}
