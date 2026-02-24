import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, CheckCircle, Sprout, UtensilsCrossed, X, Pickaxe, Hammer, Flame, ShieldAlert } from 'lucide-react';
import { useGameStore } from '../stores/gameStore';
import type { WorkOrder } from '../stores/gameStore';
import { renderItemIcon } from '../lib/itemVisual';
import { useAuthStore } from '../stores/authStore';
import { useTranslation } from 'react-i18next';

const ORDERS_COLUMN_HEIGHT = '20rem';
const FIRST_JOB_PLOT_SIZE = 132;
const FIRST_JOB_CELL_RADIUS = '0.5rem';
const FARMER_PLOT_CONFIGS = [
    {
        itemName: 'Vegetable Seed',
        label: 'Vegetable Plot',
        accent: '#34d399',
        border: 'rgba(52,211,153,0.45)',
        bg: 'rgba(52,211,153,0.10)',
        icon: '🥬',
    },
    {
        itemName: 'Chicken Egg',
        label: 'Chicken Plot',
        accent: '#facc15',
        border: 'rgba(250,204,21,0.45)',
        bg: 'rgba(250,204,21,0.10)',
        icon: '🐔',
    },
    {
        itemName: 'Beef Calf',
        label: 'Cow Plot',
        accent: '#f87171',
        border: 'rgba(248,113,113,0.45)',
        bg: 'rgba(248,113,113,0.10)',
        icon: '🐄',
    },
] as const;

