import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useGameStore } from '../stores/gameStore';
import { getExpProgress, UNLOCK_SECOND_OCCUPATION_LEVEL } from '../lib/gameConstants';
import {
    LogOut,
    User as UserIcon,
    Briefcase,
    Award,
    Zap,
    Crown,
    Lock,
    Unlock,
    TrendingUp,
    Sprout,
    ChefHat,
    ShoppingCart,
} from 'lucide-react';

import HungerBar from '../components/HungerBar';
import InventoryGrid from '../components/InventoryGrid';
import WorkspacePanel from '../components/WorkspacePanel';
import ActiveOrdersGrid from '../components/ActiveOrdersGrid';
import api from '../lib/api';
import { getEquipmentRarityColor, getEquipmentRarityLabel, getEquipmentRarityMultiplier } from '../lib/equipmentRarity';

type ProviderSkillBranch = 'VEGETABLE' | 'CHICKEN' | 'BEEF';
type ChefSkillBranch = 'PREP_MASTER' | 'KITCHEN_ECONOMY' | 'MARKET_INTEL';

interface ProviderSkillTreeData {
    points: {
        total: number;
        spent: number;
        available: number;
    };
    branches: Record<ProviderSkillBranch, {
        title: string;
        level: number;
        color: string;
        effects: {
            level1: string;
            level2: string;
            level3: string;
            level4: string;
        };
    }>;
}

interface ChefSkillTreeData {
    points: {
        total: number;
        spent: number;
        available: number;
    };
    branches: Record<ChefSkillBranch, {
        title: string;
        level: number;
        color: string;
        effects: {
            level1: string;
            level2: string;
            level3: string;
            level4: string;
        };
    }>;
}

