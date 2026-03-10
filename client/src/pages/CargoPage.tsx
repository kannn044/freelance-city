import { useEffect, useState, type CSSProperties } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Package, Plus, Lock, Trash2, ShoppingCart, ArrowRight } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useGameStore } from '../stores/gameStore';
import { useShipmentStore } from '../stores/shipmentStore';
import { renderItemIcon } from '../lib/itemVisual';
import { CARGO_BOX_CONFIG } from '../../../shared/gameConfig';
import TopNavBar from '../components/TopNavBar';

type BoxSize = 'S' | 'M' | 'L';

const CargoPage = () => {
    const user = useAuthStore((s) => s.user);
    const { inventory, fetchInventory } = useGameStore();
    const {
        cargoBoxes,
        fetchCargoBoxes,
        buyCargoBox,
        packCargo,
        unpackCargo,
        finalizeCargo,
        discardCargo,
        sellCargoListing,
        orders,
        fetchOrders,
        cancelOrder,
        publicSchedule,
        fetchPublicSchedule,
        loadPublicShip,
    } = useShipmentStore();

    const [activeTab, setActiveTab] = useState<'BOXES' | 'ORDERS'>('BOXES');
    const [selectedBoxId, setSelectedBoxId] = useState<number | null>(null);
    const [packSlotId, setPackSlotId] = useState<number | null>(null);
    const [packQty, setPackQty] = useState(1);
    const [sellBoxId, setSellBoxId] = useState<number | null>(null);
    const [sellPrice, setSellPrice] = useState('');
    const [msg, setMsg] = useState<string | null>(null);

    useEffect(() => {
        fetchCargoBoxes();
        fetchInventory();
        fetchOrders();
        fetchPublicSchedule();
        const iv = setInterval(() => {
            fetchOrders();
            fetchPublicSchedule();
        }, 5000);
        return () => clearInterval(iv);
    }, []);

    const showMsg = (m: string) => { setMsg(m); setTimeout(() => setMsg(null), 3000); };

    const handleBuyBox = async (size: BoxSize) => {
        const r = await buyCargoBox(size);
        if (!r.ok) showMsg(r.error || 'Failed');
        else { showMsg('Cargo box purchased!'); fetchInventory(); }
    };

    const handlePack = async (boxId: number) => {
        if (!packSlotId) return;
        const r = await packCargo(boxId, packSlotId, packQty);
        if (!r.ok) showMsg(r.error || 'Failed');
        else { showMsg('Packed!'); fetchInventory(); setPackSlotId(null); setPackQty(1); }
    };

    const handleUnpack = async (boxId: number, boxItemId: number, qty: number) => {
        const r = await unpackCargo(boxId, boxItemId, qty);
        if (!r.ok) showMsg(r.error || 'Failed');
        else { showMsg('Unpacked!'); fetchInventory(); }
    };

    const handleFinalize = async (boxId: number) => {
        const r = await finalizeCargo(boxId);
        if (!r.ok) showMsg(r.error || 'Failed');
        else showMsg('Cargo sealed!');
    };

    const handleDiscard = async (boxId: number) => {
        const r = await discardCargo(boxId);
        if (!r.ok) showMsg(r.error || 'Failed');
        else { showMsg('Discarded & items returned.'); fetchInventory(); setSelectedBoxId(null); }
    };

    const handleSell = async () => {
        if (!sellBoxId || !sellPrice) return;
        const r = await sellCargoListing(sellBoxId, Number(sellPrice));
        if (!r.ok) showMsg(r.error || 'Failed');
        else { showMsg('Listed on marketplace!'); setSellBoxId(null); setSellPrice(''); }
    };

    const handleCancelOrder = async (orderId: number) => {
        const r = await cancelOrder(orderId);
        if (!r.ok) showMsg(r.error || 'Failed');
        else showMsg('Order cancelled.');
    };

    const handleLoadPublic = async (orderId: number, shipId: number) => {
        const r = await loadPublicShip(orderId, shipId);
        if (!r.ok) showMsg(r.error || 'Failed');
        else showMsg('Loaded onto public ship!');
    };

    const selectedBox = cargoBoxes.find((b) => b.id === selectedBoxId);
    const myBuyOrders = orders.filter((o) => o.buyer_id === user?.id);
    const mySellOrders = orders.filter((o) => o.seller_id === user?.id);

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

            <main style={{ position: 'relative', zIndex: 1, maxWidth: 1100, margin: '0 auto', padding: '1rem' }}>
                <h1 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '0.6rem', color: '#fbbf24' }}>
                    <Package size={20} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                    Cargo Management
                </h1>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                    {(['BOXES', 'ORDERS'] as const).map((tab) => (
                        <button key={tab} onClick={() => setActiveTab(tab)} style={{
                            ...chipStyle,
                            ...(activeTab === tab ? chipActiveStyle : {}),
                        }}>
                            {tab === 'BOXES' ? 'My Cargo Boxes' : 'My Orders'}
                        </button>
                    ))}
                </div>

                {activeTab === 'BOXES' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        {/* Left: Buy + List */}
                        <section>
                            <h3 style={sectionTitle}>Buy Cargo Box</h3>
                            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                                {(['S', 'M', 'L'] as const).map((size) => {
                                    const cfg = CARGO_BOX_CONFIG.sizes[size];
                                    return (
                                        <button key={size} onClick={() => handleBuyBox(size)} style={buyBoxBtn}>
                                            <strong>{size}</strong>
                                            <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>
                                                {cfg.capacity} slots &middot; {cfg.price}&#x20B5;
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>

                            <h3 style={sectionTitle}>My Boxes ({cargoBoxes.length}/{CARGO_BOX_CONFIG.maxBoxesPerPlayer})</h3>
                            {cargoBoxes.map((box) => (
                                <div
                                    key={box.id}
                                    onClick={() => setSelectedBoxId(box.id)}
                                    style={{
                                        ...cardStyle,
                                        border: selectedBoxId === box.id ? '1px solid rgba(251,191,36,0.5)' : '1px solid rgba(148,163,184,0.2)',
                                        cursor: 'pointer',
                                        marginBottom: '0.5rem',
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontWeight: 700, color: '#e2e8f0' }}>
                                            Box #{box.id} [{box.size}]
                                        </span>
                                        <span style={statusBadge(box.status)}>{box.status}</span>
                                    </div>
                                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                                        {box.items.length}/{box.slot_capacity} items packed
                                    </div>
                                </div>
                            ))}
                        </section>

                        {/* Right: Box Detail */}
                        <section>
                            {selectedBox ? (
                                <div style={cardStyle}>
                                    <h3 style={{ margin: 0, marginBottom: '0.5rem', color: '#fbbf24' }}>
                                        Box #{selectedBox.id} [{selectedBox.size}] — {selectedBox.status}
                                    </h3>

                                    {/* Items in box */}
                                    <div style={{ marginBottom: '0.75rem' }}>
                                        <strong style={{ fontSize: '0.75rem', color: '#e2e8f0' }}>Contents:</strong>
                                        {selectedBox.items.length === 0 && (
                                            <p style={{ fontSize: '0.72rem', color: '#64748b' }}>Empty</p>
                                        )}
                                        {selectedBox.items.map((bi) => (
                                            <div key={bi.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.3rem 0', borderBottom: '1px solid rgba(148,163,184,0.1)' }}>
                                                {renderItemIcon(bi.item, 24)}
                                                <span style={{ fontSize: '0.72rem', color: '#e2e8f0', flex: 1 }}>
                                                    {bi.item.name} x{bi.quantity}
                                                </span>
                                                {(selectedBox.status === 'EMPTY' || selectedBox.status === 'PACKING' || selectedBox.status === 'PACKED') && (
                                                    <button onClick={() => handleUnpack(selectedBox.id, bi.id, bi.quantity)} style={smallBtn}>
                                                        Unpack
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>

                                    {/* Pack from inventory */}
                                    {(selectedBox.status === 'EMPTY' || selectedBox.status === 'PACKING') && (
                                        <div style={{ borderTop: '1px solid rgba(148,163,184,0.15)', paddingTop: '0.5rem' }}>
                                            <strong style={{ fontSize: '0.75rem', color: '#e2e8f0' }}>Pack from inventory:</strong>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.3rem', maxHeight: 150, overflowY: 'auto' }}>
                                                {inventory.filter((s) => s.item).map((slot) => (
                                                    <div
                                                        key={slot.id}
                                                        onClick={() => setPackSlotId(slot.id)}
                                                        style={{
                                                            padding: '0.25rem 0.4rem',
                                                            borderRadius: '0.4rem',
                                                            border: packSlotId === slot.id ? '1px solid #fbbf24' : '1px solid rgba(148,163,184,0.2)',
                                                            background: packSlotId === slot.id ? 'rgba(251,191,36,0.12)' : 'rgba(15,8,2,0.5)',
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '0.25rem',
                                                        }}
                                                    >
                                                        {renderItemIcon(slot.item!, 20)}
                                                        <span style={{ fontSize: '0.65rem', color: '#e2e8f0' }}>{slot.item!.name} x{slot.quantity}</span>
                                                    </div>
                                                ))}
                                            </div>
                                            {packSlotId && (
                                                <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem', alignItems: 'center' }}>
                                                    <input
                                                        type="number" min={1} value={packQty}
                                                        onChange={(e) => setPackQty(Math.max(1, Number(e.target.value)))}
                                                        style={{ ...inputStyle, width: 60 }}
                                                    />
                                                    <button onClick={() => handlePack(selectedBox.id)} style={primaryBtn}>
                                                        <Plus size={14} /> Pack
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Action buttons */}
                                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                                        {selectedBox.status === 'PACKING' && selectedBox.items.length > 0 && (
                                            <button onClick={() => handleFinalize(selectedBox.id)} style={primaryBtn}>
                                                <Lock size={14} /> Seal Cargo
                                            </button>
                                        )}
                                        {selectedBox.status === 'PACKED' && (
                                            <button onClick={() => setSellBoxId(selectedBox.id)} style={primaryBtn}>
                                                <ShoppingCart size={14} /> List on Market
                                            </button>
                                        )}
                                        {(selectedBox.status === 'EMPTY' || selectedBox.status === 'PACKING' || selectedBox.status === 'PACKED') && (
                                            <button onClick={() => handleDiscard(selectedBox.id)} style={dangerBtn}>
                                                <Trash2 size={14} /> Discard
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div style={{ ...cardStyle, color: '#64748b', textAlign: 'center', padding: '2rem' }}>
                                    Select a cargo box to manage
                                </div>
                            )}
                        </section>
                    </div>
                )}

                {activeTab === 'ORDERS' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        {/* Sell Orders */}
                        <section>
                            <h3 style={sectionTitle}>Sell Orders (Ship cargo)</h3>
                            {mySellOrders.filter((o) => o.status === 'PENDING').map((order) => {
                                const matchingShips = publicSchedule.filter(
                                    (s) => s.origin_city === user?.city_key && s.dest_city !== user?.city_key
                                );
                                return (
                                    <div key={order.id} style={{ ...cardStyle, marginBottom: '0.5rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span style={{ fontWeight: 700, color: '#e2e8f0' }}>Order #{order.id}</span>
                                            <span style={statusBadge(order.status)}>{order.status}</span>
                                        </div>
                                        <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                                            Price: {order.price}&#x20B5; · Expires: {new Date(order.expires_at).toLocaleTimeString()}
                                        </div>
                                        <div style={{ marginTop: '0.4rem' }}>
                                            <span style={{ fontSize: '0.7rem', color: '#cbd5e1' }}>Load onto public ship:</span>
                                            <div style={{ display: 'flex', gap: '0.3rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
                                                {matchingShips.map((ship) => (
                                                    <button
                                                        key={ship.id}
                                                        onClick={() => handleLoadPublic(order.id, ship.id)}
                                                        style={smallBtn}
                                                    >
                                                        <ArrowRight size={12} /> {ship.dest_city}
                                                        {ship.departs_at && (
                                                            <span style={{ fontSize: '0.6rem', color: '#94a3b8', marginLeft: 4 }}>
                                                                departs {new Date(ship.departs_at).toLocaleTimeString()}
                                                            </span>
                                                        )}
                                                    </button>
                                                ))}
                                                {matchingShips.length === 0 && (
                                                    <span style={{ fontSize: '0.65rem', color: '#64748b' }}>No ships available</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                            {mySellOrders.filter((o) => o.status === 'PENDING').length === 0 && (
                                <div style={{ ...cardStyle, color: '#64748b', textAlign: 'center' }}>No pending sell orders</div>
                            )}
                        </section>

                        {/* Buy Orders */}
                        <section>
                            <h3 style={sectionTitle}>Buy Orders</h3>
                            {myBuyOrders.map((order) => (
                                <div key={order.id} style={{ ...cardStyle, marginBottom: '0.5rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span style={{ fontWeight: 700, color: '#e2e8f0' }}>Order #{order.id}</span>
                                        <span style={statusBadge(order.status)}>{order.status}</span>
                                    </div>
                                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                                        Price: {order.price}&#x20B5; · Locked: {order.locked_amount}&#x20B5;
                                    </div>
                                    {order.status === 'PENDING' && (
                                        <button onClick={() => handleCancelOrder(order.id)} style={{ ...dangerBtn, marginTop: '0.4rem' }}>
                                            Cancel
                                        </button>
                                    )}
                                </div>
                            ))}
                            {myBuyOrders.length === 0 && (
                                <div style={{ ...cardStyle, color: '#64748b', textAlign: 'center' }}>No buy orders</div>
                            )}
                        </section>
                    </div>
                )}
            </main>

            {/* Sell Modal */}
            {sellBoxId && (
                <div onClick={() => setSellBoxId(null)} style={overlayStyle}>
                    <div onClick={(e) => e.stopPropagation()} style={modalStyle}>
                        <h3 style={{ margin: 0, marginBottom: '0.5rem', color: '#fbbf24' }}>List Cargo Box #{sellBoxId}</h3>
                        <label style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Price (credits)</label>
                        <input
                            type="number" min={1} value={sellPrice}
                            onChange={(e) => setSellPrice(e.target.value)}
                            style={{ ...inputStyle, width: '100%', marginBottom: '0.5rem' }}
                        />
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                            <button onClick={() => setSellBoxId(null)} style={smallBtn}>Cancel</button>
                            <button onClick={handleSell} style={primaryBtn}>List for Sale</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CargoPage;

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

const chipStyle: CSSProperties = {
    borderRadius: '9999px',
    border: '1px solid rgba(245,158,11,0.2)',
    background: 'rgba(15,8,2,0.65)',
    color: '#fbbf24',
    fontSize: '0.72rem',
    padding: '0.3rem 0.7rem',
    cursor: 'pointer',
    fontWeight: 600,
};

const chipActiveStyle: CSSProperties = {
    background: 'rgba(251,191,36,0.2)',
    border: '1px solid rgba(251,191,36,0.5)',
};

const inputStyle: CSSProperties = {
    borderRadius: '0.5rem',
    border: '1px solid rgba(148,163,184,0.3)',
    background: 'rgba(15,8,2,0.8)',
    color: '#e2e8f0',
    padding: '0.3rem 0.5rem',
    fontSize: '0.72rem',
};

const primaryBtn: CSSProperties = {
    borderRadius: '0.55rem',
    border: '1px solid rgba(245,158,11,0.35)',
    background: 'linear-gradient(135deg, rgba(180,83,9,0.5), rgba(234,88,12,0.35))',
    color: '#fef3c7',
    padding: '0.35rem 0.65rem',
    fontSize: '0.72rem',
    fontWeight: 700,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.3rem',
};

const dangerBtn: CSSProperties = {
    ...primaryBtn,
    border: '1px solid rgba(239,68,68,0.35)',
    background: 'linear-gradient(135deg, rgba(180,30,30,0.5), rgba(220,38,38,0.35))',
    color: '#fecaca',
};

const smallBtn: CSSProperties = {
    borderRadius: '0.45rem',
    border: '1px solid rgba(148,163,184,0.25)',
    background: 'rgba(30,19,10,0.7)',
    color: '#cbd5e1',
    padding: '0.25rem 0.5rem',
    fontSize: '0.65rem',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.2rem',
};

const buyBoxBtn: CSSProperties = {
    ...cardStyle,
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.15rem',
    padding: '0.5rem 1rem',
    color: '#fbbf24',
    fontWeight: 700,
    fontSize: '0.9rem',
};

const overlayStyle: CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(5,2,0,0.78)',
    backdropFilter: 'blur(4px)',
    zIndex: 40,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1rem',
};

const modalStyle: CSSProperties = {
    width: '100%',
    maxWidth: 420,
    borderRadius: '0.9rem',
    border: '1px solid rgba(245,158,11,0.28)',
    background: 'linear-gradient(135deg, rgba(22,13,5,0.97), rgba(10,5,0,0.97))',
    boxShadow: '0 20px 45px rgba(0,0,0,0.65)',
    padding: '1rem',
};

function statusBadge(status: string): CSSProperties {
    const colors: Record<string, string> = {
        OPEN: '#22c55e',
        SEALED: '#3b82f6',
        LISTED: '#8b5cf6',
        SOLD: '#eab308',
        SHIPPING: '#f97316',
        AT_PORT: '#06b6d4',
        CLAIMED: '#64748b',
        PIRATED: '#ef4444',
        PENDING: '#eab308',
        DELIVERED: '#22c55e',
        CANCELLED_TIMEOUT: '#ef4444',
    };
    return {
        display: 'inline-block',
        borderRadius: '9999px',
        padding: '0.12rem 0.45rem',
        fontSize: '0.6rem',
        fontWeight: 700,
        color: colors[status] || '#94a3b8',
        border: `1px solid ${colors[status] || '#94a3b8'}44`,
        background: `${colors[status] || '#94a3b8'}18`,
    };
}
