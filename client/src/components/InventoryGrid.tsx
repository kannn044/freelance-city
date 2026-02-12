import { motion } from 'framer-motion';
import { useGameStore } from '../stores/gameStore';
import type { InventorySlot } from '../stores/gameStore';
import { UtensilsCrossed, Package } from 'lucide-react';

const InventoryGrid = () => {
    const { inventory, eatItem } = useGameStore();

    const handleSlotClick = (slot: InventorySlot) => {
        if (!slot.item) return;
        if (slot.item.kcal && slot.item.kcal > 0) {
            eatItem(slot.id);
        }
    };

    return (
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

                return (
                    <motion.div
                        key={i}
                        onClick={() => slot && handleSlotClick(slot)}
                        whileHover={hasItem ? { scale: 1.05 } : {}}
                        whileTap={hasItem ? { scale: 0.95 } : {}}
                        style={{
                            position: 'relative',
                            aspectRatio: '1',
                            borderRadius: '0.75rem',
                            background: hasItem
                                ? 'rgba(99, 102, 241, 0.08)'
                                : 'rgba(255, 255, 255, 0.02)',
                            border: hasItem
                                ? '1px solid rgba(99, 102, 241, 0.2)'
                                : '1px dashed rgba(255, 255, 255, 0.08)',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: canEat ? 'pointer' : 'default',
                            transition: 'all 0.2s',
                            padding: '0.25rem',
                            overflow: 'hidden',
                        }}
                    >
                        {hasItem ? (
                            <>
                                <span style={{ fontSize: '1.5rem', lineHeight: 1 }}>
                                    {hasItem.icon}
                                </span>
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
                                            background: 'rgba(99, 102, 241, 0.5)',
                                            color: 'white',
                                            borderRadius: '0.25rem',
                                            padding: '0 0.25rem',
                                            lineHeight: '1.2rem',
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
    );
};

export default InventoryGrid;
