import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '../stores/gameStore';
import { useAuthStore } from '../stores/authStore';
import { ShoppingCart, Tag, Store } from 'lucide-react';

type Tab = 'market' | 'shop';

const MarketPanel = () => {
    const { marketListings, shopItems, inventory, buyListing, buyFromShop, createListing } = useGameStore();
    const user = useAuthStore((s) => s.user);
    const [tab, setTab] = useState<Tab>('market');
    const [sellSlotId, setSellSlotId] = useState<number | null>(null);
    const [sellQty, setSellQty] = useState(1);
    const [sellPrice, setSellPrice] = useState(100);
    const [showSellForm, setShowSellForm] = useState(false);

    const sellableSlots = inventory.filter((s) => s.item && s.quantity > 0);

    const handleSell = () => {
        if (sellSlotId === null) return;
        createListing(sellSlotId, sellQty, sellQty * sellPrice);
        setShowSellForm(false);
        setSellSlotId(null);
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
                {(['market', 'shop'] as Tab[]).map((t) => (
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
                        {t === 'market' ? <ShoppingCart style={{ width: '0.7rem', height: '0.7rem' }} /> : <Store style={{ width: '0.7rem', height: '0.7rem' }} />}
                        {t === 'market' ? 'Market' : 'NPC Shop'}
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
                                <select
                                    value={sellSlotId ?? ''}
                                    onChange={(e) => {
                                        const slotId = Number(e.target.value);
                                        setSellSlotId(slotId);
                                        const slot = sellableSlots.find((s) => s.id === slotId);
                                        if (slot) setSellQty(slot.quantity);
                                    }}
                                    style={{
                                        padding: '0.4rem',
                                        borderRadius: '0.35rem',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        background: 'rgba(0,0,0,0.3)',
                                        color: 'white',
                                        fontSize: '0.7rem',
                                    }}
                                >
                                    <option value="">Select item...</option>
                                    {sellableSlots.map((s) => (
                                        <option key={s.id} value={s.id}>
                                            {s.item?.icon} {s.item?.name} (x{s.quantity})
                                        </option>
                                    ))}
                                </select>
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
                                        type="number"
                                        min={1}
                                        value={sellPrice}
                                        onChange={(e) => setSellPrice(Math.max(1, Number(e.target.value)))}
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

                    {/* Listings */}
                    {marketListings.length === 0 ? (
                        <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '1rem 0' }}>
                            No listings yet
                        </p>
                    ) : (
                        marketListings.map((listing) => (
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
                                    <span style={{ fontSize: '1rem' }}>{listing.item.icon}</span>
                                    <div>
                                        <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>
                                            {listing.quantity}x {listing.item.name}
                                        </div>
                                        <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.35)' }}>
                                            by {listing.seller.email.split('@')[0]}
                                        </div>
                                    </div>
                                </div>
                                {listing.seller_id !== user?.id ? (
                                    <motion.button
                                        whileHover={{ scale: 1.05 }}
                                        whileTap={{ scale: 0.95 }}
                                        onClick={() => buyListing(listing.id)}
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
                                ) : (
                                    <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.35)' }}>
                                        Your listing
                                    </span>
                                )}
                            </motion.div>
                        ))
                    )}
                </div>
            )}

            {/* NPC Shop Tab */}
            {tab === 'shop' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {shopItems.length === 0 ? (
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
                                    <span style={{ fontSize: '1rem' }}>{item.icon}</span>
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
                                    onClick={() => buyFromShop(item.id, 1)}
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
                            </motion.div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
};

export default MarketPanel;
