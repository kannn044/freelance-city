import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, CheckCircle, Leaf, Scissors, X } from 'lucide-react';
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

const TextilisActiveOrders = () => {
    const { t } = useTranslation();
    const { workOrders, collectWork, collectReadyWork, cancelWork, hunger } = useGameStore();
    const user = useAuthStore((s: any) => s.user);
    const [, setTick] = useState(0);
    const pausedNowRef = useRef<number | null>(null);
    const [cancelConfirm, setCancelConfirm] = useState<{ orderId: number; message: string } | null>(null);

    const showFirstJobColumn = (user?.first_job_level ?? 0) > 0;
    const showSecondaryJobColumn = (user?.secondary_job_level ?? 0) > 0;
    const firstJobLabel = user?.city?.occupation_labels?.first_job ?? 'Weaver';
    const secondaryJobLabel = user?.city?.occupation_labels?.secondary_job ?? 'Tailor';

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
        .filter((o) => o.type === 'GATHER' || o.type === 'FARM')
        .sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());

    const secondaryJobOrders = workOrders
        .filter((o) => o.type === 'SEW' || o.type === 'COOK')
        .sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());

    const readyCount = workOrders.filter((o) => {
        const orderNow = getOrderNowMs(o, effectiveNowMs);
        return getRemainingMs(o.completes_at, orderNow) <= 0;
    }).length;

    const gatherGroups = Array.from(new Set(firstJobOrders.map(o => o.item.name))).map(itemName => {
        const orders = firstJobOrders.filter(o => o.item.name === itemName);
        return {
            itemName,
            itemIcon: orders[0].item,
            orders,
        };
    });

    const getGatherGroupStyle = (name: string) => {
        if (name.toLowerCase().includes('cotton')) return { border: 'rgba(74,222,128,0.4)', bg: 'rgba(74,222,128,0.18)', glow: '#4ade80', emoji: '🌾' };
        if (name.toLowerCase().includes('wool') || name.toLowerCase().includes('sheep')) return { border: 'rgba(167,139,250,0.4)', bg: 'rgba(167,139,250,0.08)', glow: '#a78bfa', emoji: '🧶' };
        return { border: 'rgba(167,139,250,0.35)', bg: 'rgba(167,139,250,0.07)', glow: '#c084fc', emoji: '🌿' };
    };

    const renderCancelConfirmModal = () => {
        if (!cancelConfirm) return null;
        return (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,5,0,0.68)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: '1rem' }}>
                <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    style={{ width: 'min(100%, 24rem)', borderRadius: '0.85rem', border: '1px solid rgba(248,113,113,0.35)', background: 'linear-gradient(180deg, rgba(30,19,10,0.96), rgba(22,13,5,0.96))', boxShadow: '0 14px 44px rgba(0,0,0,0.45)', padding: '0.95rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
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

    const renderGatherNode = (order: WorkOrder, style: { glow: string; bg: string }, isFullPlot: boolean = false) => {
        const orderNow = getOrderNowMs(order, effectiveNowMs);
        const progress = getProgress(order, orderNow);
        const ready = progress >= 100;
        const pausedByRequirement = Boolean(order.paused_at) && !ready;
        const pausedByKcal = hunger <= 0 && !ready;

        let statusText = formatTimeLeft(order.completes_at, t, orderNow);
        if (ready) statusText = '';
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
                    gap: '0.3rem',
                    padding: '0.2rem',
                    borderRadius: '0.45rem',
                    background: ready ? `${style.bg}` : 'rgba(10,5,0,0.35)',
                    border: `1px solid ${ready ? style.glow : 'rgba(255,255,255,0.06)'}`,
                    boxShadow: ready ? `0 0 10px ${style.bg}, inset 0 0 8px ${style.bg}` : 'none',
                    position: 'relative',
                    overflow: 'hidden',
                    minWidth: 0,
                }}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        {renderItemIcon(order.item, 20)}
                        <span style={{ fontSize: '0.58rem', color: ready ? style.glow : 'rgba(255,255,255,0.55)', fontWeight: 600 }}>
                            x{order.quantity}
                        </span>
                    </div>
                    {!ready ? (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setCancelConfirm({ orderId: order.id, message: isFullPlot ? t('active_orders.cancel_confirm_desc_full_plot', { item: order.item.name }) : t('active_orders.cancel_confirm_desc', { item: order.item.name }) });
                            }}
                            style={{ background: 'transparent', border: 'none', color: '#fca5a5', cursor: 'pointer', padding: 0 }}
                        >
                            <X style={{ width: '0.55rem', height: '0.55rem' }} />
                        </button>
                    ) : (
                        <div style={{ width: '0.5rem', height: '0.5rem', background: style.glow, borderRadius: '50%', boxShadow: `0 0 6px ${style.glow}`, animation: 'pulse 2s ease-in-out infinite' }} />
                    )}
                </div>

                <div style={{ height: '0.25rem', background: 'rgba(255,255,255,0.08)', borderRadius: '0.15rem', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${progress}%`, background: ready ? style.glow : `linear-gradient(90deg, ${style.bg}, ${style.glow})`, transition: 'width 1s linear', borderRadius: '0.15rem' }} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.55rem', color: ready ? style.glow : pausedByRequirement || pausedByKcal ? '#fca5a5' : 'rgba(255,255,255,0.45)' }}>
                        {statusText}
                    </span>
                    {ready && (
                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.96 }}
                            onClick={() => collectWork(order.id)}
                            title={t('active_orders.collect')}
                            style={{
                                background: 'transparent',
                                border: `1px solid ${style.glow}`,
                                color: style.glow,
                                padding: '0.1rem',
                                borderRadius: '0.18rem',
                                cursor: 'pointer',
                                boxShadow: `0 0 8px ${style.glow}22`,
                                transition: 'box-shadow 0.2s ease',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                lineHeight: 1,
                            }}
                        >
                            <CheckCircle style={{ width: '2.2rem', height: '0.8rem' }} />
                        </motion.button>
                    )}
                </div>
            </motion.div>
        );
    };

    const renderSewTask = (order: WorkOrder) => {
        const orderNow = getOrderNowMs(order, effectiveNowMs);
        const progress = getProgress(order, orderNow);
        const ready = progress >= 100;
        const queued = isQueuedSecondaryJobOrder(order, orderNow);
        const pausedByRequirement = Boolean(order.paused_at) && !ready;
        const pausedByKcal = hunger <= 0 && !ready;
        const timeLabel = ready ? t('active_orders.ready') : queued ? t('active_orders.queued') : pausedByRequirement ? t('active_orders.paused_gear') : pausedByKcal ? t('active_orders.paused_kcal') : formatTimeLeft(order.completes_at, t, orderNow);

        const glowColor = '#a78bfa';

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
                    borderRadius: '0.55rem',
                    background: ready ? 'rgba(167,139,250,0.06)' : 'rgba(22,13,5,0.55)',
                    border: `1px solid ${ready ? 'rgba(167,139,250,0.5)' : 'rgba(167,139,250,0.18)'}`,
                    boxShadow: ready ? '0 0 20px rgba(167,139,250,0.08), inset 0 1px 0 rgba(255,255,255,0.12)' : 'none',
                    position: 'relative'
                }}
            >
                <div style={{ width: '2.2rem', height: '2.2rem', borderRadius: '0.45rem', background: 'rgba(10,5,0,0.45)', border: '1px solid rgba(167,139,250,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {renderItemIcon(order.item, 22)}
                </div>

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.3rem', minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {order.item.name} <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.58rem' }}>x{order.quantity}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                            {ready ? <CheckCircle style={{ width: '0.65rem', height: '0.65rem', color: glowColor }} /> : <Clock style={{ width: '0.65rem', height: '0.65rem', color: queued ? '#facc15' : glowColor }} />}
                            <span style={{ fontSize: '0.58rem', fontWeight: 600, color: ready ? glowColor : queued ? '#facc15' : pausedByRequirement || pausedByKcal ? '#fca5a5' : 'rgba(255,255,255,0.65)' }}>
                                {timeLabel}
                            </span>
                        </div>
                    </div>

                    <div style={{ height: '0.2rem', background: 'rgba(0,0,0,0.35)', borderRadius: '0.1rem', overflow: 'hidden' }}>
                        <div style={{
                            height: '100%',
                            width: `${progress}%`,
                            background: ready ? `linear-gradient(90deg, rgba(167,139,250,0.6), ${glowColor})` : `linear-gradient(90deg, rgba(167,139,250,0.2), ${glowColor})`,
                            transition: 'width 1s linear',
                            borderRadius: '0.1rem',
                        }} />
                    </div>

                    {ready ? (
                        <motion.button
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                            onClick={() => collectWork(order.id)}
                            style={{
                                alignSelf: 'flex-start',
                                background: 'transparent',
                                border: `1px solid rgba(167,139,250,0.6)`,
                                color: glowColor,
                                padding: '0.2rem 0.55rem',
                                borderRadius: '0.22rem',
                                fontSize: '0.55rem',
                                fontWeight: 600,
                                letterSpacing: '0.07em',
                                textTransform: 'uppercase',
                                cursor: 'pointer',
                                marginTop: '0.05rem',
                                boxShadow: '0 0 10px rgba(167,139,250,0.15)',
                                transition: 'box-shadow 0.2s ease',
                            }}
                        >
                            {t('active_orders.collect')}
                        </motion.button>
                    ) : (
                        <button onClick={() => setCancelConfirm({ orderId: order.id, message: t('active_orders.cancel_confirm_desc', { item: order.item.name }) })} style={{ position: 'absolute', right: '0.4rem', bottom: '0.35rem', background: 'transparent', border: 'none', color: 'rgba(248,113,113,0.65)', fontSize: '0.52rem', textDecoration: 'underline', cursor: 'pointer' }}>
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
                        whileTap={{ scale: readyCount > 0 ? 0.97 : 1 }}
                        onClick={() => collectReadyWork()}
                        disabled={readyCount === 0}
                        style={{
                            padding: '0.4rem 0.85rem',
                            borderRadius: '0.38rem',
                            border: readyCount > 0 ? '1px solid rgba(167,139,250,0.55)' : '1px solid rgba(255,255,255,0.08)',
                            background: 'transparent',
                            color: readyCount > 0 ? '#a78bfa' : 'rgba(255,255,255,0.25)',
                            fontSize: '0.65rem',
                            fontWeight: 600,
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            cursor: readyCount > 0 ? 'pointer' : 'not-allowed',
                            boxShadow: readyCount > 0 ? '0 0 16px rgba(167,139,250,0.12)' : 'none',
                            transition: 'all 0.2s ease',
                        }}
                    >
                        {t('active_orders.collect_all_ready', { count: readyCount })}
                    </motion.button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: showFirstJobColumn && showSecondaryJobColumn ? 'repeat(2, minmax(260px, 1fr))' : 'minmax(260px, 1fr)', gap: '0.9rem' }}>

                    {showFirstJobColumn && (
                        <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid rgba(167,139,250,0.2)', borderRadius: '0.8rem', background: 'linear-gradient(180deg, rgba(167,139,250,0.03), rgba(22,13,5,0.5))', height: ORDERS_COLUMN_HEIGHT, minHeight: ORDERS_COLUMN_HEIGHT, overflow: 'hidden' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.65rem 0.8rem', borderBottom: '1px solid rgba(167,139,250,0.18)', color: '#a78bfa', fontSize: '0.8rem', fontWeight: 700 }}>
                                <Leaf style={{ width: '0.9rem', height: '0.9rem' }} /> {firstJobLabel}
                            </div>
                            <div style={{ flex: 1, minHeight: 0, padding: '0.65rem', display: 'flex', flexDirection: 'column', gap: '0.65rem', overflowY: 'auto', overflowX: 'hidden' }}>
                                {gatherGroups.length === 0 ? (
                                    <p style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '2rem 0' }}>
                                        {t('active_orders.no_first_job_orders', { defaultValue: 'No active gathering' })}
                                    </p>
                                ) : (
                                    gatherGroups.map(group => {
                                        const style = getGatherGroupStyle(group.itemName);
                                        return (
                                            <div key={`gather-group-${group.itemName}`} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', border: `1px solid ${style.border}`, background: style.bg, borderRadius: '0.6rem', padding: '0.5rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', borderBottom: `1px solid ${style.border}`, paddingBottom: '0.3rem' }}>
                                                    <span style={{ fontSize: '0.78rem' }}>{style.emoji}</span>
                                                    <span style={{ fontSize: '0.66rem', fontWeight: 800, color: style.glow }}>
                                                        {group.itemName}
                                                    </span>
                                                    <span style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.45)', marginLeft: 'auto' }}>
                                                        {group.orders.length} active
                                                    </span>
                                                </div>
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.35rem' }}>
                                                    {group.orders.map((o, orderIndex) => renderGatherNode(o, style, orderIndex < Math.floor(group.orders.length / 6) * 6))}
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    )}

                    {showSecondaryJobColumn && (
                        <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid rgba(167,139,250,0.2)', borderRadius: '0.8rem', background: 'linear-gradient(180deg, rgba(167,139,250,0.03), rgba(22,13,5,0.5))', height: ORDERS_COLUMN_HEIGHT, minHeight: ORDERS_COLUMN_HEIGHT, overflow: 'hidden' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.65rem 0.8rem', borderBottom: '1px solid rgba(167,139,250,0.18)', color: '#a78bfa', fontSize: '0.8rem', fontWeight: 700 }}>
                                <Scissors style={{ width: '0.9rem', height: '0.9rem' }} /> {secondaryJobLabel}
                            </div>
                            <div style={{ flex: 1, minHeight: 0, padding: '0.65rem', display: 'flex', flexDirection: 'column', gap: '0.55rem', overflowY: 'auto', overflowX: 'hidden' }}>
                                <AnimatePresence>
                                    {secondaryJobOrders.length === 0 ? (
                                        <p style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '2rem 0' }}>
                                            {t('active_orders.no_secondary_orders', { defaultValue: 'No active sewing' })}
                                        </p>
                                    ) : (
                                        secondaryJobOrders.map((order: WorkOrder) => renderSewTask(order))
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>
                    )}

                    {!showFirstJobColumn && !showSecondaryJobColumn && (
                        <div style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.8rem', background: 'rgba(255,255,255,0.10)', padding: '1rem', fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', textAlign: 'center' }}>
                            {t('active_orders.no_occupation')}
                        </div>
                    )}
                </div>
                {renderCancelConfirmModal()}
            </div>
        </>
    );
};

export default TextilisActiveOrders;
