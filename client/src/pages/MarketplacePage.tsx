import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { motion } from 'framer-motion';
import {
    Clock3,
    Filter,
    Gem,
    Layers,
    RefreshCw,
    Search,
    ShoppingCart,
    Tag,
    Store,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useGameStore } from '../stores/gameStore';
import { renderItemIcon } from '../lib/itemVisual';
import { getEquipmentRarityColor, type EquipmentRarity } from '../lib/equipmentRarity';
import { useTranslation } from 'react-i18next';
import TopNavBar from '../components/TopNavBar';

type SortMode = 'PRICE_ASC' | 'PRICE_DESC' | 'NEWEST' | 'QTY_DESC';
type ItemTypeFilter = 'ALL' | 'SEED' | 'RAW' | 'INGREDIENT' | 'MEAL' | 'EQUIPMENT';
type RarityFilter = 'ALL' | EquipmentRarity;
type MarketplaceTab = 'MARKET' | 'NPC_SHOP';

const itemTypeOptions: ItemTypeFilter[] = ['ALL', 'SEED', 'RAW', 'INGREDIENT', 'MEAL', 'EQUIPMENT'];
const rarityOptions: RarityFilter[] = ['ALL', 'NORMAL', 'RARE', 'EPIC', 'LEGENDARY'];

