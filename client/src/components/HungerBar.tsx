import { motion } from 'framer-motion';

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
    const pct = Math.max(0, Math.min(100, (hunger / maxHunger) * 100));
    const info = getHungerState(hunger, maxHunger);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)' }}>
                    Hunger (Kcal)
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
                    {info.state} • {info.multiplier}
                </span>
            </div>

            {/* Bar track */}
            <div
                style={{
                    position: 'relative',
                    height: '0.625rem',
                    borderRadius: '0.5rem',
                    background: 'rgba(255, 255, 255, 0.06)',
                    overflow: 'hidden',
                }}
            >
                <motion.div
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        height: '100%',
                        borderRadius: '0.5rem',
                        background: `linear-gradient(90deg, ${info.color}, ${info.color}cc)`,
                        boxShadow: `0 0 12px ${info.color}60`,
                    }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: '1.25rem', fontWeight: 700, color: info.color }}>
                    {Math.round(hunger)}
                </span>
                <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.35)' }}>
                    / {maxHunger} Kcal
                </span>
            </div>
        </div>
    );
};

export default HungerBar;
