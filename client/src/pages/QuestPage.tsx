import { useEffect, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    CheckCircle2,
    Circle,
    ClipboardList,
    Coins,
    RefreshCw,
    Sparkles,
    Star,
    Zap,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useGameStore } from '../stores/gameStore';
import { getImageByName } from '../lib/itemVisual';
import api from '../lib/api';
import TopNavBar from '../components/TopNavBar';

interface QuestRequirement {
    itemId: number;
    itemName: string;
    itemIcon: string;
    quantity: number;
}

interface DailyQuest {
    id: number;
    templateId: number;
    title: string;
    description: string;
    cityKey: string;
    rewardCredits: number;
    rewardExp: number;
    completed: boolean;
    completedAt: string | null;
    requirements: QuestRequirement[];
}

const CITY_COLORS: Record<string, { accent: string; bg: string; border: string; glow: string }> = {
    AGRARIA: { accent: '#86efac', bg: 'rgba(134,239,172,0.07)', border: 'rgba(134,239,172,0.22)', glow: 'rgba(134,239,172,0.15)' },
    FERRUM:  { accent: '#fca5a5', bg: 'rgba(252,165,165,0.07)', border: 'rgba(252,165,165,0.22)', glow: 'rgba(252,165,165,0.15)' },
    VOLTARA: { accent: '#fde68a', bg: 'rgba(253,230,138,0.07)', border: 'rgba(253,230,138,0.22)', glow: 'rgba(253,230,138,0.15)' },
    MEDICO:  { accent: '#a5f3fc', bg: 'rgba(165,243,252,0.07)', border: 'rgba(165,243,252,0.22)', glow: 'rgba(165,243,252,0.15)' },
    TEXTILIS:{ accent: '#ddd6fe', bg: 'rgba(221,214,254,0.07)', border: 'rgba(221,214,254,0.22)', glow: 'rgba(221,214,254,0.15)' },
};

const DEFAULT_THEME = { accent: '#fbbf24', bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.22)', glow: 'rgba(245,158,11,0.15)' };

function getTheme(cityKey?: string | null) {
    return (cityKey ? CITY_COLORS[cityKey] : undefined) ?? DEFAULT_THEME;
}

