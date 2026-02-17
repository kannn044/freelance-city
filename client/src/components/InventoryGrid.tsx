import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '../stores/gameStore';
import type { InventorySlot } from '../stores/gameStore';
import { UtensilsCrossed, Package, ArrowDownAZ, Rows3, Trash2 } from 'lucide-react';
import { getEquipmentImageByName, renderItemIcon } from '../lib/itemVisual';
import { getEquipmentRarityColor, getEquipmentRarityLabel, getEquipmentRarityMultiplier } from '../lib/equipmentRarity';

const equipmentSlots = [
    { key: 'HEAD', label: 'Head' },
    { key: 'UPPER_BODY', label: 'Upper Body' },
    { key: 'LOWER_BODY', label: 'Lower Body' },
    { key: 'ARM', label: 'Arm' },
    { key: 'GLOVE', label: 'Glove' },
    { key: 'SHOE', label: 'Shoe' },
] as const;

const InventoryGrid = () => {
    const { inventory, equipment, eatItem, equipItem, unequipItem, organizeInventory, discardItem } = useGameStore();
    const occupiedSlots = inventory.filter((s) => s.item && s.quantity > 0).length;
    const [hoveredSlot, setHoveredSlot] = useState<InventorySlot | null>(null);
    const [draggingSlotId, setDraggingSlotId] = useState<number | null>(null);
    const [isBinHovered, setIsBinHovered] = useState(false);
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

    const askConfirm = (title: string, description: string, confirmLabel: string, onConfirm: () => void) => {
        setConfirmState({ open: true, title, description, confirmLabel, onConfirm });
    };

    const runConfirm = () => {
        const fn = confirmState.onConfirm;
        setConfirmState((prev) => ({ ...prev, open: false, onConfirm: null }));
        fn?.();
    };

    const hasTierRarity = (slot: InventorySlot | null | undefined) => {
        return !!slot?.equipment_rarity;
    };

    const handleDropToBin = () => {
        if (!draggingSlotId) return;
        const slot = inventory.find((s) => s.id === draggingSlotId);
        setDraggingSlotId(null);
        setIsBinHovered(false);

        if (!slot?.item || slot.quantity <= 0) return;

        const rarityOrTier = slot.item.type === 'EQUIPMENT' ? 'Rarity' : 'Tier';
        const rarityText = slot.equipment_rarity
            ? `\n${rarityOrTier}: ${getEquipmentRarityLabel(slot.equipment_rarity)}`
            : '';

        askConfirm(
            'Confirm Discard Item',
            `Item: ${slot.item.name}${rarityText}\nQuantity: ${slot.quantity}`,
            'Discard',
            () => discardItem(slot.id, slot.quantity)
        );
    };

    const formatEquipmentEffect = (slot: InventorySlot | null) => {
        const item = slot?.item;
        if (!item || item.type !== 'EQUIPMENT') return null;

        const m = getEquipmentRarityMultiplier(slot?.equipment_rarity);
        const v = Number(item.effect_value ?? 0) * m;
        const v2 = Number(item.effect_value2 ?? 0) * m;

        if (item.effect_key === 'hunger_penalty_tier_reduction') return `Reduce hunger penalty by ${v} tier`;
        if (item.effect_key === 'cook_secondary_ingredient_save_chance') return `${Math.round(v * 100)}% chance to save secondary ingredients`;
        if (item.effect_key === 'max_hunger_bonus') return `Max Hunger +${v}`;
        if (item.effect_key === 'max_hunger_and_satiety_bonus') {
            const satietyPct = Math.round(v2 * 100);
            return `Max Hunger +${v}, Satiety Buff +${satietyPct}%`;
        }
        if (item.effect_key === 'raw_stack_bonus') return `Raw stack limit +${v}`;
        if (item.effect_key === 'ingredient_stack_bonus') return `Ingredient stack limit +${v}`;
        if (item.effect_key === 'farm_time_reduction_pct') return `Farm time -${Math.round(v * 100)}%`;
        if (item.effect_key === 'cook_time_reduction_pct') return `Cook time -${Math.round(v * 100)}%`;
        if (item.effect_key === 'farm_double_yield_chance') return `${Math.round(v * 100)}% chance for double yield`;
        if (item.effect_key === 'gourmet_chance') return `${Math.round(v * 100)}% chance to cook Gourmet quality`;
        if (item.effect_key === 'hunger_decay_reduction_per_min') return `Hunger decay -${v}/min`;
        if (item.effect_key === 'cook_state_hunger_decay_reduction_pct') return `While cooking: decay -${Math.round(v * 100)}%`;

        return null;
    };

    const handleSlotClick = (slot: InventorySlot) => {
        if (!slot.item) return;
        if (slot.item.type === 'EQUIPMENT') {
            const rarity = getEquipmentRarityLabel(slot.equipment_rarity);
            const effectText = formatEquipmentEffect(slot);
            askConfirm(
                'Confirm Equip Item',
                `Item: ${slot.item.name} (${rarity})\nType: EQUIPMENT\nRole: ${slot.item.equipment_role ?? '-'}\nSlot: ${slot.item.equipment_slot ?? '-'}${effectText ? `\nEffect: ${effectText}` : ''}`,
                'Equip',
                () => equipItem(slot.id)
            );
            return;
        }
        if (slot.item.kcal && slot.item.kcal > 0) {
            const rarityText = hasTierRarity(slot) ? `\nTier: ${getEquipmentRarityLabel(slot.equipment_rarity)}` : '';
            askConfirm(
                'Confirm Eat Item',
                `Item: ${slot.item.name}${rarityText}\nKcal: +${slot.item.kcal}${slot.item.buff_pct ? `\nBuff: ${Math.round(slot.item.buff_pct * 100)}% for ${slot.item.buff_mins ?? 0}m` : ''}`,
                'Eat',
                () => eatItem(slot.id)
            );
        }
    };

    return (
        <>
            <div
                style={{
                    borderRadius: '0.6rem',
                    border: '1px solid rgba(255,255,255,0.08)',
                    background: 'rgba(255,255,255,0.02)',
                    padding: '0.6rem',
                    marginBottom: '0.75rem',
                }}
            >
                <div
                    style={{
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        color: 'rgba(255,255,255,0.75)',
                        marginBottom: '0.5rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                    }}
                >
                    Equipment
                </div>

                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: '0.4rem',
                    }}
                >
                    {equipmentSlots.map((slot) => (
                        <button
                            key={slot.key}
                            onClick={() => unequipItem(slot.key)}
                            style={{
                                borderRadius: '0.5rem',
                                border: '1px dashed rgba(255,255,255,0.14)',
                                background: 'rgba(255,255,255,0.02)',
                                minHeight: '3.4rem',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.15rem',
                                padding: '0.25rem',
                                cursor: 'pointer',
                            }}
                        >
                            {(() => {
                                const eq = equipment.find((e) => e.slot === slot.key);
                                const imgSrc = getEquipmentImageByName(eq?.item_name);
                                if (imgSrc) {
                                    return (
                                        <img
                                            src={imgSrc}
                                            alt={eq?.item_name ?? slot.label}
                                            width={16}
                                            height={16}
                                            style={{ width: '1rem', height: '1rem', objectFit: 'contain' }}
                                        />
                                    );
                                }

                                if (eq?.item_icon) {
                                    return <span style={{ fontSize: '1rem', lineHeight: 1 }}>{eq.item_icon}</span>;
                                }

                                return (
                                    <span
                                        aria-hidden="true"
                                        style={{
                                            width: '1rem',
                                            height: '1rem',
                                            borderRadius: '999px',
                                            border: '1px dashed rgba(255,255,255,0.22)',
                                            display: 'inline-block',
                                        }}
                                    />
                                );
                            })()}
                            <span
                                style={{
                                    fontSize: '0.58rem',
                                    color: (() => {
                                        const eq = equipment.find((e) => e.slot === slot.key);
                                        return eq?.item_id ? getEquipmentRarityColor(eq.item_rarity) : 'rgba(255,255,255,0.6)';
                                    })(),
                                    textAlign: 'center',
                                    lineHeight: 1.15,
                                }}
                            >
                                {(() => {
                                    const eq = equipment.find((e) => e.slot === slot.key);
                                    if (!eq?.item_name) return slot.label;
                                    const rarity = getEquipmentRarityLabel(eq.item_rarity);
                                    return `${eq.item_name} (${rarity})`;
                                })()}
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderRadius: '0.5rem',
                    border: '1px solid rgba(255,255,255,0.08)',
                    background: 'rgba(255,255,255,0.02)',
                    padding: '0.4rem 0.5rem',
                    marginBottom: '0.6rem',
                }}
            >
                <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>
                    Capacity
                </span>
                <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>
                    {occupiedSlots}/8 slots
                </span>
            </div>

            <div
                style={{
                    display: 'flex',
                    gap: '0.3rem',
                    marginBottom: '0.6rem',
                    justifyContent: 'flex-end',
                }}
            >
                <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => organizeInventory('combine')}
                    title="Combine same items"
                    style={{
                        width: '1.9rem',
                        height: '1.9rem',
                        borderRadius: '0.4rem',
                        border: '1px solid rgba(255,255,255,0.14)',
                        background: 'rgba(255,255,255,0.04)',
                        color: 'rgba(255,255,255,0.88)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                    }}
                >
                    <Rows3 style={{ width: '0.82rem', height: '0.82rem' }} />
                </motion.button>
                <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => organizeInventory('sort-az')}
                    title="Sort items A-Z"
                    style={{
                        width: '1.9rem',
                        height: '1.9rem',
                        borderRadius: '0.4rem',
                        border: '1px solid rgba(147,197,253,0.34)',
                        background: 'rgba(147,197,253,0.08)',
                        color: '#bfdbfe',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                    }}
                >
                    <ArrowDownAZ style={{ width: '0.82rem', height: '0.82rem' }} />
                </motion.button>
                <motion.div
                    whileHover={{ scale: 1.03 }}
                    onDragOver={(e) => {
                        if (!draggingSlotId) return;
                        e.preventDefault();
                        setIsBinHovered(true);
                    }}
                    onDragLeave={() => setIsBinHovered(false)}
                    onDrop={(e) => {
                        e.preventDefault();
                        handleDropToBin();
                    }}
                    style={{
                        width: '2rem',
                        height: '2rem',
                        borderRadius: '0.48rem',
                        border: isBinHovered
                            ? '1px solid rgba(248,113,113,0.78)'
                            : '1px solid rgba(248,113,113,0.38)',
                        background: isBinHovered
                            ? 'rgba(220,38,38,0.28)'
                            : 'rgba(220,38,38,0.12)',
                        color: '#fecaca',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.15s ease',
                    }}
                    title="Drag item here to discard"
                >
                    <Trash2 style={{ width: '0.9rem', height: '0.9rem' }} />
                </motion.div>
            </div>

            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: '0.5rem',
                }}
            >
                {Array.from({ length: 8 }, (_, i) => {
                    const slot = inventory.find((s) => s.slot === i);
                    const hasItem = slot?.item;
                    const canEat = hasItem?.kcal && hasItem.kcal > 0;
                    const canEquip = hasItem?.type === 'EQUIPMENT';

                    return (
                        <motion.div
                            key={i}
                            onClick={() => slot && handleSlotClick(slot)}
                            onMouseEnter={() => setHoveredSlot(slot && slot.item ? slot : null)}
                            onMouseLeave={() => setHoveredSlot(null)}
                            draggable={!!hasItem}
                            onDragStartCapture={(e) => {
                                if (!slot?.item) return;
                                setDraggingSlotId(slot.id);
                                e.dataTransfer.effectAllowed = 'move';
                                e.dataTransfer.setData('text/plain', String(slot.id));
                            }}
                            onDragEndCapture={() => {
                                setDraggingSlotId(null);
                                setIsBinHovered(false);
                            }}
                            whileHover={hasItem ? { scale: 1.05 } : {}}
                            whileTap={hasItem ? { scale: 0.95 } : {}}
                            style={{
                                position: 'relative',
                                aspectRatio: '1',
                                borderRadius: '0.6rem',
                                background: hasItem
                                    ? 'rgba(255, 255, 255, 0.06)'
                                    : 'rgba(255, 255, 255, 0.03)',
                                border: hasItem
                                    ? '1px solid rgba(255, 255, 255, 0.14)'
                                    : '1px dashed rgba(255, 255, 255, 0.12)',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: hasItem ? 'grab' : 'default',
                                transition: 'all 0.2s',
                                padding: '0.3rem',
                                overflow: 'hidden',
                                opacity: draggingSlotId === slot?.id ? 0.5 : 1,
                            }}
                        >
                            {hasItem ? (
                                <>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '1.5rem' }}>
                                        {renderItemIcon(hasItem, 24)}
                                    </div>
                                    <span
                                        style={{
                                            fontSize: '0.6rem',
                                            color: slot?.equipment_rarity
                                                ? getEquipmentRarityColor(slot.equipment_rarity)
                                                : 'rgba(255,255,255,0.6)',
                                            marginTop: '0.2rem',
                                            textAlign: 'center',
                                            lineHeight: 1.2,
                                            maxWidth: '100%',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        {slot?.equipment_rarity
                                            ? `${hasItem.name} (${getEquipmentRarityLabel(slot.equipment_rarity)})`
                                            : hasItem.name}
                                    </span>
                                    {/* Quantity badge */}
                                    {slot && slot.quantity > 1 && (
                                        <span
                                            style={{
                                                position: 'absolute',
                                                top: '0.15rem',
                                                right: '0.15rem',
                                                fontSize: '0.55rem',
                                                fontWeight: 700,
                                                background: 'rgba(15, 23, 42, 0.75)',
                                                color: 'white',
                                                borderRadius: '0.25rem',
                                                padding: '0 0.25rem',
                                                lineHeight: '1rem',
                                            }}
                                        >
                                            x{slot.quantity}
                                        </span>
                                    )}
                                    {/* Eat indicator */}
                                    {canEat && (
                                        <div
                                            style={{
                                                position: 'absolute',
                                                bottom: '0.15rem',
                                                right: '0.15rem',
                                            }}
                                        >
                                            <UtensilsCrossed
                                                style={{
                                                    width: '0.6rem',
                                                    height: '0.6rem',
                                                    color: '#34d399',
                                                }}
                                            />
                                        </div>
                                    )}
                                    {canEquip && (
                                        <div
                                            style={{
                                                position: 'absolute',
                                                bottom: '0.12rem',
                                                left: '0.15rem',
                                                fontSize: '0.52rem',
                                                color: '#93c5fd',
                                                fontWeight: 700,
                                            }}
                                        >
                                            EQUIP
                                        </div>
                                    )}
                                </>
                            ) : (
                                <Package
                                    style={{
                                        width: '1rem',
                                        height: '1rem',
                                        color: 'rgba(255,255,255,0.08)',
                                    }}
                                />
                            )}
                        </motion.div>
                    );
                })}
            </div>

            <div
                style={{
                    marginTop: '0.65rem',
                    borderRadius: '0.5rem',
                    border: '1px solid rgba(255,255,255,0.08)',
                    background: 'rgba(255,255,255,0.02)',
                    padding: '0.5rem',
                    minHeight: '4.8rem',
                }}
            >
                {hoveredSlot?.item ? (
                    <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.2rem' }}>
                            {renderItemIcon(hoveredSlot.item, 16)}
                            <span
                                style={{
                                    fontSize: '0.72rem',
                                    fontWeight: 700,
                                    color:
                                        hoveredSlot.equipment_rarity
                                            ? getEquipmentRarityColor(hoveredSlot.equipment_rarity)
                                            : 'rgba(255,255,255,0.9)',
                                }}
                            >
                                {hoveredSlot.equipment_rarity
                                    ? `${hoveredSlot.item.name} (${getEquipmentRarityLabel(hoveredSlot.equipment_rarity)})`
                                    : hoveredSlot.item.name}
                            </span>
                        </div>
                        <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.65)', lineHeight: 1.45 }}>
                            Type: {hoveredSlot.item.type} • Qty: {hoveredSlot.quantity}
                            <br />
                            Buy: {hoveredSlot.item.buy_price ?? '-'} • Sell: {hoveredSlot.item.sell_price ?? '-'}
                            {hoveredSlot.item.kcal ? (
                                <>
                                    <br />
                                    Kcal: +{hoveredSlot.item.kcal}
                                    {hoveredSlot.item.buff_pct
                                        ? ` • Buff: ${Math.round(hoveredSlot.item.buff_pct * 100)}% for ${hoveredSlot.item.buff_mins ?? 0}m`
                                        : ''}
                                </>
                            ) : null}
                            {hoveredSlot.item.type === 'EQUIPMENT' ? (
                                <>
                                    <br />
                                    Role: {hoveredSlot.item.equipment_role ?? '-'} • Slot: {hoveredSlot.item.equipment_slot ?? '-'}
                                    <br />
                                    Rarity: {getEquipmentRarityLabel(hoveredSlot.equipment_rarity)}
                                    {formatEquipmentEffect(hoveredSlot) ? (
                                        <>
                                            <br />
                                            Effect: {formatEquipmentEffect(hoveredSlot)}
                                        </>
                                    ) : null}
                                </>
                            ) : hoveredSlot.equipment_rarity ? (
                                <>
                                    <br />
                                    Tier: {getEquipmentRarityLabel(hoveredSlot.equipment_rarity)}
                                </>
                            ) : null}
                        </div>
                    </>
                ) : (
                    <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.45)' }}>
                        Hover an item to view details.
                    </div>
                )}
            </div>

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
                            zIndex: 140,
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
        </>
    );
};

export default InventoryGrid;
