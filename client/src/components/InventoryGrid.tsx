import { useState } from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '../stores/gameStore';
import type { InventorySlot } from '../stores/gameStore';
import { UtensilsCrossed, Package } from 'lucide-react';
import { getEquipmentImageByName, renderItemIcon } from '../lib/itemVisual';

const equipmentSlots = [
    { key: 'HEAD', label: 'Head', icon: '🪖' },
    { key: 'UPPER_BODY', label: 'Upper Body', icon: '👕' },
    { key: 'LOWER_BODY', label: 'Lower Body', icon: '👖' },
    { key: 'ARM', label: 'Arm', icon: '💪' },
    { key: 'GLOVE', label: 'Glove', icon: '🧤' },
    { key: 'SHOE', label: 'Shoe', icon: '👟' },
] as const;

const InventoryGrid = () => {
    const { inventory, equipment, eatItem, equipItem, unequipItem } = useGameStore();
    const occupiedSlots = inventory.filter((s) => s.item && s.quantity > 0).length;
    const [hoveredSlot, setHoveredSlot] = useState<InventorySlot | null>(null);

    const formatEquipmentEffect = (slot: InventorySlot | null) => {
        const item = slot?.item;
        if (!item || item.type !== 'EQUIPMENT') return null;

        if (item.effect_key === 'hunger_penalty_tier_reduction') return `Reduce hunger penalty by ${item.effect_value ?? 0} tier`;
        if (item.effect_key === 'cook_secondary_ingredient_save_chance') return `${Math.round((item.effect_value ?? 0) * 100)}% chance to save secondary ingredients`;
        if (item.effect_key === 'max_hunger_bonus') return `Max Hunger +${item.effect_value ?? 0}`;
        if (item.effect_key === 'max_hunger_and_satiety_bonus') {
            const satietyPct = Math.round((item.effect_value2 ?? 0) * 100);
            return `Max Hunger +${item.effect_value ?? 0}, Satiety Buff +${satietyPct}%`;
        }
        if (item.effect_key === 'raw_stack_bonus') return `Raw stack limit +${item.effect_value ?? 0}`;
        if (item.effect_key === 'ingredient_stack_bonus') return `Ingredient stack limit +${item.effect_value ?? 0}`;
        if (item.effect_key === 'farm_time_reduction_pct') return `Farm time -${Math.round((item.effect_value ?? 0) * 100)}%`;
        if (item.effect_key === 'cook_time_reduction_pct') return `Cook time -${Math.round((item.effect_value ?? 0) * 100)}%`;
        if (item.effect_key === 'farm_double_yield_chance') return `${Math.round((item.effect_value ?? 0) * 100)}% chance for double yield`;
        if (item.effect_key === 'gourmet_chance') return `${Math.round((item.effect_value ?? 0) * 100)}% chance to cook Gourmet quality`;
        if (item.effect_key === 'hunger_decay_reduction_per_min') return `Hunger decay -${item.effect_value ?? 0}/min`;
        if (item.effect_key === 'cook_state_hunger_decay_reduction_pct') return `While cooking: decay -${Math.round((item.effect_value ?? 0) * 100)}%`;

        return null;
    };

    const handleSlotClick = (slot: InventorySlot) => {
        if (!slot.item) return;
        if (slot.item.type === 'EQUIPMENT') {
            equipItem(slot.id);
            return;
        }
        if (slot.item.kcal && slot.item.kcal > 0) {
            eatItem(slot.id);
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

                                return <span style={{ fontSize: '0.95rem', lineHeight: 1 }}>{slot.icon}</span>;
                            })()}
                            <span
                                style={{
                                    fontSize: '0.58rem',
                                    color: 'rgba(255,255,255,0.6)',
                                    textAlign: 'center',
                                    lineHeight: 1.15,
                                }}
                            >
                                {equipment.find((e) => e.slot === slot.key)?.item_name || slot.label}
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
                                cursor: canEat || canEquip ? 'pointer' : 'default',
                                transition: 'all 0.2s',
                                padding: '0.3rem',
                                overflow: 'hidden',
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
                                            color: 'rgba(255,255,255,0.6)',
                                            marginTop: '0.2rem',
                                            textAlign: 'center',
                                            lineHeight: 1.2,
                                            maxWidth: '100%',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        {hasItem.name}
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
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>
                                {hoveredSlot.item.name}
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
                                    {formatEquipmentEffect(hoveredSlot) ? (
                                        <>
                                            <br />
                                            Effect: {formatEquipmentEffect(hoveredSlot)}
                                        </>
                                    ) : null}
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
        </>
    );
};

export default InventoryGrid;
