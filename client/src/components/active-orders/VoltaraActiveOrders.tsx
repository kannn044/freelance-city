import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, CheckCircle, Cpu, Wrench, X } from 'lucide-react';
import { useGameStore } from '../../stores/gameStore';
import type { WorkOrder } from '../../stores/gameStore';
import { renderItemIcon } from '../../lib/itemVisual';
import { useAuthStore } from '../../stores/authStore';
import { useTranslation } from 'react-i18next';
import {
    formatTimeLeft,
    getRemainingMs,
    getOrderNowMs,
    getProgress,
    isQueuedSecondaryJobOrder,
} from '../../lib/activeOrdersUtils';

const ORDERS_COLUMN_HEIGHT = '20rem';
const CIRCUIT_PLOT_SIZE = 154;
const CENTER_R = 19;
const NODE_R = 13;
const RING_RADIUS = 54;

const VoltaraActiveOrders = () => {
    const { t } = useTranslation();
    const { workOrders, collectWork, collectReadyWork, cancelWork, hunger } = useGameStore();
    const user = useAuthStore((s) => s.user);
    const [, setTick] = useState(0);
    const pausedNowRef = useRef<number | null>(null);
    const [cancelConfirm, setCancelConfirm] = useState<{ orderId: number; message: string } | null>(null);

    const showFirstJobColumn = (user?.first_job_level ?? 0) > 0;
    const showSecondaryJobColumn = (user?.secondary_job_level ?? 0) > 0;
    const firstJobLabel = user?.city?.occupation_labels?.first_job ?? 'Technician';
    const secondaryJobLabel = user?.city?.occupation_labels?.secondary_job ?? 'Engineer';

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
        .filter((o) => o.type === 'EXTRACT' || o.type === 'FARM')
        .sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());

    const secondaryJobOrders = workOrders
        .filter((o) => o.type === 'REFINE' || o.type === 'COOK')
        .sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());

    const readyCount = workOrders.filter((o) => {
        const orderNow = getOrderNowMs(o, effectiveNowMs);
        return getRemainingMs(o.completes_at, orderNow) <= 0;
    }).length;

    // Group EXTRACT tasks dynamically by item name
    const extractGroups = Array.from(new Set(firstJobOrders.map(o => o.item.name))).map(itemName => {
        const orders = firstJobOrders.filter(o => o.item.name === itemName);
        return {
            itemName,
            itemIcon: orders[0].item,
            orders,
        };
    });

    const getExtractGroupColor = (name: string) => {
        if (name.includes('Crude Oil')) return { border: 'rgba(245,158,11,0.4)', bg: 'rgba(245,158,11,0.1)', glow: '#f59e0b', trackColor: 'rgba(245,158,11,0.25)' };
        if (name.includes('Natural Gas')) return { border: 'rgba(56,189,248,0.4)', bg: 'rgba(56,189,248,0.1)', glow: '#38bdf8', trackColor: 'rgba(56,189,248,0.25)' };
        if (name.includes('Crystal')) return { border: 'rgba(192,132,252,0.4)', bg: 'rgba(192,132,252,0.1)', glow: '#c084fc', trackColor: 'rgba(192,132,252,0.25)' };
        return { border: 'rgba(16,185,129,0.4)', bg: 'rgba(16,185,129,0.1)', glow: '#10b981', trackColor: 'rgba(16,185,129,0.25)' };
    };

    const renderCancelConfirmModal = () => {
        if (!cancelConfirm) return null;

        return (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(2,6,23,0.68)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: '1rem' }}>
                <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    style={{ width: 'min(100%, 24rem)', borderRadius: '0.85rem', border: '1px solid rgba(248,113,113,0.35)', background: 'linear-gradient(180deg, rgba(30,41,59,0.96), rgba(15,23,42,0.96))', boxShadow: '0 14px 44px rgba(0,0,0,0.45)', padding: '0.95rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
                >
                    <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#fecaca' }}>{t('active_orders.cancel_confirm_title')}</div>
                    <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.84)', lineHeight: 1.5 }}>{cancelConfirm.message}</div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.45rem' }}>
                        <button onClick={() => setCancelConfirm(null)} style={{ padding: '0.38rem 0.68rem', borderRadius: '0.48rem', border: '1px solid rgba(148,163,184,0.45)', background: 'rgba(148,163,184,0.12)', color: '#e2e8f0', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer' }}>{t('active_orders.keep_order')}</button>
                        <button onClick={() => { cancelWork(cancelConfirm.orderId); setCancelConfirm(null); }} style={{ padding: '0.38rem 0.68rem', borderRadius: '0.48rem', border: '1px solid rgba(248,113,113,0.55)', background: 'rgba(248,113,113,0.18)', color: '#fecaca', fontSize: '0.68rem', fontWeight: 800, cursor: 'pointer' }}>{t('active_orders.cancel_order')}</button>
                    </div>
                </motion.div>
            </div>
        );
    };

    // Renders a single circular node slot in the radial circuit plot
    const renderCircuitNode = (
        order: WorkOrder | null,
        slotIndex: number,
        isCenter: boolean,
        posX: number,
        posY: number,
        colors: ReturnType<typeof getExtractGroupColor>,
        isFullPlot: boolean = false
    ) => {
        const diameter = isCenter ? CENTER_R * 2 : NODE_R * 2;
        const half = diameter / 2;

        if (!order) {
            return (
                <div
                    key={`empty-${slotIndex}`}
                    style={{
                        position: 'absolute',
                        left: posX - half,
                        top: posY - half,
                        width: diameter,
                        height: diameter,
                        borderRadius: '50%',
                        border: `1px dashed ${colors.trackColor}`,
                        background: 'rgba(2,6,23,0.55)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: isCenter ? '0.65rem' : '0.5rem',
                        color: 'rgba(255,255,255,0.2)',
                        boxSizing: 'border-box',
                    }}
                >
                    {isCenter ? '○' : '·'}
                </div>
            );
        }

        const orderNow = getOrderNowMs(order, effectiveNowMs);
        const progress = getProgress(order, orderNow);
        const ready = progress >= 100;
        const pausedByRequirement = Boolean(order.paused_at) && !ready;
        const pausedByKcal = hunger <= 0 && !ready;

        const circumference = 2 * Math.PI * (half - 2);
        const dashOffset = circumference * (1 - progress / 100);

        return (
            <motion.div
                key={`node-${order.id}`}
                layout
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={() => { if (ready) collectWork(order.id); }}
                style={{
                    position: 'absolute',
                    left: posX - half,
                    top: posY - half,
                    width: diameter,
                    height: diameter,
                    borderRadius: '50%',
                    background: ready
                        ? `radial-gradient(circle, ${colors.bg}, rgba(2,6,23,0.7))`
                        : 'rgba(2,6,23,0.7)',
                    border: `1.5px solid ${ready ? colors.glow : colors.trackColor}`,
                    boxShadow: ready ? `0 0 14px ${colors.glow}, inset 0 0 8px ${colors.bg}` : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: ready ? 'pointer' : 'default',
                    boxSizing: 'border-box',
                    zIndex: 2,
                }}
                title={ready ? `${order.item.name} — ${t('active_orders.ready')}` : `${order.item.name} — ${pausedByRequirement ? t('active_orders.paused_gear') : pausedByKcal ? t('active_orders.paused_kcal') : `${Math.floor(progress)}%`}`}
            >
                {/* SVG arc progress ring */}
                <svg
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', borderRadius: '50%' }}
                    viewBox={`0 0 ${diameter} ${diameter}`}
                >
                    <circle
                        cx={half}
                        cy={half}
                        r={half - 2}
                        fill="none"
                        stroke={colors.trackColor}
                        strokeWidth="1.5"
                    />
                    {!ready && (
                        <circle
                            cx={half}
                            cy={half}
                            r={half - 2}
                            fill="none"
                            stroke={colors.glow}
                            strokeWidth="1.5"
                            strokeDasharray={circumference}
                            strokeDashoffset={dashOffset}
                            strokeLinecap="round"
                            transform={`rotate(-90 ${half} ${half})`}
                            style={{ transition: 'stroke-dashoffset 1s linear' }}
                        />
                    )}
                </svg>

                {/* Item icon or ready indicator */}
                {isCenter ? (
                    <div style={{ zIndex: 1 }}>{renderItemIcon(order.item, 16)}</div>
                ) : ready ? (
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: colors.glow, boxShadow: `0 0 6px ${colors.glow}`, zIndex: 1 }} />
                ) : (
                    <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: colors.trackColor, zIndex: 1 }} />
                )}

                {/* Cancel button on non-ready nodes */}
                {!ready && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setCancelConfirm({ orderId: order.id, message: isFullPlot ? t('active_orders.cancel_confirm_desc_full_plot', { item: order.item.name }) : t('active_orders.cancel_confirm_desc', { item: order.item.name }) });
                        }}
                        style={{
                            position: 'absolute',
                            top: '-3px',
                            right: '-3px',
                            width: '10px',
                            height: '10px',
                            borderRadius: '50%',
                            border: '1px solid rgba(248,113,113,0.6)',
                            background: 'rgba(220,38,38,0.5)',
                            color: '#fecaca',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            padding: 0,
                            zIndex: 3,
                        }}
                    >
                        <X style={{ width: '5px', height: '5px' }} />
                    </button>
                )}
            </motion.div>
        );
    };

    // Renders a full radial circuit plot for one extraction group
    const renderCircuitPlot = (group: { itemName: string; itemIcon: any; orders: WorkOrder[] }) => {
        const colors = getExtractGroupColor(group.itemName);
        const slots = Array.from({ length: 9 }, (_, i) => group.orders[i] ?? null);
        const centerSlot = slots[0];
        const ringSlots = slots.slice(1); // 8 ring nodes

        const cx = CIRCUIT_PLOT_SIZE / 2;
        const cy = CIRCUIT_PLOT_SIZE / 2;
        const ringAngles = [90, 45, 0, 315, 270, 225, 180, 135]; // clockwise from top
        const ringPositions = ringAngles.map(deg => {
            const rad = (deg * Math.PI) / 180;
            return { x: cx + RING_RADIUS * Math.cos(rad), y: cy - RING_RADIUS * Math.sin(rad) };
        });

        const filledCount = slots.filter(Boolean).length;
        const readyInGroup = slots.filter(s => {
            if (!s) return false;
            const now = getOrderNowMs(s, effectiveNowMs);
            return getRemainingMs(s.completes_at, now) <= 0;
        }).length;
        const soonestOrder = slots.filter((s): s is WorkOrder => s !== null && getRemainingMs(s.completes_at, getOrderNowMs(s, effectiveNowMs)) > 0)
            .sort((a, b) => getRemainingMs(a.completes_at, getOrderNowMs(a, effectiveNowMs)) - getRemainingMs(b.completes_at, getOrderNowMs(b, effectiveNowMs)))[0] ?? null;

        return (
            <div
                key={`circuit-plot-${group.itemName}`}
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '0.35rem',
                    border: `1px solid ${colors.border}`,
                    background: `linear-gradient(180deg, ${colors.bg}, rgba(2,6,23,0.06))`,
                    borderRadius: '0.75rem',
                    padding: '0.5rem 0.45rem 0.45rem',
                }}
            >
                {/* Group header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', paddingBottom: '0.2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        {renderItemIcon(group.itemIcon, 13)}
                        <span style={{ fontSize: '0.62rem', fontWeight: 800, color: colors.glow, fontFamily: 'monospace', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                            {group.itemName}_CIRCUIT
                        </span>
                    </div>
                    <span style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.55)', fontFamily: 'monospace' }}>
                        {filledCount}/9{readyInGroup > 0 ? ` · ${readyInGroup}★` : ''}
                    </span>
                </div>

                {/* Radial circle plot */}
                <div style={{ position: 'relative', width: CIRCUIT_PLOT_SIZE, height: CIRCUIT_PLOT_SIZE, flexShrink: 0 }}>
                    {/* SVG orbit track + spoke lines */}
                    <svg
                        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
                        viewBox={`0 0 ${CIRCUIT_PLOT_SIZE} ${CIRCUIT_PLOT_SIZE}`}
                    >
                        {/* Outer orbit ring */}
                        <circle cx={cx} cy={cy} r={RING_RADIUS} fill="none" stroke={colors.trackColor} strokeWidth="0.8" strokeDasharray="3 4" />
                        {/* Spoke lines from center to each ring position */}
                        {ringPositions.map((pos, i) => (
                            <line
                                key={`spoke-${i}`}
                                x1={cx}
                                y1={cy}
                                x2={pos.x}
                                y2={pos.y}
                                stroke={colors.trackColor}
                                strokeWidth="0.6"
                                strokeDasharray="2 3"
                            />
                        ))}
                    </svg>

                    {/* Center node */}
                    {renderCircuitNode(centerSlot, 0, true, cx, cy, colors, group.orders.length >= 9)}

                    {/* Ring nodes */}
                    {ringSlots.map((order, i) =>
                        renderCircuitNode(order, i + 1, false, ringPositions[i].x, ringPositions[i].y, colors, group.orders.length >= 9)
                    )}
                </div>

                {/* Status footer */}
                <div style={{ fontSize: '0.55rem', color: soonestOrder ? colors.glow : 'rgba(255,255,255,0.35)', fontFamily: 'monospace', textAlign: 'center' }}>
                    {soonestOrder
                        ? `NEXT: ${formatTimeLeft(soonestOrder.completes_at, t, getOrderNowMs(soonestOrder, effectiveNowMs))}`
                        : readyInGroup > 0
                            ? `${readyInGroup} NODE${readyInGroup > 1 ? 'S' : ''} READY`
                            : 'NO_ACTIVE_NODES'}
                </div>
            </div>
        );
    };

    const renderRefineryTask = (order: WorkOrder) => {
        const orderNow = getOrderNowMs(order, effectiveNowMs);
        const progress = getProgress(order, orderNow);
        const ready = progress >= 100;
        const queued = isQueuedSecondaryJobOrder(order, orderNow);
        const pausedByRequirement = Boolean(order.paused_at) && !ready;
        const pausedByKcal = hunger <= 0 && !ready;
        const timeLabel = ready ? t('active_orders.ready') : queued ? t('active_orders.queued') : pausedByRequirement ? t('active_orders.paused_gear') : pausedByKcal ? t('active_orders.paused_kcal') : formatTimeLeft(order.completes_at, t, orderNow);

        const glowColor = '#38bdf8'; // Cyan theme for Engineer

        return (
            <motion.div
                key={order.id}
                layout
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.6rem',
                    borderRadius: '0.5rem',
                    background: 'rgba(15,23,42,0.6)',
                    border: `1px solid ${ready ? glowColor : 'rgba(56,189,248,0.2)'}`,
                    boxShadow: ready ? `0 0 15px rgba(56,189,248,0.15)` : 'none',
                    position: 'relative'
                }}
            >
                <div style={{ width: '2.4rem', height: '2.4rem', borderRadius: '0.4rem', background: 'rgba(2,6,23,0.5)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {renderItemIcon(order.item, 24)}
                </div>

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.35rem', minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {order.item.name} <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.6rem' }}>x{order.quantity}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            {ready ? <CheckCircle style={{ width: '0.7rem', height: '0.7rem', color: glowColor }} /> : <Clock style={{ width: '0.7rem', height: '0.7rem', color: queued ? '#facc15' : glowColor }} />}
                            <span style={{ fontSize: '0.6rem', fontWeight: 600, color: ready ? glowColor : queued ? '#facc15' : pausedByRequirement || pausedByKcal ? '#fca5a5' : 'rgba(255,255,255,0.7)', fontFamily: 'monospace' }}>
                                {timeLabel}
                            </span>
                        </div>
                    </div>

                    <div style={{ height: '0.2rem', background: 'rgba(0,0,0,0.4)', borderRadius: '0.1rem', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${progress}%`, background: ready ? glowColor : `linear-gradient(90deg, rgba(56,189,248,0.2), ${glowColor})`, transition: 'width 1s linear' }} />
                    </div>

                    {ready ? (
                        <button onClick={() => collectWork(order.id)} style={{ alignSelf: 'flex-start', background: `rgba(56,189,248,0.15)`, border: `1px solid ${glowColor}`, color: glowColor, padding: '0.2rem 0.5rem', borderRadius: '0.3rem', fontSize: '0.6rem', fontWeight: 700, cursor: 'pointer', marginTop: '0.1rem' }}>
                            {t('active_orders.collect')}
                        </button>
                    ) : (
                        <button onClick={() => setCancelConfirm({ orderId: order.id, message: t('active_orders.cancel_confirm_desc', { item: order.item.name }) })} style={{ position: 'absolute', right: '0.4rem', bottom: '0.4rem', background: 'transparent', border: 'none', color: 'rgba(248,113,113,0.7)', fontSize: '0.55rem', textDecoration: 'underline', cursor: 'pointer' }}>
                            {t('active_orders.cancel')}
                        </button>
                    )}
                </div>
            </motion.div>
        );
    };

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
                            border: '1px solid rgba(56,189,248,0.35)',
                            background: readyCount > 0 ? 'rgba(56,189,248,0.12)' : 'rgba(255,255,255,0.04)',
                            color: readyCount > 0 ? '#38bdf8' : 'rgba(255,255,255,0.45)',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            cursor: readyCount > 0 ? 'pointer' : 'not-allowed',
                            fontFamily: 'monospace',
                            letterSpacing: '0.05em'
                        }}
                    >
                        {t('active_orders.collect_all_ready', { count: readyCount })}
                    </motion.button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: showFirstJobColumn && showSecondaryJobColumn ? 'repeat(2, minmax(260px, 1fr))' : 'minmax(260px, 1fr)', gap: '0.9rem' }}>

                    {showFirstJobColumn && (
                        <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '0.8rem', background: 'rgba(16,185,129,0.02)', height: ORDERS_COLUMN_HEIGHT, minHeight: ORDERS_COLUMN_HEIGHT, overflow: 'hidden' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.65rem 0.8rem', borderBottom: '1px solid rgba(16,185,129,0.18)', color: '#10b981', fontSize: '0.8rem', fontWeight: 700 }}>
                                <Cpu style={{ width: '0.9rem', height: '0.9rem' }} /> CIRCUIT_PLOTS // {firstJobLabel}
                            </div>
                            <div style={{ flex: 1, minHeight: 0, padding: '0.65rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', overflowY: 'auto', overflowX: 'hidden' }}>
                                {extractGroups.length === 0 ? (
                                    <p style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '2rem 0', fontFamily: 'monospace' }}>
                                        NO_ACTIVE_CIRCUITS
                                    </p>
                                ) : (
                                    extractGroups.map(group => renderCircuitPlot(group))
                                )}
                            </div>
                        </div>
                    )}

                    {showSecondaryJobColumn && (
                        <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid rgba(56,189,248,0.2)', borderRadius: '0.8rem', background: 'rgba(56,189,248,0.02)', height: ORDERS_COLUMN_HEIGHT, minHeight: ORDERS_COLUMN_HEIGHT, overflow: 'hidden' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.65rem 0.8rem', borderBottom: '1px solid rgba(56,189,248,0.18)', color: '#38bdf8', fontSize: '0.8rem', fontWeight: 700 }}>
                                <Wrench style={{ width: '0.9rem', height: '0.9rem' }} /> REFINERY_QUEUE // {secondaryJobLabel}
                            </div>
                            <div style={{ flex: 1, minHeight: 0, padding: '0.65rem', display: 'flex', flexDirection: 'column', gap: '0.55rem', overflowY: 'auto', overflowX: 'hidden' }}>
                                <AnimatePresence>
                                    {secondaryJobOrders.length === 0 ? (
                                        <p style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '2rem 0', fontFamily: 'monospace' }}>
                                            QUEUE_EMPTY
                                        </p>
                                    ) : (
                                        secondaryJobOrders.map((order) => renderRefineryTask(order))
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>
                    )}
                </div>
                {renderCancelConfirmModal()}
            </div>
        </>
    );
};

export default VoltaraActiveOrders;