const DashboardPage = () => {
    const navigate = useNavigate();
    const { user, logout, fetchMe } = useAuthStore();
    const {
        hunger,
        equipment,
        tickHunger,
        fetchAll,
        fetchWorkOrders,
        actionMessage,
        clearMessage
    } = useGameStore();
    const [showProviderSkillModal, setShowProviderSkillModal] = useState(false);
    const [providerSkillTree, setProviderSkillTree] = useState<ProviderSkillTreeData | null>(null);
    const [showChefSkillModal, setShowChefSkillModal] = useState(false);
    const [chefSkillTree, setChefSkillTree] = useState<ChefSkillTreeData | null>(null);
    const [skillLoading, setSkillLoading] = useState(false);

    const mergeAuthUser = (nextUser: any) => {
        const prevUser = useAuthStore.getState().user as any;
        useAuthStore.setState({ user: prevUser ? { ...prevUser, ...nextUser } : nextUser });
    };

    useEffect(() => {
        const init = async () => {
            try {
                await fetchMe();
                await fetchAll();
            } catch {
                navigate('/');
            }
        };
        init();

        // Game loop (hunger decay)
        const interval = setInterval(tickHunger, 1000);
        return () => clearInterval(interval);
    }, []);

    // Clear message after 3 seconds
    useEffect(() => {
        if (actionMessage) {
            const timer = setTimeout(clearMessage, 3000);
            return () => clearTimeout(timer);
        }
    }, [actionMessage]);

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
                    Loading...
                </motion.div>
            </div>
        );
    }

    const providerLevel = Number(user.provider_level ?? 0);
    const chefLevel = Number(user.chef_level ?? 0);
    const isFerrum = user.city_key === 'FERRUM';
    const providerLabel = isFerrum ? 'Miner' : 'Provider';
    const chefLabel = isFerrum ? 'Blacksmith' : 'Chef';
    const providerProgress = getExpProgress(user.provider_exp ?? 0, providerLevel);
    const chefProgress = getExpProgress(user.chef_exp ?? 0, chefLevel);

    // Determine if the second occupation can be unlocked
    const primaryLevel = user.role === 'PROVIDER' ? providerLevel : chefLevel;
    const canUnlockSecond = !isFerrum && primaryLevel >= UNLOCK_SECOND_OCCUPATION_LEVEL;
    const secondaryOccupation = user.role === 'PROVIDER' ? 'chef' : 'provider';

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

    const fetchProviderSkillTree = async () => {
        try {
            setSkillLoading(true);
            const { data } = await api.get('/game/skills/provider');
            setProviderSkillTree(data.skillTree);
        } finally {
            setSkillLoading(false);
        }
    };

    const openProviderSkillModal = async () => {
        setShowProviderSkillModal(true);
        await fetchProviderSkillTree();
    };

    const fetchChefSkillTree = async () => {
        try {
            setSkillLoading(true);
            const { data } = await api.get('/game/skills/chef');
            setChefSkillTree(data.skillTree);
        } finally {
            setSkillLoading(false);
        }
    };

    const openChefSkillModal = async () => {
        setShowChefSkillModal(true);
        await fetchChefSkillTree();
    };

    const upgradeProviderSkill = async (branch: ProviderSkillBranch) => {
        try {
            setSkillLoading(true);
            const { data } = await api.post('/game/skills/provider/upgrade', { branch });
            setProviderSkillTree(data.skillTree);
            if (data.user) {
                mergeAuthUser(data.user);
            } else {
                await fetchMe();
            }
            await fetchWorkOrders();
            useGameStore.getState().setActionMessage(data.message ?? 'Skill upgraded');
        } catch (err: any) {
            useGameStore.getState().setActionMessage(err.response?.data?.error || 'Failed to upgrade skill');
        } finally {
            setSkillLoading(false);
        }
    };

    const upgradeChefSkill = async (branch: ChefSkillBranch) => {
        try {
            setSkillLoading(true);
            const { data } = await api.post('/game/skills/chef/upgrade', { branch });
            setChefSkillTree(data.skillTree);
            if (data.user) {
                mergeAuthUser(data.user);
            } else {
                await fetchMe();
            }
            await fetchWorkOrders();
            useGameStore.getState().setActionMessage(data.message ?? 'Chef skill upgraded');
        } catch (err: any) {
            useGameStore.getState().setActionMessage(err.response?.data?.error || 'Failed to upgrade chef skill');
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
        .map((eq) => ({
            slot: eq.slot,
            name: eq.item_name ?? eq.slot,
            rarity: getEquipmentRarityLabel(eq.item_rarity),
            color: getEquipmentRarityColor(eq.item_rarity),
            description: formatEquipmentEffect(eq),
        }))
        .filter((row) => !!row.description);

    return (
        <div
            className="bg-grid"
            style={{
                minHeight: '100vh',
                background: '#0a0e17',
                color: '#f1f5f9',
                fontFamily: "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif",
                position: 'relative',
                overflow: 'hidden',
            }}
        >
            {/* ─── Animated Background Orbs ─────────────────────── */}
            <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
                <motion.div
                    style={{
                        position: 'absolute',
                        width: '500px',
                        height: '500px',
                        borderRadius: '50%',
                        background: 'radial-gradient(circle, #6366f1 0%, transparent 70%)',
                        top: '-5%',
                        right: '-5%',
                        opacity: 0.06,
                    }}
                    animate={{ x: [0, -30, 0], y: [0, 20, 0] }}
                    transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }}
                />
                <motion.div
                    style={{
                        position: 'absolute',
                        width: '400px',
                        height: '400px',
                        borderRadius: '50%',
                        background: 'radial-gradient(circle, #a78bfa 0%, transparent 70%)',
                        bottom: '10%',
                        left: '-5%',
                        opacity: 0.05,
                    }}
                    animate={{ x: [0, 40, 0], y: [0, -30, 0] }}
                    transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
                />
                <motion.div
                    style={{
                        position: 'absolute',
                        width: '300px',
                        height: '300px',
                        borderRadius: '50%',
                        background: 'radial-gradient(circle, #22d3ee 0%, transparent 70%)',
                        top: '40%',
                        left: '50%',
                        opacity: 0.04,
                    }}
                    animate={{ x: [0, 25, 0], y: [0, -20, 0] }}
                    transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
                />
            </div>

            {/* ─── Top Bar ───────────────────────────────────────── */}
            <header
                style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 20,
                    borderBottom: '1px solid rgba(99, 102, 241, 0.15)',
                    background: 'rgba(10, 14, 23, 0.8)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                }}
            >
                <div
                    style={{
                        maxWidth: '1280px',
                        margin: '0 auto',
                        display: 'flex',
                        height: '4rem',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0 1.5rem',
                    }}
                >
                    {/* Logo */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <motion.div
                            whileHover={{ scale: 1.1, rotate: 5 }}
                            style={{
                                display: 'flex',
                                height: '2.5rem',
                                width: '2.5rem',
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderRadius: '0.75rem',
                                background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(139, 92, 246, 0.2))',
                                border: '1px solid rgba(99, 102, 241, 0.3)',
                                boxShadow: '0 0 15px rgba(99, 102, 241, 0.3)',
                            }}
                        >
                            <span style={{ fontSize: '1.25rem' }}>🏙️</span>
                        </motion.div>
                        <h1
                            style={{
                                fontSize: '1.25rem',
                                fontWeight: 700,
                                letterSpacing: '-0.02em',
                                background: 'linear-gradient(135deg, #c7d2fe, #e0e7ff)',
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                            }}
                        >
                            Freelance City
                        </h1>
                    </div>

                    {/* Right side */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                        <motion.button
                            whileHover={{ scale: 1.04 }}
                            whileTap={{ scale: 0.96 }}
                            onClick={() => navigate('/marketplace')}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.45rem',
                                borderRadius: '0.65rem',
                                border: '1px solid rgba(99, 102, 241, 0.35)',
                                background: 'rgba(99, 102, 241, 0.12)',
                                color: '#c7d2fe',
                                fontSize: '0.76rem',
                                fontWeight: 700,
                                padding: '0.45rem 0.72rem',
                                cursor: 'pointer',
                            }}
                        >
                            <ShoppingCart size={14} />
                            Marketplace Hub
                        </motion.button>

                        {/* Money Pill */}
                        <motion.div
                            whileHover={{ scale: 1.05 }}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                borderRadius: '9999px',
                                background: 'rgba(52, 211, 153, 0.08)',
                                padding: '0.375rem 1rem',
                                border: '1px solid rgba(52, 211, 153, 0.2)',
                                boxShadow: '0 0 10px rgba(52, 211, 153, 0.1)',
                            }}
                        >
                            <span style={{ fontSize: '0.875rem' }}>💰</span>
                            <span
                                style={{
                                    fontFamily: 'monospace',
                                    fontWeight: 600,
                                    color: '#6ee7b7',
                                    fontSize: '0.875rem',
                                }}
                            >
                                {user.money.toLocaleString()}
                            </span>
                        </motion.div>

                        {/* User Info */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#e2e8f0' }}>
                                    {user.email.split('@')[0]}
                                </span>
                                <span
                                    style={{
                                        fontSize: '0.7rem',
                                        color: '#94a3b8',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.35rem',
                                    }}
                                >
                                    <span
                                        style={{
                                            display: 'inline-block',
                                            width: '0.5rem',
                                            height: '0.5rem',
                                            borderRadius: '9999px',
                                            background: user.role === 'PROVIDER' ? '#fbbf24' : '#fb7185',
                                        }}
                                    />
                                    {user.role}
                                </span>
                            </div>
                            <motion.button
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                                onClick={() => { logout(); navigate('/'); }}
                                style={{
                                    borderRadius: '0.5rem',
                                    padding: '0.5rem',
                                    color: '#94a3b8',
                                    background: 'transparent',
                                    border: '1px solid rgba(255,255,255,0.06)',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'all 0.2s',
                                }}
                            >
                                <LogOut size={18} />
                            </motion.button>
                        </div>
                    </div>
                </div>
            </header>

            {/* ─── Action Message Toast ──────────────────────────── */}
            <div
                style={{
                    position: 'fixed',
                    top: '5rem',
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
                                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 20px rgba(99, 102, 241, 0.15)',
                                backdropFilter: 'blur(12px)',
                                border: '1px solid rgba(99, 102, 241, 0.2)',
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
                                    background: '#818cf8',
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
                    padding: '1.5rem',
                    position: 'relative',
                    zIndex: 1,
                }}
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <motion.section
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.45 }}
                        className="glass-card"
                        style={{
                            padding: '1rem 1.1rem',
                            border: '1px solid rgba(99, 102, 241, 0.15)',
                            background: 'rgba(99, 102, 241, 0.04)',
                        }}
                    >
                        <h2
                            style={{
                                fontSize: '1rem',
                                fontWeight: 700,
                                color: '#e2e8f0',
                                marginBottom: '0.85rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                            }}
                        >
                            <span>📋</span> Active Orders by Occupation
                        </h2>
                        <ActiveOrdersGrid />
                    </motion.section>

                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(3, 1fr)',
                            gap: '1.5rem',
                        }}
                    >
                        {/* ═══════ Column 1: Profile & Stats ═══════ */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5 }}
                            style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '36rem' }}
                        >
                            <section
                                className="glass-card glow-indigo"
                                style={{
                                    padding: '1.25rem',
                                    position: 'relative',
                                    overflow: 'hidden',
                                    height: '100%',
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
                                        background: 'rgba(99, 102, 241, 0.12)',
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
                                                border: '1px solid rgba(99, 102, 241, 0.2)',
                                                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
                                            }}
                                        >
                                            <UserIcon size={28} style={{ color: '#a5b4fc' }} />
                                        </motion.div>
                                        <div>
                                            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f1f5f9' }}>
                                                {user.email.split('@')[0]}
                                            </h2>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.15rem' }}>
                                                <Crown size={12} style={{ color: '#fbbf24' }} />
                                                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#fbbf24' }}>
                                                    {user.role}
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
                                            borderTop: '1px solid rgba(99, 102, 241, 0.1)',
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
                                            <Briefcase size={13} /> Occupations
                                        </h3>

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                            <OccupationCard
                                                name={providerLabel}
                                                icon={<Sprout size={16} />}
                                                level={providerLevel}
                                                progress={providerProgress}
                                                color="#fbbf24"
                                                bgColor="rgba(251, 191, 36, 0.08)"
                                                borderColor="rgba(251, 191, 36, 0.2)"
                                                glowColor="rgba(251, 191, 36, 0.15)"
                                                canUnlock={secondaryOccupation === 'provider' && canUnlockSecond}
                                                onUnlock={handleUnlock}
                                                onOpenSkills={!providerLevel ? undefined : openProviderSkillModal}
                                            />

                                            <OccupationCard
                                                name={chefLabel}
                                                icon={<ChefHat size={16} />}
                                                level={chefLevel}
                                                progress={chefProgress}
                                                color="#fb7185"
                                                bgColor="rgba(251, 113, 133, 0.08)"
                                                borderColor="rgba(251, 113, 133, 0.2)"
                                                glowColor="rgba(251, 113, 133, 0.15)"
                                                canUnlock={secondaryOccupation === 'chef' && canUnlockSecond}
                                                onUnlock={handleUnlock}
                                                onOpenSkills={!chefLevel ? undefined : openChefSkillModal}
                                            />
                                        </div>
                                    </div>

                                    <section
                                        className="glass-card"
                                        style={{
                                            marginTop: '1rem',
                                            padding: '0.85rem',
                                            border: '1px solid rgba(99, 102, 241, 0.22)',
                                            background: 'rgba(99, 102, 241, 0.05)',
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.45rem' }}>
                                            <Zap size={14} style={{ color: '#818cf8' }} />
                                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#c7d2fe' }}>Active Buffs</span>
                                        </div>

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                                            <div style={{ fontSize: '0.66rem', color: 'rgba(255,255,255,0.86)', fontWeight: 700 }}>
                                                Food Buff
                                            </div>
                                            {hasActiveFoodBuff ? (
                                                <div style={{ fontSize: '0.64rem', color: 'rgba(255,255,255,0.78)', lineHeight: 1.4 }}>
                                                    Satiety buff: -{Math.round((user.satiety_buff ?? 0) * 100)}% hunger decay
                                                    <br />
                                                    Expires in: <span style={{ color: '#a5b4fc', fontWeight: 700 }}>{formatDuration(foodBuffRemainingMs)}</span>
                                                </div>
                                            ) : (
                                                <div style={{ fontSize: '0.64rem', color: 'rgba(255,255,255,0.45)' }}>
                                                    No active food buff
                                                </div>
                                            )}

                                            <div style={{ marginTop: '0.15rem', fontSize: '0.66rem', color: 'rgba(255,255,255,0.86)', fontWeight: 700 }}>
                                                Equipment Buffs
                                            </div>
                                            {activeEquipmentBuffs.length > 0 ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                                    {activeEquipmentBuffs.map((row) => (
                                                        <div key={`${row.slot}-${row.name}`} style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.78)' }}>
                                                            • <span style={{ color: row.color, fontWeight: 700 }}>{row.name} ({row.rarity})</span>: {row.description}
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div style={{ fontSize: '0.64rem', color: 'rgba(255,255,255,0.45)' }}>
                                                    No active equipment buff
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
                            style={{ height: '36rem' }}
                        >
                            <section
                                className="glass-card"
                                style={{
                                    height: '100%',
                                    padding: '1rem',
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
                                    <span>🎒</span> Inventory
                                </h2>
                                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                                    <InventoryGrid />
                                </div>
                            </section>
                        </motion.div>

                        {/* ═══════ Column 3: Workspace ═══════ */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: 0.15 }}
                            style={{ height: '36rem' }}
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
                                        padding: '1.25rem 1.5rem',
                                        borderBottom: '1px solid rgba(99, 102, 241, 0.1)',
                                        background: 'rgba(99, 102, 241, 0.03)',
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
                                        <span>🏗️</span> Workspace
                                    </h2>
                                </div>
                                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '1.25rem 1.5rem' }}>
                                    <WorkspacePanel />
                                </div>
                            </section>
                        </motion.div>
                    </div>
                </div>
            </main>

            <AnimatePresence>
                {showProviderSkillModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setShowProviderSkillModal(false)}
                        style={{
                            position: 'fixed',
                            inset: 0,
                            zIndex: 120,
                            background: 'rgba(2,6,23,0.62)',
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
                                border: '1px solid rgba(251,191,36,0.28)',
                                background: 'rgba(15,23,42,0.96)',
                                padding: '1rem',
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
                                <div>
                                    <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#f8fafc' }}>Provider Skill Tree</div>
                                    <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.55)' }}>
                                        Available Points: {providerSkillTree?.points.available ?? 0}
                                    </div>
                                </div>
                                <button
                                    onClick={() => setShowProviderSkillModal(false)}
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
                                    Close
                                </button>
                            </div>

                            <div style={{ display: 'grid', gap: '0.65rem' }}>
                                {([
                                    { key: 'VEGETABLE', title: 'Vegetable Farming', color: '#34d399' },
                                    { key: 'CHICKEN', title: 'Chicken Farming', color: '#facc15' },
                                    { key: 'BEEF', title: 'Beef Farming', color: '#f87171' },
                                ] as Array<{ key: ProviderSkillBranch; title: string; color: string }>).map((branchMeta) => {
                                    const branch = providerSkillTree?.branches?.[branchMeta.key];
                                    const level = branch?.level ?? 0;
                                    const available = providerSkillTree?.points.available ?? 0;
                                    const canUpgrade = !skillLoading && level < 4 && available > 0;
                                    const title = branch?.title ?? branchMeta.title;
                                    const color = branch?.color ?? branchMeta.color;
                                    const effects = branch?.effects;

                                    return (
                                        <div
                                            key={branchMeta.key}
                                            style={{
                                                borderRadius: '0.7rem',
                                                border: `1px solid ${color}55`,
                                                background: `${color}14`,
                                                padding: '0.7rem',
                                            }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                                                <div style={{ fontSize: '0.8rem', fontWeight: 700, color }}>
                                                    {title} (Lv.{level}/4)
                                                </div>
                                                <button
                                                    onClick={() => upgradeProviderSkill(branchMeta.key)}
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
                                                    Upgrade
                                                </button>
                                            </div>
                                            <div style={{ fontSize: '0.64rem', lineHeight: 1.45, display: 'flex', flexDirection: 'column', gap: '0.12rem' }}>
                                                <span
                                                    style={{
                                                        color: level >= 1 ? color : 'rgba(255,255,255,0.55)',
                                                        fontWeight: level >= 1 ? 700 : 500,
                                                    }}
                                                >
                                                    {effects?.level1 ?? 'Lv.1: Reduce task waiting time by 5%'}
                                                </span>
                                                <span
                                                    style={{
                                                        color: level >= 2 ? color : 'rgba(255,255,255,0.55)',
                                                        fontWeight: level >= 2 ? 700 : 500,
                                                    }}
                                                >
                                                    {effects?.level2 ?? 'Lv.2: Increase task plot capacity to 2 (base is 1)'}
                                                </span>
                                                <span
                                                    style={{
                                                        color: level >= 3 ? color : 'rgba(255,255,255,0.55)',
                                                        fontWeight: level >= 3 ? 700 : 500,
                                                    }}
                                                >
                                                    {effects?.level3 ?? 'Lv.3: Reduce task waiting time by another 5% (10% total)'}
                                                </span>
                                                <span
                                                    style={{
                                                        color: level >= 4 ? color : 'rgba(255,255,255,0.55)',
                                                        fontWeight: level >= 4 ? 700 : 500,
                                                    }}
                                                >
                                                    {effects?.level4 ?? 'Lv.4: Increase task plot capacity to 3'}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </motion.div>
                    </motion.div>
                )}

                {showChefSkillModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setShowChefSkillModal(false)}
                        style={{
                            position: 'fixed',
                            inset: 0,
                            zIndex: 120,
                            background: 'rgba(2,6,23,0.62)',
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
                                border: '1px solid rgba(251,113,133,0.28)',
                                background: 'rgba(15,23,42,0.96)',
                                padding: '1rem',
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
                                <div>
                                    <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#f8fafc' }}>Chef Skill Tree</div>
                                    <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.55)' }}>
                                        Available Points: {chefSkillTree?.points.available ?? 0}
                                    </div>
                                </div>
                                <button
                                    onClick={() => setShowChefSkillModal(false)}
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
                                    Close
                                </button>
                            </div>

                            <div style={{ display: 'grid', gap: '0.65rem' }}>
                                {([
                                    { key: 'PREP_MASTER', title: 'Prep Master', color: '#fb923c' },
                                    { key: 'KITCHEN_ECONOMY', title: 'Kitchen Economy', color: '#34d399' },
                                    { key: 'MARKET_INTEL', title: 'Market Intel', color: '#c084fc' },
                                ] as Array<{ key: ChefSkillBranch; title: string; color: string }>).map((branchMeta) => {
                                    const branch = chefSkillTree?.branches?.[branchMeta.key];
                                    const level = branch?.level ?? 0;
                                    const available = chefSkillTree?.points.available ?? 0;
                                    const canUpgrade = !skillLoading && level < 4 && available > 0;
                                    const title = branch?.title ?? branchMeta.title;
                                    const color = branch?.color ?? branchMeta.color;
                                    const effects = branch?.effects;

                                    return (
                                        <div
                                            key={branchMeta.key}
                                            style={{
                                                borderRadius: '0.7rem',
                                                border: `1px solid ${color}55`,
                                                background: `${color}14`,
                                                padding: '0.7rem',
                                            }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                                                <div style={{ fontSize: '0.8rem', fontWeight: 700, color }}>
                                                    {title} (Lv.{level}/4)
                                                </div>
                                                <button
                                                    onClick={() => upgradeChefSkill(branchMeta.key)}
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
                                                    Upgrade
                                                </button>
                                            </div>
                                            <div style={{ fontSize: '0.64rem', lineHeight: 1.45, display: 'flex', flexDirection: 'column', gap: '0.12rem' }}>
                                                <span style={{ color: level >= 1 ? color : 'rgba(255,255,255,0.55)', fontWeight: level >= 1 ? 700 : 500 }}>
                                                    {effects?.level1 ?? 'Lv.1 effect'}
                                                </span>
                                                <span style={{ color: level >= 2 ? color : 'rgba(255,255,255,0.55)', fontWeight: level >= 2 ? 700 : 500 }}>
                                                    {effects?.level2 ?? 'Lv.2 effect'}
                                                </span>
                                                <span style={{ color: level >= 3 ? color : 'rgba(255,255,255,0.55)', fontWeight: level >= 3 ? 700 : 500 }}>
                                                    {effects?.level3 ?? 'Lv.3 effect'}
                                                </span>
                                                <span style={{ color: level >= 4 ? color : 'rgba(255,255,255,0.55)', fontWeight: level >= 4 ? 700 : 500 }}>
                                                    {effects?.level4 ?? 'Lv.4 effect'}
                                                </span>
                                            </div>
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
}

const OccupationCard = ({ name, icon, level, progress, color, bgColor, borderColor, glowColor, canUnlock, onUnlock, onOpenSkills }: OccupationCardProps) => {
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
                            Skill
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
                                Unlock
                            </motion.button>
                        ) : (
                            <>
                                <Lock size={11} style={{ color: '#64748b' }} />
                                <span style={{ fontSize: '0.65rem', color: '#64748b' }}>Locked</span>
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
                                    MAX
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
                            {progress.currentExp.toLocaleString()} EXP
                        </span>
                        <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)' }}>
                            {progress.isMaxLevel
                                ? 'Max Level'
                                : `${progress.nextThreshold?.toLocaleString()} to next`
                            }
                        </span>
                    </div>
                </>
            )}
        </motion.div>
    );
};

export default DashboardPage;
