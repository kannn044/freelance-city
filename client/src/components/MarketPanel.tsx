import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '../stores/gameStore';
import { useAuthStore } from '../stores/authStore';
import { ShoppingCart, Tag, Store, Gift, CircleHelp, Sparkles } from 'lucide-react';
import { renderItemIcon } from '../lib/itemVisual';
import { getEquipmentRarityColor, getEquipmentRarityLabel } from '../lib/equipmentRarity';

type Tab = 'market' | 'shop' | 'equipment';

const MarketPanel = () => {
    const {
        marketListings,
        salesHistory,
        shopItems,
        recipeShop,
        equipmentBoxInfo,
        inventory,
        buyListing,
        buyFromShop,
        buyRecipeUnlock,
        openEquipmentBox,
        createListing,
        fetchRecipeShop,
        fetchEquipmentBoxInfo,
        fetchMarket,
        fetchSalesHistory,
        cancelListing,
        setActionMessage,
    } = useGameStore();
    const user = useAuthStore((s) => s.user);
    const [tab, setTab] = useState<Tab>('market');
    const [sellSlotId, setSellSlotId] = useState<number | null>(null);
    const [sellQty, setSellQty] = useState(1);
    const [sellPriceInput, setSellPriceInput] = useState('100');
    const [showSellForm, setShowSellForm] = useState(false);
    const [showSellPicker, setShowSellPicker] = useState(false);
    const [showOddsModal, setShowOddsModal] = useState(false);
    const [showBoxOpenModal, setShowBoxOpenModal] = useState(false);
    const [isBoxOpening, setIsBoxOpening] = useState(false);
    const [boxOpenResult, setBoxOpenResult] = useState<Awaited<ReturnType<typeof openEquipmentBox>> | null>(null);
    const [shopBuyQty, setShopBuyQty] = useState<Record<number, number>>({});
    const [marketBuyQty, setMarketBuyQty] = useState<Record<number, number>>({});
    const [otherSearch, setOtherSearch] = useState('');
    const [ownSearch, setOwnSearch] = useState('');
    const [salesSearch, setSalesSearch] = useState('');
    const knownSalesIdsRef = useRef<Set<number>>(new Set());
    const salesBootstrappedRef = useRef(false);
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
        confirmLabel: 'Confirm',
        onConfirm: null,
    });

    const sellableSlots = inventory.filter((s) => s.item && s.quantity > 0);
    const selectedSellSlot = sellSlotId === null ? null : sellableSlots.find((s) => s.id === sellSlotId) ?? null;
    const sellPrice = Math.max(1, Number(sellPriceInput || 1));

    // NOTE: backend stores listing.price as unit price (credits per 1 item)
    const getUnitPrice = (price: number) => price;

    const getTotalPrice = (unitPrice: number, quantity: number) => unitPrice * Math.max(0, quantity);

    const containsText = (value: string, query: string) =>
        value.toLowerCase().includes(query.trim().toLowerCase());

    const otherListings = marketListings
        .filter((l) => l.seller_id !== user?.id)
        .filter((l) => containsText(`${l.item.name} ${l.seller.email}`, otherSearch))
        .sort((a, b) => getUnitPrice(a.price) - getUnitPrice(b.price))
        .slice(0, 5);

    const ownListings = marketListings
        .filter((l) => l.seller_id === user?.id)
        .filter((l) => containsText(l.item.name, ownSearch))
        .sort((a, b) => getUnitPrice(a.price) - getUnitPrice(b.price))
        .slice(0, 5);

    const filteredSalesHistory = salesHistory
        .filter((s) => containsText(`${s.item.name} ${s.buyer_name}`, salesSearch))
        .sort((a, b) => getUnitPrice(a.price) - getUnitPrice(b.price))
        .slice(0, 5);

    useEffect(() => {
        if (tab === 'market') {
            fetchSalesHistory();
        }
        if (tab === 'shop') {
            fetchRecipeShop();
        }
        if (tab === 'equipment') {
            fetchEquipmentBoxInfo();
        }
    }, [tab, fetchRecipeShop, fetchEquipmentBoxInfo, fetchSalesHistory]);

    // Realtime refresh for market/sales while player is on Market tab
    useEffect(() => {
        if (tab !== 'market') return;

        const refresh = () => {
            void Promise.all([fetchMarket(), fetchSalesHistory()]);
        };

        refresh();
        const interval = setInterval(refresh, 5000);
        return () => clearInterval(interval);
    }, [tab, fetchMarket, fetchSalesHistory]);

    // Notify when a new sale appears in seller history
    useEffect(() => {
        if (tab !== 'market') return;

        if (!salesBootstrappedRef.current) {
            knownSalesIdsRef.current = new Set(salesHistory.map((s) => s.id));
            salesBootstrappedRef.current = true;
            return;
        }

        const newSales = salesHistory.filter((s) => !knownSalesIdsRef.current.has(s.id));
        if (newSales.length === 0) return;

        for (const sale of salesHistory) {
            knownSalesIdsRef.current.add(sale.id);
        }

        const newest = [...newSales].sort((a, b) => {
            const at = a.sold_at ? new Date(a.sold_at).getTime() : 0;
            const bt = b.sold_at ? new Date(b.sold_at).getTime() : 0;
            return bt - at;
        })[0];

        const extraCount = newSales.length - 1;
        const extraText = extraCount > 0 ? ` (+${extraCount} more)` : '';
        setActionMessage(
            `🔔 ${newest.buyer_name} bought ${newest.quantity}x ${newest.item.name} for ${newest.total} credits${extraText}`
        );
    }, [tab, salesHistory, setActionMessage]);

    const formatSoldTime = (soldAt: string | null) => {
        if (!soldAt) return '-';
        const d = new Date(soldAt);
        return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    };

    const askConfirm = (title: string, description: string, confirmLabel: string, onConfirm: () => void) => {
        setConfirmState({ open: true, title, description, confirmLabel, onConfirm });
    };

    const runConfirm = () => {
        const fn = confirmState.onConfirm;
        setConfirmState((prev) => ({ ...prev, open: false, onConfirm: null }));
        fn?.();
    };

    const formatEquipmentStatus = (
        effectKey?: string | null,
        effectValue?: number | null,
        effectValue2?: number | null,
        multiplier = 1
    ) => {
        if (!effectKey) return ['No special status'];

        const v = Number(effectValue ?? 0) * multiplier;
        const v2 = Number(effectValue2 ?? 0) * multiplier;

        switch (effectKey) {
            case 'hunger_penalty_tier_reduction':
                return [`Hunger Penalty Tier -${Math.round(v)}`];
            case 'cook_secondary_ingredient_save_chance':
                return [`Secondary Ingredient Save Chance +${Math.round(v * 100)}%`];
            case 'max_hunger_bonus':
                return [`Max Hunger +${Math.round(v)}`];
            case 'max_hunger_and_satiety_bonus':
                return [
                    `Max Hunger +${Math.round(v)}`,
                    `Satiety Bonus +${Math.round(v2 * 100)}%`,
                ];
            case 'raw_stack_bonus':
                return [`Raw Stack Capacity +${Math.round(v)}`];
            case 'ingredient_stack_bonus':
                return [`Ingredient Stack Capacity +${Math.round(v)}`];
            case 'farm_time_reduction_pct':
                return [`Farm Time Reduction +${Math.round(v * 100)}%`];
            case 'cook_time_reduction_pct':
                return [`Cook Time Reduction +${Math.round(v * 100)}%`];
            case 'farm_double_yield_chance':
                return [`Double Yield Chance +${Math.round(v * 100)}%`];
            case 'gourmet_chance':
                return [`Gourmet Chance +${Math.round(v * 100)}%`];
            case 'hunger_decay_reduction_per_min':
                return [`Hunger Decay Reduction ${v.toFixed(1)}/min`];
            case 'cook_state_hunger_decay_reduction_pct':
                return [
                    `Cooking Hunger Decay Reduction +${Math.round(v * 100)}%`,
                ].filter(Boolean);
            default:
                return [`${effectKey}: ${v}${effectValue2 != null ? ` / ${v2}` : ''}`];
        }
    };

    const openEquipmentBoxWithReveal = async () => {
        setShowBoxOpenModal(true);
        setIsBoxOpening(true);
        setBoxOpenResult(null);

        const minRevealDelayMs = 1800;
        const startedAt = Date.now();
        const result = await openEquipmentBox();
        const elapsed = Date.now() - startedAt;

        if (elapsed < minRevealDelayMs) {
            await new Promise((resolve) => setTimeout(resolve, minRevealDelayMs - elapsed));
        }

        setBoxOpenResult(result);
        setIsBoxOpening(false);
    };

    const handleSell = () => {
        if (sellSlotId === null) return;
        askConfirm(
            'Confirm Sell Listing',
            `List this item for sale?\nQuantity: ${sellQty}\nUnit Price: ${sellPrice}\nTotal: ${sellQty * sellPrice}`,
            'List Item',
            () => {
                createListing(sellSlotId, sellQty, sellPrice);
                setShowSellForm(false);
                setShowSellPicker(false);
                setSellSlotId(null);
            }
        );
    };

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.6rem',
                height: '100%',
                minHeight: 0,
                overflowY: 'auto',
                overflowX: 'hidden',
                padding: '0.75rem',
                margin: 0,
                boxSizing: 'border-box',
                borderRadius: '0.75rem',
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.02)',
            }}
        >
            {/* Tabs */}
            <div
                style={{
                    display: 'flex',
                    borderRadius: '0.5rem',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    padding: '0.25rem',
                    gap: '0.25rem',
                }}
            >
                {(['market', 'shop', 'equipment'] as Tab[]).map((t) => (
                    <button
                        key={t}
                        onClick={() => setTab(t)}
                        style={{
                            flex: 1,
                            padding: '0.35rem',
                            borderRadius: '0.35rem',
                            border: 'none',
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.3rem',
                            background: tab === t ? 'rgba(255,255,255,0.1)' : 'transparent',
                            color: tab === t ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.5)',
                            transition: 'all 0.2s',
                        }}
                    >
                        {t === 'market' ? (
                            <ShoppingCart style={{ width: '0.7rem', height: '0.7rem' }} />
                        ) : t === 'shop' ? (
                            <Store style={{ width: '0.7rem', height: '0.7rem' }} />
                        ) : (
                            <Gift style={{ width: '0.7rem', height: '0.7rem' }} />
                        )}
                        {t === 'market' ? 'Market' : t === 'shop' ? 'NPC Shop' : 'Equipment Shop'}
                    </button>
                ))}
            </div>

            {/* Market Tab */}
            {tab === 'market' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {/* Sell button */}
                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setShowSellForm(!showSellForm)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.3rem',
                            padding: '0.4rem',
                            borderRadius: '0.5rem',
                            border: '1px solid rgba(255,255,255,0.14)',
                            background: 'rgba(255,255,255,0.03)',
                            color: 'rgba(255,255,255,0.9)',
                            fontSize: '0.7rem',
                            fontWeight: 500,
                            cursor: 'pointer',
                        }}
                    >
                        <Tag style={{ width: '0.7rem', height: '0.7rem' }} />
                        {showSellForm ? 'Cancel' : 'Sell Item'}
                    </motion.button>

                    {/* Sell form */}
                    <AnimatePresence>
                        {showSellForm && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '0.4rem',
                                    overflow: 'hidden',
                                    padding: '0.55rem',
                                    background: 'rgba(255,255,255,0.03)',
                                    borderRadius: '0.5rem',
                                    border: '1px solid rgba(255,255,255,0.08)',
                                }}
                            >
                                <button
                                    type="button"
                                    onClick={() => setShowSellPicker((v) => !v)}
                                    style={{
                                        width: '100%',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: '0.5rem',
                                        padding: '0.4rem',
                                        borderRadius: '0.35rem',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        background: 'rgba(0,0,0,0.3)',
                                        color: 'white',
                                        fontSize: '0.7rem',
                                        cursor: 'pointer',
                                    }}
                                >
                                    {selectedSellSlot?.item ? (
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
                                            {renderItemIcon(selectedSellSlot.item, 16)}
                                            <span>{selectedSellSlot.item.name} (x{selectedSellSlot.quantity})</span>
                                        </span>
                                    ) : (
                                        <span style={{ color: 'rgba(255,255,255,0.7)' }}>Select item...</span>
                                    )}
                                    <span style={{ color: 'rgba(255,255,255,0.6)' }}>{showSellPicker ? '▲' : '▼'}</span>
                                </button>

                                <AnimatePresence>
                                    {showSellPicker && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -4 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -4 }}
                                            style={{
                                                maxHeight: '10rem',
                                                overflowY: 'auto',
                                                borderRadius: '0.35rem',
                                                border: '1px solid rgba(255,255,255,0.1)',
                                                background: 'rgba(2,6,23,0.88)',
                                                padding: '0.2rem',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '0.15rem',
                                            }}
                                        >
                                            {sellableSlots.length === 0 ? (
                                                <div style={{ padding: '0.4rem', fontSize: '0.65rem', color: 'rgba(255,255,255,0.5)' }}>
                                                    No sellable item
                                                </div>
                                            ) : (
                                                sellableSlots.map((s) => (
                                                    <button
                                                        key={s.id}
                                                        type="button"
                                                        onClick={() => {
                                                            setSellSlotId(s.id);
                                                            setSellQty(s.quantity);
                                                            setShowSellPicker(false);
                                                        }}
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'space-between',
                                                            gap: '0.45rem',
                                                            padding: '0.35rem 0.4rem',
                                                            borderRadius: '0.3rem',
                                                            border: s.id === sellSlotId ? '1px solid rgba(147,197,253,0.55)' : '1px solid transparent',
                                                            background: s.id === sellSlotId ? 'rgba(147,197,253,0.16)' : 'rgba(255,255,255,0.03)',
                                                            color: 'white',
                                                            fontSize: '0.66rem',
                                                            cursor: 'pointer',
                                                        }}
                                                    >
                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
                                                            {s.item ? renderItemIcon(s.item, 16) : null}
                                                            <span>{s.item?.name}</span>
                                                        </span>
                                                        <span style={{ color: 'rgba(255,255,255,0.65)' }}>x{s.quantity}</span>
                                                    </button>
                                                ))
                                            )}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                                <div style={{ display: 'flex', gap: '0.3rem' }}>
                                    <input
                                        type="number"
                                        min={1}
                                        max={sellableSlots.find((s) => s.id === sellSlotId)?.quantity ?? 1}
                                        value={sellQty}
                                        onChange={(e) => {
                                            const max = sellableSlots.find((s) => s.id === sellSlotId)?.quantity ?? 1;
                                            setSellQty(Math.min(Math.max(1, Number(e.target.value)), max));
                                        }}
                                        placeholder="Qty"
                                        style={{
                                            flex: 1,
                                            padding: '0.35rem',
                                            borderRadius: '0.35rem',
                                            border: '1px solid rgba(255,255,255,0.1)',
                                            background: 'rgba(0,0,0,0.3)',
                                            color: 'white',
                                            fontSize: '0.7rem',
                                        }}
                                    />
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        pattern="[0-9]*"
                                        value={sellPriceInput}
                                        onChange={(e) => {
                                            const next = e.target.value;
                                            if (/^\d*$/.test(next)) {
                                                setSellPriceInput(next);
                                            }
                                        }}
                                        onBlur={() => setSellPriceInput(String(sellPrice))}
                                        placeholder="Unit Price"
                                        style={{
                                            flex: 1,
                                            padding: '0.35rem',
                                            borderRadius: '0.35rem',
                                            border: '1px solid rgba(255,255,255,0.1)',
                                            background: 'rgba(0,0,0,0.3)',
                                            color: 'white',
                                            fontSize: '0.7rem',
                                        }}
                                    />
                                </div>
                                {sellSlotId !== null && (
                                    <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', textAlign: 'right' }}>
                                        Total: 💰 <span style={{ color: '#fbbf24', fontWeight: 600 }}>{sellQty * sellPrice}</span>
                                    </div>
                                )}
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={handleSell}
                                    disabled={sellSlotId === null}
                                    style={{
                                        padding: '0.4rem',
                                        borderRadius: '0.35rem',
                                        border: '1px solid rgba(255,255,255,0.14)',
                                        background: sellSlotId !== null ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)',
                                        color: 'white',
                                        fontSize: '0.7rem',
                                        fontWeight: 500,
                                        cursor: sellSlotId !== null ? 'pointer' : 'not-allowed',
                                    }}
                                >
                                    List for Sale
                                </motion.button>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Listings: Other Players */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                        <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.55)', fontWeight: 700 }}>
                            Other Players Listings
                        </div>
                        <input
                            type="text"
                            value={otherSearch}
                            onChange={(e) => setOtherSearch(e.target.value)}
                            placeholder="Search item/seller..."
                            style={{
                                width: '100%',
                                padding: '0.35rem 0.45rem',
                                borderRadius: '0.35rem',
                                border: '1px solid rgba(255,255,255,0.12)',
                                background: 'rgba(15,23,42,0.5)',
                                color: 'white',
                                fontSize: '0.65rem',
                            }}
                        />
                        {otherListings.length === 0 ? (
                            <p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', padding: '0.35rem 0' }}>
                                No listings from other players.
                            </p>
                        ) : (
                            otherListings.map((listing) => (
                                <motion.div
                                    key={listing.id}
                                    initial={{ opacity: 0, y: 5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '0.6rem',
                                        borderRadius: '0.5rem',
                                        background: 'rgba(255,255,255,0.045)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        {renderItemIcon(listing.item, 16)}
                                        <div>
                                            <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>
                                                {listing.quantity}x {listing.item.name}
                                            </div>
                                            <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.35)' }}>
                                                by {listing.seller.email.split('@')[0]}
                                            </div>
                                            <div style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.4)' }}>
                                                Unit: {listing.price} • Total: {getTotalPrice(listing.price, listing.quantity)}
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                        <input
                                            type="number"
                                            min={1}
                                            max={listing.quantity}
                                            value={marketBuyQty[listing.id] ?? 1}
                                            onChange={(e) => {
                                                const next = Math.min(
                                                    Math.max(1, Number(e.target.value) || 1),
                                                    listing.quantity
                                                );
                                                setMarketBuyQty((prev) => ({ ...prev, [listing.id]: next }));
                                            }}
                                            style={{
                                                width: '3rem',
                                                padding: '0.22rem 0.3rem',
                                                borderRadius: '0.35rem',
                                                border: '1px solid rgba(255,255,255,0.14)',
                                                background: 'rgba(15,23,42,0.45)',
                                                color: 'white',
                                                fontSize: '0.62rem',
                                            }}
                                        />
                                        <motion.button
                                            whileHover={{ scale: 1.05 }}
                                            whileTap={{ scale: 0.95 }}
                                            onClick={() => {
                                                const qty = Math.min(
                                                    Math.max(1, marketBuyQty[listing.id] ?? 1),
                                                    listing.quantity
                                                );
                                                askConfirm(
                                                    'Confirm Purchase',
                                                    `Buy ${qty}x ${listing.item.name} for ${qty * listing.price} credits?\n(Unit: ${listing.price})`,
                                                    'Buy',
                                                    () => buyListing(listing.id, qty)
                                                );
                                            }}
                                            style={{
                                                padding: '0.3rem 0.6rem',
                                                borderRadius: '0.35rem',
                                                border: '1px solid rgba(255,255,255,0.14)',
                                                background: 'rgba(255,255,255,0.08)',
                                                color: 'white',
                                                fontSize: '0.65rem',
                                                fontWeight: 500,
                                                cursor: 'pointer',
                                            }}
                                        >
                                            💰 {listing.price}
                                        </motion.button>
                                    </div>
                                </motion.div>
                            ))
                        )}
                    </div>

                    {/* Listings: Your Items */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.2rem' }}>
                        <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.55)', fontWeight: 700 }}>
                            Your Listings
                        </div>
                        <input
                            type="text"
                            value={ownSearch}
                            onChange={(e) => setOwnSearch(e.target.value)}
                            placeholder="Search your items..."
                            style={{
                                width: '100%',
                                padding: '0.35rem 0.45rem',
                                borderRadius: '0.35rem',
                                border: '1px solid rgba(255,255,255,0.12)',
                                background: 'rgba(15,23,42,0.5)',
                                color: 'white',
                                fontSize: '0.65rem',
                            }}
                        />
                        {ownListings.length === 0 ? (
                            <p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', padding: '0.35rem 0' }}>
                                You have no active listings.
                            </p>
                        ) : (
                            ownListings.map((listing) => (
                                <motion.div
                                    key={listing.id}
                                    initial={{ opacity: 0, y: 5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '0.6rem',
                                        borderRadius: '0.5rem',
                                        background: 'rgba(96,165,250,0.08)',
                                        border: '1px solid rgba(96,165,250,0.25)',
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        {renderItemIcon(listing.item, 16)}
                                        <div>
                                            <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'rgba(255,255,255,0.92)' }}>
                                                {listing.quantity}x {listing.item.name}
                                            </div>
                                            <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.45)' }}>
                                                Your listing
                                            </div>
                                            <div style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.4)' }}>
                                                Unit: {listing.price} • Total: {getTotalPrice(listing.price, listing.quantity)}
                                            </div>
                                        </div>
                                    </div>
                                    <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#93c5fd' }}>
                                        💰 {getTotalPrice(listing.price, listing.quantity)}
                                    </span>
                                    <motion.button
                                        whileHover={{ scale: 1.04 }}
                                        whileTap={{ scale: 0.96 }}
                                        onClick={() =>
                                            askConfirm(
                                                'Confirm Cancel Listing',
                                                `Cancel ${listing.quantity}x ${listing.item.name}?\nItem will return to your inventory only if space is available.`,
                                                'Cancel Listing',
                                                () => cancelListing(listing.id)
                                            )
                                        }
                                        style={{
                                            marginLeft: '0.45rem',
                                            padding: '0.28rem 0.5rem',
                                            borderRadius: '0.35rem',
                                            border: '1px solid rgba(248,113,113,0.35)',
                                            background: 'rgba(248,113,113,0.12)',
                                            color: '#fecaca',
                                            fontSize: '0.62rem',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        Cancel
                                    </motion.button>
                                </motion.div>
                            ))
                        )}
                    </div>

                    {/* Sales History */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.25rem' }}>
                        <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.55)', fontWeight: 700 }}>
                            Sales History
                        </div>
                        <input
                            type="text"
                            value={salesSearch}
                            onChange={(e) => setSalesSearch(e.target.value)}
                            placeholder="Search sold items/buyer..."
                            style={{
                                width: '100%',
                                padding: '0.35rem 0.45rem',
                                borderRadius: '0.35rem',
                                border: '1px solid rgba(255,255,255,0.12)',
                                background: 'rgba(15,23,42,0.5)',
                                color: 'white',
                                fontSize: '0.65rem',
                            }}
                        />
                        {filteredSalesHistory.length === 0 ? (
                            <p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', padding: '0.35rem 0' }}>
                                No sold history yet.
                            </p>
                        ) : (
                            filteredSalesHistory.map((sale) => (
                                <motion.div
                                    key={`sale-history-${sale.id}`}
                                    initial={{ opacity: 0, y: 5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '0.6rem',
                                        borderRadius: '0.5rem',
                                        background: 'rgba(74,222,128,0.06)',
                                        border: '1px solid rgba(74,222,128,0.2)',
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        {renderItemIcon(sale.item, 16)}
                                        <div>
                                            <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'rgba(255,255,255,0.92)' }}>
                                                {sale.quantity}x {sale.item.name}
                                            </div>
                                            <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.45)' }}>
                                                Buyer: {sale.buyer_name} • {formatSoldTime(sale.sold_at)}
                                            </div>
                                            <div style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.4)' }}>
                                                Unit: {sale.price} • Total: {getTotalPrice(sale.price, sale.quantity)}
                                            </div>
                                        </div>
                                    </div>
                                    <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#4ade80' }}>
                                        💰 {sale.total}
                                    </span>
                                </motion.div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {/* NPC Shop Tab */}
            {tab === 'shop' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {recipeShop.length > 0 && (
                        <>
                            <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.45)' }}>
                                Recipe Scrolls (Chef only)
                            </div>
                            {recipeShop.map((recipe) => (
                                <motion.div
                                    key={`recipe-${recipe.id}`}
                                    initial={{ opacity: 0, y: 5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '0.6rem',
                                        borderRadius: '0.5rem',
                                        background: 'rgba(251,191,36,0.05)',
                                        border: '1px solid rgba(251,191,36,0.2)',
                                    }}
                                >
                                    <div>
                                        <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'rgba(255,255,255,0.92)' }}>
                                            📜 {recipe.name}
                                        </div>
                                        <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.45)' }}>
                                            Unlock to cook in workspace
                                        </div>
                                    </div>
                                    <motion.button
                                        whileHover={{ scale: 1.05 }}
                                        whileTap={{ scale: 0.95 }}
                                        onClick={() =>
                                            askConfirm(
                                                'Confirm Recipe Unlock',
                                                `Unlock ${recipe.name} for ${recipe.unlock_price ?? 300} credits?`,
                                                'Unlock',
                                                () => buyRecipeUnlock(recipe.id)
                                            )
                                        }
                                        style={{
                                            padding: '0.3rem 0.6rem',
                                            borderRadius: '0.35rem',
                                            border: '1px solid rgba(251,191,36,0.35)',
                                            background: 'rgba(251,191,36,0.08)',
                                            color: '#fbbf24',
                                            fontSize: '0.65rem',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                        }}
                                    >
                                        💰 {recipe.unlock_price ?? 300}
                                    </motion.button>
                                </motion.div>
                            ))}
                        </>
                    )}

                    {shopItems.length === 0 && (!(user?.chef_level && user.chef_level > 0) || recipeShop.length === 0) ? (
                        <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '1rem 0' }}>
                            No items available. Unlock an occupation first!
                        </p>
                    ) : (
                        shopItems.map((item) => (
                            <motion.div
                                key={item.id}
                                initial={{ opacity: 0, y: 5 }}
                                animate={{ opacity: 1, y: 0 }}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '0.6rem',
                                    borderRadius: '0.5rem',
                                    background: 'rgba(255,255,255,0.045)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    {renderItemIcon(item, 16)}
                                    <div>
                                        <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>
                                            {item.name}
                                        </div>
                                        <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.35)' }}>
                                            {item.type} • Stack: {item.max_stack}
                                        </div>
                                    </div>
                                </div>
                                <motion.button
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => {
                                        const qty = Math.max(1, shopBuyQty[item.id] ?? 1);
                                        const unitPrice = item.buy_price ?? 0;
                                        askConfirm(
                                            'Confirm NPC Purchase',
                                            `Buy ${qty}x ${item.name} for ${qty * unitPrice} credits?\n(Unit: ${unitPrice})`,
                                            'Buy',
                                            () => buyFromShop(item.id, qty)
                                        );
                                    }}
                                    style={{
                                        padding: '0.3rem 0.6rem',
                                        borderRadius: '0.35rem',
                                        border: '1px solid rgba(255,255,255,0.14)',
                                        background: 'rgba(255,255,255,0.08)',
                                        color: 'white',
                                        fontSize: '0.65rem',
                                        fontWeight: 500,
                                        cursor: 'pointer',
                                    }}
                                >
                                    💰 {item.buy_price}
                                </motion.button>
                                <input
                                    type="number"
                                    min={1}
                                    max={item.max_stack}
                                    value={shopBuyQty[item.id] ?? 1}
                                    onChange={(e) => {
                                        const next = Math.min(
                                            Math.max(1, Number(e.target.value) || 1),
                                            item.max_stack
                                        );
                                        setShopBuyQty((prev) => ({ ...prev, [item.id]: next }));
                                    }}
                                    style={{
                                        width: '3.2rem',
                                        marginLeft: '0.35rem',
                                        padding: '0.22rem 0.3rem',
                                        borderRadius: '0.35rem',
                                        border: '1px solid rgba(255,255,255,0.14)',
                                        background: 'rgba(15,23,42,0.45)',
                                        color: 'white',
                                        fontSize: '0.62rem',
                                    }}
                                />
                            </motion.div>
                        ))
                    )}
                </div>
            )}

            {/* Equipment Shop Tab */}
            {tab === 'equipment' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <motion.div
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        style={{
                            borderRadius: '0.55rem',
                            border: '1px solid rgba(167,139,250,0.35)',
                            background: 'rgba(167,139,250,0.07)',
                            padding: '0.65rem',
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                            <div>
                                <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#ddd6fe' }}>
                                    🎁 Equipment Box
                                </div>
                                <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.55)' }}>
                                    1 Box = 1 Random Equipment (can roll other occupation)
                                </div>
                            </div>
                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() =>
                                    askConfirm(
                                        'Confirm Open Box',
                                        `Open 1 Equipment Box for ${equipmentBoxInfo?.box?.price ?? 420} credits?\nYou will receive 1 random equipment item.`,
                                        'Open Box',
                                        () => {
                                            void openEquipmentBoxWithReveal();
                                        }
                                    )
                                }
                                style={{
                                    padding: '0.3rem 0.6rem',
                                    borderRadius: '0.35rem',
                                    border: '1px solid rgba(167,139,250,0.5)',
                                    background: 'rgba(167,139,250,0.14)',
                                    color: '#ddd6fe',
                                    fontSize: '0.65rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                💰 {equipmentBoxInfo?.box?.price ?? 420}
                            </motion.button>
                        </div>

                        <div
                            style={{
                                marginTop: '0.45rem',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                                width: 'fit-content',
                                position: 'relative',
                            }}
                        >
                            <span style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.6)' }}>Drop Details</span>
                                <button
                                    onClick={() => setShowOddsModal(true)}
                                    style={{
                                        border: 'none',
                                        background: 'transparent',
                                        padding: 0,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        cursor: 'pointer',
                                        color: 'rgba(255,255,255,0.65)',
                                    }}
                                    aria-label="Toggle equipment odds details"
                                >
                                    <CircleHelp style={{ width: '0.8rem', height: '0.8rem' }} />
                                </button>
                        </div>
                    </motion.div>
                </div>
            )}

            <AnimatePresence>
                {showOddsModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        style={{
                            position: 'fixed',
                            inset: 0,
                            background: 'rgba(2,6,23,0.58)',
                            zIndex: 100,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '1rem',
                        }}
                        onClick={() => setShowOddsModal(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.96, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.96, opacity: 0 }}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                                width: '100%',
                                maxWidth: '24rem',
                                borderRadius: '0.75rem',
                                border: '1px solid rgba(167,139,250,0.35)',
                                background: 'rgba(15,23,42,0.96)',
                                padding: '0.9rem',
                            }}
                        >
                            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#ddd6fe', marginBottom: '0.4rem' }}>
                                Equipment Box Drop Details
                            </div>
                            <div style={{ fontSize: '0.64rem', color: 'rgba(255,255,255,0.7)', marginBottom: '0.45rem' }}>
                                Formula: Role Bias × Slot Weight
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem 0.45rem', fontSize: '0.62rem', color: 'rgba(255,255,255,0.82)' }}>
                                {equipmentBoxInfo?.odds?.map((o) => (
                                    <div key={`${o.role}-${o.slot}`}>[{o.role}] {o.slot}: {o.chancePct}%</div>
                                ))}
                            </div>

                            <div style={{ marginTop: '0.6rem', fontSize: '0.66rem', color: '#c4b5fd', fontWeight: 700 }}>
                                Rarity Odds
                            </div>
                            <div style={{ marginTop: '0.3rem', display: 'grid', gap: '0.2rem', fontSize: '0.62rem' }}>
                                {(equipmentBoxInfo?.rarityOdds ?? []).map((r) => (
                                    <div key={r.rarity} style={{ color: getEquipmentRarityColor(r.rarity) }}>
                                        {getEquipmentRarityLabel(r.rarity)}: {r.chancePct}% (Buff x{r.buffMultiplier})
                                    </div>
                                ))}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.65rem' }}>
                                <button
                                    onClick={() => setShowOddsModal(false)}
                                    style={{
                                        border: '1px solid rgba(255,255,255,0.16)',
                                        background: 'rgba(255,255,255,0.06)',
                                        color: 'white',
                                        borderRadius: '0.4rem',
                                        fontSize: '0.65rem',
                                        padding: '0.28rem 0.55rem',
                                        cursor: 'pointer',
                                    }}
                                >
                                    Close
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {showBoxOpenModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        style={{
                            position: 'fixed',
                            inset: 0,
                            background: 'rgba(2,6,23,0.65)',
                            zIndex: 130,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '1rem',
                        }}
                        onClick={() => {
                            if (!isBoxOpening) setShowBoxOpenModal(false);
                        }}
                    >
                        <motion.div
                            initial={{ scale: 0.94, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.94, opacity: 0 }}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                                width: '100%',
                                maxWidth: '22rem',
                                borderRadius: '0.8rem',
                                border: '1px solid rgba(167,139,250,0.35)',
                                background: 'rgba(15,23,42,0.97)',
                                padding: '1rem',
                            }}
                        >
                            {isBoxOpening ? (
                                <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem' }}>
                                    <motion.div
                                        animate={{ rotate: [0, 12, -12, 8, -8, 0], scale: [1, 1.08, 1] }}
                                        transition={{ repeat: Infinity, duration: 0.9, ease: 'easeInOut' }}
                                        style={{
                                            width: '4.2rem',
                                            height: '4.2rem',
                                            borderRadius: '999px',
                                            display: 'grid',
                                            placeItems: 'center',
                                            border: '1px solid rgba(167,139,250,0.45)',
                                            background: 'rgba(167,139,250,0.12)',
                                        }}
                                    >
                                        <Gift style={{ width: '2rem', height: '2rem', color: '#ddd6fe' }} />
                                    </motion.div>
                                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#ddd6fe' }}>Opening Equipment Box...</div>
                                    <div style={{ fontSize: '0.64rem', color: 'rgba(255,255,255,0.65)' }}>
                                        Please wait... luck is rolling 🎲
                                    </div>
                                </div>
                            ) : boxOpenResult?.ok && boxOpenResult.rolled?.item ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: '#c4b5fd', fontSize: '0.8rem', fontWeight: 700 }}>
                                        <Sparkles style={{ width: '0.9rem', height: '0.9rem' }} />
                                        Box Opened!
                                    </div>

                                    <div
                                        style={{
                                            borderRadius: '0.6rem',
                                            border: '1px solid rgba(167,139,250,0.35)',
                                            background: 'rgba(167,139,250,0.08)',
                                            padding: '0.65rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.55rem',
                                        }}
                                    >
                                        <div
                                            style={{
                                                width: '2.2rem',
                                                height: '2.2rem',
                                                borderRadius: '0.5rem',
                                                border: '1px solid rgba(255,255,255,0.14)',
                                                display: 'grid',
                                                placeItems: 'center',
                                                background: 'rgba(255,255,255,0.05)',
                                            }}
                                        >
                                            {renderItemIcon(boxOpenResult.rolled.item, 24)}
                                        </div>
                                        <div>
                                            <div
                                                style={{
                                                    fontSize: '0.78rem',
                                                    fontWeight: 700,
                                                    color: getEquipmentRarityColor(boxOpenResult.rolled.rarity),
                                                }}
                                            >
                                                {boxOpenResult.rolled.item.name}
                                            </div>
                                            <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.62)' }}>
                                                Price Spent: {boxOpenResult.boxPrice ?? equipmentBoxInfo?.box?.price ?? 420} credits
                                            </div>
                                        </div>
                                    </div>

                                    <div
                                        style={{
                                            borderRadius: '0.55rem',
                                            border: '1px solid rgba(255,255,255,0.14)',
                                            background: 'rgba(255,255,255,0.04)',
                                            padding: '0.55rem',
                                            display: 'grid',
                                            gap: '0.3rem',
                                            fontSize: '0.64rem',
                                            color: 'rgba(255,255,255,0.82)',
                                        }}
                                    >
                                        <div><b style={{ color: '#ddd6fe' }}>Role:</b> {boxOpenResult.rolled.role}</div>
                                        <div><b style={{ color: '#ddd6fe' }}>Slot:</b> {boxOpenResult.rolled.slot}</div>
                                        <div>
                                            <b style={{ color: '#ddd6fe' }}>Rarity:</b>{' '}
                                            <span style={{ color: getEquipmentRarityColor(boxOpenResult.rolled.rarity), fontWeight: 700 }}>
                                                {getEquipmentRarityLabel(boxOpenResult.rolled.rarity)}
                                            </span>{' '}
                                            <span style={{ color: 'rgba(255,255,255,0.62)' }}>(Buff x{boxOpenResult.rolled.buffMultiplier ?? 1})</span>
                                        </div>
                                        <div style={{ display: 'grid', gap: '0.2rem' }}>
                                            <b style={{ color: '#ddd6fe' }}>Status:</b>
                                            {formatEquipmentStatus(
                                                boxOpenResult.rolled.item.effect_key,
                                                boxOpenResult.rolled.item.effect_value,
                                                boxOpenResult.rolled.item.effect_value2,
                                                boxOpenResult.rolled.buffMultiplier ?? 1
                                            ).map((line, idx) => (
                                                <div key={`${line}-${idx}`} style={{ color: 'rgba(255,255,255,0.72)' }}>
                                                    • {line}
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.35rem' }}>
                                        <button
                                            onClick={() => setShowBoxOpenModal(false)}
                                            style={{
                                                border: '1px solid rgba(167,139,250,0.5)',
                                                background: 'rgba(167,139,250,0.2)',
                                                color: '#ddd6fe',
                                                borderRadius: '0.4rem',
                                                fontSize: '0.66rem',
                                                fontWeight: 700,
                                                padding: '0.3rem 0.62rem',
                                                cursor: 'pointer',
                                            }}
                                        >
                                            Nice!
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div style={{ display: 'grid', gap: '0.6rem' }}>
                                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#fca5a5' }}>Open Box Failed</div>
                                    <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.72)' }}>
                                        {boxOpenResult?.error ?? 'Failed to open equipment box'}
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                        <button
                                            onClick={() => setShowBoxOpenModal(false)}
                                            style={{
                                                border: '1px solid rgba(255,255,255,0.2)',
                                                background: 'rgba(255,255,255,0.08)',
                                                color: 'white',
                                                borderRadius: '0.4rem',
                                                fontSize: '0.64rem',
                                                padding: '0.28rem 0.55rem',
                                                cursor: 'pointer',
                                            }}
                                        >
                                            Close
                                        </button>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {confirmState.open && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        style={{
                            position: 'fixed',
                            inset: 0,
                            background: 'rgba(2,6,23,0.58)',
                            zIndex: 110,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '1rem',
                        }}
                        onClick={() => setConfirmState((prev) => ({ ...prev, open: false, onConfirm: null }))}
                    >
                        <motion.div
                            initial={{ scale: 0.96, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.96, opacity: 0 }}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                                width: '100%',
                                maxWidth: '22rem',
                                borderRadius: '0.75rem',
                                border: '1px solid rgba(255,255,255,0.15)',
                                background: 'rgba(15,23,42,0.96)',
                                padding: '0.9rem',
                            }}
                        >
                            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'rgba(255,255,255,0.92)', marginBottom: '0.35rem' }}>
                                {confirmState.title}
                            </div>
                            <div style={{ fontSize: '0.66rem', color: 'rgba(255,255,255,0.7)', whiteSpace: 'pre-line' }}>
                                {confirmState.description}
                            </div>
                            <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'flex-end', gap: '0.45rem' }}>
                                <button
                                    onClick={() => setConfirmState((prev) => ({ ...prev, open: false, onConfirm: null }))}
                                    style={{
                                        border: '1px solid rgba(255,255,255,0.16)',
                                        background: 'rgba(255,255,255,0.06)',
                                        color: 'white',
                                        borderRadius: '0.4rem',
                                        fontSize: '0.65rem',
                                        padding: '0.28rem 0.55rem',
                                        cursor: 'pointer',
                                    }}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={runConfirm}
                                    style={{
                                        border: '1px solid rgba(99,102,241,0.45)',
                                        background: 'rgba(99,102,241,0.2)',
                                        color: '#e0e7ff',
                                        borderRadius: '0.4rem',
                                        fontSize: '0.65rem',
                                        fontWeight: 700,
                                        padding: '0.28rem 0.6rem',
                                        cursor: 'pointer',
                                    }}
                                >
                                    {confirmState.confirmLabel}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default MarketPanel;
