import type { WorkOrder } from '../stores/gameStore';

export function formatTimeLeft(completesAt: string, t: any, nowMs: number = Date.now()): string {
    const diff = new Date(completesAt).getTime() - nowMs;
    if (diff <= 0) return t('active_orders.ready', { defaultValue: 'Ready' });
    const mins = Math.floor(diff / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
}

export function isQueuedSecondaryJobOrder(order: WorkOrder, nowMs: number = Date.now()): boolean {
    if (order.type !== 'COOK' && order.type !== 'SMELT' && order.type !== 'REFINE' && order.type !== 'SEW' && order.type !== 'BREW') return false;
    return nowMs < new Date(order.started_at).getTime();
}

export function getRemainingMs(completesAt: string, nowMs: number = Date.now()): number {
    return Math.max(0, new Date(completesAt).getTime() - nowMs);
}

export function getOrderNowMs(order: WorkOrder, fallbackNowMs: number): number {
    if (order.paused_at) {
        return new Date(order.paused_at).getTime();
    }
    return fallbackNowMs;
}

export function getProgress(order: WorkOrder, nowMs: number = Date.now()): number {
    const start = new Date(order.started_at).getTime();
    const end = new Date(order.completes_at).getTime();
    const now = nowMs;
    if (now >= end) return 100;
    if (now <= start) return 0;
    return Math.max(0, Math.min(100, ((now - start) / (end - start)) * 100));
}
