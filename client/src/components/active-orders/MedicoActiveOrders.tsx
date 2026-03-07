import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, CheckCircle, Microscope, FlaskConical, X, Dna } from 'lucide-react';
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

// ── Pentagon layout constants ──────────────────────────────────
// 6 slots: index 0 = center, indices 1-5 = pentagon vertices (top → clockwise)
const CELL = 28; // px
const PENTA_CX = 80, PENTA_CY = 80, PENTA_R = 55;

const PENTAGON_SLOTS: { top: number; left: number }[] = [
    { top: PENTA_CY - CELL / 2,                                              left: PENTA_CX - CELL / 2 },                                           // 0 center
    { top: (PENTA_CY + PENTA_R * Math.sin(-Math.PI / 2)) - CELL / 2,        left: (PENTA_CX + PENTA_R * Math.cos(-Math.PI / 2)) - CELL / 2 },      // 1 top
    { top: (PENTA_CY + PENTA_R * Math.sin(-Math.PI / 2 + 2 * Math.PI / 5 * 1)) - CELL / 2, left: (PENTA_CX + PENTA_R * Math.cos(-Math.PI / 2 + 2 * Math.PI / 5 * 1)) - CELL / 2 }, // 2 upper-right
    { top: (PENTA_CY + PENTA_R * Math.sin(-Math.PI / 2 + 2 * Math.PI / 5 * 2)) - CELL / 2, left: (PENTA_CX + PENTA_R * Math.cos(-Math.PI / 2 + 2 * Math.PI / 5 * 2)) - CELL / 2 }, // 3 lower-right
    { top: (PENTA_CY + PENTA_R * Math.sin(-Math.PI / 2 + 2 * Math.PI / 5 * 3)) - CELL / 2, left: (PENTA_CX + PENTA_R * Math.cos(-Math.PI / 2 + 2 * Math.PI / 5 * 3)) - CELL / 2 }, // 4 lower-left
    { top: (PENTA_CY + PENTA_R * Math.sin(-Math.PI / 2 + 2 * Math.PI / 5 * 4)) - CELL / 2, left: (PENTA_CX + PENTA_R * Math.cos(-Math.PI / 2 + 2 * Math.PI / 5 * 4)) - CELL / 2 }, // 5 upper-left
];

// Vertex positions for SVG polygon
const pentaPoints = Array.from({ length: 5 }, (_, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / 5;
    return { x: PENTA_CX + PENTA_R * Math.cos(angle), y: PENTA_CY + PENTA_R * Math.sin(angle) };
});
const pentaPolyline = pentaPoints.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
const PLOT_SIZE = 6;

// ── Style helpers ──────────────────────────────────────────────
const getGathererStyle = (name: string) => {
    const n = name.toLowerCase();
    if (n.includes('herb'))
        return { border: 'rgba(52,211,153,0.45)', bg: 'rgba(52,211,153,0.09)', glow: '#34d399', accent: '#10b981', emoji: '🌿', label: 'Herb Specimen' };
    if (n.includes('mushroom'))
        return { border: 'rgba(192,132,252,0.45)', bg: 'rgba(192,132,252,0.09)', glow: '#c084fc', accent: '#a855f7', emoji: '🍄', label: 'Fungi Sample' };
    if (n.includes('mineral'))
        return { border: 'rgba(56,189,248,0.45)', bg: 'rgba(56,189,248,0.09)', glow: '#38bdf8', accent: '#0ea5e9', emoji: '💎', label: 'Mineral Core' };
    if (n.includes('root') || n.includes('plant'))
        return { border: 'rgba(163,230,53,0.45)', bg: 'rgba(163,230,53,0.09)', glow: '#a3e635', accent: '#84cc16', emoji: '🌱', label: 'Root Extract' };
    return { border: 'rgba(52,211,153,0.45)', bg: 'rgba(52,211,153,0.09)', glow: '#34d399', accent: '#10b981', emoji: '🔬', label: 'Sample' };
};

