import { useEffect, useState, type CSSProperties } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Map, Skull, Ship, RefreshCw } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useShipmentStore, type WorldMapShip } from '../stores/shipmentStore';
import { citiesData, shippingRoutes } from '../../../shared/mapData';
import { SHIP_CONFIG } from '../../../shared/gameConfig';
import TopNavBar from '../components/TopNavBar';
import ConfirmDialog from '../components/ConfirmDialog';

const SVG_W = 1400;
const SVG_H = 700;

// Latitude / longitude grid lines
const GRID_H_LINES = [100, 200, 300, 400, 500, 600];
const GRID_V_LINES = [140, 280, 420, 560, 700, 840, 980, 1120, 1260];

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
    const [confirmAttack, setConfirmAttack] = useState(false);

    useEffect(() => {
        fetchWorldMapShips();
        fetchPirateCooldown();
        const iv = setInterval(() => {
            fetchWorldMapShips();
            setNow(Date.now());
        }, 10_000);
        return () => clearInterval(iv);
    }, []);

    const showMsg = (m: string) => { setMsg(m); setTimeout(() => setMsg(null), 3500); };

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
    // Docked ships that have cargo and a scheduled departure
    const dockedWithCargo = worldMapShips
        .filter((s) => s.status === 'DOCKED' && s.type === 'PUBLIC' && s.cargo_count > 0 && s.departs_at)
        .sort((a, b) => new Date(a.departs_at!).getTime() - new Date(b.departs_at!).getTime());

    const pirateSizes = SHIP_CONFIG.pirate.sizes;

    const handlePirateAttack = async () => {
        setConfirmAttack(false);
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
        const limit = selectedShip?.rps_slots_total ?? 3;
        if (rpsSequence.length >= limit) return;
        setRpsSequence([...rpsSequence, choice]);
    };

    const selectedOrigin = selectedShip ? citiesData.find((c) => c.id === selectedShip.origin_city) : null;
    const selectedDest = selectedShip ? citiesData.find((c) => c.id === selectedShip.dest_city) : null;

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

            {/* Pirate Attack Confirm */}
            <ConfirmDialog
                open={confirmAttack}
                title="Launch Pirate Attack"
                description="You are about to launch a pirate attack. This action costs credits and triggers a cooldown. Confirm your sequence below."
                variant="danger"
                confirmLabel="⚔️ Attack!"
                details={[
                    { label: 'Target Ship', value: `#${selectedShip?.id} (${selectedShip?.type})` },
                    { label: 'Route', value: `${selectedOrigin?.name ?? selectedShip?.origin_city} → ${selectedDest?.name ?? selectedShip?.dest_city}` },
                    { label: 'Cargo on board', value: `${selectedShip?.cargo_count} boxes` },
                    { label: 'Fleet size', value: pirateSize },
                    { label: 'Attack cost', value: `${pirateSizes[pirateSize].creditCost}₵` },
                    { label: 'RPS sequence', value: rpsSequence.map((r) => r === 'ROCK' ? '🪨' : r === 'PAPER' ? '📄' : '✂️').join(' ') || '—' },
                ]}
                onConfirm={handlePirateAttack}
                onCancel={() => setConfirmAttack(false)}
            />

            <main style={{ position: 'relative', zIndex: 1, maxWidth: 1600, margin: '0 auto', padding: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.8rem' }}>
                    <h1 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#38bdf8', margin: 0 }}>
                        <Map size={20} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                        World Map
                    </h1>
                    <button onClick={() => fetchWorldMapShips()} style={refreshBtn}>
                        <RefreshCw size={14} />
                    </button>
                    <span style={{ fontSize: '0.65rem', color: '#475569', marginLeft: 'auto' }}>
                        {sailingShips.length} ships at sea · live
                    </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '1rem', alignItems: 'start' }}>
                    {/* ── GeoMap SVG ─────────────────────────────── */}
                    <div style={mapContainerStyle}>
                        <svg
                            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
                            style={{ width: '100%', height: 'auto', display: 'block' }}
                            preserveAspectRatio="xMidYMid meet"
                        >
                            <defs>
                                {/* Ocean background gradient */}
                                <radialGradient id="oceanGrad" cx="50%" cy="50%" r="75%">
                                    <stop offset="0%" stopColor="#0d2240" />
                                    <stop offset="60%" stopColor="#071528" />
                                    <stop offset="100%" stopColor="#020810" />
                                </radialGradient>

                                {/* Subtle ocean shimmer pattern */}
                                <pattern id="shimmer" x="0" y="0" width="60" height="60" patternUnits="userSpaceOnUse">
                                    <circle cx="30" cy="30" r="0.6" fill="rgba(56,189,248,0.08)" />
                                    <circle cx="10" cy="10" r="0.4" fill="rgba(56,189,248,0.06)" />
                                    <circle cx="50" cy="15" r="0.5" fill="rgba(56,189,248,0.05)" />
                                    <circle cx="15" cy="50" r="0.4" fill="rgba(56,189,248,0.07)" />
                                </pattern>

                                {/* Vignette */}
                                <radialGradient id="vignette" cx="50%" cy="50%" r="70%">
                                    <stop offset="55%" stopColor="transparent" />
                                    <stop offset="100%" stopColor="rgba(0,0,0,0.6)" />
                                </radialGradient>

                                {/* City glow filter */}
                                <filter id="cityGlow" x="-60%" y="-60%" width="220%" height="220%">
                                    <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
                                    <feColorMatrix in="blur" type="saturate" values="2" result="saturated" />
                                    <feMerge>
                                        <feMergeNode in="saturated" />
                                        <feMergeNode in="SourceGraphic" />
                                    </feMerge>
                                </filter>

                                {/* Ship glow filter */}
                                <filter id="shipGlow" x="-50%" y="-50%" width="200%" height="200%">
                                    <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
                                    <feMerge>
                                        <feMergeNode in="blur" />
                                        <feMergeNode in="SourceGraphic" />
                                    </feMerge>
                                </filter>

                                {/* Route line glow */}
                                <filter id="routeGlow">
                                    <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="blur" />
                                    <feMerge>
                                        <feMergeNode in="blur" />
                                        <feMergeNode in="SourceGraphic" />
                                    </feMerge>
                                </filter>
                            </defs>

                            {/* Ocean base */}
                            <rect width={SVG_W} height={SVG_H} fill="url(#oceanGrad)" rx={16} />
                            <rect width={SVG_W} height={SVG_H} fill="url(#shimmer)" rx={16} />

                            {/* Grid lines */}
                            {GRID_H_LINES.map((y) => (
                                <line key={`h${y}`} x1={20} y1={y} x2={SVG_W - 20} y2={y}
                                    stroke="rgba(56,189,248,0.06)" strokeWidth={1} />
                            ))}
                            {GRID_V_LINES.map((x) => (
                                <line key={`v${x}`} x1={x} y1={20} x2={x} y2={SVG_H - 20}
                                    stroke="rgba(56,189,248,0.06)" strokeWidth={1} />
                            ))}

                            {/* Shipping routes — glow layer + line */}
                            {shippingRoutes.map((route) => {
                                const s = citiesData.find((c) => c.id === route.source)!;
                                const t = citiesData.find((c) => c.id === route.target)!;
                                if (!s || !t) return null;
                                const mx = (s.x + t.x) / 2;
                                const my = (s.y + t.y) / 2 - 18;
                                const angle = Math.atan2(t.y - s.y, t.x - s.x);
                                const bend = 40;
                                const cx1 = mx + Math.sin(angle) * bend;
                                const cy1 = my - Math.cos(angle) * bend;
                                const pathD = `M${s.x},${s.y} Q${cx1},${cy1} ${t.x},${t.y}`;
                                return (
                                    <g key={`${route.source}-${route.target}`}>
                                        {/* Glow */}
                                        <path d={pathD}
                                            fill="none"
                                            stroke="rgba(56,189,248,0.12)" strokeWidth={5}
                                            filter="url(#routeGlow)"
                                        />
                                        {/* Main dashed line */}
                                        <path d={pathD}
                                            fill="none"
                                            stroke="rgba(148,163,184,0.22)" strokeWidth={1}
                                            strokeDasharray="8 5"
                                        />
                                        {/* Distance pill */}
                                        <rect x={cx1 - 18} y={cy1 - 8} width={36} height={14} rx={7}
                                            fill="rgba(6,14,31,0.72)" stroke="rgba(56,189,248,0.15)" strokeWidth={0.8} />
                                        <text x={cx1} y={cy1 + 3.5}
                                            fill="rgba(148,163,184,0.60)" fontSize={8} textAnchor="middle" fontFamily="monospace">
                                            {route.distance}nm
                                        </text>
                                    </g>
                                );
                            })}

                            {/* City nodes — clean dot pins */}
                            {citiesData.map((city) => {
                                const isHome = user?.city_key === city.id;
                                return (
                                    <g key={city.id}>
                                        {/* Outermost pulse ring */}
                                        <circle cx={city.x} cy={city.y} r={32}
                                            fill="none" stroke={city.color} strokeWidth={0.6}
                                            strokeOpacity={0.12} />
                                        {/* Middle ring */}
                                        <circle cx={city.x} cy={city.y} r={20}
                                            fill={city.color + '0d'}
                                            stroke={city.color} strokeWidth={0.8} strokeOpacity={0.25} />
                                        {/* Inner glow circle */}
                                        <circle cx={city.x} cy={city.y} r={13}
                                            fill={city.color + '22'}
                                            stroke={city.color} strokeWidth={isHome ? 2 : 1.2}
                                            strokeOpacity={0.8}
                                            filter="url(#cityGlow)"
                                        />
                                        {/* Core dot */}
                                        <circle cx={city.x} cy={city.y} r={5}
                                            fill={city.color} />
                                        {/* Home indicator */}
                                        {isHome && (
                                            <>
                                                <circle cx={city.x} cy={city.y} r={38}
                                                    fill="none"
                                                    stroke={city.color}
                                                    strokeWidth={1}
                                                    strokeOpacity={0.35}
                                                    strokeDasharray="3 4" />
                                                <text x={city.x + 14} y={city.y - 10}
                                                    fontSize={11} textAnchor="middle">🏠</text>
                                            </>
                                        )}
                                        {/* City name */}
                                        <text x={city.x} y={city.y + 28}
                                            textAnchor="middle"
                                            fill={city.color}
                                            fontSize={12}
                                            fontWeight={700}
                                            letterSpacing={1}
                                            style={{ textShadow: `0 0 12px ${city.color}` }}
                                        >
                                            {city.name}
                                        </text>
                                        {/* City type */}
                                        <text x={city.x} y={city.y + 40}
                                            textAnchor="middle"
                                            fill="rgba(148,163,184,0.45)"
                                            fontSize={8}
                                            letterSpacing={0.5}
                                        >
                                            {city.type}
                                        </text>
                                    </g>
                                );
                            })}

                            {/* Sailing ships */}
                            {sailingShips.map((ship) => {
                                const pos = getShipPosition(ship);
                                const isPrivate = ship.type === 'PRIVATE';
                                const isSelected = selectedShip?.id === ship.id;
                                const col = isPrivate ? '#fbbf24' : '#38bdf8';
                                return (
                                    <g key={ship.id}
                                        onClick={() => { setSelectedShip(isSelected ? null : ship); setRpsSequence([]); }}
                                        style={{ cursor: 'pointer' }}
                                        filter="url(#shipGlow)"
                                    >
                                        {/* Selection ring */}
                                        {isSelected && (
                                            <circle cx={pos.x} cy={pos.y} r={20}
                                                fill="none" stroke="rgba(239,68,68,0.7)" strokeWidth={1.5}
                                                strokeDasharray="4 3" />
                                        )}
                                        {/* Ship halo */}
                                        <circle cx={pos.x} cy={pos.y} r={13}
                                            fill={col + '1a'}
                                            stroke={col} strokeWidth={1.5} strokeOpacity={0.7} />
                                        {/* Ship emoji */}
                                        <text x={pos.x} y={pos.y + 5} textAnchor="middle" fontSize={13}>
                                            {isPrivate ? '⛵' : '🚢'}
                                        </text>
                                        {/* Ship ID tag */}
                                        <rect x={pos.x - 10} y={pos.y - 24} width={20} height={10} rx={3}
                                            fill="rgba(6,14,31,0.8)" stroke={col} strokeWidth={0.6} strokeOpacity={0.5} />
                                        <text x={pos.x} y={pos.y - 16} textAnchor="middle"
                                            fill={col} fontSize={7} fontWeight={700} fontFamily="monospace">
                                            #{ship.id}
                                        </text>
                                    </g>
                                );
                            })}

                            {/* Vignette overlay */}
                            <rect width={SVG_W} height={SVG_H} fill="url(#vignette)" rx={16} style={{ pointerEvents: 'none' }} />

                            {/* Border frame */}
                            <rect width={SVG_W} height={SVG_H} fill="none"
                                stroke="rgba(56,189,248,0.12)" strokeWidth={2} rx={16} />

                            {/* Compass rose */}
                            <g transform={`translate(${SVG_W - 52},${SVG_H - 52})`}>
                                <circle cx={0} cy={0} r={26}
                                    fill="rgba(0,0,0,0.55)" stroke="rgba(56,189,248,0.20)" strokeWidth={1} />
                                {/* N arrow — red */}
                                <polygon points="0,-19 4,-4 0,-9 -4,-4"
                                    fill="#ef4444" opacity={0.9} />
                                {/* S arrow — grey */}
                                <polygon points="0,19 4,4 0,9 -4,4"
                                    fill="rgba(148,163,184,0.35)" />
                                {/* Cross lines */}
                                <line x1={0} y1={-20} x2={0} y2={20} stroke="rgba(148,163,184,0.15)" strokeWidth={0.8} />
                                <line x1={-20} y1={0} x2={20} y2={0} stroke="rgba(148,163,184,0.15)" strokeWidth={0.8} />
                                {/* Labels */}
                                <text x={0} y={-10} textAnchor="middle" fill="#ef4444" fontSize={8} fontWeight={800}>N</text>
                                <text x={0} y={18} textAnchor="middle" fill="rgba(148,163,184,0.5)" fontSize={7}>S</text>
                                <text x={15} y={3.5} textAnchor="middle" fill="rgba(148,163,184,0.5)" fontSize={7}>E</text>
                                <text x={-15} y={3.5} textAnchor="middle" fill="rgba(148,163,184,0.5)" fontSize={7}>W</text>
                            </g>

                            {/* Scale bar */}
                            <g transform="translate(22,678)">
                                <rect x={-4} y={-12} width={96} height={16} rx={4}
                                    fill="rgba(0,0,0,0.45)" stroke="rgba(56,189,248,0.12)" strokeWidth={0.8} />
                                <line x1={0} y1={0} x2={84} y2={0} stroke="rgba(148,163,184,0.5)" strokeWidth={1.5} />
                                <line x1={0} y1={-4} x2={0} y2={4} stroke="rgba(148,163,184,0.5)" strokeWidth={1.5} />
                                <line x1={84} y1={-4} x2={84} y2={4} stroke="rgba(148,163,184,0.5)" strokeWidth={1.5} />
                                <text x={42} y={-3} textAnchor="middle" fill="rgba(148,163,184,0.55)" fontSize={7} fontFamily="monospace">100 nm</text>
                            </g>
                        </svg>
                    </div>

                    {/* ── Side Panel ──────────────────────────────── */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                        {/* Territory legend */}
                        <div style={cardStyle}>
                            <h3 style={{ margin: '0 0 0.5rem', fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                Territories
                            </h3>
                            {citiesData.map((city) => (
                                <div key={city.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.18rem 0' }}>
                                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: city.color, display: 'inline-block', flexShrink: 0 }} />
                                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: city.color }}>{city.name}</span>
                                    {user?.city_key === city.id && (
                                        <span style={{ fontSize: '0.6rem', color: '#475569' }}>← you</span>
                                    )}
                                    <span style={{ fontSize: '0.6rem', color: '#475569', marginLeft: 'auto', textAlign: 'right' }}>{city.type}</span>
                                </div>
                            ))}
                        </div>

                        {/* Ship list */}
                        <div style={cardStyle}>
                            <h3 style={{ margin: 0, marginBottom: '0.4rem', fontSize: '0.82rem', color: '#e2e8f0' }}>
                                <Ship size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                                Sailing Ships ({sailingShips.length})
                            </h3>
                            <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                                {sailingShips.map((ship) => {
                                    const eta = ship.arrives_at
                                        ? Math.max(0, Math.floor((new Date(ship.arrives_at).getTime() - now) / 1000))
                                        : 0;
                                    const isSel = selectedShip?.id === ship.id;
                                    return (
                                        <div key={ship.id} onClick={() => { setSelectedShip(isSel ? null : ship); setRpsSequence([]); }}
                                            style={{
                                                padding: '0.3rem 0.4rem',
                                                borderBottom: '1px solid rgba(148,163,184,0.1)',
                                                cursor: 'pointer',
                                                background: isSel ? 'rgba(239,68,68,0.07)' : 'transparent',
                                                borderRadius: '0.3rem',
                                                borderLeft: isSel ? '2px solid rgba(239,68,68,0.45)' : '2px solid transparent',
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

                        {/* Next departures */}
                        <div style={cardStyle}>
                            <h3 style={{ margin: 0, marginBottom: '0.4rem', fontSize: '0.82rem', color: '#e2e8f0' }}>
                                <Ship size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                                Next Departures ({dockedWithCargo.length})
                            </h3>
                            <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                                {dockedWithCargo.map((ship) => {
                                    const depMs = new Date(ship.departs_at!).getTime();
                                    const secLeft = Math.max(0, Math.floor((depMs - now) / 1000));
                                    const mins = Math.floor(secLeft / 60);
                                    const secs = secLeft % 60;
                                    const isImm = secLeft <= 30;
                                    return (
                                        <div key={ship.id} style={{
                                            padding: '0.3rem 0.4rem',
                                            borderBottom: '1px solid rgba(148,163,184,0.1)',
                                            borderRadius: '0.3rem',
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#e2e8f0' }}>
                                                <span>🚢 #{ship.id} · {ship.cargo_count} cargo</span>
                                                <span style={{ color: isImm ? '#fbbf24' : '#6ee7b7', fontWeight: 700, fontFamily: 'monospace' }}>
                                                    {secLeft === 0 ? '⚓ Departing…' : `${mins}:${String(secs).padStart(2, '0')}`}
                                                </span>
                                            </div>
                                            <div style={{ fontSize: '0.63rem', color: '#94a3b8' }}>
                                                {ship.origin_city} → {ship.dest_city}
                                            </div>
                                        </div>
                                    );
                                })}
                                {dockedWithCargo.length === 0 && (
                                    <div style={{ fontSize: '0.7rem', color: '#64748b', textAlign: 'center', padding: '0.5rem' }}>
                                        No ships queued to depart
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Pirate attack panel */}
                        <div style={{ ...cardStyle, borderColor: 'rgba(239,68,68,0.25)' }}>
                            <h3 style={{ margin: 0, marginBottom: '0.4rem', fontSize: '0.82rem', color: '#ef4444' }}>
                                <Skull size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                                Pirate Attack
                            </h3>

                            {pirateCooldown.onCooldown ? (
                                <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                                    On cooldown until{' '}
                                    {pirateCooldown.canAttackAt ? new Date(pirateCooldown.canAttackAt).toLocaleTimeString() : '?'}
                                </div>
                            ) : selectedShip ? (
                                <div>
                                    <div style={targetInfoBox}>
                                        <div style={{ fontSize: '0.68rem', color: '#fca5a5', fontWeight: 700 }}>
                                            Target: Ship #{selectedShip.id}
                                        </div>
                                        <div style={{ fontSize: '0.63rem', color: '#94a3b8' }}>
                                            {selectedOrigin?.name ?? selectedShip.origin_city} → {selectedDest?.name ?? selectedShip.dest_city}
                                        </div>
                                        <div style={{ fontSize: '0.63rem', color: '#94a3b8' }}>
                                            {selectedShip.cargo_count} cargo on board
                                        </div>
                                    </div>

                                    <div style={{ fontSize: '0.65rem', color: '#64748b', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        Fleet size
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '0.4rem' }}>
                                        {(['S', 'M', 'L'] as const).map((s) => (
                                            <button key={s} onClick={() => { setPirateSize(s); setRpsSequence([]); }}
                                                style={{ ...chipStyle, ...(pirateSize === s ? chipActiveStyle : {}), flex: 1, textAlign: 'center' }}>
                                                {s} · {pirateSizes[s].creditCost}₵
                                            </button>
                                        ))}
                                    </div>

                                    <div style={{ fontSize: '0.65rem', color: '#64748b', marginBottom: '0.2rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        Battle sequence ({rpsSequence.length}/{selectedShip.rps_slots_total})
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.3rem', flexWrap: 'wrap', minHeight: 28 }}>
                                        {rpsSequence.map((r, i) => (
                                            <span key={i} style={rpsBadge}>{r === 'ROCK' ? '🪨' : r === 'PAPER' ? '📄' : '✂️'}</span>
                                        ))}
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                                        {['ROCK', 'PAPER', 'SCISSORS'].map((ch) => (
                                            <button key={ch} onClick={() => addRps(ch)} style={smallBtn}>
                                                {ch === 'ROCK' ? '🪨' : ch === 'PAPER' ? '📄' : '✂️'}
                                            </button>
                                        ))}
                                        {rpsSequence.length > 0 && (
                                            <button onClick={() => setRpsSequence([])} style={smallBtn}>✕ Clear</button>
                                        )}
                                    </div>

                                    <button
                                        onClick={() => setConfirmAttack(true)}
                                        disabled={rpsSequence.length === 0}
                                        style={{
                                            ...attackBtn,
                                            opacity: rpsSequence.length === 0 ? 0.45 : 1,
                                            cursor: rpsSequence.length === 0 ? 'not-allowed' : 'pointer',
                                        }}
                                    >
                                        <Skull size={14} /> Review & Launch Attack
                                    </button>
                                </div>
                            ) : (
                                <div style={{ fontSize: '0.72rem', color: '#64748b', textAlign: 'center', padding: '0.4rem 0' }}>
                                    Click a ship on the map or list to target it
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
    borderRadius: '1rem',
    border: '1px solid rgba(56,189,248,0.18)',
    background: 'linear-gradient(135deg, rgba(6,14,31,0.95), rgba(3,8,18,0.98))',
    padding: '0.5rem',
    boxShadow: '0 6px 32px rgba(0,0,0,0.55), inset 0 1px 0 rgba(56,189,248,0.06)',
    overflow: 'hidden',
};

const chipStyle: CSSProperties = {
    borderRadius: '9999px',
    border: '1px solid rgba(148,163,184,0.2)',
    background: 'rgba(15,8,2,0.65)',
    color: '#e2e8f0',
    fontSize: '0.65rem',
    padding: '0.22rem 0.5rem',
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
    padding: '0.28rem 0.5rem',
    fontSize: '0.72rem',
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
    width: 26,
    height: 26,
    borderRadius: '0.3rem',
    background: 'rgba(239,68,68,0.15)',
    border: '1px solid rgba(239,68,68,0.3)',
    fontSize: '0.8rem',
};

const targetInfoBox: CSSProperties = {
    borderRadius: '0.5rem',
    background: 'rgba(239,68,68,0.07)',
    border: '1px solid rgba(239,68,68,0.2)',
    padding: '0.4rem 0.5rem',
    marginBottom: '0.4rem',
};

const refreshBtn: CSSProperties = {
    borderRadius: '0.45rem',
    border: '1px solid rgba(56,189,248,0.2)',
    background: 'rgba(14,116,144,0.15)',
    color: '#38bdf8',
    padding: '0.25rem 0.4rem',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
};

