import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
    ArrowLeft,
    Clock3,
    Filter,
    Gem,
    Layers,
    RefreshCw,
    Search,
    ShoppingCart,
    Sparkles,
    Tag,
    Store,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useGameStore } from '../stores/gameStore';
import { renderItemIcon } from '../lib/itemVisual';
import { getEquipmentRarityColor, getEquipmentRarityLabel, type EquipmentRarity } from '../lib/equipmentRarity';

type SortMode = 'PRICE_ASC' | 'PRICE_DESC' | 'NEWEST' | 'QTY_DESC';
type ItemTypeFilter = 'ALL' | 'SEED' | 'RAW' | 'INGREDIENT' | 'MEAL' | 'EQUIPMENT';
type RarityFilter = 'ALL' | EquipmentRarity;

const itemTypeOptions: ItemTypeFilter[] = ['ALL', 'SEED', 'RAW', 'INGREDIENT', 'MEAL', 'EQUIPMENT'];
const rarityOptions: RarityFilter[] = ['ALL', 'NORMAL', 'RARE', 'EPIC', 'LEGENDARY'];

const MarketplacePage = () => {
    const navigate = useNavigate();
    const user = useAuthStore((s) => s.user);
    const {
        marketListings,
        inventory,
        salesHistory,
        fetchMarket,
        fetchInventory,
        fetchSalesHistory,
        buyListing,
        createListing,
        cancelListing,
    } = useGameStore();

    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState<ItemTypeFilter>('ALL');
    const [rarityFilter, setRarityFilter] = useState<RarityFilter>('ALL');
    const [cityFilter, setCityFilter] = useState('ALL');
    const [minPriceInput, setMinPriceInput] = useState('');
    const [maxPriceInput, setMaxPriceInput] = useState('');
    const [showAffordableOnly, setShowAffordableOnly] = useState(false);
    const [sortMode, setSortMode] = useState<SortMode>('PRICE_ASC');

    const [marketBuyQty, setMarketBuyQty] = useState<Record<number, number>>({});
    const [sellSlotId, setSellSlotId] = useState<number | null>(null);
    const [sellQtyInput, setSellQtyInput] = useState('1');
    const [sellPriceInput, setSellPriceInput] = useState('100');
    const [lastRefreshedAt, setLastRefreshedAt] = useState<string>('');

    const refreshNow = () => {
        setLastRefreshedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        void Promise.all([fetchMarket(), fetchInventory(), fetchSalesHistory()]);
    };

    useEffect(() => {
        refreshNow();
        const interval = setInterval(refreshNow, 5000);
        return () => clearInterval(interval);
    }, [fetchInventory, fetchMarket, fetchSalesHistory]);

    const ownListings = useMemo(
        () => marketListings.filter((l) => l.seller_id === user?.id).sort((a, b) => b.id - a.id),
        [marketListings, user?.id]
    );

    const cityOptions = useMemo(() => {
        const unique = new Map<string, string>();
        for (const listing of marketListings) {
            if (!listing.seller.city_key) continue;
            unique.set(listing.seller.city_key, listing.seller.city_name ?? listing.seller.city_key);
        }

        return [{ key: 'ALL', name: 'All Cities' }, ...Array.from(unique.entries()).map(([key, name]) => ({ key, name }))];
    }, [marketListings]);

    const minPrice = minPriceInput.trim() === '' ? null : Number(minPriceInput);
    const maxPrice = maxPriceInput.trim() === '' ? null : Number(maxPriceInput);

    const listings = useMemo(() => {
        const keyword = search.trim().toLowerCase();

        const filtered = marketListings
            .filter((l) => l.seller_id !== user?.id)
            .filter((l) => {
                if (!keyword) return true;
                const sellerName = l.seller.email.split('@')[0] ?? l.seller.email;
                const cityName = (l.seller.city_name ?? l.seller.city_key ?? '').toLowerCase();
                return (
                    l.item.name.toLowerCase().includes(keyword) ||
                    sellerName.toLowerCase().includes(keyword) ||
                    cityName.includes(keyword)
                );
            })
            .filter((l) => (typeFilter === 'ALL' ? true : l.item.type === typeFilter))
            .filter((l) => (rarityFilter === 'ALL' ? true : (l.equipment_rarity ?? 'NORMAL') === rarityFilter))
            .filter((l) => (cityFilter === 'ALL' ? true : (l.seller.city_key ?? 'UNKNOWN') === cityFilter))
            .filter((l) => {
                if (minPrice !== null && Number.isFinite(minPrice) && l.price < minPrice) return false;
                if (maxPrice !== null && Number.isFinite(maxPrice) && l.price > maxPrice) return false;
                return true;
            })
            .filter((l) => {
                if (!showAffordableOnly || !user) return true;
                const qty = Math.max(1, marketBuyQty[l.id] ?? 1);
                return user.money >= l.price * qty;
            });

        const sorted = [...filtered];
        sorted.sort((a, b) => {
            if (sortMode === 'PRICE_ASC') return a.price - b.price;
            if (sortMode === 'PRICE_DESC') return b.price - a.price;
            if (sortMode === 'QTY_DESC') return b.quantity - a.quantity;
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });

        return sorted;
    }, [cityFilter, marketBuyQty, marketListings, maxPrice, minPrice, rarityFilter, search, showAffordableOnly, sortMode, typeFilter, user]);

    const sellableSlots = useMemo(
        () => inventory.filter((s) => s.item && s.quantity > 0).sort((a, b) => a.slot - b.slot),
        [inventory]
    );
    const selectedSellSlot = sellSlotId === null ? null : sellableSlots.find((s) => s.id === sellSlotId) ?? null;
    const sellQty = Math.max(1, Math.floor(Number(sellQtyInput || 1)));
    const sellPrice = Math.max(1, Math.floor(Number(sellPriceInput || 1)));

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
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                <motion.div
                    style={{
                        position: 'absolute',
                        top: '-6rem',
                        right: '-8rem',
                        width: '30rem',
                        height: '30rem',
                        borderRadius: '50%',
                        background: 'radial-gradient(circle, rgba(56,189,248,0.22), rgba(56,189,248,0))',
                        filter: 'blur(12px)',
                    }}
                    animate={{ x: [0, -20, 0], y: [0, 15, 0] }}
                    transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
                />
                <motion.div
                    style={{
                        position: 'absolute',
                        bottom: '-9rem',
                        left: '-10rem',
                        width: '34rem',
                        height: '34rem',
                        borderRadius: '50%',
                        background: 'radial-gradient(circle, rgba(168,85,247,0.18), rgba(168,85,247,0))',
                        filter: 'blur(16px)',
                    }}
                    animate={{ x: [0, 25, 0], y: [0, -20, 0] }}
                    transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
                />
            </div>

            <header
                style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 20,
                    borderBottom: '1px solid rgba(129, 140, 248, 0.18)',
                    background: 'rgba(10, 14, 23, 0.72)',
                    backdropFilter: 'blur(20px)',
                }}
            >
                <div
                    style={{
                        maxWidth: '1320px',
                        margin: '0 auto',
                        height: '4.6rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0 1.35rem',
                        gap: '1rem',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
                        <button
                            onClick={() => navigate('/dashboard')}
                            style={{
                                borderRadius: '0.7rem',
                                border: '1px solid rgba(191,219,254,0.2)',
                                background: 'rgba(30,41,59,0.5)',
                                color: '#dbeafe',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.4rem',
                                fontSize: '0.76rem',
                                padding: '0.46rem 0.72rem',
                                cursor: 'pointer',
                            }}
                        >
                            <ArrowLeft size={14} />
                            Dashboard
                        </button>
                        <div>
                            <div style={{ fontSize: '1.08rem', fontWeight: 700, letterSpacing: '-0.02em', display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
                                <Sparkles size={15} style={{ color: '#c4b5fd' }} />
                                Marketplace Hub
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.62)' }}>
                                Trading Terminal แบบเต็มจอ • ฟิลเตอร์ละเอียด • ลงขายจาก Inventory ได้ทันที
                            </div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
                        <div
                            style={{
                                borderRadius: '9999px',
                                background: 'rgba(52, 211, 153, 0.12)',
                                padding: '0.36rem 0.85rem',
                                border: '1px solid rgba(52, 211, 153, 0.24)',
                                fontFamily: 'monospace',
                                color: '#6ee7b7',
                                fontSize: '0.82rem',
                                fontWeight: 700,
                            }}
                        >
                            💰 {user?.money?.toLocaleString() ?? '-'}
                        </div>
                        <button
                            onClick={refreshNow}
                            style={{
                                borderRadius: '0.7rem',
                                border: '1px solid rgba(191,219,254,0.2)',
                                background: 'rgba(30,41,59,0.52)',
                                color: '#dbeafe',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                                fontSize: '0.76rem',
                                padding: '0.45rem 0.7rem',
                                cursor: 'pointer',
                            }}
                        >
                            <RefreshCw size={13} />
                            Refresh
                        </button>
                    </div>
                </div>
            </header>

            <main style={{ maxWidth: '1320px', margin: '0 auto', padding: '1.2rem', position: 'relative', zIndex: 1 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.8rem', marginBottom: '0.8rem' }}>
                    <div style={statCardStyle}>
                        <div style={statLabelStyle}>Listed Items</div>
                        <div style={statValueStyle}>{listings.length.toLocaleString()}</div>
                    </div>
                    <div style={statCardStyle}>
                        <div style={statLabelStyle}>My Active Listings</div>
                        <div style={statValueStyle}>{ownListings.length.toLocaleString()}</div>
                    </div>
                    <div style={statCardStyle}>
                        <div style={statLabelStyle}>Recent Sales</div>
                        <div style={statValueStyle}>{salesHistory.length.toLocaleString()}</div>
                    </div>
                    <div style={statCardStyle}>
                        <div style={statLabelStyle}>Last Sync</div>
                        <div style={{ ...statValueStyle, fontSize: '1rem' }}>{lastRefreshedAt || '--:--'}</div>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '2.35fr 1.15fr', gap: '1rem', alignItems: 'start' }}>
                    <section className="glass-card" style={{ padding: '1rem', border: '1px solid rgba(99,102,241,0.24)', background: 'rgba(15,23,42,0.7)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
                            <h2 style={{ margin: 0, fontSize: '0.98rem', display: 'inline-flex', gap: '0.45rem', alignItems: 'center' }}>
                                <ShoppingCart size={15} />
                                Player Listings ({listings.length})
                            </h2>
                            <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.56)', display: 'inline-flex', alignItems: 'center', gap: '0.28rem' }}>
                                <Clock3 size={12} /> auto refresh ทุก 5 วินาที
                            </div>
                        </div>

                        <div
                            style={{
                                border: '1px solid rgba(255,255,255,0.08)',
                                background: 'linear-gradient(135deg, rgba(99,102,241,0.14), rgba(14,116,144,0.12))',
                                borderRadius: '0.85rem',
                                padding: '0.75rem',
                                marginBottom: '0.8rem',
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.55rem', color: '#c7d2fe', fontSize: '0.8rem', fontWeight: 600 }}>
                                <Filter size={14} /> Filters
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1.1fr 0.8fr 0.8fr 1fr', gap: '0.45rem' }}>
                                <div style={{ position: 'relative' }}>
                                    <Search size={14} style={{ position: 'absolute', left: '0.5rem', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.45)' }} />
                                    <input
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        placeholder="Search item / seller / city"
                                        style={{ ...inputStyle, paddingLeft: '1.65rem' }}
                                    />
                                </div>
                                <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as ItemTypeFilter)} style={inputStyle}>
                                    {itemTypeOptions.map((t) => (
                                        <option key={t} value={t}>{t}</option>
                                    ))}
                                </select>
                                <select value={rarityFilter} onChange={(e) => setRarityFilter(e.target.value as RarityFilter)} style={inputStyle}>
                                    {rarityOptions.map((r) => (
                                        <option key={r} value={r}>{r}</option>
                                    ))}
                                </select>
                                <select value={cityFilter} onChange={(e) => setCityFilter(e.target.value)} style={inputStyle}>
                                    {cityOptions.map((c) => (
                                        <option key={c.key} value={c.key}>{c.name}</option>
                                    ))}
                                </select>
                                <input
                                    value={minPriceInput}
                                    onChange={(e) => setMinPriceInput(e.target.value)}
                                    placeholder="Min"
                                    type="number"
                                    min={0}
                                    style={inputStyle}
                                />
                                <input
                                    value={maxPriceInput}
                                    onChange={(e) => setMaxPriceInput(e.target.value)}
                                    placeholder="Max"
                                    type="number"
                                    min={0}
                                    style={inputStyle}
                                />
                                <select value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)} style={inputStyle}>
                                    <option value="PRICE_ASC">Price ↑</option>
                                    <option value="PRICE_DESC">Price ↓</option>
                                    <option value="NEWEST">Newest</option>
                                    <option value="QTY_DESC">Quantity</option>
                                </select>
                            </div>
                            <div style={{ marginTop: '0.55rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.74rem', color: 'rgba(255,255,255,0.75)' }}>
                                    <input
                                        type="checkbox"
                                        checked={showAffordableOnly}
                                        onChange={(e) => setShowAffordableOnly(e.target.checked)}
                                    />
                                    แสดงเฉพาะที่เงินพอซื้อ
                                </label>

                                <div style={{ display: 'inline-flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                                    <button type="button" onClick={() => { setTypeFilter('EQUIPMENT'); setSortMode('PRICE_DESC'); }} style={chipButtonStyle}>High-end Gear</button>
                                    <button type="button" onClick={() => { setSortMode('PRICE_ASC'); setShowAffordableOnly(true); }} style={chipButtonStyle}>Budget Deals</button>
                                    <button type="button" onClick={() => { setSearch(''); setTypeFilter('ALL'); setRarityFilter('ALL'); setCityFilter('ALL'); setMinPriceInput(''); setMaxPriceInput(''); setShowAffordableOnly(false); setSortMode('PRICE_ASC'); }} style={chipButtonStyle}>Reset</button>
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', maxHeight: '65vh', overflowY: 'auto', paddingRight: '0.2rem' }}>
                            {listings.map((listing) => {
                                const qty = Math.max(1, Math.min(listing.quantity, marketBuyQty[listing.id] ?? 1));
                                const totalPrice = qty * listing.price;
                                const sellerName = listing.seller.email.split('@')[0] ?? listing.seller.email;
                                const cityName = listing.seller.city_name ?? listing.seller.city_key ?? 'Unknown City';
                                const rarity = listing.equipment_rarity ?? null;
                                const canBuy = !!user && user.money >= totalPrice;

                                return (
                                    <motion.div
                                        key={listing.id}
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        style={{
                                            border: '1px solid rgba(148,163,184,0.18)',
                                            borderRadius: '0.9rem',
                                            padding: '0.78rem',
                                            background: 'linear-gradient(135deg, rgba(30,41,59,0.8), rgba(2,6,23,0.92))',
                                            display: 'grid',
                                            gridTemplateColumns: '1.8fr 1fr 0.75fr',
                                            gap: '0.75rem',
                                            alignItems: 'center',
                                            boxShadow: '0 10px 25px rgba(2,6,23,0.4)',
                                        }}
                                    >
                                        <div>
                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
                                                {renderItemIcon(listing.item, 20)}
                                                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: rarity ? getEquipmentRarityColor(rarity) : '#f8fafc' }}>
                                                    {listing.item.name}
                                                    {rarity ? ` (${getEquipmentRarityLabel(rarity)})` : ''}
                                                </span>
                                            </div>
                                            <div style={{ marginTop: '0.35rem', display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                                                <span style={metaPillStyle}><Layers size={11} /> {listing.item.type}</span>
                                                <span style={metaPillStyle}><Store size={11} /> {sellerName}</span>
                                                <span style={metaPillStyle}><Gem size={11} /> {cityName}</span>
                                            </div>
                                            <div style={{ marginTop: '0.3rem', fontSize: '0.73rem', color: '#c7d2fe' }}>
                                                Available: {listing.quantity.toLocaleString()} • Unit: {listing.price.toLocaleString()} credits
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                            <input
                                                type="number"
                                                min={1}
                                                max={listing.quantity}
                                                value={qty}
                                                onChange={(e) => {
                                                    const next = Math.max(1, Math.min(listing.quantity, Math.floor(Number(e.target.value || 1))));
                                                    setMarketBuyQty((prev) => ({ ...prev, [listing.id]: next }));
                                                }}
                                                style={inputStyle}
                                            />
                                            <div style={{ fontSize: '0.72rem', color: canBuy ? '#86efac' : '#fda4af', fontWeight: 600 }}>
                                                Total: {totalPrice.toLocaleString()}
                                            </div>
                                        </div>

                                        <button
                                            disabled={!canBuy}
                                            onClick={() => {
                                                void buyListing(listing.id, qty);
                                            }}
                                            style={{
                                                border: '1px solid rgba(52,211,153,0.35)',
                                                background: canBuy ? 'linear-gradient(135deg, rgba(16,185,129,0.25), rgba(52,211,153,0.16))' : 'rgba(100,116,139,0.18)',
                                                color: canBuy ? '#d1fae5' : '#94a3b8',
                                                borderRadius: '0.65rem',
                                                padding: '0.5rem 0.65rem',
                                                cursor: canBuy ? 'pointer' : 'not-allowed',
                                                fontSize: '0.78rem',
                                                fontWeight: 700,
                                            }}
                                        >
                                            Buy
                                        </button>
                                    </motion.div>
                                );
                            })}

                            {listings.length === 0 && (
                                <div style={{ border: '1px dashed rgba(255,255,255,0.2)', borderRadius: '0.85rem', padding: '1.1rem', color: 'rgba(255,255,255,0.6)', textAlign: 'center', fontSize: '0.8rem', background: 'rgba(2,6,23,0.45)' }}>
                                    ไม่พบรายการที่ตรงกับตัวกรอง
                                </div>
                            )}
                        </div>
                    </section>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', position: 'sticky', top: '5.3rem' }}>
                        <section className="glass-card" style={{ padding: '0.9rem', border: '1px solid rgba(251,191,36,0.25)', background: 'rgba(30,41,59,0.55)' }}>
                            <h3 style={{ margin: 0, marginBottom: '0.65rem', display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.9rem' }}>
                                <Tag size={15} /> Sell from Inventory
                            </h3>

                            <div style={{ display: 'grid', gap: '0.45rem' }}>
                                <select
                                    value={sellSlotId ?? ''}
                                    onChange={(e) => setSellSlotId(e.target.value ? Number(e.target.value) : null)}
                                    style={inputStyle}
                                >
                                    <option value="">Select inventory item</option>
                                    {sellableSlots.map((slot) => (
                                        <option key={slot.id} value={slot.id}>
                                            {slot.item?.name} {slot.equipment_rarity ? `(${getEquipmentRarityLabel(slot.equipment_rarity)})` : ''} x{slot.quantity}
                                        </option>
                                    ))}
                                </select>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.45rem' }}>
                                    <input
                                        value={sellQtyInput}
                                        onChange={(e) => setSellQtyInput(e.target.value)}
                                        type="number"
                                        min={1}
                                        max={selectedSellSlot?.quantity ?? 1}
                                        placeholder="Qty"
                                        style={inputStyle}
                                    />
                                    <input
                                        value={sellPriceInput}
                                        onChange={(e) => setSellPriceInput(e.target.value)}
                                        type="number"
                                        min={1}
                                        placeholder="Unit Price"
                                        style={inputStyle}
                                    />
                                </div>

                                {selectedSellSlot?.item && (
                                    <div style={{ fontSize: '0.72rem', color: '#fde68a' }}>
                                        จะลงขาย: {selectedSellSlot.item.name} x{Math.min(sellQty, selectedSellSlot.quantity)} = {(Math.min(sellQty, selectedSellSlot.quantity) * sellPrice).toLocaleString()} credits
                                    </div>
                                )}

                                <button
                                    disabled={!selectedSellSlot?.item}
                                    onClick={() => {
                                        if (!selectedSellSlot) return;
                                        const finalQty = Math.max(1, Math.min(selectedSellSlot.quantity, sellQty));
                                        void createListing(selectedSellSlot.id, finalQty, sellPrice);
                                        setSellQtyInput('1');
                                        setSellPriceInput('100');
                                    }}
                                    style={{
                                        border: '1px solid rgba(251,191,36,0.35)',
                                        background: selectedSellSlot ? 'linear-gradient(135deg, rgba(251,191,36,0.22), rgba(245,158,11,0.12))' : 'rgba(100,116,139,0.18)',
                                        color: selectedSellSlot ? '#fef3c7' : '#94a3b8',
                                        borderRadius: '0.65rem',
                                        padding: '0.48rem 0.65rem',
                                        cursor: selectedSellSlot ? 'pointer' : 'not-allowed',
                                        fontSize: '0.78rem',
                                        fontWeight: 700,
                                    }}
                                >
                                    Create Listing
                                </button>
                            </div>
                        </section>

                        <section className="glass-card" style={{ padding: '0.9rem', border: '1px solid rgba(56,189,248,0.24)', background: 'rgba(15,23,42,0.7)' }}>
                            <h3 style={{ margin: 0, marginBottom: '0.65rem', display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.9rem' }}>
                                <Store size={15} /> My Active Listings ({ownListings.length})
                            </h3>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '14.5rem', overflowY: 'auto' }}>
                                {ownListings.map((listing) => (
                                    <div
                                        key={listing.id}
                                        style={{
                                            border: '1px solid rgba(255,255,255,0.1)',
                                            borderRadius: '0.55rem',
                                            padding: '0.5rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            gap: '0.5rem',
                                        }}
                                    >
                                        <div style={{ minWidth: 0 }}>
                                            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#e2e8f0' }}>{listing.item.name}</div>
                                            <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.6)' }}>
                                                {listing.quantity} x {listing.price} = {(listing.quantity * listing.price).toLocaleString()}
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => { void cancelListing(listing.id); }}
                                            style={{
                                                border: '1px solid rgba(248,113,113,0.35)',
                                                background: 'rgba(248,113,113,0.15)',
                                                color: '#fecaca',
                                                borderRadius: '0.45rem',
                                                fontSize: '0.68rem',
                                                padding: '0.3rem 0.45rem',
                                                cursor: 'pointer',
                                            }}
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                ))}
                                {ownListings.length === 0 && (
                                    <div style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.55)' }}>
                                        ยังไม่มีรายการขายของคุณ
                                    </div>
                                )}
                            </div>
                        </section>

                        <section className="glass-card" style={{ padding: '0.9rem', border: '1px solid rgba(99,102,241,0.2)', background: 'rgba(15,23,42,0.7)' }}>
                            <h3 style={{ margin: 0, marginBottom: '0.65rem', fontSize: '0.86rem' }}>Recent Sales ({salesHistory.length})</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.36rem', maxHeight: '11rem', overflowY: 'auto' }}>
                                {salesHistory.slice(0, 12).map((sale) => (
                                    <div key={sale.id} style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.75)', borderBottom: '1px dashed rgba(255,255,255,0.08)', paddingBottom: '0.28rem' }}>
                                        {sale.buyer_name} ซื้อ {sale.quantity}x {sale.item.name} = {sale.total.toLocaleString()}
                                    </div>
                                ))}
                                {salesHistory.length === 0 && (
                                    <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.55)' }}>ยังไม่มีประวัติการขาย</div>
                                )}
                            </div>
                        </section>
                    </div>
                </div>
            </main>
        </div>
    );
};