const getBrewColor = (name: string) => {
    const n = name.toLowerCase();
    if (n.includes('potion') || n.includes('elixir'))  return { glow: '#06b6d4',  liquid: 'linear-gradient(0deg,#0e7490,#22d3ee)',   bg: 'rgba(6,182,212,0.10)',   border: 'rgba(6,182,212,0.4)' };
    if (n.includes('tonic')  || n.includes('serum'))   return { glow: '#a78bfa',  liquid: 'linear-gradient(0deg,#7c3aed,#c084fc)',   bg: 'rgba(167,139,250,0.10)', border: 'rgba(167,139,250,0.4)' };
    if (n.includes('antidote')|| n.includes('remedy')) return { glow: '#4ade80',  liquid: 'linear-gradient(0deg,#15803d,#4ade80)',   bg: 'rgba(74,222,128,0.10)',  border: 'rgba(74,222,128,0.4)' };
    if (n.includes('venom')  || n.includes('acid'))    return { glow: '#facc15',  liquid: 'linear-gradient(0deg,#a16207,#fde047)',   bg: 'rgba(250,204,21,0.10)',  border: 'rgba(250,204,21,0.4)' };
    if (n.includes('catalyst')|| n.includes('compound'))return { glow: '#fb923c', liquid: 'linear-gradient(0deg,#c2410c,#fb923c)',   bg: 'rgba(251,146,60,0.10)',  border: 'rgba(251,146,60,0.4)' };
    return { glow: '#22d3ee', liquid: 'linear-gradient(0deg,#164e63,#22d3ee)', bg: 'rgba(34,211,238,0.10)', border: 'rgba(34,211,238,0.4)' };
};

interface GathererGroup {
    itemName: string;
    itemIcon: WorkOrder['item'];
    style: ReturnType<typeof getGathererStyle>;
    slots: (WorkOrder | null)[];
    filled: number;
}

const ORDERS_COLUMN_HEIGHT = '22rem';

