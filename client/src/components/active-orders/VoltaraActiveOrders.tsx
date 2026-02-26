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

    // Group EXTRACT tasks dynamically by seed item
    const extractGroups = Array.from(new Set(firstJobOrders.map(o => o.item.name))).map(itemName => {
        const orders = firstJobOrders.filter(o => o.item.name === itemName);
        return {
            itemName,
            itemIcon: orders[0].item,
            orders,
        };
    });

    const getExtractGroupColor = (name: string) => {
        if (name.includes('Crude Oil')) return { border: 'rgba(245,158,11,0.4)', bg: 'rgba(245,158,11,0.1)', glow: '#f59e0b' };
        if (name.includes('Natural Gas')) return { border: 'rgba(56,189,248,0.4)', bg: 'rgba(56,189,248,0.1)', glow: '#38bdf8' };
        if (name.includes('Crystal')) return { border: 'rgba(192,132,252,0.4)', bg: 'rgba(192,132,252,0.1)', glow: '#c084fc' };
        return { border: 'rgba(16,185,129,0.4)', bg: 'rgba(16,185,129,0.1)', glow: '#10b981' };
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

    const renderExtractNode = (order: WorkOrder, colors: any) => {
        const orderNow = getOrderNowMs(order, effectiveNowMs);
        const progress = getProgress(order, orderNow);
        const ready = progress >= 100;
        const pausedByRequirement = Boolean(order.paused_at) && !ready;
        const pausedByKcal = hunger <= 0 && !ready;

        let statusText = `${Math.floor(progress)}%`;
        if (ready) statusText = t('active_orders.ready');
        else if (pausedByRequirement) statusText = t('active_orders.paused_gear');
        else if (pausedByKcal) statusText = t('active_orders.paused_kcal');

        return (
            <motion.div
                key={order.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.35rem',
                    padding: '0.45rem',
                    borderRadius: '0.4rem',
                    background: 'rgba(2,6,23,0.4)',
                    border: `1px solid ${ready ? colors.glow : 'rgba(255,255,255,0.08)'}`,
                    boxShadow: ready ? `0 0 12px ${colors.bg}` : 'none',
                    position: 'relative',
                }}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '0.62rem', color: ready ? colors.glow : 'rgba(255,255,255,0.6)', fontWeight: 700, fontFamily: 'monospace' }}>
                        NODE_{order.id.toString().slice(-4)}
                    </div>
                    {!ready ? (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setCancelConfirm({ orderId: order.id, message: t('active_orders.cancel_confirm_desc', { item: order.item.name }) });
                            }}
                            style={{ background: 'transparent', border: 'none', color: '#fca5a5', cursor: 'pointer', padding: 0 }}
                        >
                            <X style={{ width: '0.6rem', height: '0.6rem' }} />
                        </button>
                    ) : (
                        <div style={{ width: '0.6rem', height: '0.6rem', background: colors.glow, borderRadius: '50%', boxShadow: `0 0 8px ${colors.glow}` }} />
                    )}
                </div>

                <div style={{ height: '0.3rem', background: 'rgba(255,255,255,0.1)', borderRadius: '0.15rem', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${progress}%`, background: ready ? colors.glow : `linear-gradient(90deg, ${colors.bg}, ${colors.glow})`, transition: 'width 1s linear' }} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}>
                        {statusText}
                    </div>
                    {ready && (
                        <button
                            onClick={() => collectWork(order.id)}
                            style={{ background: colors.bg, border: `1px solid ${colors.glow}`, color: colors.glow, fontSize: '0.55rem', fontWeight: 700, padding: '0.15rem 0.35rem', borderRadius: '0.2rem', cursor: 'pointer', textTransform: 'uppercase' }}
                        >
                            {t('active_orders.collect')}
                        </button>
                    )}
                </div>
            </motion.div>
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
                                <Cpu style={{ width: '0.9rem', height: '0.9rem' }} /> EXTACTION_ARRAY // {firstJobLabel}
                            </div>
                            <div style={{ flex: 1, minHeight: 0, padding: '0.65rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', overflowY: 'auto', overflowX: 'hidden' }}>
                                {extractGroups.length === 0 ? (
                                    <p style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '2rem 0', fontFamily: 'monospace' }}>
                                        NO_ACTIVE_EXTRACTIONS
                                    </p>
                                ) : (
                                    extractGroups.map(group => {
                                        const colors = getExtractGroupColor(group.itemName);
                                        return (
                                            <div key={`extract-group-${group.itemName}`} style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', border: `1px solid ${colors.border}`, background: colors.bg, borderRadius: '0.6rem', padding: '0.5rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', borderBottom: `1px solid ${colors.border}`, paddingBottom: '0.3rem' }}>
                                                    {renderItemIcon(group.itemIcon, 14)}
                                                    <span style={{ fontSize: '0.68rem', fontWeight: 800, color: colors.glow, fontFamily: 'monospace', letterSpacing: '0.05em' }}>
                                                        {group.itemName.toUpperCase()}_RIG
                                                    </span>
                                                </div>
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '0.4rem' }}>
                                                    {group.orders.map(o => renderExtractNode(o, colors))}
                                                </div>
                                            </div>
                                        );
                                    })
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
