import { useEffect, useState, useMemo, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { normalizeUserJobFields, useAuthStore } from '../stores/authStore';
import { useGameStore } from '../stores/gameStore';
import { getExpProgress } from '../lib/gameConstants';
import {
    User as UserIcon,
    Briefcase,
    Award,
    Zap,
    Crown,
    Lock,
    Unlock,
    TrendingUp,
    Sprout,
    UtensilsCrossed,
    Pickaxe,
    Hammer,
} from 'lucide-react';

import iconCityStatusPng from '../assets/items/ui/icon_city_status.png';
import iconActiveOrdersPng from '../assets/items/ui/icon_active_orders.png';
import iconInventoryPng from '../assets/items/ui/icon_inventory.png';

import HungerBar from '../components/HungerBar';
import InventoryGrid from '../components/InventoryGrid';
import WorkspacePanel from '../components/WorkspacePanel';
import AgrariaActiveOrders from '../components/active-orders/AgrariaActiveOrders';
import FerrumActiveOrders from '../components/active-orders/FerrumActiveOrders';
import MedicoActiveOrders from '../components/active-orders/MedicoActiveOrders';
import VoltaraActiveOrders from '../components/active-orders/VoltaraActiveOrders';
import TextilisActiveOrders from '../components/active-orders/TextilisActiveOrders';
import ActiveOrdersGrid from '../components/ActiveOrdersGrid';
import api from '../lib/api';
import { getEquipmentRarityColor, getEquipmentRarityLabel, getEquipmentRarityMultiplier } from '../lib/equipmentRarity';
import { useTranslation } from 'react-i18next';
import TopNavBar from '../components/TopNavBar';

type SkillBranchKey = string;

interface JobSkillTreeData {
    points: {
        total: number;
        spent: number;
        available: number;
    };
    treeTitle?: string;
    occupationLabel?: string;
    branches: Record<string, {
        title: string;
        level: number;
        color: string;
        effects: Record<string, string>;
    }>;
}

interface GovernanceCandidate {
    user_id: number;
    email: string;
    votes: number;
    is_mayor: boolean;
}

interface CityGovernanceData {
    city_key: string | null;
    cycle: {
        cycleId: number;
        cycleStart: string;
        cycleEnd: string;
    };
    taxes: {
        domesticPct: number;
        exportPct: number;
        importPct: number;
    } | null;
    mayor: { userId: number } | null;
    candidates: GovernanceCandidate[];
    canSetTaxes: boolean;
    userVoteCandidateId: number | null;
}

const ROLE_THEME: Record<string, { color: string; bg: string; border: string }> = {
    MAYOR: {
        color: '#fbbf24',
        bg: 'rgba(251, 191, 36, 0.16)',
        border: '1px solid rgba(251, 191, 36, 0.4)',
    },
    CITIZEN: {
        color: '#22d3ee',
        bg: 'rgba(34, 211, 238, 0.14)',
        border: '1px solid rgba(34, 211, 238, 0.35)',
    },
};

const CITY_TIER_THRESHOLDS = [
    0,
    20_000_000,
    40_000_000,
    70_000_000,
    120_000_000,
    250_000_000,
    400_000_000,
    600_000_000,
    850_000_000,
    1_100_000_000,
];

const DashboardPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { user, fetchMe } = useAuthStore();
    const {
        hunger,
        equipment,
        tickHunger,
        tickDurability,
        fetchCritical,
        fetchBackground,
        fetchWorkOrders,
        actionMessage,
        clearMessage
    } = useGameStore();
    const [showFirstJobSkillModal, setShowFirstJobSkillModal] = useState(false);
    const [firstJobSkillTree, setFirstJobSkillTree] = useState<JobSkillTreeData | null>(null);
    const [showSecondaryJobSkillModal, setShowSecondaryJobSkillModal] = useState(false);
    const [secondaryJobSkillTree, setSecondaryJobSkillTree] = useState<JobSkillTreeData | null>(null);
    const [skillLoading, setSkillLoading] = useState(false);
    const [governance, setGovernance] = useState<CityGovernanceData | null>(null);
    const [selectedCandidateId, setSelectedCandidateId] = useState<number | null>(null);
    const [isVoting, setIsVoting] = useState(false);
    const [isSavingTaxes, setIsSavingTaxes] = useState(false);
    const [taxDraft, setTaxDraft] = useState({ domesticPct: 3, exportPct: 3, importPct: 3 });
    const [viewportWidth, setViewportWidth] = useState<number>(() =>
        typeof window !== 'undefined' ? window.innerWidth : 1280
    );

    const mergeAuthUser = (nextUser: any) => {
        const prevUser = useAuthStore.getState().user as any;
        const merged = prevUser ? { ...prevUser, ...nextUser } : nextUser;
        useAuthStore.setState({ user: normalizeUserJobFields(merged) });
    };

    const fetchGovernance = async () => {
        const { data } = await api.get('/game/city/governance');
        const next = (data?.governance ?? null) as CityGovernanceData | null;
        setGovernance(next);
        if (next?.taxes) {
            setTaxDraft({
                domesticPct: Number(next.taxes.domesticPct ?? 3),
                exportPct: Number(next.taxes.exportPct ?? 3),
                importPct: Number(next.taxes.importPct ?? 3),
            });
        }
        setSelectedCandidateId(next?.userVoteCandidateId ?? null);
    };

    const submitVoteMayor = async () => {
        if (!selectedCandidateId) return;
        try {
            setIsVoting(true);
            const { data } = await api.post('/game/city/vote-mayor', { candidateUserId: selectedCandidateId });
            if (data?.governance) {
                setGovernance(data.governance as CityGovernanceData);
            } else {
                await fetchGovernance();
            }
            await fetchMe();
            useGameStore.getState().setActionMessage(data?.message ?? t('dashboard.vote_submitted'));
        } catch (err: any) {
            useGameStore.getState().setActionMessage(err.response?.data?.error || t('dashboard.vote_failed'));
        } finally {
            setIsVoting(false);
        }
    };

    const saveCityTaxes = async () => {
        try {
            setIsSavingTaxes(true);
            const { data } = await api.post('/game/city/taxes', {
                domesticPct: Number(taxDraft.domesticPct),
                exportPct: Number(taxDraft.exportPct),
                importPct: Number(taxDraft.importPct),
            });
            if (data?.governance) {
                setGovernance(data.governance as CityGovernanceData);
            } else {
                await fetchGovernance();
            }
            await fetchMe();
            useGameStore.getState().setActionMessage(data?.message ?? t('dashboard.taxes_updated'));
        } catch (err: any) {
            useGameStore.getState().setActionMessage(err.response?.data?.error || t('dashboard.taxes_update_failed'));
        } finally {
            setIsSavingTaxes(false);
        }
    };

    useEffect(() => {
        const init = async () => {
            try {
                // 1. Fetch user profile first so hunger/city is known
                await fetchMe();
                // 2. Fetch critical data (inventory + work orders + config) for fast render
                await fetchCritical();
                // 3. Load governance and background data in parallel — non-blocking
                Promise.all([
                    fetchBackground(),
                    fetchGovernance(),
                ]).catch(() => {});
            } catch {
                navigate('/');
            }
        };
        init();

        // Game loop (hunger decay + durability decay)
        const interval = setInterval(() => {
            tickHunger();
            tickDurability();
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    // Clear message after 3 seconds
    useEffect(() => {
        if (actionMessage) {
            const timer = setTimeout(clearMessage, 3000);
            return () => clearTimeout(timer);
        }
    }, [actionMessage]);

    useEffect(() => {
        const onResize = () => setViewportWidth(window.innerWidth);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    // Stable ember particles — must be declared before any early return (Rules of Hooks)
    const embers = useMemo(() =>
        Array.from({ length: 20 }, (_, i) => ({
            id: i,
            left: `${5 + Math.random() * 90}%`,
            delay: `${Math.random() * 10}s`,
            duration: `${7 + Math.random() * 9}s`,
            size: `${2 + Math.random() * 3}px`,
            drift: `${-30 + Math.random() * 60}px`,
            hue: Math.random() > 0.5 ? '#fbbf24' : '#f97316',
        })), []);

    if (!user) {
        return (
            <div
                style={{
                    display: 'flex',
                    height: '100vh',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#0a0e17',
                    color: 'white',
                    fontSize: '1rem',
                }}
            >
                <motion.div
                    animate={{ opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                >
                    {t('common.loading')}
                </motion.div>
            </div>
        );
    }

    const firstJobLevel = Number(user.first_job_level ?? 0);
    const secondaryJobLevel = Number(user.secondary_job_level ?? 0);
    const firstJobLabel = user.city?.occupation_labels?.first_job
        ?? (user.city?.workspace_modes?.first_job === 'MINE' ? 'Miner' : 'First Job');
    const secondaryJobLabel = user.city?.occupation_labels?.secondary_job
        ?? (user.city?.workspace_modes?.secondary_job === 'SMELT' ? 'Blacksmith' : 'Secondary Job');
    const firstJobIcon = user.city?.workspace_modes?.first_job === 'MINE' ? <Pickaxe size={16} /> : <Sprout size={16} />;
    const secondaryJobIcon = user.city?.workspace_modes?.secondary_job === 'SMELT' ? <Hammer size={16} /> : <UtensilsCrossed size={16} />;
    const firstJobProgress = getExpProgress(user.first_job_exp ?? 0, firstJobLevel);
    const secondaryJobProgress = getExpProgress(user.secondary_job_exp ?? 0, secondaryJobLevel);

    type JobSlotKey = 'first_job' | 'secondary_job';
    type JobSkillEndpoint = 'first-job' | 'secondary-job';

    const slotToSkillEndpoint: Record<JobSlotKey, JobSkillEndpoint> = {
        first_job: 'first-job',
        secondary_job: 'secondary-job',
    };

    const jobUiBySlot: Record<JobSlotKey, {
        label: string;
        icon: ReactNode;
        level: number;
        progress: ReturnType<typeof getExpProgress>;
        color: string;
        bgColor: string;
        borderColor: string;
        glowColor: string;
    }> = {
        first_job: {
            label: firstJobLabel,
            icon: firstJobIcon,
            level: firstJobLevel,
            progress: firstJobProgress,
            color: '#22d3ee',
            bgColor: 'rgba(34, 211, 238, 0.09)',
            borderColor: 'rgba(34, 211, 238, 0.32)',
            glowColor: 'rgba(34, 211, 238, 0.2)',
        },
        secondary_job: {
            label: secondaryJobLabel,
            icon: secondaryJobIcon,
            level: secondaryJobLevel,
            progress: secondaryJobProgress,
            color: '#f97316',
            bgColor: 'rgba(249, 115, 22, 0.09)',
            borderColor: 'rgba(249, 115, 22, 0.32)',
            glowColor: 'rgba(249, 115, 22, 0.2)',
        },
    };

    const firstJob = jobUiBySlot.first_job;
    const secondaryJob = jobUiBySlot.secondary_job;
    const userRole = String(user.role ?? 'CITIZEN').toUpperCase();
    const roleTheme = ROLE_THEME[userRole] ?? ROLE_THEME.CITIZEN;
    const mayorCandidate = governance?.candidates?.find((candidate) => candidate.is_mayor);
    const electionEndText = governance?.cycle?.cycleEnd
        ? new Date(governance.cycle.cycleEnd).toLocaleString()
        : '-';

    // Determine if the second occupation can be unlocked
    const secondaryLevel = secondaryJob.level;
    const canUnlockSecond = secondaryLevel < 1;

    const handleUnlock = async () => {
        try {
            await useAuthStore.getState().unlockOccupation();
            // Re-fetch game data to show new shop items
            useGameStore.getState().fetchShop();
            useGameStore.getState().fetchRecipes();
            useGameStore.getState().fetchRecipeShop();
        } catch {
            // Error is handled in the store
        }
    };

    const fetchSkillTree = async (jobSlot: JobSlotKey) => {
        try {
            setSkillLoading(true);
            const endpoint = slotToSkillEndpoint[jobSlot];
            const { data } = await api.get(`/game/skills/${endpoint}`);
            return data.skillTree as JobSkillTreeData;
        } finally {
            setSkillLoading(false);
        }
    };

    const openFirstJobSkillModal = async () => {
        setShowFirstJobSkillModal(true);
        const tree = await fetchSkillTree('first_job');
        setFirstJobSkillTree(tree);
    };

    const openSecondaryJobSkillModal = async () => {
        setShowSecondaryJobSkillModal(true);
        const tree = await fetchSkillTree('secondary_job');
        setSecondaryJobSkillTree(tree);
    };

    const renderBranchEffects = (effects: Record<string, string> | undefined, level: number, color: string) => (
        <div style={{ fontSize: '0.64rem', lineHeight: 1.45, display: 'flex', flexDirection: 'column', gap: '0.12rem' }}>
            {Array.from({ length: 5 }, (_, idx) => {
                const rank = idx + 1;
                const key = `level${rank}`;
                const text = effects?.[key] ?? `Lv.${rank} effect`;
                return (
                    <span
                        key={key}
                        style={{
                            color: level >= rank ? color : 'rgba(255,255,255,0.55)',
                            fontWeight: level >= rank ? 700 : 500,
                        }}
                    >
                        {text}
                    </span>
                );
            })}
        </div>
    );

    const upgradeSkill = async (jobSlot: JobSlotKey, branch: SkillBranchKey) => {
        try {
            setSkillLoading(true);
            const endpoint = slotToSkillEndpoint[jobSlot];
            const { data } = await api.post(`/game/skills/${endpoint}/upgrade`, { branch });
            if (jobSlot === 'first_job') {
                setFirstJobSkillTree(data.skillTree);
            } else {
                setSecondaryJobSkillTree(data.skillTree);
            }
            if (data.user) {
                mergeAuthUser(data.user);
            } else {
                await fetchMe();
            }
            await fetchWorkOrders();
            useGameStore.getState().setActionMessage(data.message ?? t('dashboard.skill_upgraded'));
        } catch (err: any) {
            useGameStore.getState().setActionMessage(err.response?.data?.error || t('dashboard.skill_upgrade_failed'));
        } finally {
            setSkillLoading(false);
        }
    };

    const formatDuration = (ms: number) => {
        const totalSec = Math.max(0, Math.floor(ms / 1000));
        const mins = Math.floor(totalSec / 60);
        const secs = totalSec % 60;
        return `${mins}m ${secs}s`;
    };

    const foodBuffRemainingMs = user.buff_expires_at
        ? new Date(user.buff_expires_at).getTime() - Date.now()
        : 0;
    const hasActiveFoodBuff = Number(user.satiety_buff ?? 0) > 0 && foodBuffRemainingMs > 0;

    const formatEquipmentEffect = (eq: (typeof equipment)[number]) => {
        const key = eq.effect_key;
        const m = getEquipmentRarityMultiplier(eq.item_rarity);
        const v = Number(eq.effect_value ?? 0) * m;
        const v2 = Number(eq.effect_value2 ?? 0) * m;

        if (!key) return null;
        if (key === 'hunger_penalty_tier_reduction') return `Hunger penalty tier -${v}`;
        if (key === 'cook_secondary_ingredient_save_chance') return `Save secondary ingredients ${Math.round(v * 100)}%`;
        if (key === 'max_hunger_bonus') return `Max hunger +${v}`;
        if (key === 'max_hunger_and_satiety_bonus') return `Max hunger +${v}, extra satiety +${Math.round(v2 * 100)}%`;
        if (key === 'raw_stack_bonus') return `Raw stack +${v}`;
        if (key === 'ingredient_stack_bonus') return `Ingredient stack +${v}`;
        if (key === 'farm_time_reduction_pct') return `Farm time -${Math.round(v * 100)}%`;
        if (key === 'cook_time_reduction_pct') return `Cook time -${Math.round(v * 100)}%`;
        if (key === 'farm_double_yield_chance') return `Farm double yield ${Math.round(v * 100)}%`;
        if (key === 'gourmet_chance') return `Gourmet chance ${Math.round(v * 100)}%`;
        if (key === 'hunger_decay_reduction_per_min') return `Hunger decay -${v}/min`;
        if (key === 'cook_state_hunger_decay_reduction_pct') return `During cooking decay -${Math.round(v * 100)}%`;
        return key;
    };

    const activeEquipmentBuffs = equipment
        .filter((eq) => !!eq.item_id && !!eq.effect_key)
        .map((eq) => {
            const dur = Number(eq.durability ?? 100);
            const isBroken = dur <= 0;
            return {
                slot: eq.slot,
                name: eq.item_name ?? eq.slot,
                rarity: getEquipmentRarityLabel(eq.item_rarity),
                color: getEquipmentRarityColor(eq.item_rarity),
                description: isBroken ? null : formatEquipmentEffect(eq),
                durability: dur,
                isBroken,
            };
        })
        .filter((row) => !!row.description || row.isBroken);

    const cityTier = Math.max(1, Math.min(10, Number(user.city?.tier ?? 1)));
    const cityTreasury = Math.max(0, Number(user.city?.treasury ?? 0));
    const currentTierFloor = CITY_TIER_THRESHOLDS[Math.max(0, cityTier - 1)] ?? 0;
    const nextTierTarget = cityTier >= 10 ? null : (CITY_TIER_THRESHOLDS[cityTier] ?? null);
    const tierSpan = nextTierTarget !== null ? Math.max(1, nextTierTarget - currentTierFloor) : 1;
    const treasuryInTier = nextTierTarget !== null
        ? Math.max(0, Math.min(tierSpan, cityTreasury - currentTierFloor))
        : tierSpan;
    const cityProgressPct = nextTierTarget !== null ? Math.min(100, (treasuryInTier / tierSpan) * 100) : 100;
    const remainingToNextTier = nextTierTarget !== null ? Math.max(0, nextTierTarget - cityTreasury) : 0;
    const isMobile = viewportWidth < 900;
    const isTablet = viewportWidth >= 900 && viewportWidth < 1200;
    const topSummaryGridTemplate = viewportWidth < 1100 ? '1fr' : '1.1fr 1.9fr';
    const dashboardGridTemplate = isMobile ? '1fr' : isTablet ? 'repeat(2, minmax(0, 1fr))' : '1.15fr 1fr 1fr';
    const panelHeight = isMobile ? 'auto' : isTablet ? '30rem' : '32rem';

    return (
        <div
            className="bg-forge"
            style={{
                minHeight: '100vh',
                color: '#f1f5f9',
                fontFamily: "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif",
                position: 'relative',
                overflow: 'hidden',
            }}
        >
            {/* ─── Ember Particles ─────────────────────────────── */}
            <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
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
                <div style={{ position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '70%', height: '220px', background: 'radial-gradient(ellipse at bottom, rgba(234,88,12,0.1) 0%, transparent 70%)' }} />
                <motion.div
                    style={{ position: 'absolute', width: '500px', height: '500px', borderRadius: '50%', background: 'radial-gradient(circle, #f59e0b 0%, transparent 70%)', top: '-5%', right: '-5%', opacity: 0.06 }}
                    animate={{ x: [0, -30, 0], y: [0, 20, 0] }}
                    transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }}
                />
                <motion.div
                    style={{ position: 'absolute', width: '400px', height: '400px', borderRadius: '50%', background: 'radial-gradient(circle, #fb923c 0%, transparent 70%)', bottom: '10%', left: '-5%', opacity: 0.05 }}
                    animate={{ x: [0, 40, 0], y: [0, -30, 0] }}
                    transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
                />
            </div>

            {/* ─── Top Bar ───────────────────────────────────────── */}
            <TopNavBar />

            {/* ─── Action Message Toast ──────────────────────────── */}
            <div
                style={{
                    position: 'fixed',
                    top: isMobile ? '4.5rem' : '5rem',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    zIndex: 50,
                    pointerEvents: 'none',
                }}
            >
                <AnimatePresence>
                    {actionMessage && (
                        <motion.div
                            initial={{ opacity: 0, y: -20, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -20, scale: 0.9 }}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.75rem',
                                borderRadius: '9999px',
                                background: 'rgba(17, 24, 39, 0.9)',
                                padding: '0.75rem 1.5rem',
                                fontSize: '0.875rem',
                                fontWeight: 500,
                                color: '#e2e8f0',
                                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 20px rgba(245, 158, 11, 0.18)',
                                backdropFilter: 'blur(12px)',
                                border: '1px solid rgba(245, 158, 11, 0.2)',
                                pointerEvents: 'auto',
                            }}
                        >
                            <motion.span
                                animate={{ opacity: [0.4, 1, 0.4] }}
                                transition={{ duration: 1.5, repeat: Infinity }}
                                style={{
                                    display: 'inline-block',
                                    width: '0.5rem',
                                    height: '0.5rem',
                                    borderRadius: '9999px',
                                    background: '#f59e0b',
                                }}
                            />
                            {actionMessage}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* ─── Main Content Grid ────────────────────────────── */}
            <main
                style={{
                    maxWidth: '1280px',
                    margin: '0 auto',
                    padding: isMobile ? '1rem' : '1.5rem',
                    position: 'relative',
                    zIndex: 1,
                }}
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: topSummaryGridTemplate,
                            gap: '1rem',
                            alignItems: 'stretch',
                        }}
                    >
                        <motion.section
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.45, delay: 0.06 }}
                            className="glass-card glow-indigo"
                            style={{
                                padding: '0.85rem 0.95rem',
                                overflow: 'hidden',
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.8rem', flexWrap: 'wrap' }}>
                                <div>
                                    <h2
                                        style={{
                                            fontSize: '1.1rem',
                                            fontWeight: 700,
                                            color: '#f1f5f9',
                                            marginBottom: '0.35rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.45rem',
                                        }}
                                    >
                                        <img src={iconCityStatusPng} alt="City Status" style={{ width: '1rem', height: '1rem', objectFit: 'contain' }} /> {t('dashboard.city_status')}
                                    </h2>
                                    <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.78)' }}>
                                        {t('dashboard.current_city')}: <strong style={{ color: '#fde68a' }}>{user.city?.name ?? user.city_key ?? t('common.unknown')}</strong>
                                        {' '}• {t('dashboard.tier')} {cityTier}
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                                    <div style={{ fontSize: '0.68rem', border: '1px solid rgba(245,158,11,0.22)', borderRadius: '0.5rem', padding: '0.28rem 0.45rem', background: 'rgba(245,158,11,0.07)' }}>
                                        {t('dashboard.taxes.domestic')}: <span style={{ color: '#fde68a', fontWeight: 700 }}>{user.city?.taxes?.domesticPct ?? 0}%</span>
                                    </div>
                                    <div style={{ fontSize: '0.68rem', border: '1px solid rgba(245,158,11,0.22)', borderRadius: '0.5rem', padding: '0.28rem 0.45rem', background: 'rgba(245,158,11,0.07)' }}>
                                        {t('dashboard.taxes.export')}: <span style={{ color: '#fca5a5', fontWeight: 700 }}>{user.city?.taxes?.exportPct ?? 0}%</span>
                                    </div>
                                    <div style={{ fontSize: '0.68rem', border: '1px solid rgba(245,158,11,0.22)', borderRadius: '0.5rem', padding: '0.28rem 0.45rem', background: 'rgba(245,158,11,0.07)' }}>
                                        {t('dashboard.taxes.import')}: <span style={{ color: '#86efac', fontWeight: 700 }}>{user.city?.taxes?.importPct ?? 0}%</span>
                                    </div>
                                </div>
                            </div>

                            <div
                                style={{
                                    marginTop: '0.7rem',
                                    borderRadius: '0.7rem',
                                    border: '1px solid rgba(245,158,11,0.15)',
                                    background: 'rgba(245,158,11,0.05)',
                                    padding: '0.65rem 0.72rem',
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.7rem', flexWrap: 'wrap' }}>
                                    <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.85)' }}>
                                        {t('dashboard.mayor')}: <span style={{ color: '#fcd34d', fontWeight: 700 }}>{mayorCandidate?.email?.split('@')[0] ?? t('common.none')}</span>
                                    </div>
                                    <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.62)' }}>
                                        {t('dashboard.election_ends')}: {electionEndText}
                                    </div>
                                </div>

                                <div style={{ marginTop: '0.55rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                    {(governance?.candidates ?? []).slice(0, 6).map((candidate) => {
                                        const isSelected = selectedCandidateId === candidate.user_id;
                                        const isMayor = candidate.is_mayor;
                                        return (
                                            <button
                                                key={candidate.user_id}
                                                type="button"
                                                onClick={() => setSelectedCandidateId(candidate.user_id)}
                                                style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    borderRadius: '0.55rem',
                                                    border: isSelected
                                                        ? '1px solid rgba(56,189,248,0.7)'
                                                        : '1px solid rgba(148,163,184,0.24)',
                                                    background: isSelected
                                                        ? 'rgba(56,189,248,0.12)'
                                                        : 'rgba(22,13,5,0.5)',
                                                    color: '#e2e8f0',
                                                    fontSize: '0.69rem',
                                                    padding: '0.38rem 0.5rem',
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                <span>
                                                    {candidate.email.split('@')[0]} {isMayor ? '👑' : ''}
                                                </span>
                                                <span style={{ color: '#fbbf24', fontWeight: 700 }}>{t('dashboard.votes_count', { count: candidate.votes })}</span>
                                            </button>
                                        );
                                    })}
                                    {(governance?.candidates?.length ?? 0) === 0 && (
                                        <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.6)' }}>
                                            {t('dashboard.no_candidates')}
                                        </div>
                                    )}
                                </div>

                                <div style={{ marginTop: '0.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                                    <button
                                        type="button"
                                        disabled={isVoting || !selectedCandidateId}
                                        onClick={submitVoteMayor}
                                        style={{
                                            borderRadius: '0.55rem',
                                            border: '1px solid rgba(56,189,248,0.4)',
                                            background: 'rgba(56,189,248,0.12)',
                                            color: '#fde68a',
                                            fontSize: '0.68rem',
                                            fontWeight: 700,
                                            padding: '0.35rem 0.65rem',
                                            cursor: isVoting || !selectedCandidateId ? 'not-allowed' : 'pointer',
                                            opacity: isVoting || !selectedCandidateId ? 0.6 : 1,
                                        }}
                                    >
                                        {isVoting ? t('dashboard.submitting') : t('dashboard.vote_mayor')}
                                    </button>
                                </div>

                                {governance?.canSetTaxes && (
                                    <div style={{ marginTop: '0.65rem', paddingTop: '0.65rem', borderTop: '1px solid rgba(148,163,184,0.2)' }}>
                                        <div style={{ fontSize: '0.68rem', color: '#fcd34d', fontWeight: 700, marginBottom: '0.42rem' }}>
                                            {t('dashboard.mayor_tax_controls')}
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.4rem' }}>
                                            {([
                                                ['domesticPct', t('dashboard.taxes.domestic')],
                                                ['exportPct', t('dashboard.taxes.export')],
                                                ['importPct', t('dashboard.taxes.import')],
                                            ] as const).map(([key, label]) => (
                                                <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                                    <span style={{ fontSize: '0.63rem', color: '#cbd5e1' }}>{label}</span>
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        max={12}
                                                        step={0.5}
                                                        value={taxDraft[key]}
                                                        onChange={(event) => {
                                                            const nextValue = Number(event.target.value);
                                                            setTaxDraft((prev) => ({ ...prev, [key]: Number.isFinite(nextValue) ? nextValue : 0 }));
                                                        }}
                                                        style={{
                                                            width: '100%',
                                                            borderRadius: '0.4rem',
                                                            border: '1px solid rgba(148,163,184,0.35)',
                                                            background: 'rgba(22,13,5,0.8)',
                                                            color: '#e2e8f0',
                                                            padding: '0.3rem 0.4rem',
                                                            fontSize: '0.7rem',
                                                        }}
                                                    />
                                                </label>
                                            ))}
                                        </div>
                                        <div style={{ marginTop: '0.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                                            <button
                                                type="button"
                                                disabled={isSavingTaxes}
                                                onClick={saveCityTaxes}
                                                style={{
                                                    borderRadius: '0.55rem',
                                                    border: '1px solid rgba(251,191,36,0.45)',
                                                    background: 'rgba(251,191,36,0.14)',
                                                    color: '#fde68a',
                                                    fontSize: '0.68rem',
                                                    fontWeight: 700,
                                                    padding: '0.35rem 0.65rem',
                                                    cursor: isSavingTaxes ? 'not-allowed' : 'pointer',
                                                    opacity: isSavingTaxes ? 0.65 : 1,
                                                }}
                                            >
                                                {isSavingTaxes ? t('common.saving') : t('dashboard.save_taxes')}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div style={{ marginTop: '0.85rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.38rem', gap: '0.75rem', flexWrap: 'wrap' }}>
                                    <div style={{ fontSize: '0.76rem', color: 'rgba(255,255,255,0.8)' }}>
                                        {t('dashboard.treasury_progress')}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: '#fbbf24', fontFamily: 'monospace' }}>
                                        {nextTierTarget !== null
                                            ? `${cityTreasury.toLocaleString()} / ${nextTierTarget.toLocaleString()}`
                                            : `${cityTreasury.toLocaleString()} / ${t('common.max')}`}
                                    </div>
                                </div>

                                <div
                                    style={{
                                        width: '100%',
                                        height: '0.56rem',
                                        borderRadius: '9999px',
                                        background: 'rgba(148,163,184,0.2)',
                                        overflow: 'hidden',
                                        border: '1px solid rgba(148,163,184,0.28)',
                                    }}
                                >
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${cityProgressPct}%` }}
                                        transition={{ duration: 0.8, ease: 'easeOut' }}
                                        style={{
                                            height: '100%',
                                            background: 'linear-gradient(90deg, #f59e0b, #ea580c)',
                                        }}
                                    />
                                </div>

                                <div style={{ marginTop: '0.42rem', fontSize: '0.72rem', color: 'rgba(255,255,255,0.72)' }}>
                                    {nextTierTarget !== null
                                        ? t('dashboard.remaining_for_next_tier', { credits: remainingToNextTier.toLocaleString(), tier: cityTier + 1 })
                                        : t('dashboard.max_tier_reached')}
                                </div>
                            </div>
                        </motion.section>

                        <motion.section
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.45 }}
                            className="glass-card glow-indigo"
                            style={{
                                padding: '0.85rem 0.95rem',
                                overflow: 'hidden',
                            }}
                        >
                            <h2
                                style={{
                                    fontSize: '1.1rem',
                                    fontWeight: 700,
                                    color: '#f1f5f9',
                                    marginBottom: '0.85rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                }}
                            >
                                <img src={iconActiveOrdersPng} alt="Active Orders" style={{ width: '1rem', height: '1rem', objectFit: 'contain' }} /> {t('dashboard.active_orders')}
                            </h2>
                            {user?.city_key === 'AGRARIA' ? <AgrariaActiveOrders /> :
                             user?.city_key === 'FERRUM' ? <FerrumActiveOrders /> :
                             user?.city_key === 'MEDICO' ? <MedicoActiveOrders /> :
                             user?.city_key === 'VOLTARA' ? <VoltaraActiveOrders /> :
                             user?.city_key === 'TEXTILIS' ? <TextilisActiveOrders /> :
                             <ActiveOrdersGrid />}
                        </motion.section>
                    </div>



                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: dashboardGridTemplate,
                            gap: '1rem',
                            alignItems: 'stretch',
                        }}
                    >
                        {/* ═══════ Column 1: Profile & Stats ═══════ */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5 }}
                            style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem', height: panelHeight }}
                        >
                            <section
                                className="glass-card glow-indigo"
                                style={{
                                    padding: '1rem',
                                    position: 'relative',
                                    overflow: 'hidden',
                                    height: isMobile ? 'auto' : '100%',
                                    display: 'flex',
                                    flexDirection: 'column',
                                }}
                            >
                                <div
                                    style={{
                                        position: 'absolute',
                                        top: '-2rem',
                                        right: '-2rem',
                                        width: '6rem',
                                        height: '6rem',
                                        borderRadius: '50%',
                                        background: 'rgba(245, 158, 11, 0.08)',
                                        filter: 'blur(30px)',
                                    }}
                                />

                                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: '0.25rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
                                        <motion.div
                                            whileHover={{ scale: 1.05 }}
                                            style={{
                                                display: 'flex',
                                                height: '3.5rem',
                                                width: '3.5rem',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                borderRadius: '1rem',
                                                background: 'linear-gradient(135deg, rgba(55, 65, 81, 0.8), rgba(31, 41, 55, 0.8))',
                                                border: '1px solid rgba(245, 102, 11, 0.2)',
                                                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
                                            }}
                                        >
                                            <UserIcon size={28} style={{ color: '#fbbf24' }} />
                                        </motion.div>
                                        <div>
                                            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f1f5f9' }}>
                                                {user.email.split('@')[0]}
                                            </h2>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.15rem' }}>
                                                <Crown size={12} style={{ color: roleTheme.color }} />
                                                <span
                                                    style={{
                                                        fontSize: '0.72rem',
                                                        fontWeight: 700,
                                                        color: roleTheme.color,
                                                        background: roleTheme.bg,
                                                        border: roleTheme.border,
                                                        borderRadius: '9999px',
                                                        padding: '0.12rem 0.52rem',
                                                    }}
                                                >
                                                    {userRole}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ marginBottom: '1.25rem', height: 'auto', overflow: 'hidden' }}>
                                        <HungerBar hunger={hunger} maxHunger={2400} />
                                    </div>

                                    <div
                                        style={{
                                            paddingTop: '1.25rem',
                                            borderTop: '1px solid rgba(245, 158, 11, 0.12)',
                                        }}
                                    >
                                        <h3
                                            style={{
                                                fontSize: '0.8rem',
                                                fontWeight: 600,
                                                color: '#94a3b8',
                                                marginBottom: '0.75rem',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.4rem',
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.05em',
                                            }}
                                        >
                                            <Briefcase size={13} /> {t('dashboard.occupations')}
                                        </h3>

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                                            <OccupationCard
                                                name={firstJob.label}
                                                icon={firstJob.icon}
                                                level={firstJob.level}
                                                progress={firstJob.progress}
                                                color={firstJob.color}
                                                bgColor={firstJob.bgColor}
                                                borderColor={firstJob.borderColor}
                                                glowColor={firstJob.glowColor}
                                                canUnlock={false}
                                                onUnlock={handleUnlock}
                                                onOpenSkills={!firstJob.level ? undefined : openFirstJobSkillModal}
                                                t={t}
                                            />

                                            <OccupationCard
                                                name={secondaryJob.label}
                                                icon={secondaryJob.icon}
                                                level={secondaryJob.level}
                                                progress={secondaryJob.progress}
                                                color={secondaryJob.color}
                                                bgColor={secondaryJob.bgColor}
                                                borderColor={secondaryJob.borderColor}
                                                glowColor={secondaryJob.glowColor}
                                                canUnlock={canUnlockSecond}
                                                onUnlock={handleUnlock}
                                                onOpenSkills={!secondaryJob.level ? undefined : openSecondaryJobSkillModal}
                                                t={t}
                                            />
                                        </div>
                                    </div>

                                    <section
                                        style={{
                                            marginTop: '0.8rem',
                                            padding: '0.7rem',
                                            borderRadius: '0.72rem',
                                            border: '1px solid rgba(245, 158, 11, 0.18)',
                                                background: 'rgba(245, 158, 11, 0.04)',
                                            overflow: 'hidden',
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.45rem' }}>
                                            <Zap size={14} style={{ color: '#f59e0b' }} />
                                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#fbbf24' }}>{t('dashboard.active_buffs')}</span>
                                        </div>

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                                            <div style={{ fontSize: '0.66rem', color: 'rgba(255,255,255,0.86)', fontWeight: 700 }}>
                                                {t('dashboard.food_buff')}
                                            </div>
                                            {hasActiveFoodBuff ? (
                                                <div style={{ fontSize: '0.64rem', color: 'rgba(255,255,255,0.78)', lineHeight: 1.4 }}>
                                                    {t('dashboard.satiety_buff_desc', { value: Math.round((user.satiety_buff ?? 0) * 100) })}
                                                    <br />
                                                    {t('dashboard.expires_in')}: <span style={{ color: '#fbbf24', fontWeight: 700 }}>{formatDuration(foodBuffRemainingMs)}</span>
                                                </div>
                                            ) : (
                                                <div style={{ fontSize: '0.64rem', color: 'rgba(255,255,255,0.45)' }}>
                                                    {t('dashboard.no_food_buff')}
                                                </div>
                                            )}

                                            <div style={{ marginTop: '0.15rem', fontSize: '0.66rem', color: 'rgba(255,255,255,0.86)', fontWeight: 700 }}>
                                                {t('dashboard.equipment_buffs')}
                                            </div>
                                            {activeEquipmentBuffs.length > 0 ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                                    {activeEquipmentBuffs.map((row) => {
                                                        const durPct = Math.max(0, Math.min(100, row.durability));
                                                        const barColor = row.isBroken
                                                            ? '#ef4444'
                                                            : durPct > 60
                                                                ? '#34d399'
                                                                : durPct > 30
                                                                    ? '#fbbf24'
                                                                    : '#ef4444';
                                                        return (
                                                            <div key={`${row.slot}-${row.name}`} style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.78)' }}>
                                                                • <span style={{ color: row.color, fontWeight: 700 }}>{row.name} ({row.rarity})</span>: {row.isBroken ? <span style={{ color: '#ef4444', fontWeight: 700 }}>⚠ Broken</span> : row.description}
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.18rem' }}>
                                                                    <div
                                                                        style={{
                                                                            flex: 1,
                                                                            height: '0.32rem',
                                                                            borderRadius: '9999px',
                                                                            background: 'rgba(148,163,184,0.2)',
                                                                            overflow: 'hidden',
                                                                            border: '1px solid rgba(148,163,184,0.15)',
                                                                        }}
                                                                    >
                                                                        <div
                                                                            style={{
                                                                                width: `${durPct}%`,
                                                                                height: '100%',
                                                                                background: barColor,
                                                                                borderRadius: '9999px',
                                                                                transition: 'width 0.5s ease-out',
                                                                            }}
                                                                        />
                                                                    </div>
                                                                    <span style={{ fontSize: '0.56rem', color: barColor, fontWeight: 700, minWidth: '2.5rem', textAlign: 'right' }}>
                                                                        {Math.round(durPct)}/100
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            ) : (
                                                <div style={{ fontSize: '0.64rem', color: 'rgba(255,255,255,0.45)' }}>
                                                    {t('dashboard.no_equipment_buff')}
                                                </div>
                                            )}
                                        </div>
                                    </section>
                                </div>
                            </section>
                        </motion.div>

                        {/* ═══════ Column 2: Inventory ═══════ */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: 0.1 }}
                            style={{ height: panelHeight }}
                        >
                            <section
                                className="glass-card"
                                style={{
                                    height: '100%',
                                    padding: '0.8rem',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    overflow: 'hidden',
                                }}
                            >
                                <h2
                                    style={{
                                        fontSize: '1.1rem',
                                        fontWeight: 700,
                                        color: '#f1f5f9',
                                        marginBottom: '1rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                    }}
                                >
                                    <img src={iconInventoryPng} alt="Inventory" style={{ width: '1rem', height: '1rem', objectFit: 'contain' }} /> {t('dashboard.inventory')}
                                </h2>
                                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
                                    <InventoryGrid />
                                </div>
                            </section>
                        </motion.div>

                        {/* ═══════ Column 3: Workspace ═══════ */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: 0.15 }}
                            style={{ height: panelHeight }}
                        >
                            <section
                                className="glass-card"
                                style={{
                                    height: '100%',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    overflow: 'hidden',
                                }}
                            >
                                <div
                                    style={{
                                        padding: '0.95rem 1rem',
                                        borderBottom: '1px solid rgba(245, 158, 11, 0.12)',
                                        background: 'rgba(245, 158, 11, 0.03)',
                                    }}
                                >
                                    <h2
                                        style={{
                                            fontSize: '1.1rem',
                                            fontWeight: 700,
                                            color: '#f1f5f9',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.5rem',
                                        }}
                                    >
                                        <Hammer size={16} /> {t('dashboard.workspace')}
                                    </h2>
                                </div>
                                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: '0.9rem 1rem' }}>
                                    <WorkspacePanel />
                                </div>
                            </section>
                        </motion.div>
                    </div>
                </div>
            </main>

            <AnimatePresence>
                {showFirstJobSkillModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setShowFirstJobSkillModal(false)}
                        style={{
                            position: 'fixed',
                            inset: 0,
                            zIndex: 120,
                            background: 'rgba(5,2,0,0.75)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '1rem',
                        }}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.96 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.96 }}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                                width: '100%',
                                maxWidth: '34rem',
                                borderRadius: '0.9rem',
                                border: `1px solid ${firstJob.borderColor}`,
                                background: 'rgba(22,13,5,0.97)',
                                padding: '1rem',
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
                                <div>
                                    <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#f8fafc' }}>
                                        {firstJobSkillTree?.treeTitle ?? t('dashboard.skill_tree')}
                                    </div>
                                    <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.55)' }}>
                                        {t('dashboard.available_points')}: {firstJobSkillTree?.points.available ?? 0}
                                    </div>
                                </div>
                                <button
                                    onClick={() => setShowFirstJobSkillModal(false)}
                                    style={{
                                        border: '1px solid rgba(255,255,255,0.16)',
                                        background: 'rgba(255,255,255,0.06)',
                                        color: 'white',
                                        borderRadius: '0.4rem',
                                        fontSize: '0.65rem',
                                        padding: '0.3rem 0.6rem',
                                        cursor: 'pointer',
                                    }}
                                >
                                    {t('common.close')}
                                </button>
                            </div>

                            <div style={{ display: 'grid', gap: '0.65rem' }}>
                                {Object.entries(firstJobSkillTree?.branches ?? {}).map(([branchKey, branch]) => {
                                    const level = branch?.level ?? 0;
                                    const available = firstJobSkillTree?.points.available ?? 0;
                                    const canUpgrade = !skillLoading && level < 5 && available > 0;
                                    const title = branch?.title ?? branchKey;
                                    const color = branch?.color ?? '#34d399';
                                    const effects = branch?.effects;

                                    return (
                                        <div
                                            key={branchKey}
                                            style={{
                                                borderRadius: '0.7rem',
                                                border: `1px solid ${color}55`,
                                                background: `${color}14`,
                                                padding: '0.7rem',
                                            }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                                                <div style={{ fontSize: '0.8rem', fontWeight: 700, color }}>
                                                    {title} (Lv.{level}/5)
                                                </div>
                                                <button
                                                    onClick={() => upgradeSkill('first_job', branchKey)}
                                                    disabled={!canUpgrade}
                                                    style={{
                                                        border: `1px solid ${color}66`,
                                                        background: canUpgrade ? `${color}2b` : 'rgba(255,255,255,0.05)',
                                                        color: canUpgrade ? color : 'rgba(255,255,255,0.45)',
                                                        borderRadius: '0.4rem',
                                                        fontSize: '0.62rem',
                                                        fontWeight: 700,
                                                        padding: '0.24rem 0.55rem',
                                                        cursor: canUpgrade ? 'pointer' : 'not-allowed',
                                                    }}
                                                >
                                                    {t('dashboard.upgrade')}
                                                </button>
                                            </div>
                                            {renderBranchEffects(effects, level, color)}
                                        </div>
                                    );
                                })}
                            </div>
                        </motion.div>
                    </motion.div>
                )}

                {showSecondaryJobSkillModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setShowSecondaryJobSkillModal(false)}
                        style={{
                            position: 'fixed',
                            inset: 0,
                            zIndex: 120,
                            background: 'rgba(5,2,0,0.75)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '1rem',
                        }}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.96 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.96 }}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                                width: '100%',
                                maxWidth: '34rem',
                                borderRadius: '0.9rem',
                                border: `1px solid ${secondaryJob.borderColor}`,
                                background: 'rgba(22,13,5,0.97)',
                                padding: '1rem',
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
                                <div>
                                    <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#f8fafc' }}>
                                        {secondaryJobSkillTree?.treeTitle ?? t('dashboard.skill_tree')}
                                    </div>
                                    <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.55)' }}>
                                        {t('dashboard.available_points')}: {secondaryJobSkillTree?.points.available ?? 0}
                                    </div>
                                </div>
                                <button
                                    onClick={() => setShowSecondaryJobSkillModal(false)}
                                    style={{
                                        border: '1px solid rgba(255,255,255,0.16)',
                                        background: 'rgba(255,255,255,0.06)',
                                        color: 'white',
                                        borderRadius: '0.4rem',
                                        fontSize: '0.65rem',
                                        padding: '0.3rem 0.6rem',
                                        cursor: 'pointer',
                                    }}
                                >
                                    {t('common.close')}
                                </button>
                            </div>

                            <div style={{ display: 'grid', gap: '0.65rem' }}>
                                {Object.entries(secondaryJobSkillTree?.branches ?? {}).map(([branchKey, branch]) => {
                                    const level = branch?.level ?? 0;
                                    const available = secondaryJobSkillTree?.points.available ?? 0;
                                    const canUpgrade = !skillLoading && level < 5 && available > 0;
                                    const title = branch?.title ?? branchKey;
                                    const color = branch?.color ?? '#fb923c';
                                    const effects = branch?.effects;

                                    return (
                                        <div
                                            key={branchKey}
                                            style={{
                                                borderRadius: '0.7rem',
                                                border: `1px solid ${color}55`,
                                                background: `${color}14`,
                                                padding: '0.7rem',
                                            }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                                                <div style={{ fontSize: '0.8rem', fontWeight: 700, color }}>
                                                    {title} (Lv.{level}/5)
                                                </div>
                                                <button
                                                    onClick={() => upgradeSkill('secondary_job', branchKey)}
                                                    disabled={!canUpgrade}
                                                    style={{
                                                        border: `1px solid ${color}66`,
                                                        background: canUpgrade ? `${color}2b` : 'rgba(255,255,255,0.05)',
                                                        color: canUpgrade ? color : 'rgba(255,255,255,0.45)',
                                                        borderRadius: '0.4rem',
                                                        fontSize: '0.62rem',
                                                        fontWeight: 700,
                                                        padding: '0.24rem 0.55rem',
                                                        cursor: canUpgrade ? 'pointer' : 'not-allowed',
                                                    }}
                                                >
                                                    {t('dashboard.upgrade')}
                                                </button>
                                            </div>
                                            {renderBranchEffects(effects, level, color)}
                                        </div>
                                    );
                                })}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ─── Responsive override for mobile ────────────────── */}
            <style>{`
                @media (max-width: 1024px) {
                    main > div > div:last-child {
                        grid-template-columns: 1fr 1fr !important;
                    }
                }
                @media (max-width: 640px) {
                    main > div > div:last-child {
                        grid-template-columns: 1fr !important;
                    }
                }
            `}</style>
        </div>
    );
};

// ─── Occupation Card Sub-Component ──────────────────────────────────

interface OccupationCardProps {
    name: string;
    icon: React.ReactNode;
    level: number | null | undefined;
    progress: ReturnType<typeof getExpProgress>;
    color: string;
    bgColor: string;
    borderColor: string;
    glowColor: string;
    canUnlock?: boolean;
    onUnlock?: () => void;
    onOpenSkills?: () => void;
    t: any;
}

const OccupationCard = ({ name, icon, level, progress, color, bgColor, borderColor, glowColor, canUnlock, onUnlock, onOpenSkills, t }: OccupationCardProps) => {
    const normalizedLevel = Number(level ?? 0);
    const isLocked = normalizedLevel <= 0;

    return (
        <motion.div
            whileHover={!isLocked || canUnlock ? { scale: 1.02 } : {}}
            style={{
                padding: '0.75rem',
                borderRadius: '0.75rem',
                border: `1px solid ${isLocked ? (canUnlock ? `${color}40` : 'rgba(255,255,255,0.06)') : borderColor}`,
                background: isLocked ? (canUnlock ? `${bgColor}` : 'rgba(255,255,255,0.02)') : bgColor,
                opacity: isLocked && !canUnlock ? 0.5 : 1,
                transition: 'all 0.2s',
                position: 'relative',
                overflow: 'hidden',
                cursor: canUnlock ? 'pointer' : 'default',
            }}
        >
            {/* Subtle glow for active */}
            {!isLocked && (
                <div
                    style={{
                        position: 'absolute',
                        top: '-1rem',
                        right: '-1rem',
                        width: '3rem',
                        height: '3rem',
                        borderRadius: '50%',
                        background: glowColor,
                        filter: 'blur(15px)',
                    }}
                />
            )}

            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '0.5rem',
                    position: 'relative',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ color }}>{icon}</span>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color }}>
                        {name}
                    </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    {!isLocked && onOpenSkills && (
                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={onOpenSkills}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.3rem',
                                padding: '0.2rem 0.5rem',
                                borderRadius: '0.35rem',
                                border: `1px solid ${color}55`,
                                background: `${color}1f`,
                                color,
                                fontSize: '0.58rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                            }}
                        >
                            {t('dashboard.skill')}
                        </motion.button>
                    )}
                    {isLocked ? (
                        canUnlock ? (
                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={onUnlock}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.3rem',
                                    padding: '0.2rem 0.6rem',
                                    borderRadius: '0.35rem',
                                    border: `1px solid ${color}60`,
                                    background: `linear-gradient(135deg, ${color}30, ${color}15)`,
                                    color,
                                    fontSize: '0.6rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    boxShadow: `0 0 12px ${color}20`,
                                }}
                            >
                                <Unlock size={10} />
                                {t('dashboard.unlock')}
                            </motion.button>
                        ) : (
                            <>
                                <Lock size={11} style={{ color: '#64748b' }} />
                                <span style={{ fontSize: '0.65rem', color: '#64748b' }}>{t('dashboard.locked')}</span>
                            </>
                        )
                    ) : (
                        <>
                            <Award size={12} style={{ color }} />
                            <span style={{ fontSize: '0.7rem', fontWeight: 700, color }}>
                                Lvl {normalizedLevel}
                            </span>
                            {progress.isMaxLevel && (
                                <span
                                    style={{
                                        fontSize: '0.55rem',
                                        fontWeight: 700,
                                        padding: '0.1rem 0.35rem',
                                        borderRadius: '0.25rem',
                                        background: `${color}20`,
                                        color,
                                        marginLeft: '0.2rem',
                                    }}
                                >
                                    {t('common.max')}
                                </span>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* EXP Progress Bar */}
            {!isLocked && (
                <>
                    <div
                        style={{
                            height: '0.35rem',
                            width: '100%',
                            borderRadius: '0.25rem',
                            background: 'rgba(255,255,255,0.06)',
                            overflow: 'hidden',
                            position: 'relative',
                        }}
                    >
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${progress.progressPct}%` }}
                            transition={{ duration: 0.8, ease: 'easeOut' }}
                            style={{
                                height: '100%',
                                borderRadius: '0.25rem',
                                background: `linear-gradient(90deg, ${color}, ${color}cc)`,
                                boxShadow: `0 0 8px ${color}40`,
                            }}
                        />
                    </div>
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginTop: '0.35rem',
                        }}
                    >
                        <span
                            style={{
                                fontSize: '0.6rem',
                                color: 'rgba(255,255,255,0.4)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.2rem',
                            }}
                        >
                            <TrendingUp size={9} />
                            {progress.currentExp.toLocaleString()} {t('common.exp')}
                        </span>
                        <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)' }}>
                            {progress.isMaxLevel
                                ? t('common.max')
                                : `${progress.nextThreshold?.toLocaleString()} ${t('dashboard.to_next_level')}`
                            }
                        </span>
                    </div>
                </>
            )}
        </motion.div>
    );
};

export default DashboardPage;