const statCardStyle: CSSProperties = {
    borderRadius: '0.85rem',
    border: '1px solid rgba(148,163,184,0.2)',
    background: 'linear-gradient(135deg, rgba(30,41,59,0.7), rgba(15,23,42,0.9))',
    padding: '0.7rem 0.8rem',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
};

const statLabelStyle: CSSProperties = {
    fontSize: '0.68rem',
    color: 'rgba(255,255,255,0.58)',
    marginBottom: '0.22rem',
};

const statValueStyle: CSSProperties = {
    fontSize: '1.15rem',
    color: '#e2e8f0',
    fontWeight: 700,
    lineHeight: 1.15,
};

const chipButtonStyle: CSSProperties = {
    borderRadius: '9999px',
    border: '1px solid rgba(191,219,254,0.24)',
    background: 'rgba(15,23,42,0.6)',
    color: '#dbeafe',
    fontSize: '0.66rem',
    padding: '0.23rem 0.55rem',
    cursor: 'pointer',
};

const metaPillStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.22rem',
    borderRadius: '9999px',
    border: '1px solid rgba(148,163,184,0.24)',
    background: 'rgba(148,163,184,0.12)',
    color: 'rgba(226,232,240,0.9)',
    fontSize: '0.65rem',
    padding: '0.13rem 0.42rem',
};

const inputStyle: CSSProperties = {
    borderRadius: '0.5rem',
    border: '1px solid rgba(255,255,255,0.15)',
    background: 'rgba(2,6,23,0.65)',
    color: 'white',
    fontSize: '0.75rem',
    padding: '0.45rem 0.5rem',
    width: '100%',
    outline: 'none',
};

export default MarketplacePage;
