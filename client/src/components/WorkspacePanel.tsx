import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '../stores/gameStore';
import { useAuthStore } from '../stores/authStore';
import { Sprout, ChefHat, Play, TrendingUp, Lock } from 'lucide-react';
import { getExpProgress } from '../lib/gameConstants';

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
    const { inventory, shopItems, recipes, startFarm, startCook, buyFromShop } = useGameStore();
    const user = useAuthStore((s) => s.user);
    const [showStartForm, setShowStartForm] = useState(false);

    const canFarm = (user?.provider_level ?? 0) > 0;
    const canCook = (user?.chef_level ?? 0) > 0;

    // Seeds in inventory (for providers to farm)
    const seedSlots = inventory.filter((s) => s.item?.type === 'SEED');
    // Available seeds to buy from shop
    const seedShopItems = shopItems.filter((i) => i.type === 'SEED');

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.6rem',
                height: 'auto',
                overflowY: 'auto',
                overflowX: 'hidden',
                boxSizing: 'border-box',
                borderRadius: '0.75rem',
            }}
        >
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
                    padding: '0.55rem',
                    borderRadius: '0.5rem',
                    border: '1px solid rgba(255,255,255,0.14)',
                    background: 'rgba(255,255,255,0.03)',
                    color: 'rgba(255,255,255,0.9)',
                    fontSize: '0.72rem',
                    fontWeight: 500,
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
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.5rem',
                            overflow: 'hidden',
                            border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: '0.5rem',
                            background: 'rgba(255,255,255,0.02)',
                            padding: '0.55rem',
                        }}
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
                                                        padding: '0.55rem 0.6rem',
                                                        borderRadius: '0.5rem',
                                                        border: '1px solid rgba(255,255,255,0.08)',
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
                                                padding: '0.55rem 0.6rem',
                                                borderRadius: '0.5rem',
                                                border: '1px solid rgba(255,255,255,0.12)',
                                                background: 'rgba(255,255,255,0.03)',
                                                color: 'rgba(255,255,255,0.9)',
                                                fontSize: '0.75rem',
                                                fontWeight: 500,
                                                cursor: 'pointer',
                                            }}
                                        >
                                            <span>{slot.item?.icon} {slot.item?.name} (x{slot.quantity})</span>
                                            {/* <span>🌱 Plant</span> */}
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
                                                padding: '0.55rem 0.6rem',
                                                borderRadius: '0.5rem',
                                                border: '1px solid rgba(255,255,255,0.12)',
                                                background: 'rgba(255,255,255,0.03)',
                                                color: 'rgba(255,255,255,0.8)',
                                                fontSize: '0.7rem',
                                                cursor: 'pointer',
                                                textAlign: 'left',
                                            }}
                                        >
                                            <span style={{ fontWeight: 600, color: 'rgba(255,255,255,0.92)' }}>
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
