import { motion } from 'framer-motion';
import { useAuthStore } from '../stores/authStore';

interface HungerBarProps {
    hunger: number;
    maxHunger?: number;
}

function getHungerState(hunger: number, max: number) {
    const pct = (hunger / max) * 100;
    if (pct >= 80) return { state: 'Fit', color: '#34d399', bg: 'rgba(52, 211, 153, 0.15)', multiplier: '1.0x' };
    if (pct >= 40) return { state: 'Normal', color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.15)', multiplier: '1.2x' };
    if (pct >= 20) return { state: 'Hungry', color: '#fb923c', bg: 'rgba(251, 146, 60, 0.15)', multiplier: '1.5x' };
    return { state: 'Starving', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)', multiplier: '2.5x' };
}

const HungerBar = ({ hunger, maxHunger = 2400 }: HungerBarProps) => {
    const user = useAuthStore((s) => s.user);
    const pct = Math.max(0, Math.min(100, (hunger / maxHunger) * 100));
    const info = getHungerState(hunger, maxHunger);
    const providerLevel = user?.provider_level ?? 0;
    const chefLevel = user?.chef_level ?? 0;

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.6rem',
                // height: '100%',
                // minHeight: 0,
                // overflowY: 'auto',
                // overflowX: 'hidden',
                padding: '0.75rem',
                margin: 0,
                boxSizing: 'border-box',
                borderRadius: '0.75rem',
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.02)',
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>
                    Hunger
                </span>
                <span
                    style={{
                        fontSize: '0.65rem',
                        fontWeight: 600,
                        padding: '0.15rem 0.5rem',
                        borderRadius: '9999px',
                        background: info.bg,
                        color: info.color,
                        border: `1px solid ${info.color}40`,
                    }}
                >
                    {info.state}
                </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
                <span style={{ fontSize: '1.25rem', fontWeight: 700, color: info.color, lineHeight: 1 }}>
                    {Math.round(hunger)}
                </span>
                <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)' }}>
                    / {maxHunger} kcal
                </span>
            </div>

            <div
                style={{
                    position: 'relative',
                    height: '0.6rem',
                    borderRadius: '9999px',
                    background: 'rgba(255, 255, 255, 0.08)',
                    overflow: 'hidden',
                }}
            >
                <motion.div
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        height: '100%',
                        borderRadius: '9999px',
                        background: info.color,
                    }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                />
            </div>

            <div style={{ display: 'flex', gap: '0.45rem' }}>
                <div
                    style={{
                        flex: 1,
                        fontSize: '0.65rem',
                        color: 'rgba(255,255,255,0.8)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '0.45rem',
                        padding: '0.35rem 0.45rem',
                        background: 'rgba(255,255,255,0.02)',
                    }}
                >
                    Provider Lv. {providerLevel}
                </div>
                <div
                    style={{
                        flex: 1,
                        fontSize: '0.65rem',
                        color: 'rgba(255,255,255,0.8)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '0.45rem',
                        padding: '0.35rem 0.45rem',
                        background: 'rgba(255,255,255,0.02)',
                    }}
                >
                    Chef Lv. {chefLevel}
                </div>
            </div>
            <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)' }}>Decay multiplier: {info.multiplier}</span>
        </div>
    );
};

export default HungerBar;