function getNextResetLabel(): string {
    const now = new Date();
    const nextMidnightUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    const diffMs = nextMidnightUTC.getTime() - now.getTime();
    const hrs = Math.floor(diffMs / (1000 * 60 * 60));
    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${hrs}h ${mins}m`;
}

const QuestPage = () => {
    const user = useAuthStore((s) => s.user);
    const refreshUser = useAuthStore((s) => s.fetchMe);

    const inventory = useGameStore((s) => s.inventory);

    const [quests, setQuests] = useState<DailyQuest[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState<number | null>(null);
    const [confirmQuest, setConfirmQuest] = useState<DailyQuest | null>(null);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
    const [resetLabel, setResetLabel] = useState(getNextResetLabel());

    // itemId → total quantity owned
    const inventoryMap = useMemo(() => {
        const map: Record<number, number> = {};
        for (const slot of inventory) {
            if (slot.item_id !== null && slot.quantity > 0) {
                map[slot.item_id] = (map[slot.item_id] ?? 0) + slot.quantity;
            }
        }
        return map;
    }, [inventory]);

    const cityKey = user?.city_key ?? '';
    const theme = getTheme(cityKey);

    const embers = useMemo(() =>
        Array.from({ length: 18 }, (_, i) => ({
            id: i,
            left: `${5 + Math.random() * 90}%`,
            delay: `${Math.random() * 10}s`,
            duration: `${7 + Math.random() * 9}s`,
            size: `${2 + Math.random() * 3}px`,
            drift: `${-30 + Math.random() * 60}px`,
            hue: Math.random() > 0.5 ? '#fbbf24' : '#f97316',
        })), []);

    const fetchQuests = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get('/game/quests');
            setQuests(res.data.quests ?? []);
        } catch {
            showToast('Failed to load quests.', 'error');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchQuests(); }, [fetchQuests]);

    useEffect(() => {
        const interval = setInterval(() => setResetLabel(getNextResetLabel()), 60_000);
        return () => clearInterval(interval);
    }, []);

    function showToast(msg: string, type: 'success' | 'error') {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3500);
    }

    async function handleSubmit(quest: DailyQuest) {
        if (quest.completed || submitting !== null) return;
        setSubmitting(quest.id);
        try {
            const res = await api.post(`/game/quests/submit/${quest.id}`);
            const { rewardCredits, rewardExp } = res.data;
            setQuests((prev) => prev.map((q) => q.id === quest.id ? { ...q, completed: true, completedAt: new Date().toISOString() } : q));
            showToast(`Quest completed! +${rewardCredits} credits, +${rewardExp} EXP`, 'success');
            await refreshUser();
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { error?: string; itemName?: string } } })?.response?.data?.error;
            if (msg === 'QUEST_ALREADY_COMPLETED') showToast('Quest already completed.', 'error');
            else if (msg === 'INSUFFICIENT_ITEM') {
                const item = (err as { response?: { data?: { itemName?: string } } })?.response?.data?.itemName ?? 'item';
                showToast(`Not enough: ${item}`, 'error');
            } else if (msg === 'QUEST_EXPIRED') showToast('This quest has expired.', 'error');
            else showToast('Failed to submit quest.', 'error');
        } finally {
            setSubmitting(null);
        }
    }

    function handleConfirmSubmit(quest: DailyQuest) {
        setConfirmQuest(null);
        handleSubmit(quest);
    }

    const completedCount = quests.filter((q) => q.completed).length;
    const totalQuests = quests.length;

    return (
        <div className="bg-forge" style={{ minHeight: '100vh', position: 'relative', overflow: 'hidden' }}>
            {/* Ember particles */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 0 }}>
                {embers.map((e) => (
                    <span key={e.id} style={{
                        position: 'absolute', bottom: '-8px', left: e.left,
                        width: e.size, height: e.size, borderRadius: '50%',
                        background: `radial-gradient(circle, ${e.hue} 0%, #92400e 100%)`,
                        filter: 'blur(0.8px)',
                        '--drift': e.drift,
                        animation: `ember-rise ${e.duration} ${e.delay} infinite ease-in`,
                    } as React.CSSProperties} />
                ))}
                <div style={{ position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '70%', height: '180px', background: 'radial-gradient(ellipse at bottom, rgba(234,88,12,0.1) 0%, transparent 70%)' }} />
            </div>

            {/* Toast */}
            <AnimatePresence>
                {toast && (
                    <motion.div key="toast" initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
                        style={{ position: 'fixed', top: '1.25rem', left: '50%', transform: 'translateX(-50%)', zIndex: 9999,
                            background: toast.type === 'success' ? 'rgba(52,211,153,0.18)' : 'rgba(248,113,113,0.18)',
                            border: `1px solid ${toast.type === 'success' ? 'rgba(52,211,153,0.4)' : 'rgba(248,113,113,0.4)'}`,
                            color: toast.type === 'success' ? '#6ee7b7' : '#fca5a5',
                            borderRadius: '0.75rem', padding: '0.65rem 1.2rem', fontSize: '0.85rem', fontWeight: 600,
                            backdropFilter: 'blur(12px)', boxShadow: '0 4px 24px rgba(0,0,0,0.3)' }}>
                        {toast.msg}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Top Nav */}
            <TopNavBar
                rightExtra={
                    <motion.button
                        whileHover={{ scale: 1.06 }}
                        whileTap={{ scale: 0.94 }}
                        onClick={fetchQuests}
                        disabled={loading}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.22)', borderRadius: '0.6rem', color: '#fbbf24', padding: '0.4rem 0.65rem', cursor: loading ? 'not-allowed' : 'pointer', fontSize: '0.78rem', fontWeight: 600 }}
                    >
                        <RefreshCw size={13} style={{ animation: loading ? 'spin 0.8s linear infinite' : 'none' }} /> Refresh
                    </motion.button>
                }
            />

            <div style={{ maxWidth: '56rem', margin: '0 auto', position: 'relative', zIndex: 1, padding: '1.5rem' }}>

                {/* Header row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
                    <span style={{ fontSize: '0.75rem', color: '#78604a', fontWeight: 600 }}>
                        {completedCount}/{totalQuests} completed
                    </span>
                    <span style={{ fontSize: '0.72rem', color: '#78604a', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <RefreshCw size={11} /> Resets in {resetLabel}
                    </span>
                </div>

                {/* Progress bar */}
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}
                    style={{ background: 'rgba(245,158,11,0.08)', borderRadius: '9999px', height: '6px', marginBottom: '1.5rem', overflow: 'hidden', border: '1px solid rgba(245,158,11,0.12)' }}>
                    <motion.div initial={{ width: 0 }} animate={{ width: totalQuests > 0 ? `${(completedCount / totalQuests) * 100}%` : '0%' }} transition={{ duration: 0.7, ease: 'easeOut' }}
                        style={{ height: '100%', background: `linear-gradient(90deg, #b45309, #f59e0b, ${theme.accent})`, borderRadius: '9999px', boxShadow: '0 0 8px rgba(245,158,11,0.4)' }} />
                </motion.div>

                {/* All completed banner */}
                <AnimatePresence>
                    {completedCount === totalQuests && totalQuests > 0 && (
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', background: 'linear-gradient(135deg, rgba(180,83,9,0.15), rgba(245,158,11,0.08))', border: '1px solid rgba(245,158,11,0.35)', borderRadius: '0.75rem', padding: '0.85rem 1.2rem', marginBottom: '1.5rem', color: '#fbbf24', fontWeight: 700, fontSize: '0.88rem' }}>
                            <Sparkles size={16} /> All daily quests completed! Come back after reset for new quests.
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Quest grid */}
                {loading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} style={{ height: '7rem', borderRadius: '0.85rem', background: 'rgba(245,158,11,0.04)', border: '1px solid rgba(245,158,11,0.1)', animation: 'pulse 1.5s ease-in-out infinite' }} />
                        ))}
                    </div>
                ) : quests.length === 0 ? (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        style={{ textAlign: 'center', color: '#a07850', padding: '3rem', fontSize: '0.9rem', background: 'rgba(245,158,11,0.04)', border: '1px solid rgba(245,158,11,0.12)', borderRadius: '0.85rem' }}>
                        <ClipboardList size={32} style={{ color: '#78604a', margin: '0 auto 0.75rem' }} />
                        No quests available for your city yet.
                    </motion.div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                        {quests.map((quest, idx) => (
                            <QuestCard key={quest.id} quest={quest} theme={theme} index={idx} isSubmitting={submitting === quest.id} onConfirm={setConfirmQuest} inventoryMap={inventoryMap} />
                        ))}
                    </div>
                )}
            </div>

            {/* Confirm Modal */}
            <AnimatePresence>
                {confirmQuest && (
                    <QuestConfirmModal
                        quest={confirmQuest}
                        theme={theme}
                        inventoryMap={inventoryMap}
                        isSubmitting={submitting === confirmQuest.id}
                        onCancel={() => setConfirmQuest(null)}
                        onConfirm={() => handleConfirmSubmit(confirmQuest)}
                    />
                )}
            </AnimatePresence>

            <style>{`
                @keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 0.8; } }
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
};

interface QuestCardProps {
    quest: DailyQuest;
    theme: typeof DEFAULT_THEME;
    index: number;
    isSubmitting: boolean;
    inventoryMap: Record<number, number>;
    onConfirm: (quest: DailyQuest) => void;
}

const QuestCard = ({ quest, theme, index, isSubmitting, inventoryMap, onConfirm }: QuestCardProps) => {
    const isCompleted = quest.completed;
    return (
        <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.42, delay: index * 0.06, ease: [0.16,1,0.3,1] }}
            style={{ background: isCompleted ? 'rgba(245,158,11,0.04)' : 'linear-gradient(160deg, rgba(30,19,10,0.7) 0%, rgba(22,13,5,0.75) 100%)', border: `1px solid ${isCompleted ? 'rgba(245,158,11,0.3)' : theme.border}`, borderRadius: '0.85rem', padding: '1rem 1.15rem', display: 'flex', alignItems: 'flex-start', gap: '1rem', position: 'relative', overflow: 'hidden', backdropFilter: 'blur(8px)', transition: 'border-color 0.25s' }}>
            {/* Corner brackets for completed quests */}
            {isCompleted && (['tl','tr','bl','br'] as const).map((corner) => (
                <div key={corner} style={{ position: 'absolute', width: 10, height: 10, ...( corner === 'tl' && { top: -1, left: -1, borderTop: `2px solid ${theme.accent}`, borderLeft: `2px solid ${theme.accent}` }), ...(corner === 'tr' && { top: -1, right: -1, borderTop: `2px solid ${theme.accent}`, borderRight: `2px solid ${theme.accent}` }), ...(corner === 'bl' && { bottom: -1, left: -1, borderBottom: `2px solid ${theme.accent}`, borderLeft: `2px solid ${theme.accent}` }), ...(corner === 'br' && { bottom: -1, right: -1, borderBottom: `2px solid ${theme.accent}`, borderRight: `2px solid ${theme.accent}` }) }} />
            ))}

            {/* Status icon */}
            <div style={{ flexShrink: 0, marginTop: '0.1rem', color: isCompleted ? theme.accent : theme.accent, opacity: isCompleted ? 1 : 0.7 }}>
                {isCompleted ? <CheckCircle2 size={22} /> : <Circle size={22} />}
            </div>

            {/* Content */}
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <div>
                        <h3 style={{ fontSize: '0.92rem', fontWeight: 700, color: isCompleted ? theme.accent : '#fef3c7', textDecoration: isCompleted ? 'line-through' : 'none', opacity: isCompleted ? 0.65 : 1, marginBottom: '0.2rem' }}>
                            {quest.title}
                        </h3>
                        <p style={{ fontSize: '0.76rem', color: '#a07850', margin: 0, lineHeight: 1.4 }}>
                            {quest.description}
                        </p>
                    </div>
                    {/* Rewards */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', alignItems: 'flex-end', flexShrink: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.76rem', fontWeight: 700, color: '#6ee7b7', background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: '9999px', padding: '0.22rem 0.55rem' }}>
                            <Coins size={11} /> +{quest.rewardCredits}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.72rem', fontWeight: 700, color: '#fbbf24', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: '9999px', padding: '0.2rem 0.5rem' }}>
                            <Star size={10} /> +{quest.rewardExp} EXP
                        </div>
                    </div>
                </div>

                {/* Requirements */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.7rem', color: '#78604a', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Deliver:</span>
                    {quest.requirements.map((req) => {
                        const owned = inventoryMap[req.itemId] ?? 0;
                        const enough = owned >= req.quantity;
                        return (
                            <div key={req.itemId} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', background: 'rgba(245,158,11,0.06)', border: `1px solid ${enough || isCompleted ? 'rgba(245,158,11,0.14)' : 'rgba(248,113,113,0.25)'}`, borderRadius: '0.5rem', padding: '0.25rem 0.55rem', fontSize: '0.74rem', color: '#fef3c7', fontWeight: 600 }}>
                                {(() => { const src = getImageByName(req.itemName); return src ? <img src={src} alt={req.itemName} width={16} height={16} style={{ width: 16, height: 16, objectFit: 'contain' }} /> : <span style={{ fontSize: 14 }}>{req.itemIcon}</span>; })()}
                                <span>{req.itemName}</span>
                                {isCompleted ? (
                                    <span style={{ color: theme.accent, fontWeight: 700 }}>×{req.quantity}</span>
                                ) : (
                                    <span style={{ color: enough ? '#86efac' : '#fca5a5', fontWeight: 700 }}>{owned}/{req.quantity}</span>
                                )}
                            </div>
                        );
                    })}
                    {/* Submit button */}
                    <motion.button
                        onClick={() => !isCompleted && !isSubmitting && onConfirm(quest)}
                        disabled={isCompleted || isSubmitting}
                        style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.35rem', background: isCompleted ? 'rgba(245,158,11,0.1)' : isSubmitting ? 'rgba(180,83,9,0.2)' : 'linear-gradient(135deg, #b45309, #ea580c)', border: `1px solid ${isCompleted ? 'rgba(245,158,11,0.3)' : 'rgba(245,158,11,0.45)'}`, borderRadius: '0.6rem', color: isCompleted ? '#fbbf24' : '#fef3c7', padding: '0.38rem 0.85rem', cursor: isCompleted || isSubmitting ? 'not-allowed' : 'pointer', fontSize: '0.77rem', fontWeight: 700, opacity: isCompleted ? 0.65 : 1, flexShrink: 0 }}>
                        {isSubmitting ? (<><Zap size={12} style={{ animation: 'spin 0.7s linear infinite' }} /> Submitting…</>) : isCompleted ? (<><CheckCircle2 size={12} /> Completed</>) : (<><Zap size={12} /> Submit</>)}
                    </motion.button>
                </div>
            </div>
        </motion.div>
    );
};

export default QuestPage;

// ─── Confirm Modal ───────────────────────────────────────────────────────────

interface QuestConfirmModalProps {
    quest: DailyQuest;
    theme: typeof DEFAULT_THEME;
    inventoryMap: Record<number, number>;
    isSubmitting: boolean;
    onCancel: () => void;
    onConfirm: () => void;
}

const QuestConfirmModal = ({ quest, theme, inventoryMap, isSubmitting, onCancel, onConfirm }: QuestConfirmModalProps) => {
    const canSubmit = quest.requirements.every((r) => (inventoryMap[r.itemId] ?? 0) >= r.quantity);

    return (
        <motion.div
            key="confirm-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCancel}
            style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
        >
            <motion.div
                key="confirm-box"
                initial={{ opacity: 0, scale: 0.92, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.92, y: 16 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                onClick={(e) => e.stopPropagation()}
                style={{ background: 'linear-gradient(160deg, rgba(28,16,6,0.97) 0%, rgba(18,10,3,0.98) 100%)', border: `1px solid ${theme.border}`, borderRadius: '1rem', padding: '1.5rem', width: '100%', maxWidth: '26rem', boxShadow: `0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px ${theme.glow}` }}
            >
                {/* Header */}
                <div style={{ marginBottom: '1rem' }}>
                    <h2 style={{ fontSize: '1rem', fontWeight: 800, color: '#fef3c7', margin: 0, marginBottom: '0.25rem' }}>Confirm Quest Submission</h2>
                    <p style={{ fontSize: '0.78rem', color: '#a07850', margin: 0 }}>{quest.title}</p>
                </div>

                {/* Requirements checklist */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.25rem' }}>
                    <p style={{ fontSize: '0.7rem', color: '#78604a', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', margin: 0 }}>Items required:</p>
                    {quest.requirements.map((req) => {
                        const owned = inventoryMap[req.itemId] ?? 0;
                        const enough = owned >= req.quantity;
                        const src = getImageByName(req.itemName);
                        return (
                            <div key={req.itemId} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', background: enough ? 'rgba(52,211,153,0.06)' : 'rgba(248,113,113,0.06)', border: `1px solid ${enough ? 'rgba(52,211,153,0.2)' : 'rgba(248,113,113,0.25)'}`, borderRadius: '0.6rem', padding: '0.45rem 0.75rem' }}>
                                {src
                                    ? <img src={src} alt={req.itemName} width={20} height={20} style={{ width: 20, height: 20, objectFit: 'contain', flexShrink: 0 }} />
                                    : <span style={{ fontSize: 18, flexShrink: 0 }}>{req.itemIcon}</span>
                                }
                                <span style={{ flex: 1, fontSize: '0.82rem', color: '#fef3c7', fontWeight: 600 }}>{req.itemName}</span>
                                <span style={{ fontSize: '0.85rem', fontWeight: 800, color: enough ? '#86efac' : '#fca5a5' }}>
                                    {owned} / {req.quantity}
                                </span>
                                {enough
                                    ? <CheckCircle2 size={14} style={{ color: '#86efac', flexShrink: 0 }} />
                                    : <Circle size={14} style={{ color: '#fca5a5', flexShrink: 0 }} />
                                }
                            </div>
                        );
                    })}
                </div>

                {/* Rewards preview */}
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', background: 'rgba(52,211,153,0.07)', border: '1px solid rgba(52,211,153,0.18)', borderRadius: '0.6rem', padding: '0.45rem', fontSize: '0.8rem', fontWeight: 700, color: '#6ee7b7' }}>
                        <Coins size={13} /> +{quest.rewardCredits} Credits
                    </div>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.18)', borderRadius: '0.6rem', padding: '0.45rem', fontSize: '0.8rem', fontWeight: 700, color: '#fbbf24' }}>
                        <Star size={13} /> +{quest.rewardExp} EXP
                    </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '0.6rem' }}>
                    <motion.button
                        whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                        onClick={onCancel}
                        style={{ flex: 1, padding: '0.55rem', borderRadius: '0.6rem', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.18)', color: '#a07850', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}
                    >
                        Cancel
                    </motion.button>
                    <motion.button
                        whileHover={canSubmit && !isSubmitting ? { scale: 1.03 } : {}}
                        whileTap={canSubmit && !isSubmitting ? { scale: 0.97 } : {}}
                        onClick={canSubmit && !isSubmitting ? onConfirm : undefined}
                        disabled={!canSubmit || isSubmitting}
                        style={{ flex: 2, padding: '0.55rem', borderRadius: '0.6rem', background: canSubmit ? 'linear-gradient(135deg, #b45309, #ea580c)' : 'rgba(180,83,9,0.12)', border: `1px solid ${canSubmit ? 'rgba(245,158,11,0.5)' : 'rgba(245,158,11,0.12)'}`, color: canSubmit ? '#fef3c7' : '#78604a', fontSize: '0.82rem', fontWeight: 700, cursor: canSubmit && !isSubmitting ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', transition: 'all 0.2s' }}
                    >
                        {isSubmitting
                            ? <><Zap size={13} style={{ animation: 'spin 0.7s linear infinite' }} /> Submitting…</>
                            : canSubmit
                                ? <><Sparkles size={13} /> Confirm & Submit</>
                                : 'Not Enough Items'
                        }
                    </motion.button>
                </div>
            </motion.div>
        </motion.div>
    );
};
