import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Flame, X, AlertTriangle, CheckCircle, Skull } from 'lucide-react';
import { renderItemIcon } from '../lib/itemVisual';
import { useGameStore, type InventorySlot } from '../stores/gameStore';
import type { CityEnchantConfig } from '../../../shared/gameConfig';
import {
    getEnchantColor,
    getSlotEnchantLevel,
    getSlotSpecialStats,
    formatSuccessRate,
    ENCHANT_SUCCESS_RATES,
    getFailureZoneLabel,
    isDestroyZone,
    isMilestoneLevel,
    ENCHANT_BONUS_MULTIPLIER,
    ENCHANT_MAX_LEVEL,
    SPECIAL_STAT_DEFINITIONS,
    getMaterialForLevel,
} from '../lib/enchantment';
import { useAuthStore } from '../stores/authStore';

export type EnchantResultState =
    | { status: 'success'; newLevel: number; specialStatAdded: string | null }
    | { status: 'fail'; newLevel: number }
    | { status: 'destroyed' };

interface EnchantModalProps {
    slot: InventorySlot;
    config: CityEnchantConfig;
    onClose: () => void;
}

const EnchantModal: React.FC<EnchantModalProps> = ({ slot, config, onClose }) => {
    const { enchantAttempt, inventory } = useGameStore();
    const user = useAuthStore((s) => s.user);
    const [isAttempting, setIsAttempting] = useState(false);
    const [result, setResult] = useState<EnchantResultState | null>(null);
    const [shake, setShake] = useState(false);

    // Always read fresh slot from inventory so enchant_level updates after each attempt
    const freshSlot = inventory.find((s) => s.id === slot.id) ?? slot;
    const currentLevel = getSlotEnchantLevel(freshSlot);
    const targetLevel = currentLevel + 1;
    const maxReached = targetLevel > ENCHANT_MAX_LEVEL;
    const cost = config.materialCost[targetLevel];
    const materialName = cost ? getMaterialForLevel(config, targetLevel) : null;
    const successRate = cost ? (ENCHANT_SUCCESS_RATES[targetLevel] ?? 0) : 0;

    const specialStats = getSlotSpecialStats(freshSlot);
    const playerGold = user?.money ?? 0;

    // Count player material in inventory
    const playerMaterialQty = inventory
        .filter((s) => s.item?.name === materialName)
        .reduce((sum, s) => sum + s.quantity, 0);

    const canAfford = cost ? playerGold >= cost.gold && playerMaterialQty >= cost.qty : false;

    const isTextilis = config.cityKey === 'textilis';
    const primaryColor = config.uiTheme.primaryColor;
    const gradientFrom = config.uiTheme.gradientFrom;
    const gradientTo = config.uiTheme.gradientTo;

    const handleAttempt = async () => {
        if (isAttempting || !canAfford || maxReached) return;
        setResult(null);
        setIsAttempting(true);

        const res = await enchantAttempt(freshSlot.id);
        setIsAttempting(false);

        if (!res.ok) {
            setResult(null);
            return;
        }

        if (res.destroyed) {
            setShake(true);
            setTimeout(() => setShake(false), 600);
            setResult({ status: 'destroyed' });
        } else if (res.success) {
            setResult({ status: 'success', newLevel: res.newLevel!, specialStatAdded: res.specialStatAdded ?? null });
        } else {
            setShake(true);
            setTimeout(() => setShake(false), 600);
            setResult({ status: 'fail', newLevel: res.newLevel! });
        }
    };

    const enchantLevelColor = getEnchantColor(currentLevel);
    const enchantBonus = ENCHANT_BONUS_MULTIPLIER[currentLevel] ?? 0;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0,0,0,0.75)',
                    zIndex: 200,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '1rem',
                }}
                onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
            >
                <motion.div
                    animate={shake ? { x: [-8, 8, -6, 6, -4, 4, 0] } : {}}
                    transition={{ duration: 0.5 }}
                    style={{
                        background: `linear-gradient(135deg, ${gradientFrom} 0%, ${gradientTo} 100%)`,
                        border: `2px solid ${primaryColor}`,
                        borderRadius: '1rem',
                        padding: '1.5rem',
                        width: '100%',
                        maxWidth: '460px',
                        boxShadow: `0 0 32px ${primaryColor}55`,
                        position: 'relative',
                        color: '#fff',
                    }}
                >
                    {/* Close button */}
                    <button
                        onClick={onClose}
                        style={{ position: 'absolute', top: '0.75rem', right: '0.75rem', background: 'none', border: 'none', cursor: 'pointer', color: '#ccc' }}
                    >
                        <X size={20} />
                    </button>

                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                        {isTextilis ? <Sparkles size={22} color={primaryColor} /> : <Flame size={22} color={primaryColor} />}
                        <span style={{ fontWeight: 700, fontSize: '1.15rem', color: primaryColor }}>
                            {config.workshopLabel}
                        </span>
                    </div>

                    {/* Item Info */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', padding: '0.75rem', background: 'rgba(0,0,0,0.3)', borderRadius: '0.5rem' }}>
                        <div style={{ width: 48, height: 48, flexShrink: 0 }}>
                            {renderItemIcon(freshSlot.item ?? null, 48)}
                        </div>
                        <div>
                            <div style={{ fontWeight: 600 }}>{freshSlot.item?.name ?? '?'}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.2rem' }}>
                                <span style={{
                                    padding: '2px 8px',
                                    borderRadius: '999px',
                                    background: enchantLevelColor,
                                    color: '#000',
                                    fontSize: '0.78rem',
                                    fontWeight: 700,
                                }}>
                                    +{currentLevel}
                                </span>
                                {enchantBonus > 0 && (
                                    <span style={{ fontSize: '0.75rem', color: '#ccc' }}>
                                        Stats ×{(1 + enchantBonus).toFixed(2)}
                                    </span>
                                )}
                            </div>
                            {specialStats.length > 0 && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.3rem' }}>
                                    {specialStats.map((stat) => (
                                        <span key={stat} style={{ fontSize: '0.7rem', background: `${primaryColor}33`, border: `1px solid ${primaryColor}66`, borderRadius: '4px', padding: '1px 6px', color: primaryColor }}>
                                            {SPECIAL_STAT_DEFINITIONS[stat]?.label ?? stat}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Attempt Section */}
                    {maxReached ? (
                        <div style={{ textAlign: 'center', color: '#facc15', fontWeight: 600, padding: '1rem' }}>
                            ✨ Maximum enchant level +12 reached!
                        </div>
                    ) : (
                        <>
                            <div style={{ marginBottom: '0.75rem', borderTop: `1px solid ${primaryColor}33`, paddingTop: '0.75rem' }}>
                                <div style={{ fontWeight: 600, marginBottom: '0.5rem', color: primaryColor }}>
                                    — Attempt +{targetLevel} —
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem', marginBottom: '0.3rem' }}>
                                    <span style={{ color: '#ccc' }}>Material</span>
                                    <span style={{ color: playerMaterialQty >= (cost?.qty ?? 0) ? '#86efac' : '#f87171', fontWeight: 600 }}>
                                        {cost?.qty}× {materialName}
                                        <span style={{ color: '#999', fontWeight: 400 }}> (you have: {playerMaterialQty})</span>
                                    </span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem', marginBottom: '0.3rem' }}>
                                    <span style={{ color: '#ccc' }}>Gold</span>
                                    <span style={{ color: playerGold >= (cost?.gold ?? 0) ? '#86efac' : '#f87171', fontWeight: 600 }}>
                                        {cost?.gold?.toLocaleString()}g
                                        <span style={{ color: '#999', fontWeight: 400 }}> (you have: {playerGold.toLocaleString()}g)</span>
                                    </span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem', marginBottom: '0.3rem' }}>
                                    <span style={{ color: '#ccc' }}>Success Rate</span>
                                    <span style={{ color: '#facc15', fontWeight: 700 }}>{formatSuccessRate(successRate)}</span>
                                </div>
                                {isMilestoneLevel(targetLevel) && (
                                    <div style={{ fontSize: '0.8rem', color: primaryColor, background: `${primaryColor}22`, borderRadius: '4px', padding: '4px 8px', marginTop: '0.3rem' }}>
                                        ⭐ Milestone! Unlocks a random Special Stat on success.
                                    </div>
                                )}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.4rem', fontSize: '0.8rem', color: isDestroyZone(targetLevel) ? '#f87171' : '#fbbf24' }}>
                                    <AlertTriangle size={14} />
                                    <span>{getFailureZoneLabel(targetLevel)}</span>
                                </div>
                            </div>

                            {/* Result Banner */}
                            {result && (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    style={{
                                        borderRadius: '0.5rem',
                                        padding: '0.6rem 1rem',
                                        marginBottom: '0.75rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        background:
                                            result.status === 'success' ? 'rgba(34,197,94,0.15)' :
                                            result.status === 'destroyed' ? 'rgba(239,68,68,0.2)' :
                                            'rgba(245,158,11,0.15)',
                                        border:
                                            result.status === 'success' ? '1px solid #22c55e' :
                                            result.status === 'destroyed' ? '1px solid #ef4444' :
                                            '1px solid #f59e0b',
                                    }}
                                >
                                    {result.status === 'success' && (
                                        <>
                                            <CheckCircle size={18} color="#22c55e" />
                                            <div>
                                                <div style={{ fontWeight: 700, color: '#22c55e' }}>Success! Reached +{result.newLevel}</div>
                                                {result.specialStatAdded && (
                                                    <div style={{ fontSize: '0.8rem', color: '#86efac' }}>
                                                        ✨ {SPECIAL_STAT_DEFINITIONS[result.specialStatAdded]?.label ?? result.specialStatAdded} unlocked!
                                                    </div>
                                                )}
                                            </div>
                                        </>
                                    )}
                                    {result.status === 'fail' && (
                                        <>
                                            <AlertTriangle size={18} color="#f59e0b" />
                                            <div style={{ fontWeight: 600, color: '#f59e0b' }}>
                                                Failed — dropped to +{result.newLevel}
                                            </div>
                                        </>
                                    )}
                                    {result.status === 'destroyed' && (
                                        <>
                                            <Skull size={18} color="#ef4444" />
                                            <div style={{ fontWeight: 700, color: '#ef4444' }}>Item Destroyed!</div>
                                        </>
                                    )}
                                </motion.div>
                            )}

                            {/* Buttons */}
                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                <button
                                    onClick={handleAttempt}
                                    disabled={isAttempting || !canAfford || result?.status === 'destroyed'}
                                    style={{
                                        flex: 1,
                                        padding: '0.65rem',
                                        borderRadius: '0.5rem',
                                        border: 'none',
                                        background: canAfford && result?.status !== 'destroyed' ? primaryColor : '#555',
                                        color: '#000',
                                        fontWeight: 700,
                                        cursor: canAfford && result?.status !== 'destroyed' ? 'pointer' : 'not-allowed',
                                        opacity: isAttempting ? 0.7 : 1,
                                        fontSize: '0.95rem',
                                    }}
                                >
                                    {isAttempting ? '...' : isTextilis ? '✨ ENCHANT' : '🔥 FORGE UP'}
                                </button>
                                <button
                                    onClick={onClose}
                                    style={{
                                        padding: '0.65rem 1.25rem',
                                        borderRadius: '0.5rem',
                                        border: '1px solid #555',
                                        background: 'transparent',
                                        color: '#ccc',
                                        cursor: 'pointer',
                                        fontWeight: 600,
                                    }}
                                >
                                    CANCEL
                                </button>
                            </div>
                        </>
                    )}
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};

export default EnchantModal;
