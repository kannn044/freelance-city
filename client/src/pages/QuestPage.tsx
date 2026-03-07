import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
    ArrowLeft,
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
import { getImageByName } from '../lib/itemVisual';
import api from '../lib/api';

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
    AGRARIA: {
        accent: '#86efac',
        bg: 'rgba(134, 239, 172, 0.06)',
        border: 'rgba(134, 239, 172, 0.2)',
        glow: 'rgba(134, 239, 172, 0.15)',
    },
    FERRUM: {
        accent: '#fca5a5',
        bg: 'rgba(252, 165, 165, 0.06)',
        border: 'rgba(252, 165, 165, 0.2)',
        glow: 'rgba(252, 165, 165, 0.15)',
    },
    VOLTARA: {
        accent: '#fde68a',
        bg: 'rgba(253, 230, 138, 0.06)',
        border: 'rgba(253, 230, 138, 0.2)',
        glow: 'rgba(253, 230, 138, 0.15)',
    },
    MEDICO: {
        accent: '#a5f3fc',
        bg: 'rgba(165, 243, 252, 0.06)',
        border: 'rgba(165, 243, 252, 0.2)',
        glow: 'rgba(165, 243, 252, 0.15)',
    },
    TEXTILIS: {
        accent: '#ddd6fe',
        bg: 'rgba(221, 214, 254, 0.06)',
        border: 'rgba(221, 214, 254, 0.2)',
        glow: 'rgba(221, 214, 254, 0.15)',
    },
};

const DEFAULT_THEME = {
    accent: '#c7d2fe',
    bg: 'rgba(199, 210, 254, 0.06)',
    border: 'rgba(199, 210, 254, 0.2)',
    glow: 'rgba(199, 210, 254, 0.15)',
};

function getTheme(cityKey?: string | null): { accent: string; bg: string; border: string; glow: string } {
    return (cityKey ? CITY_COLORS[cityKey] : undefined) ?? DEFAULT_THEME;
}

