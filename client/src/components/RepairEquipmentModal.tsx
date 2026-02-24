import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { getEquipmentImageByName, getImageByName } from '../lib/itemVisual';
import type { RepairCostResult, InventorySlot } from '../stores/gameStore';

interface RepairEquipmentModalProps {
    open: boolean;
    slot: string | number;
    itemName: string;
    itemIcon?: string | null;
    loading: boolean;
    repairing: boolean;
    cost: RepairCostResult | null;
    inventory: InventorySlot[];
    onClose: () => void;
    onRepair: () => void;
}

const RepairEquipmentModal: React.FC<RepairEquipmentModalProps> = ({
    open,
    // slot is unused but kept in props for completeness
    itemName,
    itemIcon,
    loading,
    repairing,
    cost,
    inventory,
    onClose,
    onRepair,
}) => {
    const { t } = useTranslation();

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(2,6,23,0.58)',
                        zIndex: 150,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '1rem',
                    }}
                    onClick={onClose}
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
                            border: '1px solid rgba(251,191,36,0.3)',
                            background: 'rgba(15,23,42,0.96)',
                            padding: '0.9rem',
                        }}
                    >
                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'rgba(255,255,255,0.92)', marginBottom: '0.35rem' }}>
                            🔧 {t('inventory.repair_title', 'Repair Equipment')}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.5rem' }}>
                            {(() => {
                                const imgSrc = getEquipmentImageByName(itemName);
                                if (imgSrc) {
                                    return (
                                        <img
                                            src={imgSrc}
                                            alt={itemName}
                                            style={{ width: '1.2rem', height: '1.2rem', objectFit: 'contain' }}
                                        />
                                    );
                                }
                                if (itemIcon) {
                                    return <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>{itemIcon}</span>;
                                }
                                return null;
                            })()}
                            <span style={{ fontSize: '0.66rem', color: 'rgba(255,255,255,0.7)' }}>
                                {itemName}
                            </span>
                        </div>

                        {loading ? (
                            <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.45)', padding: '0.5rem 0' }}>
                                {t('common.loading', 'Loading...')}
                            </div>
                        ) : cost && cost.ingredients.length > 0 ? (
                            <>
                                <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.55)', marginBottom: '0.35rem' }}>
                                    {t('inventory.repair_desc', 'Materials needed to restore durability to 100/100:')}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginBottom: '0.6rem' }}>
                                    {cost.ingredients.map((ing) => {
                                        const available = inventory
                                            .filter((s) => s.item_id === ing.item_id)
                                            .reduce((sum, s) => sum + s.quantity, 0);
                                        const enough = available >= ing.repair_qty;
                                        return (
                                            <div
                                                key={ing.item_id}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.4rem',
                                                    padding: '0.3rem 0.4rem',
                                                    borderRadius: '0.35rem',
                                                    background: enough ? 'rgba(52,211,153,0.08)' : 'rgba(239,68,68,0.08)',
                                                    border: `1px solid ${enough ? 'rgba(52,211,153,0.2)' : 'rgba(239,68,68,0.2)'}`,
                                                }}
                                            >
                                                {(() => {
                                                    const imgSrc = getImageByName(ing.item_name);
                                                    if (imgSrc) {
                                                        return (
                                                            <img
                                                                src={imgSrc}
                                                                alt={ing.item_name}
                                                                style={{ width: '1rem', height: '1rem', objectFit: 'contain' }}
                                                            />
                                                        );
                                                    }
                                                    return <span style={{ fontSize: '0.85rem' }}>{ing.item_icon}</span>;
                                                })()}
                                                <span style={{ flex: 1, fontSize: '0.62rem', color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>
                                                    {ing.item_name}
                                                </span>
                                                <span style={{
                                                    fontSize: '0.6rem',
                                                    fontWeight: 700,
                                                    color: enough ? '#34d399' : '#ef4444',
                                                }}>
                                                    {ing.repair_qty} {t('common.needed', 'needed')} ({available} {t('common.have', 'have')})
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div style={{
                                    fontSize: '0.58rem',
                                    color: 'rgba(255,255,255,0.5)',
                                    marginBottom: '0.5rem',
                                }}>
                                    {t('inventory.repair_missing', 'Missing durability')}: {cost.missingPct}%
                                </div>
                            </>
                        ) : (
                            <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.45)', padding: '0.5rem 0' }}>
                                {cost?.missingPct === 0
                                    ? t('inventory.repair_full', 'Equipment is already at full durability!')
                                    : t('inventory.repair_no_recipe', 'No crafting recipe found for this equipment.')}
                            </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.45rem' }}>
                            <button
                                onClick={onClose}
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
                                {t('common.cancel')}
                            </button>
                            {cost && cost.ingredients.length > 0 && (() => {
                                const canRepair = cost.ingredients.every((ing) => {
                                    const available = inventory
                                        .filter((s) => s.item_id === ing.item_id)
                                        .reduce((sum, s) => sum + s.quantity, 0);
                                    return available >= ing.repair_qty;
                                });
                                return (
                                    <button
                                        onClick={onRepair}
                                        disabled={!canRepair || repairing}
                                        style={{
                                            border: `1px solid ${canRepair ? 'rgba(251,191,36,0.45)' : 'rgba(255,255,255,0.1)'}`,
                                            background: canRepair ? 'rgba(251,191,36,0.2)' : 'rgba(255,255,255,0.04)',
                                            color: canRepair ? '#fde68a' : 'rgba(255,255,255,0.3)',
                                            borderRadius: '0.4rem',
                                            fontSize: '0.65rem',
                                            fontWeight: 700,
                                            padding: '0.28rem 0.6rem',
                                            cursor: canRepair ? 'pointer' : 'not-allowed',
                                            opacity: repairing ? 0.6 : 1,
                                        }}
                                    >
                                        {repairing ? t('common.loading', 'Loading...') : `🔧 ${t('inventory.repair', 'Repair')}`}
                                    </button>
                                );
                            })()}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default React.memo(RepairEquipmentModal);
