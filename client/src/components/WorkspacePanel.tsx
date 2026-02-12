import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '../stores/gameStore';
import type { WorkOrder } from '../stores/gameStore';
import { useAuthStore } from '../stores/authStore';
import { Clock, CheckCircle, Sprout, ChefHat, Play, TrendingUp, Lock } from 'lucide-react';
import { getExpProgress } from '../lib/gameConstants';

function formatTimeLeft(completesAt: string): string {
    const diff = new Date(completesAt).getTime() - Date.now();
    if (diff <= 0) return 'Ready!';
    const mins = Math.floor(diff / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
}

function getProgress(order: WorkOrder): number {
    const start = new Date(order.started_at).getTime();
    const end = new Date(order.completes_at).getTime();
    const now = Date.now();
    if (now >= end) return 100;
    return Math.min(100, ((now - start) / (end - start)) * 100);
}

/** Mini EXP bar for the workspace header */
const MiniExpBar = ({ label, icon, level, exp, color }: {
    label: string;
    icon: React.ReactNode;
    level: number;
    exp: number;
    color: string;
}) => {
    const progress = getExpProgress(exp, level);
    const isLocked = level <= 0;

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.35rem 0.5rem',
            borderRadius: '0.5rem',
            background: isLocked ? 'rgba(255,255,255,0.02)' : `${color}10`,
            border: `1px solid ${isLocked ? 'rgba(255,255,255,0.06)' : `${color}25`}`,
            opacity: isLocked ? 0.5 : 1,
            flex: 1,
        }}>
            <span style={{ color: isLocked ? '#64748b' : color }}>{icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '0.15rem',
                }}>
                    <span style={{
                        fontSize: '0.6rem',
                        fontWeight: 700,
                        color: isLocked ? '#64748b' : color,
                    }}>
                        {label}
                    </span>
                    {isLocked ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.15rem' }}>
                            <Lock size={8} style={{ color: '#64748b' }} />
                            <span style={{ fontSize: '0.55rem', color: '#64748b' }}>Locked</span>
                        </span>
                    ) : (
                        <span style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.45)' }}>
                            Lvl {progress.level}
                        </span>
                    )}
                </div>
                {!isLocked && (
                    <>
                        <div style={{
                            height: '0.2rem',
                            borderRadius: '0.15rem',
                            background: 'rgba(255,255,255,0.06)',
                            overflow: 'hidden',
                        }}>
                            <div style={{
                                height: '100%',
                                width: `${progress.progressPct}%`,
                                borderRadius: '0.15rem',
                                background: `linear-gradient(90deg, ${color}, ${color}cc)`,
                                transition: 'width 0.5s ease-out',
                            }} />
                        </div>
                        <div style={{
                            fontSize: '0.5rem',
                            color: 'rgba(255,255,255,0.3)',
                            marginTop: '0.1rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.15rem',
                        }}>
                            <TrendingUp size={7} />
                            {progress.isMaxLevel
                                ? 'MAX'
                                : `${progress.currentExp.toLocaleString()}/${progress.nextThreshold?.toLocaleString() ?? 0}`
                            }
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

const WorkspacePanel = () => {
    const { workOrders, inventory, shopItems, recipes, collectWork, startFarm, startCook, buyFromShop } = useGameStore();
    const user = useAuthStore((s) => s.user);
    const [, setTick] = useState(0);
    const [showStartForm, setShowStartForm] = useState(false);

    // Tick every second for timer updates
    useEffect(() => {
        const interval = setInterval(() => setTick((t) => t + 1), 1000);
        return () => clearInterval(interval);
    }, []);

    const canFarm = (user?.provider_level ?? 0) > 0;
    const canCook = (user?.chef_level ?? 0) > 0;

    // Seeds in inventory (for providers to farm)
    const seedSlots = inventory.filter((s) => s.item?.type === 'SEED');
    // Available seeds to buy from shop
    const seedShopItems = shopItems.filter((i) => i.type === 'SEED');

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Level / EXP Section */}
            <div style={{ display: 'flex', gap: '0.4rem' }}>
                <MiniExpBar
                    label="Provider"
                    icon={<Sprout size={12} />}
                    level={user?.provider_level ?? 0}
                    exp={user?.provider_exp ?? 0}
                    color="#fbbf24"
                />
                <MiniExpBar
                    label="Chef"
                    icon={<ChefHat size={12} />}
                    level={user?.chef_level ?? 0}
                    exp={user?.chef_exp ?? 0}
                    color="#fb7185"
                />
            </div>

            {/* Active Orders */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <AnimatePresence>
                    {workOrders.length === 0 && (
                        <motion.p
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            style={{
                                fontSize: '0.8rem',
                                color: 'rgba(255,255,255,0.3)',
                                textAlign: 'center',
                                padding: '1.5rem 0',
                            }}
                        >
                            No active tasks. Start one below!
                        </motion.p>
                    )}
                    {workOrders.map((order) => {
                        const progress = getProgress(order);
                        const ready = progress >= 100;

                        return (
                            <motion.div
                                key={order.id}
                                layout
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                style={{
                                    background: 'rgba(255,255,255,0.03)',
                                    border: ready
                                        ? '1px solid rgba(52, 211, 153, 0.3)'
                                        : '1px solid rgba(255,255,255,0.06)',
                                    borderRadius: '0.75rem',
                                    padding: '0.75rem',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '0.5rem',
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <span style={{ fontSize: '1.1rem' }}>{order.item.icon}</span>
                                        <div>
                                            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>
                                                {order.type === 'FARM' ? 'Growing' : 'Cooking'} {order.item.name}
                                            </div>
                                            <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)' }}>
                                                x{order.quantity}
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                        {ready ? (
                                            <CheckCircle style={{ width: '0.85rem', height: '0.85rem', color: '#34d399' }} />
                                        ) : (
                                            <Clock style={{ width: '0.85rem', height: '0.85rem', color: '#fbbf24' }} />
                                        )}
                                        <span style={{
                                            fontSize: '0.7rem',
                                            fontWeight: 600,
                                            color: ready ? '#34d399' : '#fbbf24',
                                        }}>
                                            {formatTimeLeft(order.completes_at)}
                                        </span>
                                    </div>
                                </div>

                                {/* Progress bar */}
                                <div style={{
                                    height: '0.25rem',
                                    borderRadius: '0.25rem',
                                    background: 'rgba(255,255,255,0.06)',
                                    overflow: 'hidden',
                                }}>
                                    <div style={{
                                        height: '100%',
                                        width: `${progress}%`,
                                        borderRadius: '0.25rem',
                                        background: ready
                                            ? 'linear-gradient(90deg, #34d399, #10b981)'
                                            : 'linear-gradient(90deg, #6366f1, #8b5cf6)',
                                        transition: 'width 1s linear',
                                    }} />
                                </div>

                                {ready && (
                                    <motion.button
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                        onClick={() => collectWork(order.id)}
                                        style={{
                                            padding: '0.4rem 0.75rem',
                                            borderRadius: '0.5rem',
                                            border: 'none',
                                            background: 'linear-gradient(135deg, #34d399, #10b981)',
                                            color: 'white',
                                            fontSize: '0.75rem',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                        }}
                                    >
                                        ✅ Collect
                                    </motion.button>
                                )}
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
            </div>

            {/* Start new task */}
            <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setShowStartForm(!showStartForm)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.4rem',
                    padding: '0.5rem',
                    borderRadius: '0.5rem',
                    border: '1px dashed rgba(99, 102, 241, 0.3)',
                    background: 'rgba(99, 102, 241, 0.05)',
                    color: '#818cf8',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                }}
            >
                <Play style={{ width: '0.75rem', height: '0.75rem' }} />
                {showStartForm ? 'Hide' : 'Start New Task'}
            </motion.button>

            <AnimatePresence>
                {showStartForm && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', overflow: 'hidden' }}
                    >
                        {!canFarm && !canCook && (
                            <p style={{
                                fontSize: '0.75rem',
                                color: 'rgba(255,255,255,0.35)',
                                textAlign: 'center',
                                padding: '1rem 0',
                            }}>
                                No occupations unlocked yet. Select a class to get started!
                            </p>
                        )}

                        {canFarm && (
                            <>
                                <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                    <Sprout style={{ width: '0.7rem', height: '0.7rem' }} /> Farm your seeds
                                </div>
                                {seedSlots.length === 0 ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                        <p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.35)' }}>
                                            No seeds in inventory. Buy from shop:
                                        </p>
                                        {seedShopItems.length === 0 ? (
                                            <p style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.25)', fontStyle: 'italic' }}>
                                                Loading shop items...
                                            </p>
                                        ) : (
                                            seedShopItems.map((item) => (
                                                <motion.button
                                                    key={item.id}
                                                    whileHover={{ scale: 1.02 }}
                                                    whileTap={{ scale: 0.98 }}
                                                    onClick={() => buyFromShop(item.id, 1)}
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'space-between',
                                                        padding: '0.5rem',
                                                        borderRadius: '0.5rem',
                                                        border: '1px solid rgba(255,255,255,0.06)',
                                                        background: 'rgba(255,255,255,0.03)',
                                                        color: 'rgba(255,255,255,0.8)',
                                                        fontSize: '0.7rem',
                                                        cursor: 'pointer',
                                                    }}
                                                >
                                                    <span>{item.icon} {item.name}</span>
                                                    <span style={{ color: '#fbbf24' }}>💰 {item.buy_price}</span>
                                                </motion.button>
                                            ))
                                        )}
                                    </div>
                                ) : (
                                    seedSlots.map((slot) => (
                                        <motion.button
                                            key={slot.id}
                                            whileHover={{ scale: 1.02 }}
                                            whileTap={{ scale: 0.98 }}
                                            onClick={() => slot.item && startFarm(slot.item.id, 1)}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                padding: '0.5rem',
                                                borderRadius: '0.5rem',
                                                border: '1px solid rgba(52, 211, 153, 0.2)',
                                                background: 'rgba(52, 211, 153, 0.05)',
                                                color: '#34d399',
                                                fontSize: '0.75rem',
                                                fontWeight: 600,
                                                cursor: 'pointer',
                                            }}
                                        >
                                            <span>{slot.item?.icon} {slot.item?.name} (x{slot.quantity})</span>
                                            <span>🌱 Plant</span>
                                        </motion.button>
                                    ))
                                )}
                            </>
                        )}

                        {canCook && (
                            <>
                                <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                    <ChefHat style={{ width: '0.7rem', height: '0.7rem' }} /> Cook a recipe
                                </div>
                                {recipes.length === 0 ? (
                                    <p style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.25)', fontStyle: 'italic' }}>
                                        Loading recipes...
                                    </p>
                                ) : (
                                    recipes.map((recipe) => (
                                        <motion.button
                                            key={recipe.id}
                                            whileHover={{ scale: 1.02 }}
                                            whileTap={{ scale: 0.98 }}
                                            onClick={() => startCook(recipe.id)}
                                            style={{
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '0.25rem',
                                                padding: '0.5rem',
                                                borderRadius: '0.5rem',
                                                border: '1px solid rgba(251, 146, 60, 0.2)',
                                                background: 'rgba(251, 146, 60, 0.05)',
                                                color: 'rgba(255,255,255,0.8)',
                                                fontSize: '0.7rem',
                                                cursor: 'pointer',
                                                textAlign: 'left',
                                            }}
                                        >
                                            <span style={{ fontWeight: 600, color: '#fb923c' }}>
                                                {recipe.output_item.icon} {recipe.name}
                                            </span>
                                            <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)' }}>
                                                {recipe.ingredients.map((i) => `${i.quantity}x ${i.item.icon}${i.item.name}`).join(' + ')}
                                            </span>
                                        </motion.button>
                                    ))
                                )}
                            </>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default WorkspacePanel;