function formatTimeLeft(completesAt: string, t: any, nowMs: number = Date.now()): string {
    const diff = new Date(completesAt).getTime() - nowMs;
    if (diff <= 0) return t('active_orders.ready');
    const mins = Math.floor(diff / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
}

function isQueuedSecondaryJobOrder(order: WorkOrder, nowMs: number = Date.now()): boolean {
    if (order.type !== 'COOK' && order.type !== 'SMELT') return false;
    return nowMs < new Date(order.started_at).getTime();
}

function getRemainingMs(completesAt: string, nowMs: number = Date.now()): number {
    return Math.max(0, new Date(completesAt).getTime() - nowMs);
}

function getOrderNowMs(order: WorkOrder, fallbackNowMs: number): number {
    if (order.paused_at) {
        return new Date(order.paused_at).getTime();
    }
    return fallbackNowMs;
}

function getProgress(order: WorkOrder, nowMs: number = Date.now()): number {
    const start = new Date(order.started_at).getTime();
    const end = new Date(order.completes_at).getTime();
    const now = nowMs;
    if (now >= end) return 100;
    if (now <= start) return 0;
    return Math.max(0, Math.min(100, ((now - start) / (end - start)) * 100));
}

const ActiveOrdersGrid = () => {
    const { t } = useTranslation();
    const { workOrders, collectWork, collectReadyWork, cancelWork, hunger, equipment } = useGameStore();
    const user = useAuthStore((s) => s.user);
    const [, setTick] = useState(0);
    const pausedNowRef = useRef<number | null>(null);
    const [cancelConfirm, setCancelConfirm] = useState<{ orderId: number; message: string } | null>(null);

    const showFirstJobColumn = (user?.first_job_level ?? 0) > 0;
    const showSecondaryJobColumn = (user?.secondary_job_level ?? 0) > 0;
    const firstJobWorkspaceMode = user?.city?.workspace_modes?.first_job ?? 'FARM';
    const secondaryJobWorkspaceMode = user?.city?.workspace_modes?.secondary_job ?? 'COOK';
    const firstJobLabel = user?.city?.occupation_labels?.first_job ?? 'First Job';
    const secondaryJobLabel = user?.city?.occupation_labels?.secondary_job ?? 'Secondary Job';
    const isMiningMode = firstJobWorkspaceMode === 'MINE';
    const firstJobSpecialTaskItemName = user?.city?.first_job_special_task_item_name ?? 'Ferrum Mining Permit';
    const hasSafetyHelmet = equipment.some((eq) => eq.slot === 'HEAD' && String(eq.item_name ?? '').toLowerCase() === 'safety helmet');

    useEffect(() => {
        const interval = setInterval(() => setTick((t) => t + 1), 1000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (hunger <= 0) {
            if (pausedNowRef.current === null) {
                pausedNowRef.current = Date.now();
            }
            return;
        }
        pausedNowRef.current = null;
    }, [hunger]);

    const effectiveNowMs = pausedNowRef.current ?? Date.now();

    const firstJobOrders = workOrders
        .filter((o) => o.type === 'FARM' || o.type === 'MINE')
        .sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());

    const secondaryJobOrders = workOrders
        .filter((o) => o.type === 'COOK' || o.type === 'SMELT')
        .sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());

    const miningOrders = firstJobOrders.filter((o) => o.item?.name === firstJobSpecialTaskItemName);
    const regularFirstJobOrders = firstJobOrders.filter((o) => o.item?.name !== firstJobSpecialTaskItemName);
    const layerMeta = (code: number | null) => {
        if (code === 2) return { key: 'DEEP', label: t('active_orders.mine_layers.DEEP'), color: '#f59e0b', risk: !hasSafetyHelmet };
        if (code === 3) return { key: 'CORE', label: t('active_orders.mine_layers.CORE'), color: '#ef4444', risk: !hasSafetyHelmet };
        return { key: 'SURFACE', label: t('active_orders.mine_layers.SURFACE'), color: '#38bdf8', risk: false };
    };

    const readyCount = workOrders.filter((o) => {
        const orderNow = getOrderNowMs(o, effectiveNowMs);
        return getRemainingMs(o.completes_at, orderNow) <= 0;
    }).length;
    const firstJobPlotsByType = FARMER_PLOT_CONFIGS.map((config) => {
        const typeOrders = regularFirstJobOrders.filter((o) => o.item?.name === config.itemName);
        const slots = Array.from({ length: 9 }, (_, i) => typeOrders[i] ?? null);
        const ordersInPlot = slots.filter((o): o is WorkOrder => o !== null);
        const soonestOrder = ordersInPlot.length > 0
            ? ordersInPlot.reduce((soonest, current) =>
                getRemainingMs(current.completes_at, getOrderNowMs(current, effectiveNowMs)) < getRemainingMs(soonest.completes_at, getOrderNowMs(soonest, effectiveNowMs))
                    ? current
                    : soonest
            )
            : null;

        return {
            ...config,
            label: t(`active_orders.plots.${config.itemName}` as any, { defaultValue: config.label }),
            slots,
            filled: ordersInPlot.length,
            full: ordersInPlot.length === 9,
            ordersCount: typeOrders.length,
            overflowOrders: Math.max(0, typeOrders.length - 9),
            soonestReadyLabel: soonestOrder ? formatTimeLeft(soonestOrder.completes_at, t, getOrderNowMs(soonestOrder, effectiveNowMs)) : null,
        };
    });

    const renderOrderCard = (order: WorkOrder, accent: 'first_job' | 'secondary_job') => {
        const orderNow = getOrderNowMs(order, effectiveNowMs);
        const progress = getProgress(order, orderNow);
        const ready = progress >= 100;
        const queued = isQueuedSecondaryJobOrder(order, orderNow);
        const pausedByRequirement = Boolean(order.paused_at) && !ready;
        const pausedByKcal = hunger <= 0 && !ready;
        const timeLabel = ready
            ? t('active_orders.ready')
            : queued
                ? t('active_orders.queued')
                : pausedByRequirement
                    ? t('active_orders.paused_gear')
                    : pausedByKcal
                        ? t('active_orders.paused_kcal')
                        : formatTimeLeft(order.completes_at, t, orderNow);

        const color = accent === 'first_job' ? '#34d399' : '#fb923c';
        const border = accent === 'first_job'
            ? '1px solid rgba(52, 211, 153, 0.22)'
            : '1px solid rgba(251, 146, 60, 0.22)';
        const bg = accent === 'first_job'
            ? 'rgba(52, 211, 153, 0.04)'
            : 'rgba(251, 146, 60, 0.04)';

        return (
            <motion.div
                key={order.id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                    background: bg,
                    border,
                    borderRadius: '0.75rem',
                    padding: '0.7rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.45rem',
                }}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                        {renderItemIcon(order.item, 16)}
                        <div style={{ minWidth: 0 }}>
                            <div
                                style={{
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    color: 'rgba(255,255,255,0.92)',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                }}
                            >
                                {order.item.name}
                            </div>
                            <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.45)' }}>
                                x{order.quantity}
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        {ready ? (
                            <CheckCircle style={{ width: '0.8rem', height: '0.8rem', color: '#34d399' }} />
                        ) : (
                            <Clock style={{ width: '0.8rem', height: '0.8rem', color }} />
                        )}
                        <span style={{ fontSize: '0.62rem', fontWeight: 600, color: ready ? '#34d399' : queued ? '#facc15' : pausedByRequirement || pausedByKcal ? '#f87171' : color }}>
                            {timeLabel}
                        </span>
                    </div>
                </div>

                <div
                    style={{
                        height: '0.25rem',
                        borderRadius: '0.25rem',
                        background: 'rgba(255,255,255,0.07)',
                        overflow: 'hidden',
                    }}
                >
                    <div
                        style={{
                            height: '100%',
                            width: `${progress}%`,
                            borderRadius: '0.25rem',
                            background: ready
                                ? 'linear-gradient(90deg, #34d399, #10b981)'
                                : accent === 'first_job'
                                    ? 'linear-gradient(90deg, #34d399, #10b981)'
                                    : 'linear-gradient(90deg, #fb923c, #f97316)',
                            transition: 'width 1s linear',
                        }}
                    />
                </div>

                {ready && (
                    <motion.button
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => collectWork(order.id)}
                        style={{
                            padding: '0.35rem 0.65rem',
                            borderRadius: '0.5rem',
                            border: 'none',
                            background: 'linear-gradient(135deg, #34d399, #10b981)',
                            color: 'white',
                            fontSize: '0.68rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                        }}
                    >
                        {t('active_orders.collect')}
                    </motion.button>
                )}

                {!ready && (
                    <motion.button
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setCancelConfirm({ orderId: order.id, message: t('active_orders.cancel_confirm_desc', { item: order.item.name }) })}
                        style={{
                            padding: '0.32rem 0.6rem',
                            borderRadius: '0.5rem',
                            border: '1px solid rgba(248,113,113,0.45)',
                            background: 'rgba(248,113,113,0.14)',
                            color: '#fecaca',
                            fontSize: '0.66rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                        }}
                    >
                        {t('active_orders.cancel')}
                    </motion.button>
                )}
            </motion.div>
        );
    };

    const renderFirstJobPlotCell = (
        order: WorkOrder | null,
        index: number,
        palette: { accent: string; border: string; bg: string }
    ) => {
        if (!order) {
            return (
                <div
                    key={`first-job-empty-${index}`}
                    style={{
                        width: '100%',
                        aspectRatio: '1 / 1',
                        borderRadius: FIRST_JOB_CELL_RADIUS,
                        border: `1px solid ${palette.border}`,
                        background: `linear-gradient(145deg, ${palette.bg}, rgba(15,23,42,0.12))`,
                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -8px 18px rgba(0,0,0,0.12)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.6rem',
                        color: 'rgba(255,255,255,0.28)',
                    }}
                >
                    +
                </div>
            );
        }

        const orderNow = getOrderNowMs(order, effectiveNowMs);
        const ready = getRemainingMs(order.completes_at, orderNow) <= 0;
        return (
            <motion.div
                key={`first-job-order-${order.id}`}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={() => {
                    if (ready) collectWork(order.id);
                }}
                style={{
                    width: '100%',
                    aspectRatio: '1 / 1',
                    borderRadius: FIRST_JOB_CELL_RADIUS,
                    border: ready ? `1px solid ${palette.accent}` : `1px solid ${palette.border}`,
                    background: ready
                        ? `linear-gradient(145deg, ${palette.bg}, rgba(255,255,255,0.08))`
                        : `linear-gradient(145deg, ${palette.bg}, rgba(15,23,42,0.12))`,
                    boxShadow: ready
                        ? `0 0 18px ${palette.bg}, inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -10px 18px rgba(0,0,0,0.16)`
                        : 'inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -10px 18px rgba(0,0,0,0.16)',
                    padding: '0.2rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    cursor: ready ? 'pointer' : 'default',
                }}
            >
                {renderItemIcon(order.item, 20)}
                {!ready && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setCancelConfirm({ orderId: order.id, message: t('active_orders.cancel_confirm_desc', { item: order.item.name }) });
                        }}
                        title={t('active_orders.cancel')}
                        style={{
                            position: 'absolute',
                            left: '0.16rem',
                            top: '0.16rem',
                            width: '0.9rem',
                            height: '0.9rem',
                            borderRadius: '999px',
                            border: '1px solid rgba(248,113,113,0.55)',
                            background: 'rgba(220,38,38,0.34)',
                            color: '#fecaca',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            padding: 0,
                        }}
                    >
                        <X style={{ width: '0.55rem', height: '0.55rem' }} />
                    </button>
                )}
                <div
                    style={{
                        position: 'absolute',
                        right: '0.2rem',
                        top: '0.2rem',
                        width: '0.5rem',
                        height: '0.5rem',
                        borderRadius: '9999px',
                        background: ready ? palette.accent : 'rgba(255,255,255,0.2)',
                        boxShadow: ready ? `0 0 10px ${palette.bg}` : 'none',
                    }}
                />
            </motion.div>
        );
    };

    const renderCancelConfirmModal = () => {
        if (!cancelConfirm) return null;

        return (
            <div
                style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(2,6,23,0.68)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1200,
                    padding: '1rem',
                }}
            >
                <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    style={{
                        width: 'min(100%, 24rem)',
                        borderRadius: '0.85rem',
                        border: '1px solid rgba(248,113,113,0.35)',
                        background: 'linear-gradient(180deg, rgba(30,41,59,0.96), rgba(15,23,42,0.96))',
                        boxShadow: '0 14px 44px rgba(0,0,0,0.45)',
                        padding: '0.95rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.75rem',
                    }}
                >
                    <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#fecaca' }}>
                        {t('active_orders.cancel_confirm_title')}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.84)', lineHeight: 1.5 }}>
                        {cancelConfirm.message}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.45rem' }}>
                        <button
                            onClick={() => setCancelConfirm(null)}
                            style={{
                                padding: '0.38rem 0.68rem',
                                borderRadius: '0.48rem',
                                border: '1px solid rgba(148,163,184,0.45)',
                                background: 'rgba(148,163,184,0.12)',
                                color: '#e2e8f0',
                                fontSize: '0.68rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                            }}
                        >
                            {t('active_orders.keep_order')}
                        </button>
                        <button
                            onClick={() => {
                                cancelWork(cancelConfirm.orderId);
                                setCancelConfirm(null);
                            }}
                            style={{
                                padding: '0.38rem 0.68rem',
                                borderRadius: '0.48rem',
                                border: '1px solid rgba(248,113,113,0.55)',
                                background: 'rgba(248,113,113,0.18)',
                                color: '#fecaca',
                                fontSize: '0.68rem',
                                fontWeight: 800,
                                cursor: 'pointer',
                            }}
                        >
                            {t('active_orders.cancel_order')}
                        </button>
                    </div>
                </motion.div>
            </div>
        );
    };

    if (isMiningMode) {
        return (
            <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <motion.button
                            whileHover={{ scale: readyCount > 0 ? 1.02 : 1 }}
                            whileTap={{ scale: readyCount > 0 ? 0.98 : 1 }}
                            onClick={() => collectReadyWork()}
                            disabled={readyCount === 0}
                            style={{
                                padding: '0.4rem 0.7rem',
                                borderRadius: '0.45rem',
                                border: '1px solid rgba(52,211,153,0.35)',
                                background: readyCount > 0 ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.04)',
                                color: readyCount > 0 ? '#34d399' : 'rgba(255,255,255,0.45)',
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                cursor: readyCount > 0 ? 'pointer' : 'not-allowed',
                            }}
                        >
                            {t('active_orders.collect_all_ready', { count: readyCount })}
                        </motion.button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: showSecondaryJobColumn ? 'repeat(2, minmax(280px, 1fr))' : '1fr', gap: '0.9rem' }}>
                        <div
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                border: '1px solid rgba(56,189,248,0.22)',
                                borderRadius: '0.8rem',
                                background: 'linear-gradient(180deg, rgba(2,6,23,0.62), rgba(15,23,42,0.55))',
                                height: ORDERS_COLUMN_HEIGHT,
                                minHeight: ORDERS_COLUMN_HEIGHT,
                                overflow: 'hidden',
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', padding: '0.65rem 0.8rem', borderBottom: '1px solid rgba(56,189,248,0.22)', color: '#67e8f9', fontSize: '0.8rem', fontWeight: 700 }}>
                                <Pickaxe style={{ width: '0.9rem', height: '0.9rem' }} /> {t('active_orders.expeditions', { label: firstJobLabel })}
                            </div>
                            <div style={{ flex: 1, minHeight: 0, padding: '0.65rem', display: 'flex', flexDirection: 'column', gap: '0.55rem', overflowY: 'auto', overflowX: 'hidden' }}>
                                {miningOrders.length === 0 ? (
                                    <p style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.35)', textAlign: 'center', padding: '0.8rem 0' }}>
                                        {t('active_orders.no_mining_expeditions')}
                                    </p>
                                ) : (
                                    miningOrders.map((order) => {
                                        const meta = layerMeta(order.recipe_id);
                                        const orderNow = getOrderNowMs(order, effectiveNowMs);
                                        const progress = getProgress(order, orderNow);
                                        const ready = progress >= 100;
                                        const queued = orderNow < new Date(order.started_at).getTime();
                                        const pausedByRequirement = Boolean(order.paused_at) && !ready;
                                        const pausedByKcal = hunger <= 0 && !ready;
                                        const timeLabel = ready
                                            ? t('active_orders.ore_ready')
                                            : queued
                                                ? t('active_orders.queued')
                                                : pausedByRequirement
                                                    ? t('active_orders.paused_gear')
                                                    : pausedByKcal
                                                        ? t('active_orders.paused_kcal')
                                                        : formatTimeLeft(order.completes_at, t, orderNow);
                                        return (
                                            <motion.div
                                                key={`mine-${order.id}`}
                                                layout
                                                initial={{ opacity: 0, y: 8 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                style={{
                                                    border: `1px solid ${meta.color}55`,
                                                    background: 'rgba(15,23,42,0.58)',
                                                    borderRadius: '0.72rem',
                                                    padding: '0.65rem',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    gap: '0.42rem',
                                                }}
                                            >
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                        <Pickaxe style={{ width: '0.78rem', height: '0.78rem', color: meta.color }} />
                                                        <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#e2e8f0' }}>{meta.label}</span>
                                                    </div>
                                                    <span style={{ fontSize: '0.62rem', color: ready ? '#34d399' : queued ? '#facc15' : pausedByRequirement || pausedByKcal ? '#f87171' : meta.color, fontWeight: 700 }}>{timeLabel}</span>
                                                </div>

                                                <div style={{ height: '0.26rem', borderRadius: '0.26rem', background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                                                    <div style={{ height: '100%', width: `${progress}%`, borderRadius: '0.26rem', background: ready ? 'linear-gradient(90deg,#34d399,#10b981)' : `linear-gradient(90deg, ${meta.color}, #f8fafc)`, transition: 'width 1s linear' }} />
                                                </div>

                                                {meta.risk && (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.62rem', color: '#fca5a5' }}>
                                                        <ShieldAlert style={{ width: '0.72rem', height: '0.72rem' }} />
                                                        {t('active_orders.safety_helmet_alert')}
                                                    </div>
                                                )}

                                                <div style={{ display: 'flex', gap: '0.45rem' }}>
                                                    {ready ? (
                                                        <button
                                                            onClick={() => collectWork(order.id)}
                                                            style={{
                                                                padding: '0.3rem 0.6rem',
                                                                borderRadius: '0.45rem',
                                                                border: 'none',
                                                                background: 'linear-gradient(135deg,#34d399,#10b981)',
                                                                color: 'white',
                                                                fontSize: '0.66rem',
                                                                fontWeight: 700,
                                                                cursor: 'pointer',
                                                            }}
                                                        >
                                                            {t('active_orders.collect_ore')}
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={() => {
                                                                setCancelConfirm({ orderId: order.id, message: t('active_orders.cancel_confirm_desc_mine', { label: meta.label }) });
                                                            }}
                                                            style={{
                                                                padding: '0.3rem 0.6rem',
                                                                borderRadius: '0.45rem',
                                                                border: '1px solid rgba(248,113,113,0.45)',
                                                                background: 'rgba(248,113,113,0.14)',
                                                                color: '#fecaca',
                                                                fontSize: '0.66rem',
                                                                fontWeight: 700,
                                                                cursor: 'pointer',
                                                            }}
                                                        >
                                                            {t('active_orders.abort_expedition')}
                                                        </button>
                                                    )}
                                                </div>
                                            </motion.div>
                                        );
                                    })
                                )}
                            </div>
                        </div>

                        {showSecondaryJobColumn && (
                            <div
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    border: '1px solid rgba(251,146,60,0.22)',
                                    borderRadius: '0.8rem',
                                    background: 'linear-gradient(180deg, rgba(30,41,59,0.55), rgba(15,23,42,0.5))',
                                    height: ORDERS_COLUMN_HEIGHT,
                                    minHeight: ORDERS_COLUMN_HEIGHT,
                                    overflow: 'hidden',
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', padding: '0.65rem 0.8rem', borderBottom: '1px solid rgba(251,146,60,0.22)', color: '#fb923c', fontSize: '0.8rem', fontWeight: 700 }}>
                                    <Hammer style={{ width: '0.9rem', height: '0.9rem' }} /> {secondaryJobWorkspaceMode === 'SMELT' ? t('active_orders.secondary_queue', { label: secondaryJobLabel }) : t('active_orders.orders_label', { label: secondaryJobLabel })}
                                </div>
                                <div style={{ flex: 1, minHeight: 0, padding: '0.65rem', display: 'flex', flexDirection: 'column', gap: '0.55rem', overflowY: 'auto', overflowX: 'hidden' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.62rem', color: 'rgba(251,191,36,0.9)' }}>
                                        <Flame style={{ width: '0.72rem', height: '0.72rem' }} /> {t('active_orders.fuel_sensitive')}
                                    </div>
                                    <AnimatePresence>
                                        {secondaryJobOrders.length === 0 ? (
                                            <p style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.35)', textAlign: 'center', padding: '0.8rem 0' }}>
                                                {t('active_orders.no_secondary_orders', { defaultValue: `No active ${secondaryJobWorkspaceMode === 'SMELT' ? t('active_orders.smelting') : 'orders'}` })}
                                            </p>
                                        ) : (
                                            secondaryJobOrders.map((order) => renderOrderCard(order, 'secondary_job'))
                                        )}
                                    </AnimatePresence>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                {renderCancelConfirmModal()}
            </>
        );
    }

    return (
        <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <motion.button
                        whileHover={{ scale: readyCount > 0 ? 1.02 : 1 }}
                        whileTap={{ scale: readyCount > 0 ? 0.98 : 1 }}
                        onClick={() => collectReadyWork()}
                        disabled={readyCount === 0}
                        style={{
                            padding: '0.4rem 0.7rem',
                            borderRadius: '0.45rem',
                            border: '1px solid rgba(52,211,153,0.35)',
                            background: readyCount > 0 ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.04)',
                            color: readyCount > 0 ? '#34d399' : 'rgba(255,255,255,0.45)',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            cursor: readyCount > 0 ? 'pointer' : 'not-allowed',
                        }}
                    >
                        {t('active_orders.collect_all_ready', { count: readyCount })}
                    </motion.button>
                </div>

                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns:
                            showFirstJobColumn && showSecondaryJobColumn
                                ? 'repeat(2, minmax(260px, 1fr))'
                                : 'minmax(260px, 1fr)',
                        gap: '0.9rem',
                    }}
                >
                    {showFirstJobColumn && (
                        <div
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                border: '1px solid rgba(52, 211, 153, 0.2)',
                                borderRadius: '0.8rem',
                                background: 'rgba(52, 211, 153, 0.02)',
                                height: ORDERS_COLUMN_HEIGHT,
                                minHeight: ORDERS_COLUMN_HEIGHT,
                                overflow: 'hidden',
                            }}
                        >
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.4rem',
                                padding: '0.65rem 0.8rem',
                                borderBottom: '1px solid rgba(52, 211, 153, 0.18)',
                                color: '#34d399',
                                fontSize: '0.8rem',
                                fontWeight: 700,
                            }}>
                                <Sprout style={{ width: '0.9rem', height: '0.9rem' }} /> {t('active_orders.orders_label', { label: firstJobLabel })}
                            </div>
                            <div
                                style={{
                                    flex: 1,
                                    minHeight: 0,
                                    padding: '0.65rem',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '0.45rem',
                                    overflowY: 'auto',
                                    overflowX: 'hidden',
                                }}
                            >
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    {firstJobPlotsByType.map((seedType, seedTypeIndex) => (
                                        <div
                                            key={`seed-type-${seedType.itemName}`}
                                            style={{
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '0.35rem',
                                                border: `1px solid ${seedType.border}`,
                                                background: `linear-gradient(180deg, ${seedType.bg}, rgba(15,23,42,0.08))`,
                                                borderRadius: '0.75rem',
                                                padding: '0.45rem',
                                            }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.45rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                                    <span style={{ fontSize: '0.82rem' }}>{seedType.icon}</span>
                                                    <span style={{ fontSize: '0.66rem', fontWeight: 800, color: seedType.accent }}>
                                                        {seedType.label}
                                                    </span>
                                                </div>
                                                <span style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.68)' }}>
                                                    {t('active_orders.plot_status', { filled: seedType.filled })}
                                                    {seedType.overflowOrders > 0 ? t('active_orders.plot_queued', { count: seedType.overflowOrders }) : ''}
                                                </span>
                                            </div>

                                            <div
                                                style={{
                                                    width: `${FIRST_JOB_PLOT_SIZE}px`,
                                                    height: `${FIRST_JOB_PLOT_SIZE}px`,
                                                    display: 'grid',
                                                    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                                                    gridTemplateRows: 'repeat(3, minmax(0, 1fr))',
                                                    gap: '0.24rem',
                                                    boxSizing: 'border-box',
                                                    borderRadius: '0.55rem',
                                                    alignSelf: 'center',
                                                }}
                                            >
                                                {seedType.slots.map((order, i) =>
                                                    renderFirstJobPlotCell(order, seedTypeIndex * 100 + i, {
                                                        accent: seedType.accent,
                                                        border: seedType.border,
                                                        bg: seedType.bg,
                                                    })
                                                )}
                                            </div>

                                            <div style={{ fontSize: '0.56rem', color: seedType.full ? seedType.accent : 'rgba(255,255,255,0.62)', textAlign: 'center' }}>
                                                {seedType.full ? t('active_orders.plot_full') : t('active_orders.plot_growing')}
                                                {seedType.soonestReadyLabel ? t('active_orders.plot_next_ready', { time: seedType.soonestReadyLabel }) : t('active_orders.plot_waiting')}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {showSecondaryJobColumn && (
                        <div
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                border: '1px solid rgba(251, 146, 60, 0.2)',
                                borderRadius: '0.8rem',
                                background: 'rgba(251, 146, 60, 0.02)',
                                height: ORDERS_COLUMN_HEIGHT,
                                minHeight: ORDERS_COLUMN_HEIGHT,
                                overflow: 'hidden',
                            }}
                        >
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.4rem',
                                padding: '0.65rem 0.8rem',
                                borderBottom: '1px solid rgba(251, 146, 60, 0.18)',
                                color: '#fb923c',
                                fontSize: '0.8rem',
                                fontWeight: 700,
                            }}>
                                <UtensilsCrossed style={{ width: '0.9rem', height: '0.9rem' }} /> {t('active_orders.orders_label', { label: secondaryJobLabel })}
                            </div>
                            <div
                                style={{
                                    flex: 1,
                                    minHeight: 0,
                                    padding: '0.65rem',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '0.55rem',
                                    overflowY: 'auto',
                                    overflowX: 'hidden',
                                }}
                            >
                                <AnimatePresence>
                                    {secondaryJobOrders.length === 0 ? (
                                        <p style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.35)', textAlign: 'center', padding: '0.8rem 0' }}>
                                            {t('active_orders.no_secondary_orders')}
                                        </p>
                                    ) : (
                                        secondaryJobOrders.map((order) => renderOrderCard(order, 'secondary_job'))
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>
                    )}

                    {!showFirstJobColumn && !showSecondaryJobColumn && (
                        <div
                            style={{
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '0.8rem',
                                background: 'rgba(255,255,255,0.02)',
                                padding: '1rem',
                                fontSize: '0.75rem',
                                color: 'rgba(255,255,255,0.5)',
                                textAlign: 'center',
                            }}
                        >
                            {t('active_orders.no_occupation')}
                        </div>
                    )}
                </div>
            </div>
            {renderCancelConfirmModal()}
        </>
    );
};

export default ActiveOrdersGrid;