const MarketplacePage = () => {
    const { t } = useTranslation();
    const user = useAuthStore((s) => s.user);
    const {
        marketListings,
        inventory,
        salesHistory,
        shopItems,
        shopUserCityKey,
        shopBrowsingCityKey,
        recipeShop,
        fetchMarket,
        fetchInventory,
        fetchSalesHistory,
        fetchShop,
        fetchRecipeShop,
        buyListing,
        buyFromShop,
        sellToShop,
        buyRecipeUnlock,
        createListing,
        cancelListing,
    } = useGameStore();

    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState<ItemTypeFilter>('ALL');
    const [rarityFilter, setRarityFilter] = useState<RarityFilter>('ALL');
    const [cityFilter, setCityFilter] = useState('ALL');
    const [npcShopCityFilter, setNpcShopCityFilter] = useState('');
    const [minPriceInput, setMinPriceInput] = useState('');
    const [maxPriceInput, setMaxPriceInput] = useState('');
    const [showAffordableOnly, setShowAffordableOnly] = useState(false);
    const [sortMode, setSortMode] = useState<SortMode>('PRICE_ASC');
    const [activeTab, setActiveTab] = useState<MarketplaceTab>('MARKET');

    const [marketBuyQty, setMarketBuyQty] = useState<Record<number, number>>({});
    const [shopBuyQty, setShopBuyQty] = useState<Record<number, number>>({});
    const [npcSellSlotId, setNpcSellSlotId] = useState<number | null>(null);
    const [npcSellQtyInput, setNpcSellQtyInput] = useState('1');
    const [sellSlotId, setSellSlotId] = useState<number | null>(null);
    const [sellQtyInput, setSellQtyInput] = useState('1');
    const [sellPriceInput, setSellPriceInput] = useState('100');
    const [lastRefreshedAt, setLastRefreshedAt] = useState<string>('');
    const [confirmState, setConfirmState] = useState<{
        open: boolean;
        title: string;
        description: string;
        confirmLabel: string;
        onConfirm: (() => void) | null;
    }>({
        open: false,
        title: '',
        description: '',
        confirmLabel: t('common.confirm'),
        onConfirm: null,
    });

    const refreshMarketNow = () => {
        setLastRefreshedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        void Promise.all([fetchMarket(), fetchInventory(), fetchSalesHistory()]);
    };

    const refreshNpcShopNow = (city?: string) => {
        setLastRefreshedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        void Promise.all([fetchShop(city), fetchRecipeShop(), fetchInventory()]);
    };

    const refreshNow = () => {
        if (activeTab === 'MARKET') {
            refreshMarketNow();
            return;
        }
        refreshNpcShopNow(npcShopCityFilter || undefined);
    };

    useEffect(() => {
        if (activeTab === 'MARKET') {
            refreshMarketNow();
        } else {
            refreshNpcShopNow(npcShopCityFilter || undefined);
        }

        const interval = setInterval(() => {
            if (activeTab === 'MARKET') {
                refreshMarketNow();
                return;
            }
            refreshNpcShopNow(npcShopCityFilter || undefined);
        }, 5000);

        return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, npcShopCityFilter, fetchInventory, fetchMarket, fetchRecipeShop, fetchSalesHistory, fetchShop]);

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

        return [{ key: 'ALL', name: t('common.all') }, ...Array.from(unique.entries()).map(([key, name]) => ({ key, name }))];
    }, [marketListings, t]);

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

    const npcSellableSlots = useMemo(
        () => inventory.filter((s) => s.item && s.quantity > 0 && (s.item.sell_price ?? 0) > 0).sort((a, b) => a.slot - b.slot),
        [inventory]
    );
    const selectedNpcSellSlot = npcSellSlotId === null ? null : npcSellableSlots.find((s) => s.id === npcSellSlotId) ?? null;
    const npcSellQty = Math.max(1, Math.min(selectedNpcSellSlot?.quantity ?? 1, Math.floor(Number(npcSellQtyInput || 1))));

    const sellableSlots = useMemo(
        () => inventory.filter((s) => s.item && s.quantity > 0).sort((a, b) => a.slot - b.slot),
        [inventory]
    );
    const selectedSellSlot = sellSlotId === null ? null : sellableSlots.find((s) => s.id === sellSlotId) ?? null;
    const sellQty = Math.max(1, Math.floor(Number(sellQtyInput || 1)));
    const sellPrice = Math.max(1, Math.floor(Number(sellPriceInput || 1)));
    const formatCredits = (value: number) => `${Math.max(0, value).toLocaleString()} ${t('common.credits')}`;

    const askConfirm = (title: string, description: string, confirmLabel: string, onConfirm: () => void) => {
        setConfirmState({ open: true, title, description, confirmLabel, onConfirm });
    };

    const closeConfirm = () => {
        setConfirmState((prev) => ({ ...prev, open: false, onConfirm: null }));
    };

    const runConfirm = () => {
        const fn = confirmState.onConfirm;
        closeConfirm();
        fn?.();
    };

    // Stable ember particles
    const embers = useMemo(() =>
        Array.from({ length: 16 }, (_, i) => ({
            id: i,
            left: `${5 + Math.random() * 90}%`,
            delay: `${Math.random() * 10}s`,
            duration: `${7 + Math.random() * 9}s`,
            size: `${2 + Math.random() * 3}px`,
            drift: `${-30 + Math.random() * 60}px`,
            hue: Math.random() > 0.5 ? '#fbbf24' : '#f97316',
        })), []);

    return (
        <div
            className="bg-forge"
            style={{
                minHeight: '100vh',
                color: '#f1f5f9',
                fontFamily: "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif",
                position: 'relative',
                overflow: 'hidden',
            }}
        >
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
                {embers.map((e) => (
                    <span key={e.id} style={{
                        position: 'absolute', bottom: '-8px', left: e.left,
                        width: e.size, height: e.size, borderRadius: '50%',
                        background: `radial-gradient(circle, ${e.hue} 0%, #92400e 100%)`,
                        filter: 'blur(0.8px)',
                        '--drift': e.drift,
                        animation: `ember-rise ${e.duration} ${e.delay} infinite ease-in`,
                    } as CSSProperties} />
                ))}
                <div style={{ position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '70%', height: '200px', background: 'radial-gradient(ellipse at bottom, rgba(234,88,12,0.1) 0%, transparent 70%)' }} />
                <motion.div
                    style={{ position: 'absolute', top: '-6rem', right: '-8rem', width: '30rem', height: '30rem', borderRadius: '50%', background: 'radial-gradient(circle, rgba(245,158,11,0.18), rgba(245,158,11,0))', filter: 'blur(12px)' }}
                    animate={{ x: [0, -20, 0], y: [0, 15, 0] }}
                    transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
                />
                <motion.div
                    style={{ position: 'absolute', bottom: '-9rem', left: '-10rem', width: '34rem', height: '34rem', borderRadius: '50%', background: 'radial-gradient(circle, rgba(234,88,12,0.12), rgba(234,88,12,0))', filter: 'blur(16px)' }}
                    animate={{ x: [0, 25, 0], y: [0, -20, 0] }}
                    transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
                />
            </div>

            <TopNavBar
                rightExtra={
                    <button
                        onClick={refreshNow}
                        style={{
                            borderRadius: '0.6rem',
                            border: '1px solid rgba(245,158,11,0.2)',
                            background: 'rgba(30,19,10,0.6)',
                            color: '#fef3c7',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            fontSize: '0.76rem',
                            padding: '0.4rem 0.65rem',
                            cursor: 'pointer',
                        }}
                    >
                        <RefreshCw size={13} />
                        {t('common.refresh')}
                    </button>
                }
            />

            <main style={{ maxWidth: '1320px', margin: '0 auto', padding: '1.2rem', position: 'relative', zIndex: 1 }}>
                <div
                    style={{
                        display: 'inline-flex',
                        borderRadius: '0.8rem',
                        background: 'rgba(15,8,2,0.7)',
                        border: '1px solid rgba(245,158,11,0.2)',
                        padding: '0.25rem',
                        gap: '0.25rem',
                        marginBottom: '0.9rem',
                    }}
                >
                    <button
                        type="button"
                        onClick={() => setActiveTab('MARKET')}
                        style={{
                            borderRadius: '0.58rem',
                            border: 'none',
                            background: activeTab === 'MARKET' ? 'rgba(245,158,11,0.22)' : 'transparent',
                            color: activeTab === 'MARKET' ? '#fef3c7' : 'rgba(226,232,240,0.65)',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            padding: '0.4rem 0.7rem',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                        }}
                    >
                        <ShoppingCart size={13} /> {t('marketplace.tabs.market')}
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('NPC_SHOP')}
                        style={{
                            borderRadius: '0.58rem',
                            border: 'none',
                            background: activeTab === 'NPC_SHOP' ? 'rgba(245,158,11,0.22)' : 'transparent',
                            color: activeTab === 'NPC_SHOP' ? '#fef3c7' : 'rgba(226,232,240,0.65)',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            padding: '0.4rem 0.7rem',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                        }}
                    >
                        <Store size={13} /> {t('marketplace.tabs.npc_shop')}
                    </button>
                </div>

                {activeTab === 'MARKET' ? (
                <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.8rem', marginBottom: '0.8rem' }}>
                    <div style={statCardStyle}>
                        <div style={statLabelStyle}>{t('marketplace.stats.listed_items')}</div>
                        <div style={statValueStyle}>{listings.length.toLocaleString()}</div>
                    </div>
                    <div style={statCardStyle}>
                        <div style={statLabelStyle}>{t('marketplace.stats.my_listings')}</div>
                        <div style={statValueStyle}>{ownListings.length.toLocaleString()}</div>
                    </div>
                    <div style={statCardStyle}>
                        <div style={statLabelStyle}>{t('marketplace.stats.recent_sales')}</div>
                        <div style={statValueStyle}>{salesHistory.length.toLocaleString()}</div>
                    </div>
                    <div style={statCardStyle}>
                        <div style={statLabelStyle}>{t('marketplace.stats.last_sync')}</div>
                        <div style={{ ...statValueStyle, fontSize: '1rem' }}>{lastRefreshedAt || '--:--'}</div>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '2.35fr 1.15fr', gap: '1rem', alignItems: 'start' }}>
                    <section className="glass-card" style={{ padding: '1rem', border: '1px solid rgba(245,158,11,0.22)', background: 'rgba(22,13,5,0.75)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
                            <h2 style={{ margin: 0, fontSize: '0.98rem', display: 'inline-flex', gap: '0.45rem', alignItems: 'center' }}>
                                <ShoppingCart size={15} />
                                {t('marketplace.player_listings', { count: listings.length })}
                            </h2>
                            <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.56)', display: 'inline-flex', alignItems: 'center', gap: '0.28rem' }}>
                                <Clock3 size={12} /> {t('marketplace.auto_refresh_desc')}
                            </div>
                        </div>

                        <div
                            style={{
                                border: '1px solid rgba(255,255,255,0.08)',
                                background: 'linear-gradient(135deg, rgba(245,158,11,0.07), rgba(234,88,12,0.05))',
                                borderRadius: '0.85rem',
                                padding: '0.75rem',
                                marginBottom: '0.8rem',
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.55rem', color: '#fbbf24', fontSize: '0.8rem', fontWeight: 600 }}>
                                <Filter size={14} /> {t('marketplace.filters')}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1.1fr 0.8fr 0.8fr 1fr', gap: '0.45rem' }}>
                                <div style={{ position: 'relative' }}>
                                    <Search size={14} style={{ position: 'absolute', left: '0.5rem', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.45)' }} />
                                    <input
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        placeholder={t('marketplace.search_placeholder')}
                                        style={{ ...inputStyle, paddingLeft: '1.65rem' }}
                                    />
                                </div>
                                <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as ItemTypeFilter)} style={inputStyle}>
                                    {itemTypeOptions.map((tOpt) => (
                                        <option key={tOpt} value={tOpt}>{tOpt === 'ALL' ? t('common.all') : tOpt}</option>
                                    ))}
                                </select>
                                <select value={rarityFilter} onChange={(e) => setRarityFilter(e.target.value as RarityFilter)} style={inputStyle}>
                                    {rarityOptions.map((r) => (
                                        <option key={r} value={r}>{r === 'ALL' ? t('common.all') : t(`common.rarity_labels.${r.toUpperCase()}`)}</option>
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
                                    placeholder={t('common.min')}
                                    type="number"
                                    min={0}
                                    style={inputStyle}
                                />
                                <input
                                    value={maxPriceInput}
                                    onChange={(e) => setMaxPriceInput(e.target.value)}
                                    placeholder={t('common.max')}
                                    type="number"
                                    min={0}
                                    style={inputStyle}
                                />
                                <select value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)} style={inputStyle}>
                                    <option value="PRICE_ASC">{t('common.price')} ↑</option>
                                    <option value="PRICE_DESC">{t('common.price')} ↓</option>
                                    <option value="NEWEST">{t('common.newest')}</option>
                                    <option value="QTY_DESC">{t('common.quantity')}</option>
                                </select>
                            </div>
                            <div style={{ marginTop: '0.55rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.74rem', color: 'rgba(255,255,255,0.75)' }}>
                                    <input
                                        type="checkbox"
                                        checked={showAffordableOnly}
                                        onChange={(e) => setShowAffordableOnly(e.target.checked)}
                                    />
                                    {t('marketplace.affordable_only')}
                                </label>

                                <div style={{ display: 'inline-flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                                    <button type="button" onClick={() => { setTypeFilter('EQUIPMENT'); setSortMode('PRICE_DESC'); }} style={chipButtonStyle}>{t('marketplace.high_end_gear')}</button>
                                    <button type="button" onClick={() => { setSortMode('PRICE_ASC'); setShowAffordableOnly(true); }} style={chipButtonStyle}>{t('marketplace.budget_deals')}</button>
                                    <button type="button" onClick={() => { setSearch(''); setTypeFilter('ALL'); setRarityFilter('ALL'); setCityFilter('ALL'); setMinPriceInput(''); setMaxPriceInput(''); setShowAffordableOnly(false); setSortMode('PRICE_ASC'); }} style={chipButtonStyle}>{t('common.reset')}</button>
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
                                            background: 'linear-gradient(135deg, rgba(30,19,10,0.85), rgba(10,5,0,0.92))',
                                            display: 'grid',
                                            gridTemplateColumns: '1.8fr 1fr 0.75fr',
                                            gap: '0.75rem',
                                            alignItems: 'center',
                                            boxShadow: '0 10px 25px rgba(5,2,0,0.45)',
                                        }}
                                    >
                                        <div>
                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
                                                {renderItemIcon(listing.item, 20)}
                                                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: rarity ? getEquipmentRarityColor(rarity) : '#f8fafc' }}>
                                                    {listing.item.name}
                                                    {rarity ? ` (${t(`common.rarity_labels.${rarity.toUpperCase()}`)})` : ''}
                                                </span>
                                            </div>
                                            <div style={{ marginTop: '0.35rem', display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                                                <span style={metaPillStyle}><Layers size={11} /> {listing.item.type}</span>
                                                <span style={metaPillStyle}><Store size={11} /> {sellerName}</span>
                                                <span style={metaPillStyle}><Gem size={11} /> {cityName}</span>
                                            </div>
                                            <div style={{ marginTop: '0.3rem', fontSize: '0.73rem', color: '#fbbf24' }}>
                                                {t('marketplace.available')}: {listing.quantity.toLocaleString()} • {t('marketplace.unit')}: {listing.price.toLocaleString()} {t('common.credits')}
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
                                                {t('common.total')}: {totalPrice.toLocaleString()}
                                            </div>
                                        </div>

                                        <button
                                            disabled={!canBuy}
                                            onClick={() => {
                                                askConfirm(
                                                    t('marketplace.confirm_buy_title'),
                                                    `${t('marketplace.confirm_buy_desc')}\n\n` +
                                                    `${t('marketplace.item')}: ${listing.item.name}${rarity ? ` (${t(`common.rarity_labels.${rarity.toUpperCase()}`)})` : ''}\n` +
                                                    `${t('marketplace.seller')}: ${sellerName}\n` +
                                                    `${t('marketplace.city')}: ${cityName}\n` +
                                                    `${t('marketplace.quantity')}: ${qty.toLocaleString()} / ${listing.quantity.toLocaleString()} available\n` +
                                                    `${t('marketplace.unit_price')}: ${formatCredits(listing.price)}\n` +
                                                    `${t('marketplace.total_cost')}: ${formatCredits(totalPrice)}\n\n` +
                                                    `${t('marketplace.current_money')}: ${formatCredits(user?.money ?? 0)}\n` +
                                                    `${t('marketplace.money_after_purchase')}: ${formatCredits((user?.money ?? 0) - totalPrice)}`,
                                                    t('marketplace.buy'),
                                                    () => {
                                                        void buyListing(listing.id, qty);
                                                    }
                                                );
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
                                            {t('marketplace.buy')}
                                        </button>
                                    </motion.div>
                                );
                            })}

                            {listings.length === 0 && (
                                <div style={{ border: '1px dashed rgba(255,255,255,0.2)', borderRadius: '0.85rem', padding: '1.1rem', color: 'rgba(255,255,255,0.6)', textAlign: 'center', fontSize: '0.8rem', background: 'rgba(5,2,0,0.45)' }}>
                                    {t('marketplace.no_listings')}
                                </div>
                            )}
                        </div>
                    </section>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', position: 'sticky', top: '5.3rem' }}>
                        <section className="glass-card" style={{ padding: '0.9rem', border: '1px solid rgba(251,191,36,0.25)', background: 'rgba(30,19,10,0.65)' }}>
                            <h3 style={{ margin: 0, marginBottom: '0.65rem', display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.9rem' }}>
                                <Tag size={15} /> {t('marketplace.sell_from_inventory')}
                            </h3>

                            <div style={{ display: 'grid', gap: '0.45rem' }}>
                                <select
                                    value={sellSlotId ?? ''}
                                    onChange={(e) => setSellSlotId(e.target.value ? Number(e.target.value) : null)}
                                    style={inputStyle}
                                >
                                    <option value="">{t('marketplace.select_item')}</option>
                                    {sellableSlots.map((slot) => (
                                        <option key={slot.id} value={slot.id}>
                                            {slot.item?.name} {slot.equipment_rarity ? `(${t(`common.rarity_labels.${slot.equipment_rarity.toUpperCase()}`)})` : ''} x{slot.quantity}
                                        </option>
                                    ))}
                                </select>

                                {selectedSellSlot?.item && (
                                    <div
                                        style={{
                                            border: '1px solid rgba(148,163,184,0.22)',
                                            borderRadius: '0.65rem',
                                            background: 'rgba(5,2,0,0.5)',
                                            padding: '0.48rem 0.55rem',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '0.45rem',
                                        }}
                                    >
                                        {renderItemIcon(selectedSellSlot.item, 22)}
                                        <div style={{ minWidth: 0 }}>
                                            <div
                                                style={{
                                                    fontSize: '0.76rem',
                                                    fontWeight: 700,
                                                    color: selectedSellSlot.equipment_rarity
                                                        ? getEquipmentRarityColor(selectedSellSlot.equipment_rarity)
                                                        : '#f8fafc',
                                                }}
                                            >
                                                {selectedSellSlot.item.name}
                                                {selectedSellSlot.equipment_rarity
                                                    ? ` (${t(`common.rarity_labels.${selectedSellSlot.equipment_rarity.toUpperCase()}`)})`
                                                    : ''}
                                            </div>
                                            <div style={{ fontSize: '0.68rem', color: 'rgba(226,232,240,0.72)' }}>
                                                {t('marketplace.in_bag')}: {selectedSellSlot.quantity.toLocaleString()} • Slot #{selectedSellSlot.slot}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.45rem' }}>
                                    <input
                                        value={sellQtyInput}
                                        onChange={(e) => setSellQtyInput(e.target.value)}
                                        type="number"
                                        min={1}
                                        max={selectedSellSlot?.quantity ?? 1}
                                        placeholder={t('common.qty')}
                                        style={inputStyle}
                                    />
                                    <input
                                        value={sellPriceInput}
                                        onChange={(e) => setSellPriceInput(e.target.value)}
                                        type="number"
                                        min={1}
                                        placeholder={t('common.price')}
                                        style={inputStyle}
                                    />
                                </div>

                                {selectedSellSlot?.item && (
                                    <div style={{ fontSize: '0.72rem', color: '#fde68a' }}>
                                        {t('marketplace.listing_preview', {
                                            item: selectedSellSlot.item.name,
                                            qty: Math.min(sellQty, selectedSellSlot.quantity),
                                            total: (Math.min(sellQty, selectedSellSlot.quantity) * sellPrice).toLocaleString()
                                        })}
                                    </div>
                                )}

                                <button
                                    disabled={!selectedSellSlot?.item}
                                    onClick={() => {
                                        if (!selectedSellSlot) return;
                                        const finalQty = Math.max(1, Math.min(selectedSellSlot.quantity, sellQty));
                                        const totalPrice = finalQty * sellPrice;
                                        askConfirm(
                                            t('marketplace.confirm_listing_title'),
                                            `${t('marketplace.confirm_listing_desc')}\n\n` +
                                            `${t('marketplace.item')}: ${selectedSellSlot.item?.name}${selectedSellSlot.equipment_rarity ? ` (${t(`common.rarity_labels.${selectedSellSlot.equipment_rarity.toUpperCase()}`)})` : ''}\n` +
                                            `${t('marketplace.inventory_slot')}: ${selectedSellSlot.slot}\n` +
                                            `${t('marketplace.quantity_to_list')}: ${finalQty.toLocaleString()}\n` +
                                            `${t('marketplace.remaining_in_inventory')}: ${(selectedSellSlot.quantity - finalQty).toLocaleString()}\n` +
                                            `${t('marketplace.unit_price')}: ${formatCredits(sellPrice)}\n` +
                                            `${t('marketplace.listing_value')}: ${formatCredits(totalPrice)}`,
                                            t('marketplace.create_listing'),
                                            () => {
                                                void createListing(selectedSellSlot.id, finalQty, sellPrice);
                                                setSellQtyInput('1');
                                                setSellPriceInput('100');
                                            }
                                        );
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
                                    {t('marketplace.create_listing')}
                                </button>
                            </div>
                        </section>

                        <section className="glass-card" style={{ padding: '0.9rem', border: '1px solid rgba(56,189,248,0.24)', background: 'rgba(22,13,5,0.75)' }}>
                            <h3 style={{ margin: 0, marginBottom: '0.65rem', display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.9rem' }}>
                                <Store size={15} /> {t('marketplace.stats.my_listings')} ({ownListings.length})
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
                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.42rem' }}>
                                                {renderItemIcon(listing.item, 18)}
                                                <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#e2e8f0' }}>
                                                    {listing.item.name}
                                                    {listing.equipment_rarity ? ` (${t(`common.rarity_labels.${listing.equipment_rarity.toUpperCase()}`)})` : ''}
                                                </div>
                                            </div>
                                            <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.6)' }}>
                                                {listing.quantity} x {listing.price} = {(listing.quantity * listing.price).toLocaleString()}
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => {
                                                const totalValue = listing.quantity * listing.price;
                                                askConfirm(
                                                    t('marketplace.confirm_cancel_title'),
                                                    `${t('marketplace.confirm_cancel_desc')}\n\n` +
                                                    `${t('marketplace.item')}: ${listing.item.name}${listing.equipment_rarity ? ` (${t(`common.rarity_labels.${listing.equipment_rarity.toUpperCase()}`)})` : ''}\n` +
                                                    `${t('marketplace.listing_id')}: #${listing.id}\n` +
                                                    `${t('marketplace.quantity')}: ${listing.quantity.toLocaleString()}\n` +
                                                    `${t('marketplace.unit_price')}: ${formatCredits(listing.price)}\n` +
                                                    `${t('marketplace.listing_value')}: ${formatCredits(totalValue)}\n\n` +
                                                    `${t('marketplace.after_cancel_desc')}`,
                                                    t('marketplace.cancel_listing'),
                                                    () => {
                                                        void cancelListing(listing.id);
                                                    }
                                                );
                                            }}
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
                                            {t('marketplace.cancel_listing')}
                                        </button>
                                    </div>
                                ))}
                                {ownListings.length === 0 && (
                                    <div style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.55)' }}>
                                        {t('marketplace.no_own_listings')}
                                    </div>
                                )}
                            </div>
                        </section>

                        <section className="glass-card" style={{ padding: '0.9rem', border: '1px solid rgba(245,158,11,0.2)', background: 'rgba(22,13,5,0.75)' }}>
                            <h3 style={{ margin: 0, marginBottom: '0.65rem', fontSize: '0.86rem' }}>{t('marketplace.recent_sales_title', { count: salesHistory.length })}</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.36rem', maxHeight: '11rem', overflowY: 'auto' }}>
                                {salesHistory.slice(0, 12).map((sale) => (
                                    <div key={sale.id} style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.75)', borderBottom: '1px dashed rgba(255,255,255,0.08)', paddingBottom: '0.28rem' }}>
                                        {t('marketplace.sold_history', {
                                            buyer: sale.buyer_name,
                                            qty: sale.quantity,
                                            item: sale.item.name,
                                            total: sale.total.toLocaleString()
                                        })}
                                    </div>
                                ))}
                                {salesHistory.length === 0 && (
                                    <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.55)' }}>{t('marketplace.no_sales_history')}</div>
                                )}
                            </div>
                        </section>
                    </div>
                </div>
                </>
                ) : (
                <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.8rem', marginBottom: '0.8rem' }}>
                    <div style={statCardStyle}>
                        <div style={statLabelStyle}>{t('marketplace.stats.npc_items')}</div>
                        <div style={statValueStyle}>{shopItems.length.toLocaleString()}</div>
                    </div>
                    <div style={statCardStyle}>
                        <div style={statLabelStyle}>{t('marketplace.stats.recipe_scrolls')}</div>
                        <div style={statValueStyle}>{recipeShop.length.toLocaleString()}</div>
                    </div>
                    <div style={statCardStyle}>
                        <div style={statLabelStyle}>{t('marketplace.stats.money')}</div>
                        <div style={statValueStyle}>{user?.money?.toLocaleString() ?? '-'}</div>
                    </div>
                    <div style={statCardStyle}>
                        <div style={statLabelStyle}>{t('marketplace.stats.last_sync')}</div>
                        <div style={{ ...statValueStyle, fontSize: '1rem' }}>{lastRefreshedAt || '--:--'}</div>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '1rem', alignItems: 'start' }}>
                    <section className="glass-card" style={{ padding: '1rem', border: '1px solid rgba(245,158,11,0.22)', background: 'rgba(22,13,5,0.75)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
                            <h2 style={{ margin: 0, fontSize: '0.98rem', display: 'inline-flex', gap: '0.45rem', alignItems: 'center' }}>
                                <Store size={15} /> {t('marketplace.npc_shop_items', { count: shopItems.length })}
                            </h2>
                            <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.56)', display: 'inline-flex', alignItems: 'center', gap: '0.28rem' }}>
                                <Clock3 size={12} /> {t('marketplace.auto_refresh_desc')}
                            </div>
                        </div>

                        {/* City selector */}
                        <div style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                            {[
                                { key: '', label: t('marketplace.my_city') },
                                { key: 'ALL', label: t('common.all') },
                                { key: 'AGRARIA', label: 'Agraria' },
                                { key: 'FERRUM', label: 'Ferrum' },
                                { key: 'VOLTARA', label: 'Voltara' },
                                { key: 'TEXTILIS', label: 'Textilis' },
                                { key: 'MEDICO', label: 'Medico' },
                            ].map(({ key, label }) => {
                                const isActive = npcShopCityFilter === key;
                                return (
                                    <button
                                        key={key}
                                        type="button"
                                        onClick={() => setNpcShopCityFilter(key)}
                                        style={{
                                            borderRadius: '0.5rem',
                                            border: `1px solid ${isActive ? 'rgba(245,158,11,0.65)' : 'rgba(148,163,184,0.2)'}`,
                                            background: isActive ? 'rgba(245,158,11,0.2)' : 'rgba(30,19,10,0.5)',
                                            color: isActive ? '#fef3c7' : 'rgba(226,232,240,0.7)',
                                            fontSize: '0.73rem',
                                            fontWeight: isActive ? 700 : 400,
                                            padding: '0.3rem 0.65rem',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        {label}
                                    </button>
                                );
                            })}
                            {shopBrowsingCityKey && shopUserCityKey && shopBrowsingCityKey !== shopUserCityKey && (
                                <span style={{ fontSize: '0.7rem', color: '#fbbf24', marginLeft: '0.25rem' }}>
                                    ⚠ {t('marketplace.browse_only')}
                                </span>
                            )}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                            {shopItems.map((item) => {
                                const unitPrice = Math.max(0, Number(item.buy_price ?? 0));
                                const qty = Math.max(1, Math.floor(shopBuyQty[item.id] ?? 1));
                                const total = unitPrice * qty;
                                const isSameCity = shopBrowsingCityKey === 'ALL'
                                    ? ((item as any).source_city_keys ?? []).includes(shopUserCityKey)
                                    : (!shopBrowsingCityKey || !shopUserCityKey || shopBrowsingCityKey === shopUserCityKey);
                                const canBuy = unitPrice > 0 && !!user && user.money >= total && isSameCity;

                                return (
                                    <div
                                        key={item.id}
                                        style={{
                                            border: '1px solid rgba(148,163,184,0.18)',
                                            borderRadius: '0.85rem',
                                            padding: '0.75rem',
                                            background: 'linear-gradient(135deg, rgba(30,19,10,0.85), rgba(10,5,0,0.92))',
                                            display: 'grid',
                                            gridTemplateColumns: '1.65fr 0.7fr 0.7fr',
                                            alignItems: 'center',
                                            gap: '0.7rem',
                                        }}
                                    >
                                        <div>
                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.84rem', fontWeight: 700 }}>
                                                {renderItemIcon(item, 20)}
                                                {item.name}
                                            </div>
                                            <div style={{ marginTop: '0.3rem', fontSize: '0.72rem', color: '#fbbf24' }}>
                                                {t('marketplace.type')}: {item.type} • {t('marketplace.unit')}: {unitPrice.toLocaleString()} {t('common.credits')}
                                            </div>
                                        </div>

                                        <div>
                                            <input
                                                value={qty}
                                                onChange={(e) => {
                                                    const next = Math.max(1, Math.floor(Number(e.target.value || 1)));
                                                    setShopBuyQty((prev) => ({ ...prev, [item.id]: next }));
                                                }}
                                                type="number"
                                                min={1}
                                                style={inputStyle}
                                            />
                                            <div style={{ marginTop: '0.24rem', fontSize: '0.7rem', color: canBuy ? '#86efac' : '#fda4af', fontWeight: 600 }}>
                                                {t('common.total')}: {total.toLocaleString()}
                                            </div>
                                        </div>

                                        <button
                                            type="button"
                                            disabled={!canBuy}
                                            onClick={() => {
                                                askConfirm(
                                                    t('marketplace.confirm_buy_npc_title'),
                                                    `${t('marketplace.confirm_buy_npc_desc')}\n\n` +
                                                    `${t('marketplace.item')}: ${item.name}\n` +
                                                    `${t('marketplace.type')}: ${item.type}\n` +
                                                    `${t('marketplace.quantity')}: ${qty.toLocaleString()}\n` +
                                                    `${t('marketplace.unit_price')}: ${formatCredits(unitPrice)}\n` +
                                                    `${t('marketplace.total_cost')}: ${formatCredits(total)}\n\n` +
                                                    `${t('marketplace.current_money')}: ${formatCredits(user?.money ?? 0)}\n` +
                                                    `${t('marketplace.money_after_purchase')}: ${formatCredits((user?.money ?? 0) - total)}`,
                                                    t('marketplace.buy'),
                                                    () => {
                                                        void buyFromShop(item.id, qty);
                                                    }
                                                );
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
                                            {t('marketplace.buy')}
                                        </button>
                                    </div>
                                );
                            })}

                            {shopItems.length === 0 && (
                                <div style={{ border: '1px dashed rgba(255,255,255,0.2)', borderRadius: '0.85rem', padding: '1.1rem', color: 'rgba(255,255,255,0.6)', textAlign: 'center', fontSize: '0.8rem', background: 'rgba(5,2,0,0.45)' }}>
                                    {t('marketplace.no_npc_items')}
                                </div>
                            )}
                        </div>
                    </section>

                    <section className="glass-card" style={{ padding: '0.9rem', border: '1px solid rgba(251,191,36,0.25)', background: 'rgba(30,19,10,0.65)' }}>
                        <h3 style={{ margin: 0, marginBottom: '0.7rem', display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.9rem' }}>
                            <Tag size={15} /> {t('marketplace.sell_to_npc', { count: npcSellableSlots.length })}
                        </h3>

                        <div style={{ display: 'grid', gap: '0.45rem' }}>
                            <select
                                value={npcSellSlotId ?? ''}
                                onChange={(e) => { setNpcSellSlotId(e.target.value ? Number(e.target.value) : null); setNpcSellQtyInput('1'); }}
                                style={inputStyle}
                            >
                                <option value="">{t('marketplace.select_item')}</option>
                                {npcSellableSlots.map((slot) => (
                                    <option key={slot.id} value={slot.id}>
                                        {slot.item?.name} x{slot.quantity} ({t('marketplace.unit')}: {slot.item?.sell_price})
                                    </option>
                                ))}
                            </select>

                            {selectedNpcSellSlot?.item && (
                                <div style={{ display: 'grid', alignItems: 'center', gridTemplateColumns: '1fr 1fr', gap: '0.45rem' }}>
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.76rem', fontWeight: 700, color: '#f8fafc' }}>
                                        {renderItemIcon(selectedNpcSellSlot.item, 18)}
                                        {selectedNpcSellSlot.item.name}
                                    </div>
                                    <div style={{ fontSize: '0.68rem', color: '#fbbf24' }}>
                                        {t('marketplace.unit')}: {selectedNpcSellSlot.item.sell_price} • {t('marketplace.in_bag')}: {selectedNpcSellSlot.quantity}
                                    </div>
                                </div>
                            )}

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.45rem', alignItems: 'center' }}>
                                <input
                                    value={npcSellQtyInput}
                                    onChange={(e) => setNpcSellQtyInput(e.target.value)}
                                    type="number"
                                    min={1}
                                    max={selectedNpcSellSlot?.quantity ?? 1}
                                    placeholder={t('common.qty')}
                                    style={inputStyle}
                                />
                                <button
                                    disabled={!selectedNpcSellSlot?.item || npcSellQty < 1}
                                    onClick={() => {
                                        if (!selectedNpcSellSlot?.item) return;
                                        const totalRevenue = npcSellQty * (selectedNpcSellSlot.item.sell_price ?? 0);
                                        askConfirm(
                                            t('marketplace.confirm_sell_npc_title'),
                                            `${t('marketplace.item')}: ${selectedNpcSellSlot.item.name}\n` +
                                            `${t('marketplace.quantity')}: ${npcSellQty.toLocaleString()}\n` +
                                            `${t('marketplace.unit_price')}: ${formatCredits(selectedNpcSellSlot.item.sell_price ?? 0)}\n` +
                                            `${t('marketplace.total_revenue')}: ${formatCredits(totalRevenue)}\n\n` +
                                            `${t('marketplace.current_money')}: ${formatCredits(user?.money ?? 0)}\n` +
                                            `${t('marketplace.money_after_sell')}: ${formatCredits((user?.money ?? 0) + totalRevenue)}`,
                                            t('marketplace.sell'),
                                            () => {
                                                void sellToShop(selectedNpcSellSlot.id, npcSellQty);
                                                setNpcSellSlotId(null);
                                                setNpcSellQtyInput('1');
                                            }
                                        );
                                    }}
                                    style={{
                                        border: '1px solid rgba(248,113,113,0.35)',
                                        background: selectedNpcSellSlot?.item ? 'linear-gradient(135deg, rgba(239,68,68,0.2), rgba(248,113,113,0.12))' : 'rgba(100,116,139,0.18)',
                                        color: selectedNpcSellSlot?.item ? '#fecaca' : '#94a3b8',
                                        borderRadius: '0.65rem',
                                        padding: '0.45rem 0.65rem',
                                        cursor: selectedNpcSellSlot?.item ? 'pointer' : 'not-allowed',
                                        fontSize: '0.78rem',
                                        fontWeight: 700,
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    {t('marketplace.sell')}
                                </button>
                            </div>

                            {selectedNpcSellSlot?.item && (
                                <div style={{ fontSize: '0.7rem', color: '#fde68a' }}>
                                    {t('marketplace.listing_preview', {
                                        item: selectedNpcSellSlot.item.name,
                                        qty: npcSellQty,
                                        total: (npcSellQty * (selectedNpcSellSlot.item.sell_price ?? 0)).toLocaleString()
                                    })}
                                </div>
                            )}

                            {npcSellableSlots.length === 0 && (
                                <div style={{ fontSize: '0.73rem', color: 'rgba(255,255,255,0.55)' }}>
                                    {t('marketplace.no_sellable_items')}
                                </div>
                            )}
                        </div>
                    </section>

                    <section className="glass-card" style={{ padding: '0.9rem', border: '1px solid rgba(251,191,36,0.25)', background: 'rgba(30,19,10,0.65)' }}>
                        <h3 style={{ margin: 0, marginBottom: '0.7rem', display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.9rem' }}>
                            <Tag size={15} /> {t('marketplace.recipe_shop', { count: recipeShop.length })}
                        </h3>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                            {recipeShop.map((recipe) => {
                                const unlockPrice = Math.max(0, Number(recipe.unlock_price ?? 0));
                                const canBuyRecipe = unlockPrice > 0 && !!user && user.money >= unlockPrice;

                                return (
                                    <div
                                        key={recipe.id}
                                        style={{
                                            border: '1px solid rgba(255,255,255,0.12)',
                                            borderRadius: '0.6rem',
                                            padding: '0.55rem',
                                            background: 'rgba(5,2,0,0.6)',
                                        }}
                                    >
                                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#f8fafc' }}>{recipe.name}</div>
                                        <div style={{ marginTop: '0.26rem', fontSize: '0.72rem', color: '#cbd5e1' }}>
                                            {t('marketplace.unlock')}: {unlockPrice.toLocaleString()} {t('common.credits')}
                                        </div>
                                        <button
                                            type="button"
                                            disabled={!canBuyRecipe}
                                            onClick={() => {
                                                askConfirm(
                                                    t('marketplace.confirm_unlock_title'),
                                                    `${t('marketplace.confirm_unlock_desc')}\n\n` +
                                                    `${t('marketplace.recipe')}: ${recipe.name}\n` +
                                                    `${t('marketplace.unlock_cost')}: ${formatCredits(unlockPrice)}\n\n` +
                                                    `${t('marketplace.current_money')}: ${formatCredits(user?.money ?? 0)}\n` +
                                                    `${t('marketplace.money_after_unlock')}: ${formatCredits((user?.money ?? 0) - unlockPrice)}\n\n` +
                                                    `${t('marketplace.after_confirm_desc')}`,
                                                    t('marketplace.unlock_recipe'),
                                                    () => {
                                                        void buyRecipeUnlock(recipe.id);
                                                    }
                                                );
                                            }}
                                            style={{
                                                marginTop: '0.45rem',
                                                border: '1px solid rgba(251,191,36,0.35)',
                                                background: canBuyRecipe ? 'linear-gradient(135deg, rgba(251,191,36,0.22), rgba(245,158,11,0.12))' : 'rgba(100,116,139,0.18)',
                                                color: canBuyRecipe ? '#fef3c7' : '#94a3b8',
                                                borderRadius: '0.55rem',
                                                padding: '0.38rem 0.55rem',
                                                cursor: canBuyRecipe ? 'pointer' : 'not-allowed',
                                                fontSize: '0.72rem',
                                                fontWeight: 700,
                                            }}
                                        >
                                            {t('marketplace.unlock_recipe')}
                                        </button>
                                    </div>
                                );
                            })}

                            {recipeShop.length === 0 && (
                                <div style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.55)' }}>
                                    {t('marketplace.no_recipes')}
                                </div>
                            )}
                        </div>
                    </section>
                </div>
                </>
                )}
            </main>

            {confirmState.open && (
                <div
                    onClick={closeConfirm}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(5,2,0,0.78)',
                        backdropFilter: 'blur(4px)',
                        zIndex: 40,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '1rem',
                    }}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            width: '100%',
                            maxWidth: '520px',
                            borderRadius: '0.9rem',
                            border: '1px solid rgba(245,158,11,0.28)',
                            background: 'linear-gradient(135deg, rgba(22,13,5,0.97), rgba(10,5,0,0.97))',
                            boxShadow: '0 20px 45px rgba(0,0,0,0.65)',
                            padding: '1rem',
                        }}
                    >
                        <h3 style={{ margin: 0, marginBottom: '0.55rem', fontSize: '1rem', color: '#e2e8f0' }}>
                            {confirmState.title}
                        </h3>
                        <p
                            style={{
                                margin: 0,
                                fontSize: '0.78rem',
                                lineHeight: 1.55,
                                color: 'rgba(226,232,240,0.92)',
                                whiteSpace: 'pre-line',
                            }}
                        >
                            {confirmState.description}
                        </p>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.9rem' }}>
                            <button
                                type="button"
                                onClick={closeConfirm}
                                style={{
                                    borderRadius: '0.55rem',
                                    border: '1px solid rgba(148,163,184,0.25)',
                                    background: 'rgba(30,19,10,0.7)',
                                    color: '#c4a882',
                                    padding: '0.42rem 0.7rem',
                                    fontSize: '0.76rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                }}
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                type="button"
                                onClick={runConfirm}
                                style={{
                                    borderRadius: '0.55rem',
                                    border: '1px solid rgba(245,158,11,0.35)',
                                    background: 'linear-gradient(135deg, rgba(180,83,9,0.5), rgba(234,88,12,0.35))',
                                    color: '#fef3c7',
                                    padding: '0.42rem 0.78rem',
                                    fontSize: '0.76rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                }}
                            >
                                {confirmState.confirmLabel}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const statCardStyle: CSSProperties = {
    borderRadius: '0.85rem',
    border: '1px solid rgba(148,163,184,0.2)',
    background: 'linear-gradient(135deg, rgba(30,19,10,0.75), rgba(15,8,2,0.9))',
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
    border: '1px solid rgba(245,158,11,0.2)',
    background: 'rgba(15,8,2,0.65)',
    color: '#fbbf24',
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
    background: 'rgba(5,2,0,0.75)',
    color: 'white',
    fontSize: '0.75rem',
    padding: '0.45rem 0.5rem',
    width: '100%',
    outline: 'none',
};

export default MarketplacePage;