function getNextResetLabel(): string {
    const now = new Date();
    const nextMidnightUTC = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
    );
    const diffMs = nextMidnightUTC.getTime() - now.getTime();
    const hrs = Math.floor(diffMs / (1000 * 60 * 60));
    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${hrs}h ${mins}m`;
}

const QuestPage = () => {
    const navigate = useNavigate();
    const user = useAuthStore((s) => s.user);
    const refreshUser = useAuthStore((s) => s.fetchMe);

    const [quests, setQuests] = useState<DailyQuest[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState<number | null>(null);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
    const [resetLabel, setResetLabel] = useState(getNextResetLabel());

    const cityKey = user?.city_key ?? '';
    const theme = getTheme(cityKey);

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

    useEffect(() => {
        fetchQuests();
    }, [fetchQuests]);

    // Update reset countdown every minute
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
            setQuests((prev) =>
                prev.map((q) =>
                    q.id === quest.id
                        ? { ...q, completed: true, completedAt: new Date().toISOString() }
                        : q
                )
            );
            showToast(`Quest completed! +${rewardCredits} credits, +${rewardExp} EXP`, 'success');
            await refreshUser();
        } catch (err: unknown) {
            const msg =
                (err as { response?: { data?: { error?: string; itemName?: string } } })?.response?.data?.error;
            if (msg === 'QUEST_ALREADY_COMPLETED') showToast('Quest already completed.', 'error');
            else if (msg === 'INSUFFICIENT_ITEM') {
                const item =
                    (err as { response?: { data?: { itemName?: string } } })?.response?.data?.itemName ?? 'item';
                showToast(`Not enough: ${item}`, 'error');
            } else if (msg === 'QUEST_EXPIRED') showToast('This quest has expired.', 'error');
            else showToast('Failed to submit quest.', 'error');
        } finally {
            setSubmitting(null);
        }
    }

    const completedCount = quests.filter((q) => q.completed).length;
    const totalQuests = quests.length;

    return (
        <div
            style={{
                minHeight: '100vh',
                background: 'linear-gradient(135deg, #0f0f1a 0%, #0a0a12 100%)',
                padding: '1.5rem',
            }}
        >
            {/* Toast */}
            <AnimatePresence>
                {toast && (
                    <motion.div
                        key="toast"
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        style={{
                            position: 'fixed',
                            top: '1.25rem',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            zIndex: 9999,
                            background: toast.type === 'success'
                                ? 'rgba(52, 211, 153, 0.18)'
                                : 'rgba(248, 113, 113, 0.18)',
                            border: `1px solid ${toast.type === 'success' ? 'rgba(52,211,153,0.4)' : 'rgba(248,113,113,0.4)'}`,
                            color: toast.type === 'success' ? '#6ee7b7' : '#fca5a5',
                            borderRadius: '0.75rem',
                            padding: '0.65rem 1.2rem',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            backdropFilter: 'blur(12px)',
                            boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
                        }}
                    >
                        {toast.msg}
                    </motion.div>
                )}
            </AnimatePresence>

            <div style={{ maxWidth: '56rem', margin: '0 auto' }}>
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: -12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '1.5rem',
                        flexWrap: 'wrap',
                        gap: '0.75rem',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <motion.button
                            whileHover={{ scale: 1.06 }}
                            whileTap={{ scale: 0.94 }}
                            onClick={() => navigate('/dashboard')}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.4rem',
                                background: 'rgba(99,102,241,0.12)',
                                border: '1px solid rgba(99,102,241,0.3)',
                                borderRadius: '0.6rem',
                                color: '#c7d2fe',
                                padding: '0.42rem 0.75rem',
                                cursor: 'pointer',
                                fontSize: '0.8rem',
                                fontWeight: 600,
                            }}
                        >
                            <ArrowLeft size={14} /> Back
                        </motion.button>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    width: '2.25rem',
                                    height: '2.25rem',
                                    borderRadius: '0.65rem',
                                    background: `linear-gradient(135deg, ${theme.glow}, rgba(99,102,241,0.1))`,
                                    border: `1px solid ${theme.border}`,
                                }}
                            >
                                <ClipboardList size={16} style={{ color: theme.accent }} />
                            </div>
                            <div>
                                <h1
                                    style={{
                                        fontSize: '1.15rem',
                                        fontWeight: 700,
                                        background: `linear-gradient(135deg, ${theme.accent}, #e0e7ff)`,
                                        WebkitBackgroundClip: 'text',
                                        WebkitTextFillColor: 'transparent',
                                        lineHeight: 1,
                                    }}
                                >
                                    Daily Quests
                                </h1>
                                <span style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.1rem', display: 'block' }}>
                                    {cityKey} · Resets in {resetLabel}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        {/* Progress pill */}
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.4rem',
                                background: theme.bg,
                                border: `1px solid ${theme.border}`,
                                borderRadius: '9999px',
                                padding: '0.35rem 0.8rem',
                                fontSize: '0.78rem',
                                color: theme.accent,
                                fontWeight: 700,
                            }}
                        >
                            <CheckCircle2 size={13} />
                            {completedCount} / {totalQuests} done
                        </div>

                        <motion.button
                            whileHover={{ scale: 1.06 }}
                            whileTap={{ scale: 0.94 }}
                            onClick={fetchQuests}
                            disabled={loading}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.4rem',
                                background: 'rgba(99,102,241,0.1)',
                                border: '1px solid rgba(99,102,241,0.25)',
                                borderRadius: '0.6rem',
                                color: '#a5b4fc',
                                padding: '0.42rem 0.7rem',
                                cursor: loading ? 'not-allowed' : 'pointer',
                                fontSize: '0.78rem',
                                fontWeight: 600,
                            }}
                        >
                            <RefreshCw size={13} style={{ animation: loading ? 'spin 0.8s linear infinite' : 'none' }} />
                            Refresh
                        </motion.button>
                    </div>
                </motion.div>

                {/* Progress bar */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.15 }}
                    style={{
                        background: 'rgba(255,255,255,0.05)',
                        borderRadius: '9999px',
                        height: '6px',
                        marginBottom: '1.5rem',
                        overflow: 'hidden',
                    }}
                >
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: totalQuests > 0 ? `${(completedCount / totalQuests) * 100}%` : '0%' }}
                        transition={{ duration: 0.6, ease: 'easeOut' }}
                        style={{
                            height: '100%',
                            background: `linear-gradient(90deg, ${theme.accent}, #818cf8)`,
                            borderRadius: '9999px',
                        }}
                    />
                </motion.div>

                {/* All completed banner */}
                <AnimatePresence>
                    {completedCount === totalQuests && totalQuests > 0 && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.6rem',
                                background: 'rgba(52, 211, 153, 0.1)',
                                border: '1px solid rgba(52, 211, 153, 0.35)',
                                borderRadius: '0.75rem',
                                padding: '0.85rem 1.2rem',
                                marginBottom: '1.5rem',
                                color: '#6ee7b7',
                                fontWeight: 700,
                                fontSize: '0.88rem',
                            }}
                        >
                            <Sparkles size={16} />
                            All daily quests completed! Come back after reset for new quests.
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Quest grid */}
                {loading ? (
                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.85rem',
                        }}
                    >
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div
                                key={i}
                                style={{
                                    height: '7rem',
                                    borderRadius: '0.85rem',
                                    background: 'rgba(255,255,255,0.04)',
                                    animation: 'pulse 1.5s ease-in-out infinite',
                                }}
                            />
                        ))}
                    </div>
                ) : quests.length === 0 ? (
                    <div
                        style={{
                            textAlign: 'center',
                            color: '#64748b',
                            padding: '3rem',
                            fontSize: '0.9rem',
                        }}
                    >
                        No quests available for your city yet.
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                        {quests.map((quest, idx) => (
                            <QuestCard
                                key={quest.id}
                                quest={quest}
                                theme={theme}
                                index={idx}
                                isSubmitting={submitting === quest.id}
                                onSubmit={handleSubmit}
                            />
                        ))}
                    </div>
                )}
            </div>

            <style>{`
                @keyframes pulse {
                    0%, 100% { opacity: 0.5; }
                    50% { opacity: 1; }
                }
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
};

interface QuestCardProps {
    quest: DailyQuest;
    theme: typeof DEFAULT_THEME;
    index: number;
    isSubmitting: boolean;
    onSubmit: (quest: DailyQuest) => void;
}

const QuestCard = ({ quest, theme, index, isSubmitting, onSubmit }: QuestCardProps) => {
    const isCompleted = quest.completed;

    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.38, delay: index * 0.06 }}
            style={{
                background: isCompleted
                    ? 'rgba(52, 211, 153, 0.04)'
                    : theme.bg,
                border: `1px solid ${isCompleted ? 'rgba(52,211,153,0.25)' : theme.border}`,
                borderRadius: '0.85rem',
                padding: '1rem 1.15rem',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '1rem',
                position: 'relative',
                overflow: 'hidden',
                transition: 'border-color 0.2s',
            }}
        >
            {/* Completed overlay shimmer */}
            {isCompleted && (
                <div
                    style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'linear-gradient(90deg, transparent, rgba(52,211,153,0.04), transparent)',
                        pointerEvents: 'none',
                    }}
                />
            )}

            {/* Status icon */}
            <div
                style={{
                    flexShrink: 0,
                    marginTop: '0.1rem',
                    color: isCompleted ? '#34d399' : theme.accent,
                }}
            >
                {isCompleted ? <CheckCircle2 size={22} /> : <Circle size={22} />}
            </div>

            {/* Content */}
            <div style={{ flex: 1, minWidth: 0 }}>
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: '0.75rem',
                        flexWrap: 'wrap',
                    }}
                >
                    <div>
                        <h3
                            style={{
                                fontSize: '0.9rem',
                                fontWeight: 700,
                                color: isCompleted ? '#6ee7b7' : '#e2e8f0',
                                textDecoration: isCompleted ? 'line-through' : 'none',
                                opacity: isCompleted ? 0.7 : 1,
                                marginBottom: '0.2rem',
                            }}
                        >
                            {quest.title}
                        </h3>
                        <p
                            style={{
                                fontSize: '0.76rem',
                                color: '#64748b',
                                margin: 0,
                                lineHeight: 1.4,
                            }}
                        >
                            {quest.description}
                        </p>
                    </div>

                    {/* Rewards */}
                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.3rem',
                            alignItems: 'flex-end',
                            flexShrink: 0,
                        }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.3rem',
                                fontSize: '0.76rem',
                                fontWeight: 700,
                                color: '#6ee7b7',
                                background: 'rgba(52,211,153,0.08)',
                                border: '1px solid rgba(52,211,153,0.2)',
                                borderRadius: '9999px',
                                padding: '0.22rem 0.55rem',
                            }}
                        >
                            <Coins size={11} />
                            +{quest.rewardCredits}
                        </div>
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.3rem',
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                color: '#fbbf24',
                                background: 'rgba(251,191,36,0.08)',
                                border: '1px solid rgba(251,191,36,0.2)',
                                borderRadius: '9999px',
                                padding: '0.2rem 0.5rem',
                            }}
                        >
                            <Star size={10} />
                            +{quest.rewardExp} EXP
                        </div>
                    </div>
                </div>

                {/* Requirements */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.55rem',
                        marginTop: '0.75rem',
                        flexWrap: 'wrap',
                    }}
                >
                    <span style={{ fontSize: '0.7rem', color: '#475569', fontWeight: 600 }}>
                        Deliver:
                    </span>
                    {quest.requirements.map((req) => (
                        <div
                            key={req.itemId}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid rgba(255,255,255,0.08)',
                                borderRadius: '0.5rem',
                                padding: '0.25rem 0.55rem',
                                fontSize: '0.74rem',
                                color: '#cbd5e1',
                                fontWeight: 600,
                            }}
                        >
                            {(() => {
                                const src = getImageByName(req.itemName);
                                return src ? (
                                    <img src={src} alt={req.itemName} width={16} height={16} style={{ width: 16, height: 16, objectFit: 'contain' }} />
                                ) : (
                                    <span style={{ fontSize: 14 }}>{req.itemIcon}</span>
                                );
                            })()}
                            <span>{req.itemName}</span>
                            <span style={{ color: theme.accent, fontWeight: 700 }}>×{req.quantity}</span>
                        </div>
                    ))}

                    {/* Submit button */}
                    <motion.button
                        whileHover={!isCompleted && !isSubmitting ? { scale: 1.04 } : {}}
                        whileTap={!isCompleted && !isSubmitting ? { scale: 0.96 } : {}}
                        onClick={() => !isCompleted && !isSubmitting && onSubmit(quest)}
                        disabled={isCompleted || isSubmitting}
                        style={{
                            marginLeft: 'auto',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            background: isCompleted
                                ? 'rgba(52,211,153,0.1)'
                                : isSubmitting
                                    ? 'rgba(99,102,241,0.14)'
                                    : `linear-gradient(135deg, ${theme.glow}, rgba(99,102,241,0.15))`,
                            border: `1px solid ${isCompleted ? 'rgba(52,211,153,0.3)' : 'rgba(99,102,241,0.3)'}`,
                            borderRadius: '0.6rem',
                            color: isCompleted ? '#6ee7b7' : '#c7d2fe',
                            padding: '0.38rem 0.85rem',
                            cursor: isCompleted || isSubmitting ? 'not-allowed' : 'pointer',
                            fontSize: '0.77rem',
                            fontWeight: 700,
                            opacity: isCompleted ? 0.7 : 1,
                            flexShrink: 0,
                        }}
                    >
                        {isSubmitting ? (
                            <>
                                <Zap size={12} style={{ animation: 'spin 0.7s linear infinite' }} />
                                Submitting…
                            </>
                        ) : isCompleted ? (
                            <>
                                <CheckCircle2 size={12} />
                                Completed
                            </>
                        ) : (
                            <>
                                <Zap size={12} />
                                Submit
                            </>
                        )}
                    </motion.button>
                </div>
            </div>
        </motion.div>
    );
};

export default QuestPage;