const MedicoActiveOrders = () => {
    const { t } = useTranslation();
    const { workOrders, collectWork, collectReadyWork, cancelWork, hunger } = useGameStore();
    const user = useAuthStore((s: any) => s.user);
    const [, setTick] = useState(0);
    const pausedNowRef = useRef<number | null>(null);
    const [cancelConfirm, setCancelConfirm] = useState<{ orderId: number; message: string } | null>(null);

    const showFirstJobColumn = (user?.first_job_level ?? 0) > 0;
    const showSecondaryJobColumn = (user?.secondary_job_level ?? 0) > 0;
    const firstJobLabel = user?.city?.occupation_labels?.first_job ?? 'Gatherer';
    const secondaryJobLabel = user?.city?.occupation_labels?.secondary_job ?? 'Alchemist';

    useEffect(() => {
        const interval = setInterval(() => setTick((t) => t + 1), 1000);
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
        .filter((o) => o.type === 'FORAGE' || o.type === 'FARM')
        .sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());

    const secondaryJobOrders = workOrders
        .filter((o) => o.type === 'BREW' || o.type === 'COOK')
        .sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());

    const readyCount = workOrders.filter((o) => {
        const orderNow = getOrderNowMs(o, effectiveNowMs);
        return getRemainingMs(o.completes_at, orderNow) <= 0;
    }).length;

    // Build pentagon groups (6 slots: center + 5 vertices)
    const gathererGroups: GathererGroup[] = Array.from(new Set(firstJobOrders.map(o => o.item.name))).map(itemName => {
        const orders = firstJobOrders.filter(o => o.item.name === itemName);
        const slots = Array.from({ length: PLOT_SIZE }, (_, i) => orders[i] ?? null);
        return { itemName, itemIcon: orders[0].item, style: getGathererStyle(itemName), slots, filled: orders.slice(0, PLOT_SIZE).filter(Boolean).length };
    });

    const renderCancelConfirmModal = () => {
        if (!cancelConfirm) return null;
        return (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,5,0,0.68)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: '1rem' }}>
                <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    style={{ width: 'min(100%, 24rem)', borderRadius: '0.85rem', border: '1px solid rgba(248,113,113,0.35)', background: 'linear-gradient(180deg, rgba(30,19,10,0.96), rgba(22,13,5,0.96))', boxShadow: '0 14px 44px rgba(0,0,0,0.45)', padding: '0.95rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
                >
                    <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#fecaca' }}>{t('active_orders.cancel_confirm_title')}</div>
                    <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.84)', lineHeight: 1.55 }}>{cancelConfirm.message}</div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.45rem' }}>
                        <button onClick={() => setCancelConfirm(null)} style={{ padding: '0.38rem 0.72rem', borderRadius: '0.5rem', border: '1px solid rgba(148,163,184,0.45)', background: 'rgba(148,163,184,0.1)', color: '#e2e8f0', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer' }}>{t('active_orders.keep_order')}</button>
                        <button onClick={() => { cancelWork(cancelConfirm.orderId); setCancelConfirm(null); }} style={{ padding: '0.38rem 0.72rem', borderRadius: '0.5rem', border: '1px solid rgba(248,113,113,0.55)', background: 'rgba(248,113,113,0.18)', color: '#fecaca', fontSize: '0.68rem', fontWeight: 800, cursor: 'pointer' }}>{t('active_orders.cancel_order')}</button>
                    </div>
                </motion.div>
            </div>
        );
    };

    // ── Pentagon slot ──────────────────────────────────────────
    const renderPentagonSlot = (order: WorkOrder | null, style: GathererGroup['style'], slotIndex: number) => {
        const pos = PENTAGON_SLOTS[slotIndex];
        if (!order) {
            return (
                <div key={`empty-${slotIndex}`} style={{ position: 'absolute', top: pos.top, left: pos.left, width: CELL, height: CELL, borderRadius: '0.4rem', border: `1px dashed ${style.border}`, background: 'rgba(2,6,23,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.4 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: style.glow, opacity: 0.3 }} />
                </div>
            );
        }
        const orderNow = getOrderNowMs(order, effectiveNowMs);
        const progress = getProgress(order, orderNow);
        const ready = progress >= 100;
        const pausedByReq = Boolean(order.paused_at) && !ready;
        const pausedByKcal = hunger <= 0 && !ready;
        const statusText = ready ? t('active_orders.ready') : pausedByReq ? t('active_orders.paused_gear') : pausedByKcal ? t('active_orders.paused_kcal') : formatTimeLeft(order.completes_at, t, orderNow);

        return (
            <motion.div
                key={order.id}
                layout
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.3rem',
                    padding: '0.4rem',
                    borderRadius: '0.45rem',
                    background: ready ? `${style.bg}` : 'rgba(10,5,0,0.35)',
                    border: `1px solid ${ready ? style.glow : 'rgba(255,255,255,0.06)'}`,
                    boxShadow: ready ? `0 0 10px ${style.bg}, inset 0 0 8px ${style.bg}` : 'none',
                    position: 'relative',
                    overflow: 'hidden',
                    zIndex: slotIndex === 0 ? 2 : 1,
                }}
                onClick={ready ? () => collectWork(order.id) : undefined}
                title={ready ? `${t('active_orders.collect')}: ${order.item.name}` : `${order.item.name} — ${statusText}`}
            >
                {/* Liquid progress fill */}
                <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: `${progress}%`, background: `${style.glow}20`, borderRadius: '0.4rem', pointerEvents: 'none', transition: 'height 1s linear' }} />

                {renderItemIcon(order.item, 13)}
                <div style={{ fontSize: '0.42rem', fontWeight: 700, color: ready ? style.glow : 'rgba(255,255,255,0.45)', lineHeight: 1, zIndex: 1 }}>×{order.quantity}</div>

                {ready && (
                    <motion.div animate={{ scale: [1, 1.4, 1] }} transition={{ repeat: Infinity, duration: 1.5 }}
                        style={{ position: 'absolute', top: 1, right: 2, width: 5, height: 5, borderRadius: '50%', background: style.glow, boxShadow: `0 0 6px ${style.glow}` }} />
                )}
                {!ready && (
                    <button onClick={(e) => { e.stopPropagation(); setCancelConfirm({ orderId: order.id, message: t('active_orders.cancel_confirm_desc', { item: order.item.name }) }); }}
                        style={{ position: 'absolute', top: 1, right: 1, background: 'transparent', border: 'none', color: 'rgba(248,113,113,0.5)', cursor: 'pointer', padding: 0, lineHeight: 1, zIndex: 3 }}>
                        <X style={{ width: 7, height: 7 }} />
                    </button>
                )}
            </motion.div>
        );
    };

    // ── Pentagon group card ────────────────────────────────────
    const renderPentagonGroup = (group: GathererGroup) => {
        const anyReady = group.slots.some(o => { if (!o) return false; return getProgress(o, getOrderNowMs(o, effectiveNowMs)) >= 100; });
        return (
            <motion.div key={group.itemName} layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.45rem', padding: '0.7rem 0.55rem 0.5rem', borderRadius: '0.9rem', border: `1px solid ${group.style.border}`, background: `linear-gradient(160deg, ${group.style.bg}, rgba(2,6,23,0.55))`, boxShadow: anyReady ? `0 0 18px ${group.style.glow}22` : 'none', minWidth: 175, flex: '0 0 auto' }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <span style={{ fontSize: '0.82rem' }}>{group.style.emoji}</span>
                    <span style={{ fontSize: '0.63rem', fontWeight: 800, color: group.style.glow, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{group.itemName}</span>
                    <span style={{ fontSize: '0.54rem', color: 'rgba(255,255,255,0.35)', marginLeft: 'auto' }}>{group.filled}/{PLOT_SIZE}</span>
                </div>

                {/* Pentagon container */}
                <div style={{ position: 'relative', width: 160, height: 155, flexShrink: 0 }}>
                    <svg width={160} height={155} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                        {/* Spokes center → vertices */}
                        {pentaPoints.map((p, i) => (
                            <line key={i} x1={PENTA_CX} y1={PENTA_CY} x2={p.x.toFixed(1)} y2={p.y.toFixed(1)}
                                stroke={group.style.glow} strokeWidth="0.5" strokeOpacity="0.25" strokeDasharray="3 3" />
                        ))}
                        {/* Pentagon outline */}
                        <polygon points={pentaPolyline} fill="none" stroke={group.style.glow} strokeWidth="1" strokeOpacity="0.3" strokeDasharray="4 3" />
                        {/* Specimen label */}
                        <text x={PENTA_CX} y={148} textAnchor="middle" fontSize="7" fill={group.style.glow} fillOpacity="0.45" fontFamily="monospace" letterSpacing="1">
                            {group.style.label.toUpperCase()}
                        </text>
                    </svg>
                    {PENTAGON_SLOTS.map((_, i) => renderPentagonSlot(group.slots[i] ?? null, group.style, i))}
                </div>

                {anyReady && (
                    <motion.button initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                        onClick={() => group.slots.forEach(o => { if (!o) return; const orderNow = getOrderNowMs(o, effectiveNowMs); if (getProgress(o, orderNow) >= 100) collectWork(o.id); })}
                        style={{ padding: '0.24rem 0.75rem', borderRadius: '0.45rem', border: `1px solid ${group.style.glow}`, background: `${group.style.glow}18`, color: group.style.glow, fontSize: '0.58rem', fontWeight: 700, cursor: 'pointer', letterSpacing: '0.03em' }}>
                        {t('active_orders.collect')} ✓
                    </motion.button>
                )}
            </motion.div>
        );
    };

    // ── Alchemist test-tube vials ──────────────────────────────
    const TUBE_H = 72, TUBE_W = 30;

    const renderBrewVial = (order: WorkOrder) => {
        const orderNow = getOrderNowMs(order, effectiveNowMs);
        const progress = getProgress(order, orderNow);
        const ready = progress >= 100;
        const queued = isQueuedSecondaryJobOrder(order, orderNow);
        const pausedByReq = Boolean(order.paused_at) && !ready;
        const pausedByKcal = hunger <= 0 && !ready;
        const timeLabel = ready ? t('active_orders.ready') : queued ? t('active_orders.queued') : pausedByReq ? t('active_orders.paused_gear') : pausedByKcal ? t('active_orders.paused_kcal') : formatTimeLeft(order.completes_at, t, orderNow);
        const colors = getBrewColor(order.item.name);
        const liquidH = Math.round((progress / 100) * TUBE_H);

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
                    background: ready ? 'rgba(167,139,250,0.08)' : 'rgba(22,13,5,0.55)',
                    border: `1px solid ${ready ? colors.glow : 'rgba(167,139,250,0.18)'}`,
                    boxShadow: ready ? '0 0 14px rgba(167,139,250,0.15)' : 'none',
                    position: 'relative'
                }}
            >
                <div style={{ width: '2.2rem', height: '2.2rem', borderRadius: '0.45rem', background: 'rgba(10,5,0,0.45)', border: '1px solid rgba(167,139,250,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {renderItemIcon(order.item, 22)}
                </div>

                {/* Stopper cap */}
                <div style={{ width: TUBE_W - 4, height: 5, borderRadius: '2px 2px 0 0', background: ready ? colors.glow : `${colors.glow}55`, boxShadow: ready ? `0 0 8px ${colors.glow}` : 'none', flexShrink: 0 }} />

                {/* Vial tube */}
                <div style={{ position: 'relative', width: TUBE_W, height: TUBE_H, borderRadius: `0 0 ${TUBE_W / 2}px ${TUBE_W / 2}px`, border: `1.5px solid ${ready ? colors.glow : colors.border}`, borderTop: 'none', background: 'rgba(2,6,23,0.75)', overflow: 'hidden', boxShadow: ready ? `0 0 18px ${colors.glow}55, inset 0 0 10px ${colors.glow}22` : 'inset 0 0 8px rgba(0,0,0,0.5)', cursor: ready ? 'pointer' : 'default', flexShrink: 0 }}
                    onClick={ready ? () => collectWork(order.id) : undefined} title={`${order.item.name} ×${order.quantity}`}>
                    {/* Liquid */}
                    <motion.div animate={{ height: liquidH }} transition={{ duration: 1, ease: 'linear' }}
                        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: colors.liquid, opacity: ready ? 1 : 0.72 }} />
                    {/* Bubbles */}
                    {!ready && !queued && liquidH > 4 && [0.2, 0.55, 0.8].map((xFrac, bi) => (
                        <motion.div key={bi} animate={{ y: [-liquidH * 0.3, -liquidH * 0.85, -liquidH * 0.3] }} transition={{ duration: 1.8 + bi * 0.4, repeat: Infinity, ease: 'easeInOut', delay: bi * 0.5 }}
                            style={{ position: 'absolute', bottom: liquidH * 0.1, left: TUBE_W * xFrac, width: 4 - bi, height: 4 - bi, borderRadius: '50%', background: colors.glow, opacity: 0.4 }} />
                    ))}
                    {/* Ruler marks */}
                    {[25, 50, 75].map(pct => (
                        <div key={pct} style={{ position: 'absolute', bottom: `${pct}%`, left: 0, width: 5, height: 1, background: 'rgba(255,255,255,0.2)' }} />
                    ))}
                    {/* Glass sheen */}
                    <div style={{ position: 'absolute', top: 4, left: 4, width: 4, height: TUBE_H - 12, borderRadius: 3, background: 'rgba(255,255,255,0.10)', pointerEvents: 'none' }} />
                    {/* Item icon */}
                    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', opacity: 0.85, zIndex: 2, pointerEvents: 'none' }}>
                        {renderItemIcon(order.item, 18)}
                    </div>
                    {/* Ready indicator */}
                    {ready && (
                        <motion.div animate={{ opacity: [1, 0.4, 1] }} transition={{ repeat: Infinity, duration: 1.2 }}
                            style={{ position: 'absolute', top: 3, left: '50%', transform: 'translateX(-50%)', zIndex: 3 }}>
                            <CheckCircle style={{ width: 12, height: 12, color: colors.glow }} />
                        </motion.div>
                    )}
                </div>

                {/* Labels */}
                <div style={{ fontSize: '0.56rem', fontWeight: 700, color: ready ? colors.glow : 'rgba(255,255,255,0.65)', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: TUBE_W + 20, letterSpacing: '0.02em' }}>
                    {order.item.name}
                </div>
                <div style={{ fontSize: '0.5rem', color: 'rgba(255,255,255,0.4)', marginTop: -2 }}>×{order.quantity}</div>
                <div style={{ fontSize: '0.52rem', fontWeight: 600, color: ready ? colors.glow : queued ? '#facc15' : pausedByReq || pausedByKcal ? '#fca5a5' : 'rgba(255,255,255,0.45)', display: 'flex', alignItems: 'center', gap: '0.15rem' }}>
                    {ready ? <CheckCircle style={{ width: 8, height: 8 }} /> : <Clock style={{ width: 8, height: 8 }} />}
                    {timeLabel}
                </div>
                {ready ? (
                    <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.96 }} onClick={() => collectWork(order.id)}
                        style={{ fontSize: '0.5rem', fontWeight: 800, padding: '0.18rem 0.45rem', borderRadius: '0.35rem', border: `1px solid ${colors.glow}`, background: `${colors.glow}22`, color: colors.glow, cursor: 'pointer', letterSpacing: '0.04em' }}>
                        {t('active_orders.collect')}
                    </motion.button>
                ) : (
                    <button onClick={() => setCancelConfirm({ orderId: order.id, message: t('active_orders.cancel_confirm_desc', { item: order.item.name }) })}
                        style={{ fontSize: '0.48rem', background: 'transparent', border: 'none', color: 'rgba(248,113,113,0.55)', textDecoration: 'underline', cursor: 'pointer', padding: 0 }}>
                        {t('active_orders.cancel')}
                    </button>
                )}
            </motion.div>
        );
    };

    // ── Alchemist rack container ───────────────────────────────
    const renderAlchemistRack = () => (
        <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid rgba(6,182,212,0.22)', borderRadius: '0.9rem', background: 'linear-gradient(160deg, rgba(6,182,212,0.04), rgba(2,6,23,0.65))', height: ORDERS_COLUMN_HEIGHT, minHeight: ORDERS_COLUMN_HEIGHT, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', padding: '0.65rem 0.8rem', borderBottom: '1px solid rgba(6,182,212,0.2)', background: 'rgba(6,182,212,0.04)' }}>
                <FlaskConical style={{ width: '0.9rem', height: '0.9rem', color: '#22d3ee' }} />
                <span style={{ color: '#22d3ee', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', fontFamily: 'monospace' }}>{secondaryJobLabel}</span>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    {secondaryJobOrders.length > 0 && (
                        <>
                            <motion.div animate={{ opacity: [1, 0.3, 1] }} transition={{ repeat: Infinity, duration: 1.4 }}
                                style={{ width: 6, height: 6, borderRadius: '50%', background: '#22d3ee', boxShadow: '0 0 8px #22d3ee' }} />
                            <span style={{ fontSize: '0.55rem', color: 'rgba(34,211,238,0.6)', fontFamily: 'monospace' }}>{secondaryJobOrders.length} ACTIVE</span>
                        </>
                    )}
                </div>
            </div>

            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: '0.8rem 0.7rem 0.5rem' }}>
                {secondaryJobOrders.length === 0 ? (
                    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem', opacity: 0.18 }}>
                            {[56, 72, 60, 68, 52].map((h, i) => (
                                <div key={i} style={{ width: 16, height: h, borderRadius: '0 0 8px 8px', border: '1px dashed rgba(34,211,238,0.5)', background: 'transparent' }} />
                            ))}
                        </div>
                        <div style={{ width: 120, height: 2, background: 'rgba(34,211,238,0.15)', borderRadius: 1 }} />
                        <p style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.3)', textAlign: 'center', margin: 0, fontFamily: 'monospace' }}>
                            {t('active_orders.no_secondary_orders', { defaultValue: 'Lab is idle' })}
                        </p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                        {/* Vials row */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.7rem 0.55rem', alignItems: 'flex-end', paddingBottom: '0.3rem' }}>
                            <AnimatePresence>
                                {secondaryJobOrders.map(order => renderBrewVial(order))}
                            </AnimatePresence>
                        </div>
                        {/* Rack shelf */}
                        <div style={{ height: 4, borderRadius: 2, background: 'linear-gradient(90deg, transparent, rgba(34,211,238,0.28), transparent)', margin: '0.1rem 0' }} />
                        {/* Formula log */}
                        <div style={{ fontSize: '0.52rem', color: 'rgba(34,211,238,0.45)', fontFamily: 'monospace', letterSpacing: '0.03em', lineHeight: 1.8 }}>
                            {secondaryJobOrders.slice(0, 4).map((o, i) => {
                                const p = getProgress(o, getOrderNowMs(o, effectiveNowMs));
                                return (
                                    <div key={o.id} style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                                        <span style={{ color: 'rgba(34,211,238,0.3)' }}>[{String(i + 1).padStart(2, '0')}]</span>
                                        <span style={{ color: 'rgba(255,255,255,0.5)' }}>{o.item.name}</span>
                                        <span style={{ marginLeft: 'auto', color: p >= 100 ? '#22d3ee' : 'rgba(34,211,238,0.4)' }}>{p >= 100 ? 'READY' : `${Math.floor(p)}%`}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );

    // ── Gatherer column ────────────────────────────────────────
    const renderGathererColumn = () => (
        <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid rgba(52,211,153,0.2)', borderRadius: '0.9rem', background: 'linear-gradient(160deg, rgba(52,211,153,0.04), rgba(2,6,23,0.6))', height: ORDERS_COLUMN_HEIGHT, minHeight: ORDERS_COLUMN_HEIGHT, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', padding: '0.65rem 0.8rem', borderBottom: '1px solid rgba(52,211,153,0.18)', background: 'rgba(52,211,153,0.04)' }}>
                <Microscope style={{ width: '0.9rem', height: '0.9rem', color: '#34d399' }} />
                <span style={{ color: '#34d399', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', fontFamily: 'monospace' }}>{firstJobLabel}</span>
                <span style={{ marginLeft: 'auto', fontSize: '0.52rem', color: 'rgba(52,211,153,0.5)', fontFamily: 'monospace', background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: '0.25rem', padding: '0.1rem 0.3rem', letterSpacing: '0.04em' }}>
                    ⬠ {PLOT_SIZE}-SLOT PENTAGON
                </span>
            </div>
            <div style={{ flex: 1, minHeight: 0, padding: '0.7rem', display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: '0.7rem', overflowY: 'auto', overflowX: 'hidden', alignContent: 'flex-start' }}>
                {gathererGroups.length === 0 ? (
                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', height: '100%' }}>
                        <svg width={120} height={110} opacity={0.15}>
                            <polygon points={pentaPoints.map(p => `${(p.x * 0.68 + 8).toFixed(1)},${(p.y * 0.68 + 4).toFixed(1)}`).join(' ')} fill="none" stroke="#34d399" strokeWidth="1.5" strokeDasharray="4 3" />
                            <circle cx={60} cy={55} r={4} fill="none" stroke="#34d399" strokeWidth="1" />
                        </svg>
                        <p style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)', margin: 0, fontFamily: 'monospace' }}>
                            {t('active_orders.no_first_job_orders', { defaultValue: 'No specimens collected' })}
                        </p>
                    </div>
                ) : (
                    gathererGroups.map(group => renderPentagonGroup(group))
                )}
            </div>
        </div>
    );

    return (
        <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {/* Header bar */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Dna style={{ width: '0.85rem', height: '0.85rem', color: 'rgba(52,211,153,0.55)' }} />
                        <span style={{ fontSize: '0.6rem', fontFamily: 'monospace', letterSpacing: '0.08em', color: 'rgba(52,211,153,0.45)', textTransform: 'uppercase' }}>
                            MEDICO · BIO-LAB ORDERS
                        </span>
                    </div>
                    <motion.button
                        whileHover={{ scale: readyCount > 0 ? 1.02 : 1 }}
                        whileTap={{ scale: readyCount > 0 ? 0.97 : 1 }}
                        onClick={() => collectReadyWork()}
                        disabled={readyCount === 0}
                        style={{
                            padding: '0.4rem 0.7rem',
                            borderRadius: '0.45rem',
                            border: '1px solid rgba(74,222,128,0.35)',
                            background: readyCount > 0 ? 'rgba(74,222,128,0.12)' : 'rgba(255,255,255,0.12)',
                            color: readyCount > 0 ? '#4ade80' : 'rgba(255,255,255,0.45)',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            cursor: readyCount > 0 ? 'pointer' : 'not-allowed',
                        }}
                    >
                        {t('active_orders.collect_all_ready', { count: readyCount })}
                    </motion.button>
                </div>

                {/* Job columns */}
                <div style={{ display: 'grid', gridTemplateColumns: showFirstJobColumn && showSecondaryJobColumn ? 'repeat(2, minmax(260px, 1fr))' : 'minmax(260px, 1fr)', gap: '0.9rem' }}>

                    {showFirstJobColumn && renderGathererColumn()}

                    {showSecondaryJobColumn && renderAlchemistRack()}

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

export default MedicoActiveOrders;
