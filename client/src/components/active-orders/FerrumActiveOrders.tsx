import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, CheckCircle, Pickaxe, Hammer, Flame, ShieldAlert, X } from 'lucide-react';
import { useGameStore } from '../../stores/gameStore';
import type { WorkOrder } from '../../stores/gameStore';
import { renderItemIcon } from '../../lib/itemVisual';
import { useAuthStore } from '../../stores/authStore';
import { useTranslation } from 'react-i18next';
import {
    formatTimeLeft,
    isQueuedSecondaryJobOrder,
    getRemainingMs,
    getOrderNowMs,
    getProgress,
} from '../../lib/activeOrdersUtils';

const ORDERS_COLUMN_HEIGHT = '26rem';
const MINING_PLOT_SIZE = 3;

type LayerKey = 'SURFACE' | 'DEEP' | 'CORE';

const FerrumActiveOrders = () => {
    const { t } = useTranslation();
    const { workOrders, collectWork, collectReadyWork, cancelWork, hunger, equipment } = useGameStore();
    const user = useAuthStore((s) => s.user);
    const [, setTick] = useState(0);
    const pausedNowRef = useRef<number | null>(null);
    const [cancelConfirm, setCancelConfirm] = useState<{ orderId: number; message: string } | null>(null);

    const showFirstJobColumn = (user?.first_job_level ?? 0) > 0;
    const showSecondaryJobColumn = (user?.secondary_job_level ?? 0) > 0;
    const secondaryJobWorkspaceMode = user?.city?.workspace_modes?.secondary_job ?? 'COOK';
    const firstJobLabel = user?.city?.occupation_labels?.first_job ?? 'First Job';
    const secondaryJobLabel = user?.city?.occupation_labels?.secondary_job ?? 'Secondary Job';
    const firstJobSpecialTaskItemName = user?.city?.first_job_special_task_item_name ?? 'Ferrum Mining Permit';
    const hasSafetyHelmet = (equipment as any[]).some(
        (eq) => eq.slot === 'HEAD' && String(eq.item_name ?? '').toLowerCase() === 'safety helmet'
    );

    useEffect(() => {
        const interval = setInterval(() => setTick((tick) => tick + 1), 1000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (hunger <= 0) {
            if (pausedNowRef.current === null) pausedNowRef.current = Date.now();
            return;
        }
        pausedNowRef.current = null;
    }, [hunger]);

    const effectiveNowMs = pausedNowRef.current ?? Date.now();

    const firstJobOrders = workOrders
        .filter((o) => o.type === 'MINE' || o.type === 'FARM')
        .sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());

    const secondaryJobOrders = workOrders
        .filter((o) => o.type === 'SMELT' || o.type === 'COOK')
        .sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());

    const miningOrders = firstJobOrders.filter(
        (o) => o.type === 'MINE' || o.item?.name === firstJobSpecialTaskItemName
    );

    const resolveLayerKey = (code: number | null): LayerKey => {
        if (code === 2) return 'DEEP';
        if (code === 3) return 'CORE';
        return 'SURFACE';
    };

    const getLayerStyle = (layerKey: LayerKey) => {
        if (layerKey === 'DEEP')
            return { border: 'rgba(245,158,11,0.4)', bg: 'rgba(245,158,11,0.18)', glow: '#f59e0b', accent: '#fde68a', emoji: '⛏️', risk: !hasSafetyHelmet };
        if (layerKey === 'CORE')
            return { border: 'rgba(239,68,68,0.4)', bg: 'rgba(239,68,68,0.18)', glow: '#ef4444', accent: '#fca5a5', emoji: '🔥', risk: !hasSafetyHelmet };
        return { border: 'rgba(56,189,248,0.4)', bg: 'rgba(56,189,248,0.18)', glow: '#38bdf8', accent: '#fde68a', emoji: '⛏️', risk: false };
    };

    const getForgePalette = (name: string) => {
        const n = name.toLowerCase();
        if (n.includes('steel')) return { accent: '#d1d5db', border: 'rgba(209,213,219,0.28)', bg: 'rgba(148,163,184,0.10)', glow: '#e5e7eb', ember: '#fb923c' };
        if (n.includes('copper') || n.includes('bronze')) return { accent: '#fb923c', border: 'rgba(251,146,60,0.28)', bg: 'rgba(251,146,60,0.10)', glow: '#fdba74', ember: '#f97316' };
        if (n.includes('iron')) return { accent: '#94a3b8', border: 'rgba(148,163,184,0.28)', bg: 'rgba(71,85,105,0.18)', glow: '#cbd5e1', ember: '#fb923c' };
        return { accent: '#f59e0b', border: 'rgba(245,158,11,0.28)', bg: 'rgba(245,158,11,0.10)', glow: '#fcd34d', ember: '#f97316' };
    };

    const readyCount = workOrders.filter((o) => {
        const orderNow = getOrderNowMs(o, effectiveNowMs);
        return getRemainingMs(o.completes_at, orderNow) <= 0;
    }).length;

    // Group mine orders by layer — always show all 3 layers
    const miningGroups = (['SURFACE', 'DEEP', 'CORE'] as const)
        .map((layerKey) => ({
            layerKey,
            style: getLayerStyle(layerKey),
            orders: miningOrders.filter((o) => resolveLayerKey(o.recipe_id) === layerKey),
        }));

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

    const renderEmptyMineSlot = (layerKey: LayerKey, idx: number) => {
        const depthBg =
            layerKey === 'CORE'
                ? 'linear-gradient(135deg, rgba(60,15,15,0.7) 0%, rgba(30,10,10,0.9) 60%, rgba(45,18,18,0.75) 100%)'
                : layerKey === 'DEEP'
                ? 'linear-gradient(135deg, rgba(40,30,10,0.7) 0%, rgba(25,18,6,0.9) 60%, rgba(45,32,10,0.75) 100%)'
                : 'linear-gradient(135deg, rgba(20,26,36,0.75) 0%, rgba(14,20,30,0.92) 60%, rgba(22,30,42,0.78) 100%)';
        const crackColor =
            layerKey === 'CORE' ? 'rgba(239,68,68,0.22)' :
            layerKey === 'DEEP' ? 'rgba(245,158,11,0.22)' :
            'rgba(56,189,248,0.1)';
        return (
            <div
                key={`empty-${layerKey}-${idx}`}
                style={{
                    position: 'relative',
                    borderRadius: '0.45rem',
                    background: depthBg,
                    border: `1px solid ${crackColor.replace('0.1', '0.22')}`,
                    overflow: 'hidden',
                    minHeight: '4.2rem',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.25rem',
                    opacity: 0.65,
                }}
            >
                {/* Cave crack lines */}
                <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', top: '15%', left: '10%', width: '35%', height: '1px', background: crackColor, transform: 'rotate(-18deg)' }} />
                    <div style={{ position: 'absolute', top: '40%', right: '8%', width: '25%', height: '1px', background: crackColor, transform: 'rotate(12deg)' }} />
                    <div style={{ position: 'absolute', bottom: '22%', left: '22%', width: '20%', height: '1px', background: crackColor, transform: 'rotate(-8deg)' }} />
                    {/* Top-left corner triangle */}
                    <div style={{ position: 'absolute', top: 0, left: 0, width: 0, height: 0, borderStyle: 'solid', borderWidth: '1rem 1rem 0 0', borderColor: `${crackColor.replace('0.1', '0.35')} transparent transparent transparent` }} />
                </div>
                <Pickaxe style={{ width: '1rem', height: '1rem', color: crackColor.replace('0.1', '0.5') }} />
                <span style={{ fontSize: '0.52rem', color: 'rgba(255,255,255,0.2)', letterSpacing: '0.04em' }}>empty</span>
            </div>
        );
    };

    const renderMineNode = (
        order: WorkOrder,
        style: ReturnType<typeof getLayerStyle>,
        layerKey: LayerKey,
        isFullPlot: boolean = false
    ) => {
        const orderNow = getOrderNowMs(order, effectiveNowMs);
        const progress = getProgress(order, orderNow);
        const ready = progress >= 100;
        const pausedByRequirement = Boolean(order.paused_at) && !ready;
        const pausedByKcal = hunger <= 0 && !ready;

        let statusText = formatTimeLeft(order.completes_at, t, orderNow);
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
                    gap: '0.3rem',
                    padding: '0.4rem',
                    borderRadius: '0.45rem',
                    background: ready
                        ? style.bg
                        : layerKey === 'CORE'
                            ? 'linear-gradient(135deg, rgba(60,15,15,0.7) 0%, rgba(30,10,10,0.88) 60%, rgba(45,18,18,0.75) 100%)'
                            : layerKey === 'DEEP'
                                ? 'linear-gradient(135deg, rgba(45,32,10,0.72) 0%, rgba(28,20,6,0.9) 60%, rgba(42,30,8,0.78) 100%)'
                                : 'linear-gradient(135deg, rgba(14,22,36,0.78) 0%, rgba(10,16,26,0.92) 60%, rgba(16,24,38,0.8) 100%)',
                    border: `1px solid ${ready ? style.glow : style.border}`,
                    boxShadow: ready ? `0 0 10px ${style.bg}, inset 0 0 8px ${style.bg}` : 'none',
                    position: 'relative',
                    overflow: 'hidden',
                    minWidth: 0,
                    minHeight: '4.2rem',
                }}
            >
                {/* Triangle top-left accent */}
                <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: 0,
                    height: 0,
                    borderStyle: 'solid',
                    borderWidth: '0.9rem 0.9rem 0 0',
                    borderColor: `${ready ? style.glow : style.border} transparent transparent transparent`,
                    opacity: 0.6,
                    pointerEvents: 'none',
                }} />

                {/* Full-plot triangle badge bottom-right */}
                {isFullPlot && !ready && (
                    <div style={{
                        position: 'absolute',
                        bottom: 0,
                        right: 0,
                        width: 0,
                        height: 0,
                        borderStyle: 'solid',
                        borderWidth: '0 0 0.9rem 0.9rem',
                        borderColor: `transparent transparent ${style.glow} transparent`,
                        opacity: 0.5,
                        pointerEvents: 'none',
                    }} />
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        {renderItemIcon(order.item, 14)}
                        <span style={{ fontSize: '0.58rem', color: ready ? style.glow : 'rgba(255,255,255,0.55)', fontWeight: 600 }}>
                            x{order.quantity}
                        </span>
                    </div>
                    {!ready ? (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setCancelConfirm({ orderId: order.id, message: t('active_orders.cancel_confirm_desc_mine', { label: order.item.name }) });
                            }}
                            style={{ background: 'transparent', border: 'none', color: '#fca5a5', cursor: 'pointer', padding: 0 }}
                        >
                            <X style={{ width: '0.55rem', height: '0.55rem' }} />
                        </button>
                    ) : (
                        <div style={{ width: '0.5rem', height: '0.5rem', background: style.glow, borderRadius: '50%', boxShadow: `0 0 6px ${style.glow}` }} />
                    )}
                </div>

                <div style={{ height: '0.25rem', background: 'rgba(255,255,255,0.08)', borderRadius: '0.15rem', overflow: 'hidden' }}>
                    <div style={{
                        height: '100%',
                        width: `${progress}%`,
                        background: ready ? style.glow : `linear-gradient(90deg, ${style.bg}, ${style.glow})`,
                        transition: 'width 1s linear',
                        borderRadius: '0.15rem',
                    }} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.55rem', color: ready ? style.glow : pausedByRequirement || pausedByKcal ? '#fca5a5' : 'rgba(255,255,255,0.45)' }}>
                        {statusText}
                    </span>
                    {ready && (
                        <button
                            onClick={() => collectWork(order.id)}
                            style={{ background: style.bg, border: `1px solid ${style.glow}`, color: style.glow, fontSize: '0.52rem', fontWeight: 700, padding: '0.12rem 0.3rem', borderRadius: '0.2rem', cursor: 'pointer' }}
                        >
                            {t('active_orders.collect')}
                        </button>
                    )}
                </div>
            </motion.div>
        );
    };

    const renderForgeTask = (order: WorkOrder) => {
        const palette = getForgePalette(order.item.name);
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
                    background: ready ? palette.bg : 'rgba(22,13,5,0.55)',
                    border: `1px solid ${ready ? palette.glow : palette.border}`,
                    boxShadow: ready ? `0 0 14px ${palette.bg}` : 'none',
                    position: 'relative',
                }}
            >
                <div style={{ width: '2.2rem', height: '2.2rem', borderRadius: '0.45rem', background: 'rgba(10,5,0,0.45)', border: `1px solid ${palette.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {renderItemIcon(order.item, 22)}
                </div>

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.3rem', minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {order.item.name} <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.58rem' }}>x{order.quantity}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', flexShrink: 0 }}>
                            {ready
                                ? <CheckCircle style={{ width: '0.65rem', height: '0.65rem', color: palette.glow }} />
                                : <Clock style={{ width: '0.65rem', height: '0.65rem', color: queued ? '#facc15' : palette.accent }} />
                            }
                            <span style={{ fontSize: '0.58rem', fontWeight: 600, color: ready ? palette.glow : queued ? '#facc15' : pausedByRequirement || pausedByKcal ? '#fca5a5' : 'rgba(255,255,255,0.65)' }}>
                                {timeLabel}
                            </span>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.55rem', color: `${palette.ember}99` }}>
                        <Flame style={{ width: '0.58rem', height: '0.58rem', color: palette.ember }} />
                        <span>{secondaryJobWorkspaceMode === 'SMELT' ? t('active_orders.smelting', { defaultValue: 'Smelting' }) : secondaryJobLabel}</span>
                    </div>

                    <div style={{ height: '0.2rem', background: 'rgba(0,0,0,0.35)', borderRadius: '0.1rem', overflow: 'hidden' }}>
                        <div style={{
                            height: '100%',
                            width: `${progress}%`,
                            background: ready ? palette.glow : `linear-gradient(90deg, ${palette.bg}, ${palette.glow})`,
                            transition: 'width 1s linear',
                            borderRadius: '0.1rem',
                        }} />
                    </div>

                    {ready ? (
                        <button
                            onClick={() => collectWork(order.id)}
                            style={{ alignSelf: 'flex-start', background: palette.bg, border: `1px solid ${palette.glow}`, color: palette.glow, padding: '0.18rem 0.45rem', borderRadius: '0.25rem', fontSize: '0.58rem', fontWeight: 700, cursor: 'pointer', marginTop: '0.05rem' }}
                        >
                            {t('active_orders.collect')}
                        </button>
                    ) : (
                        <button
                            onClick={() => setCancelConfirm({ orderId: order.id, message: t('active_orders.cancel_confirm_desc', { item: order.item.name }) })}
                            style={{ position: 'absolute', right: '0.4rem', bottom: '0.35rem', background: 'transparent', border: 'none', color: 'rgba(248,113,113,0.65)', fontSize: '0.52rem', textDecoration: 'underline', cursor: 'pointer' }}
                        >
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
                            border: '1px solid rgba(52,211,153,0.35)',
                            background: readyCount > 0 ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.12)',
                            color: readyCount > 0 ? '#34d399' : 'rgba(255,255,255,0.45)',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            cursor: readyCount > 0 ? 'pointer' : 'not-allowed',
                        }}
                    >
                        {t('active_orders.collect_all_ready', { count: readyCount })}
                    </motion.button>
                </div>

                <div style={{
                    display: 'grid',
                    gridTemplateColumns: showFirstJobColumn && showSecondaryJobColumn
                        ? 'repeat(auto-fit, minmax(240px, 1fr))'
                        : '1fr',
                    gap: '0.9rem',
                }}>
                    {showFirstJobColumn && (
                        <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid rgba(56,189,248,0.2)', borderRadius: '0.8rem', background: 'linear-gradient(180deg, rgba(56,189,248,0.14), rgba(22,13,5,0.5))', height: ORDERS_COLUMN_HEIGHT, minHeight: ORDERS_COLUMN_HEIGHT, overflow: 'hidden' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.65rem 0.8rem', borderBottom: '1px solid rgba(56,189,248,0.18)', color: '#67e8f9', fontSize: '0.8rem', fontWeight: 700 }}>
                                <Pickaxe style={{ width: '0.9rem', height: '0.9rem' }} /> {t('active_orders.expeditions', { label: firstJobLabel })}
                            </div>
                            <div style={{ flex: 1, minHeight: 0, padding: '0.65rem', display: 'flex', flexDirection: 'column', gap: '0.65rem', overflowY: 'auto', overflowX: 'hidden' }}>
                                {miningGroups.map(({ layerKey, style, orders }) => {
                                        const label = t(`active_orders.mine_layers.${layerKey}`);
                                        const caveBg =
                                            layerKey === 'CORE'
                                                ? 'linear-gradient(180deg, rgba(50,10,10,0.55) 0%, rgba(20,6,6,0.7) 100%)'
                                                : layerKey === 'DEEP'
                                                    ? 'linear-gradient(180deg, rgba(40,26,6,0.55) 0%, rgba(20,12,4,0.7) 100%)'
                                                    : 'linear-gradient(180deg, rgba(12,22,38,0.55) 0%, rgba(8,14,26,0.7) 100%)';
                                        return (
                                            <div
                                                key={`mine-group-${layerKey}`}
                                                style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', border: `1px solid ${style.border}`, background: caveBg, borderRadius: '0.6rem', padding: '0.5rem', position: 'relative', overflow: 'hidden' }}
                                            >
                                                {/* Cave stalactite top accent */}
                                                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: `linear-gradient(90deg, transparent, ${style.glow}55, transparent)`, pointerEvents: 'none' }} />
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', borderBottom: `1px solid ${style.border}`, paddingBottom: '0.3rem' }}>
                                                    <span style={{ fontSize: '0.78rem' }}>{style.emoji}</span>
                                                    <span style={{ fontSize: '0.66rem', fontWeight: 800, color: style.glow }}>{label}</span>
                                                    {style.risk && orders.length > 0 && (
                                                        <span title={t('active_orders.safety_helmet_alert')}>
                                                            <ShieldAlert style={{ width: '0.66rem', height: '0.66rem', color: '#fca5a5' }} />
                                                        </span>
                                                    )}
                                                <span style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.45)', marginLeft: 'auto' }}>
                                                        {orders.length}/{MINING_PLOT_SIZE}
                                                    </span>
                                                </div>
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.35rem' }}>
                                                    {Array.from({ length: MINING_PLOT_SIZE }).map((_, idx) => {
                                                        const o = orders[idx];
                                                        return o
                                                            ? renderMineNode(o, style, layerKey, (idx + 1) % MINING_PLOT_SIZE === 0)
                                                            : renderEmptyMineSlot(layerKey, idx);
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })}
                            </div>
                        </div>
                    )}

                    {showSecondaryJobColumn && (
                        <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid rgba(251,146,60,0.2)', borderRadius: '0.8rem', background: 'linear-gradient(180deg, rgba(120,53,15,0.15), rgba(22,13,5,0.5))', height: ORDERS_COLUMN_HEIGHT, minHeight: ORDERS_COLUMN_HEIGHT, overflow: 'hidden' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.65rem 0.8rem', borderBottom: '1px solid rgba(251,146,60,0.18)', color: '#fb923c', fontSize: '0.8rem', fontWeight: 700 }}>
                                <Hammer style={{ width: '0.9rem', height: '0.9rem' }} /> {secondaryJobWorkspaceMode === 'SMELT' ? t('active_orders.secondary_queue', { label: secondaryJobLabel }) : t('active_orders.orders_label', { label: secondaryJobLabel })}
                            </div>
                            <div style={{ flex: 1, minHeight: 0, padding: '0.65rem', display: 'flex', flexDirection: 'column', gap: '0.55rem', overflowY: 'auto', overflowX: 'hidden' }}>
                                <AnimatePresence>
                                    {secondaryJobOrders.length === 0 ? (
                                        <p style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '2rem 0' }}>
                                            {t('active_orders.no_secondary_orders', { defaultValue: `No active ${secondaryJobWorkspaceMode === 'SMELT' ? t('active_orders.smelting', { defaultValue: 'smelting' }) : 'orders'}` })}
                                        </p>
                                    ) : (
                                        secondaryJobOrders.map((order: WorkOrder) => renderForgeTask(order))
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

export default FerrumActiveOrders;
