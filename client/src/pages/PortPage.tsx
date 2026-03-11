import { useEffect, useState, type CSSProperties } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Anchor, PackageCheck } from 'lucide-react';
import { useShipmentStore } from '../stores/shipmentStore';
import { renderItemIcon } from '../lib/itemVisual';
import TopNavBar from '../components/TopNavBar';
import ConfirmDialog from '../components/ConfirmDialog';

const PortPage = () => {
    const { portBoxes, fetchPort, claimCargo } = useShipmentStore();
    const [msg, setMsg] = useState<string | null>(null);
    const [claimTarget, setClaimTarget] = useState<{ id: number; source: string; size: string; items: { name: string; qty: number }[] } | null>(null);

    useEffect(() => {
        fetchPort();
        const iv = setInterval(fetchPort, 20_000);
        return () => clearInterval(iv);
    }, []);

    const showMsg = (m: string) => { setMsg(m); setTimeout(() => setMsg(null), 3000); };

    const handleClaim = async (boxId: number) => {
        const r = await claimCargo(boxId);
        if (!r.ok) showMsg(r.error || 'Failed');
        else showMsg('Cargo claimed to inventory!');
        setClaimTarget(null);
    };

    const tradeBoxes = portBoxes.filter((b) => b.source_type === 'trade');
    const pirateBoxes = portBoxes.filter((b) => b.source_type === 'pirate');

    return (
        <div className="bg-forge" style={pageStyle}>
            <TopNavBar />

            {/* Claim confirm dialog */}
            <ConfirmDialog
                open={claimTarget !== null}
                title={claimTarget?.source === 'pirate' ? '☠️ Claim Pirate Loot' : '📦 Claim Trade Cargo'}
                variant={claimTarget?.source === 'pirate' ? 'warning' : 'default'}
                description={claimTarget?.source === 'pirate'
                    ? 'Claim this pirate loot to your inventory?'
                    : 'Move this trade cargo from port storage to your inventory?'}
                details={[
                    { label: 'Box', value: `#${claimTarget?.id} [${claimTarget?.size}]` },
                    ...(claimTarget?.items ?? []).map((it) => ({ label: it.name, value: `×${it.qty}` })),
                ]}
                confirmLabel="Claim"
                onConfirm={() => handleClaim(claimTarget!.id)}
                onCancel={() => setClaimTarget(null)}
            />

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

            <main style={{ position: 'relative', zIndex: 1, maxWidth: 900, margin: '0 auto', padding: '1rem' }}>
                <h1 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '0.8rem', color: '#38bdf8' }}>
                    <Anchor size={20} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                    Port Storage
                </h1>

                {/* Trade Cargo */}
                <section style={{ marginBottom: '1.5rem' }}>
                    <h3 style={sectionTitle}>Incoming Trade Cargo ({tradeBoxes.length})</h3>
                    {tradeBoxes.length === 0 && (
                        <div style={{ ...cardStyle, color: '#64748b', textAlign: 'center' }}>No cargo waiting</div>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.6rem' }}>
                        {tradeBoxes.map((box) => (
                            <div key={box.id} style={cardStyle}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                                    <span style={{ fontWeight: 700, color: '#e2e8f0' }}>Box #{box.id} [{box.size}]</span>
                                    <span style={tradeBadge}>Trade</span>
                                </div>
                                <div style={{ marginBottom: '0.4rem' }}>
                                    {box.items.map((bi) => (
                                        <div key={bi.id} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.2rem 0' }}>
                                            {renderItemIcon(bi.item, 20)}
                                            <span style={{ fontSize: '0.7rem', color: '#cbd5e1' }}>{bi.item.name} x{bi.quantity}</span>
                                        </div>
                                    ))}
                                </div>
                                <button
                                    onClick={() => setClaimTarget({ id: box.id, source: box.source_type, size: box.size, items: box.items.map((bi) => ({ name: bi.item.name, qty: bi.quantity })) })}
                                    style={claimBtn}
                                >
                                    <PackageCheck size={14} /> Claim to Inventory
                                </button>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Pirate Loot */}
                <section>
                    <h3 style={{ ...sectionTitle, color: '#ef4444' }}>Pirate Loot ({pirateBoxes.length})</h3>
                    {pirateBoxes.length === 0 && (
                        <div style={{ ...cardStyle, color: '#64748b', textAlign: 'center' }}>No pirate loot</div>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.6rem' }}>
                        {pirateBoxes.map((box) => (
                            <div key={box.id} style={{ ...cardStyle, borderColor: 'rgba(239,68,68,0.25)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                                    <span style={{ fontWeight: 700, color: '#e2e8f0' }}>Loot #{box.id} [{box.size}]</span>
                                    <span style={pirateBadge}>Pirate</span>
                                </div>
                                <div style={{ marginBottom: '0.4rem' }}>
                                    {box.items.map((bi) => (
                                        <div key={bi.id} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.2rem 0' }}>
                                            {renderItemIcon(bi.item, 20)}
                                            <span style={{ fontSize: '0.7rem', color: '#cbd5e1' }}>{bi.item.name} x{bi.quantity}</span>
                                        </div>
                                    ))}
                                </div>
                                <button
                                    onClick={() => setClaimTarget({ id: box.id, source: box.source_type, size: box.size, items: box.items.map((bi) => ({ name: bi.item.name, qty: bi.quantity })) })}
                                    style={{ ...claimBtn, borderColor: 'rgba(239,68,68,0.35)', background: 'linear-gradient(135deg, rgba(180,30,30,0.5), rgba(220,38,38,0.35))' }}
                                >
                                    <PackageCheck size={14} /> Claim Loot
                                </button>
                            </div>
                        ))}
                    </div>
                </section>
            </main>
        </div>
    );
};

export default PortPage;

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

const sectionTitle: CSSProperties = {
    fontSize: '0.85rem',
    fontWeight: 700,
    color: '#e2e8f0',
    marginBottom: '0.5rem',
};

const claimBtn: CSSProperties = {
    borderRadius: '0.55rem',
    border: '1px solid rgba(56,189,248,0.35)',
    background: 'linear-gradient(135deg, rgba(14,116,144,0.5), rgba(6,182,212,0.35))',
    color: '#cffafe',
    padding: '0.35rem 0.65rem',
    fontSize: '0.72rem',
    fontWeight: 700,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.3rem',
};

const tradeBadge: CSSProperties = {
    display: 'inline-block',
    borderRadius: '9999px',
    padding: '0.12rem 0.45rem',
    fontSize: '0.6rem',
    fontWeight: 700,
    color: '#22c55e',
    border: '1px solid rgba(34,197,94,0.3)',
    background: 'rgba(34,197,94,0.1)',
};

const pirateBadge: CSSProperties = {
    display: 'inline-block',
    borderRadius: '9999px',
    padding: '0.12rem 0.45rem',
    fontSize: '0.6rem',
    fontWeight: 700,
    color: '#ef4444',
    border: '1px solid rgba(239,68,68,0.3)',
    background: 'rgba(239,68,68,0.1)',
};
