import { useEffect, useState, type CSSProperties } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Map, Skull, Ship, RefreshCw } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useShipmentStore, type WorldMapShip } from '../stores/shipmentStore';
import { citiesData, shippingRoutes } from '../../../shared/mapData';
import { SHIP_CONFIG } from '../../../shared/gameConfig';
import TopNavBar from '../components/TopNavBar';

const SVG_W = 900;
const SVG_H = 600;

const WorldMapPage = () => {
    const user = useAuthStore((s) => s.user);
    const {
        worldMapShips,
        fetchWorldMapShips,
        pirateCooldown,
        fetchPirateCooldown,
        launchPirateAttack,
    } = useShipmentStore();

    const [selectedShip, setSelectedShip] = useState<WorldMapShip | null>(null);
    const [pirateSize, setPirateSize] = useState<'S' | 'M' | 'L'>('S');
    const [rpsSequence, setRpsSequence] = useState<string[]>([]);
    const [msg, setMsg] = useState<string | null>(null);
    const [now, setNow] = useState(Date.now());

    useEffect(() => {
        fetchWorldMapShips();
        fetchPirateCooldown();
        const iv = setInterval(() => {
            fetchWorldMapShips();
            setNow(Date.now());
        }, 3000);
        return () => clearInterval(iv);
    }, []);

    const showMsg = (m: string) => { setMsg(m); setTimeout(() => setMsg(null), 3000); };

    // Calculate ship position along route
    const getShipPosition = (ship: WorldMapShip) => {
        const origin = citiesData.find((c) => c.id === ship.origin_city);
        const dest = citiesData.find((c) => c.id === ship.dest_city);
        if (!origin || !dest) return { x: 0, y: 0 };

        if (ship.status === 'DOCKED') return { x: origin.x, y: origin.y };
        if (ship.status === 'ARRIVED') return { x: dest.x, y: dest.y };

        // Sailing: interpolate position
        if (ship.departed_at && ship.arrives_at) {
            const dep = new Date(ship.departed_at).getTime();
            const arr = new Date(ship.arrives_at).getTime();
            const total = arr - dep;
            const elapsed = now - dep;
            const t = Math.min(1, Math.max(0, total > 0 ? elapsed / total : 0));
            return {
                x: origin.x + (dest.x - origin.x) * t,
                y: origin.y + (dest.y - origin.y) * t,
            };
        }
        return { x: origin.x, y: origin.y };
    };

    const sailingShips = worldMapShips.filter((s) => s.status === 'SAILING');

    const pirateSizes = SHIP_CONFIG.pirate.sizes;

    const handlePirateAttack = async () => {
        if (!selectedShip) return;
        const r = await launchPirateAttack(selectedShip.id, pirateSize, rpsSequence);
        if (!r.ok) showMsg(r.error || 'Attack failed');
        else {
            showMsg(`Attack result: ${r.result}`);
            setSelectedShip(null);
            setRpsSequence([]);
        }
    };

    const addRps = (choice: string) => {
        if (rpsSequence.length >= 10) return;
        setRpsSequence([...rpsSequence, choice]);
    };

    return (
        <div className="bg-forge" style={pageStyle}>
            <TopNavBar />

            <AnimatePresence>
                {msg && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
                        style={toastStyle}
                    >
                        {msg}
                    </motion.div>
                )}
            </AnimatePresence>

            <main style={{ position: 'relative', zIndex: 1, maxWidth: 1200, margin: '0 auto', padding: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.8rem' }}>
                    <h1 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#38bdf8', margin: 0 }}>
                        <Map size={20} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                        World Map
                    </h1>
                    <button onClick={() => fetchWorldMapShips()} style={refreshBtn}>
                        <RefreshCw size={14} />
                    </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '1rem' }}>
                    {/* SVG Map */}
                    <div style={mapContainerStyle}>
                        <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} style={{ width: '100%', height: 'auto' }}>
                            {/* Ocean bg */}
                            <rect width={SVG_W} height={SVG_H} fill="#0a1628" rx={12} />

                            {/* Shipping routes */}
                            {shippingRoutes.map((route) => {
                                const s = citiesData.find((c) => c.id === route.source)!;
                                const t = citiesData.find((c) => c.id === route.target)!;
                                return (
                                    <g key={`${route.source}-${route.target}`}>
                                        <line
                                            x1={s.x} y1={s.y} x2={t.x} y2={t.y}
                                            stroke="rgba(148,163,184,0.15)" strokeWidth={1.5} strokeDasharray="6 4"
                                        />
                                        <text
                                            x={(s.x + t.x) / 2} y={(s.y + t.y) / 2 - 6}
                                            fill="rgba(148,163,184,0.4)" fontSize={9} textAnchor="middle"
                                        >
                                            {route.distance}nm
                                        </text>
                                    </g>
                                );
                            })}

                            {/* Cities */}
                            {citiesData.map((city) => (
                                <g key={city.id}>
                                    <circle
                                        cx={city.x} cy={city.y} r={user?.city_key === city.id ? 18 : 14}
                                        fill={city.color + '33'} stroke={city.color} strokeWidth={2}
                                    />
                                    <circle cx={city.x} cy={city.y} r={5} fill={city.color} />
                                    <text
                                        x={city.x} y={city.y + 28} textAnchor="middle"
                                        fill={city.color} fontSize={12} fontWeight={700}
                                    >
                                        {city.name}
                                    </text>
                                    <text
                                        x={city.x} y={city.y + 40} textAnchor="middle"
                                        fill="rgba(148,163,184,0.6)" fontSize={8}
                                    >
                                        {city.type}
                                    </text>
                                </g>
                            ))}

                            {/* Sailing ships */}
                            {sailingShips.map((ship) => {
                                const pos = getShipPosition(ship);
                                const isPrivate = ship.type === 'PRIVATE';
                                return (
                                    <g
                                        key={ship.id}
                                        onClick={() => setSelectedShip(ship)}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        <circle cx={pos.x} cy={pos.y} r={8} fill={isPrivate ? 'rgba(251,191,36,0.3)' : 'rgba(56,189,248,0.3)'} stroke={isPrivate ? '#fbbf24' : '#38bdf8'} strokeWidth={1.5} />
                                        <text x={pos.x} y={pos.y + 4} textAnchor="middle" fontSize={10}>
                                            {isPrivate ? '⛵' : '🚢'}
                                        </text>
                                    </g>
                                );
                            })}
                        </svg>
                    </div>

                    {/* Side Panel */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                        {/* Ship list */}
                        <div style={cardStyle}>
                            <h3 style={{ margin: 0, marginBottom: '0.4rem', fontSize: '0.82rem', color: '#e2e8f0' }}>
                                <Ship size={14} style={{ marginRight: 4 }} />
                                Sailing Ships ({sailingShips.length})
                            </h3>
                            <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                                {sailingShips.map((ship) => {
                                    const eta = ship.arrives_at ? Math.max(0, Math.floor((new Date(ship.arrives_at).getTime() - now) / 1000)) : 0;
                                    return (
                                        <div
                                            key={ship.id}
                                            onClick={() => setSelectedShip(ship)}
                                            style={{
                                                padding: '0.3rem 0.4rem',
                                                borderBottom: '1px solid rgba(148,163,184,0.1)',
                                                cursor: 'pointer',
                                                background: selectedShip?.id === ship.id ? 'rgba(56,189,248,0.1)' : 'transparent',
                                                borderRadius: '0.3rem',
                                            }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#e2e8f0' }}>
                                                <span>{ship.type === 'PRIVATE' ? '⛵' : '🚢'} #{ship.id}</span>
                                                <span style={{ color: '#94a3b8' }}>ETA {eta}s</span>
                                            </div>
                                            <div style={{ fontSize: '0.63rem', color: '#94a3b8' }}>
                                                {ship.origin_city} → {ship.dest_city} · {ship.cargo_count} cargo
                                            </div>
                                        </div>
                                    );
                                })}
                                {sailingShips.length === 0 && (
                                    <div style={{ fontSize: '0.7rem', color: '#64748b', textAlign: 'center', padding: '0.5rem' }}>
                                        No ships at sea
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Pirate attack panel */}
                        <div style={{ ...cardStyle, borderColor: 'rgba(239,68,68,0.25)' }}>
                            <h3 style={{ margin: 0, marginBottom: '0.4rem', fontSize: '0.82rem', color: '#ef4444' }}>
                                <Skull size={14} style={{ marginRight: 4 }} />
                                Pirate Attack
                            </h3>

                            {pirateCooldown.onCooldown ? (
                                <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                                    On cooldown until {pirateCooldown.canAttackAt ? new Date(pirateCooldown.canAttackAt).toLocaleTimeString() : '?'}
                                </div>
                            ) : selectedShip ? (
                                <div>
                                    <div style={{ fontSize: '0.7rem', color: '#cbd5e1', marginBottom: '0.3rem' }}>
                                        Targeting Ship #{selectedShip.id} ({selectedShip.origin_city} → {selectedShip.dest_city})
                                    </div>

                                    {/* Size select */}
                                    <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '0.4rem' }}>
                                        {(['S', 'M', 'L'] as const).map((s) => (
                                            <button
                                                key={s} onClick={() => { setPirateSize(s); setRpsSequence([]); }}
                                                style={{ ...chipStyle, ...(pirateSize === s ? chipActiveStyle : {}) }}
                                            >
                                                {s} ({pirateSizes[s].creditCost}&#x20B5;)
                                            </button>
                                        ))}
                                    </div>

                                    {/* RPS input */}
                                    <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
                                        RPS Sequence ({rpsSequence.length} chosen):
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.3rem', flexWrap: 'wrap' }}>
                                        {rpsSequence.map((r, i) => (
                                            <span key={i} style={rpsBadge}>{r === 'ROCK' ? '🪨' : r === 'PAPER' ? '📄' : '✂️'}</span>
                                        ))}
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '0.4rem' }}>
                                        {['ROCK', 'PAPER', 'SCISSORS'].map((ch) => (
                                            <button key={ch} onClick={() => addRps(ch)} style={smallBtn}>
                                                {ch === 'ROCK' ? '🪨' : ch === 'PAPER' ? '📄' : '✂️'} {ch}
                                            </button>
                                        ))}
                                        {rpsSequence.length > 0 && (
                                            <button onClick={() => setRpsSequence([])} style={smallBtn}>Clear</button>
                                        )}
                                    </div>

                                    <button
                                        onClick={handlePirateAttack}
                                        disabled={rpsSequence.length === 0}
                                        style={{
                                            ...attackBtn,
                                            opacity: rpsSequence.length === 0 ? 0.5 : 1,
                                            cursor: rpsSequence.length === 0 ? 'not-allowed' : 'pointer',
                                        }}
                                    >
                                        <Skull size={14} /> Launch Attack
                                    </button>
                                </div>
                            ) : (
                                <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                                    Click a sailing ship on the map to target it
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default WorldMapPage;

// ─── Styles ─────────────────────────────────────────

const pageStyle: CSSProperties = {
    minHeight: '100vh',
    color: '#f1f5f9',
    fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
    position: 'relative',
    overflow: 'hidden',
};

const toastStyle: CSSProperties = {
    position: 'fixed',
    top: 70,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 50,
    borderRadius: '0.7rem',
    border: '1px solid rgba(251,191,36,0.3)',
    background: 'rgba(10,5,0,0.92)',
    color: '#fbbf24',
    padding: '0.5rem 1.2rem',
    fontSize: '0.78rem',
    fontWeight: 700,
    boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
};

const cardStyle: CSSProperties = {
    borderRadius: '0.85rem',
    border: '1px solid rgba(148,163,184,0.2)',
    background: 'linear-gradient(135deg, rgba(30,19,10,0.75), rgba(15,8,2,0.9))',
    padding: '0.7rem 0.8rem',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
};

const mapContainerStyle: CSSProperties = {
    borderRadius: '0.85rem',
    border: '1px solid rgba(56,189,248,0.2)',
    background: 'linear-gradient(135deg, rgba(10,22,40,0.9), rgba(5,12,25,0.95))',
    padding: '0.5rem',
    boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
};

const chipStyle: CSSProperties = {
    borderRadius: '9999px',
    border: '1px solid rgba(148,163,184,0.2)',
    background: 'rgba(15,8,2,0.65)',
    color: '#e2e8f0',
    fontSize: '0.65rem',
    padding: '0.2rem 0.5rem',
    cursor: 'pointer',
    fontWeight: 600,
};

const chipActiveStyle: CSSProperties = {
    background: 'rgba(239,68,68,0.2)',
    border: '1px solid rgba(239,68,68,0.5)',
    color: '#fca5a5',
};

const smallBtn: CSSProperties = {
    borderRadius: '0.45rem',
    border: '1px solid rgba(148,163,184,0.25)',
    background: 'rgba(30,19,10,0.7)',
    color: '#cbd5e1',
    padding: '0.25rem 0.45rem',
    fontSize: '0.65rem',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.2rem',
};

const attackBtn: CSSProperties = {
    borderRadius: '0.55rem',
    border: '1px solid rgba(239,68,68,0.4)',
    background: 'linear-gradient(135deg, rgba(180,30,30,0.6), rgba(220,38,38,0.4))',
    color: '#fecaca',
    padding: '0.4rem 0.75rem',
    fontSize: '0.75rem',
    fontWeight: 700,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.3rem',
    width: '100%',
    justifyContent: 'center',
};

const rpsBadge: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 24,
    height: 24,
    borderRadius: '0.3rem',
    background: 'rgba(239,68,68,0.15)',
    border: '1px solid rgba(239,68,68,0.3)',
    fontSize: '0.75rem',
};

const refreshBtn: CSSProperties = {
    borderRadius: '0.45rem',
    border: '1px solid rgba(148,163,184,0.25)',
    background: 'rgba(30,19,10,0.7)',
    color: '#94a3b8',
    padding: '0.3rem',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
};
