import { motion, AnimatePresence } from 'framer-motion';
import { Scissors } from 'lucide-react';
import { renderItemIcon } from '../../lib/itemVisual';
import { useTranslation } from 'react-i18next';
import { useGameStore, type IngredientSelection, type WorkspaceActionResult } from '../../stores/gameStore';
import { useAuthStore } from '../../stores/authStore';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { getEquipmentRarityColor, type EquipmentRarity } from '../../lib/equipmentRarity';
import { getCookMixOutcomes, rarityRank } from '../../lib/cookMix';
import { RequirementModal, type RequirementModalState } from './RequirementModal';

const TailorWorkspace = () => {
    const { t } = useTranslation();
    const { inventory, recipes: visibleRecipes, recipeShop, startCook } = useGameStore();
    const user = useAuthStore((s) => s.user);
    const secondaryJobLabel = user?.city?.occupation_labels?.secondary_job ?? 'Secondary Job';

    const [selectedRecipeId, setSelectedRecipeId] = useState<number | null>(null);
    const [selectedQtyBySlot, setSelectedQtyBySlot] = useState<Record<number, number>>({});
    const [requirementModal, setRequirementModal] = useState<RequirementModalState>({
        open: false,
        title: '',
        description: '',
    });

    const selectedRecipe = visibleRecipes.find((r) => r.id === selectedRecipeId) ?? null;

    const getSelectedQtyForItem = (itemId: number) => {
        return Object.entries(selectedQtyBySlot).reduce((sum, [slotIdRaw, qty]) => {
            if (qty <= 0) return sum;
            const slotId = Number(slotIdRaw);
            const slot = inventory.find((s) => s.id === slotId);
            if (!slot || slot.item_id !== itemId) return sum;
            return sum + qty;
        }, 0);
    };

    const recipeSelectionValid = selectedRecipe
        ? selectedRecipe.ingredients.every((ing) => getSelectedQtyForItem(ing.item_id) === ing.quantity)
        : false;

    const selectedRaritiesExpanded: EquipmentRarity[] = selectedRecipe
        ? Object.entries(selectedQtyBySlot).flatMap(([slotIdRaw, qty]) => {
            const slotId = Number(slotIdRaw);
            const slot = inventory.find((s) => s.id === slotId);
            if (!slot || !slot.item_id || qty <= 0) return [];
            const rarity = (slot.equipment_rarity ?? 'NORMAL') as EquipmentRarity;
            return Array.from({ length: qty }, () => rarity);
        })
        : [];

    const topTwo = [...selectedRaritiesExpanded].sort((a, b) => rarityRank[b] - rarityRank[a]).slice(0, 2);
    const pairA = (topTwo[0] ?? 'NORMAL') as EquipmentRarity;
    const pairB = (topTwo[1] ?? 'NORMAL') as EquipmentRarity;
    const predictedOutcomes = getCookMixOutcomes(pairA, pairB);
    const predictedPairLabel = `${t(`common.rarity_labels.${pairA.toUpperCase()}`)} + ${t(`common.rarity_labels.${pairB.toUpperCase()}`)}`;

    const openCookPicker = (recipeId: number) => {
        setSelectedRecipeId(recipeId);
        setSelectedQtyBySlot({});
    };

    const closeCookPicker = () => {
        setSelectedRecipeId(null);
        setSelectedQtyBySlot({});
    };

    const openRequirementModalFromResult = (result: WorkspaceActionResult) => {
        if (result.ok) {
            closeCookPicker();
            return;
        }
        const requirement = result.requirement;
        if (!requirement?.requiredItemName) {
            setRequirementModal({
                open: true,
                title: t('workspace.cannot_start_sew'),
                description: result.error ?? t('workspace.error_start_job'),
            });
            return;
        }

        const howTo = requirement.mustBeEquipped
            ? t('workspace.must_equip', { name: requirement.requiredItemName })
            : t('workspace.must_have', { name: requirement.requiredItemName });

        setRequirementModal({
            open: true,
            title: t('workspace.cannot_start_job'),
            description: `${result.error ?? t('workspace.condition_failed')}\n\n${howTo}\n${t('workspace.buy_at_npc')}`,
        });
    };

    const submitCookSelection = async () => {
        if (!selectedRecipe) return;
        const selections: IngredientSelection[] = Object.entries(selectedQtyBySlot)
            .map(([slotId, quantity]) => ({ slotId: Number(slotId), quantity: Number(quantity) }))
            .filter((x) => Number.isInteger(x.slotId) && x.slotId > 0 && Number.isInteger(x.quantity) && x.quantity > 0);

        const result = await startCook(selectedRecipe.id, selections);
        openRequirementModalFromResult(result);
    };

    return (
        <>
            <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <Scissors style={{ width: '0.7rem', height: '0.7rem' }} /> {t('workspace.sewing_workshop', { defaultValue: 'Sewing Workshop', label: secondaryJobLabel })}
            </div>

            {visibleRecipes.length > 0 && (
                visibleRecipes.map((recipe) => (
                    <motion.button
                        key={recipe.id}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => openCookPicker(recipe.id)}
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.25rem',
                            padding: '0.55rem 0.6rem',
                            borderRadius: '0.5rem',
                            border: '1px solid rgba(167,139,250,0.18)',
                            background: 'rgba(167,139,250,0.04)',
                            color: 'rgba(255,255,255,0.8)',
                            fontSize: '0.7rem',
                            cursor: 'pointer',
                            textAlign: 'left',
                            marginTop: '0.5rem',
                        }}
                    >
                        <span style={{
                            fontWeight: 600,
                            color: 'rgba(255,255,255,0.92)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                        }}>
                            {renderItemIcon(recipe.output_item, 15)} {recipe.name}
                        </span>
                        <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)' }}>
                            {recipe.ingredients.map((i) => `${i.quantity}x ${i.item.icon}${i.item.name}`).join(' + ')}
                        </span>
                    </motion.button>
                ))
            )}

            {recipeShop.length > 0 && (
                <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.42)', marginTop: '0.5rem' }}>
                    {t('workspace.locked_recipes_desc')}
                </div>
            )}

            {visibleRecipes.length === 0 && recipeShop.length === 0 && (
                <p style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.25)', fontStyle: 'italic', marginTop: '0.5rem' }}>
                    {t('workspace.no_recipes')}
                </p>
            )}

            {typeof document !== 'undefined' && createPortal(
                <AnimatePresence>
                    {selectedRecipe && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={closeCookPicker}
                            style={{
                                position: 'fixed',
                                inset: 0,
                                background: 'rgba(10,5,0,0.62)',
                                zIndex: 9999,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '1rem',
                            }}
                        >
                            <motion.div
                                initial={{ scale: 0.96, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.96, opacity: 0 }}
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                    width: '100%',
                                    maxWidth: '28rem',
                                    maxHeight: 'calc(100vh - 2rem)',
                                    height: 'min(78vh, calc(100vh - 2rem))',
                                    overflow: 'hidden',
                                    borderRadius: '0.75rem',
                                    border: '1px solid rgba(167,139,250,0.2)',
                                    background: 'rgba(22,13,5,0.96)',
                                    padding: '0.85rem',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '0.55rem',
                                }}
                            >
                                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'rgba(255,255,255,0.92)' }}>
                                    {t('workspace.choose_ingredients_sew', { defaultValue: `Sew: ${selectedRecipe.name}`, name: selectedRecipe.name })}
                                </div>
                                <div style={{ fontSize: '0.64rem', color: 'rgba(255,255,255,0.55)' }}>
                                    {t('workspace.rarity_control_desc')}
                                </div>

                                <div
                                    style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '0.55rem',
                                        overflowY: 'auto',
                                        minHeight: 0,
                                        flex: 1,
                                        paddingRight: '0.1rem',
                                    }}
                                >
                                    <div
                                        style={{
                                            border: '1px solid rgba(167,139,250,0.15)',
                                            borderRadius: '0.55rem',
                                            background: 'rgba(167,139,250,0.04)',
                                            padding: '0.5rem',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '0.3rem',
                                        }}
                                    >
                                        <div style={{ fontSize: '0.66rem', fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>
                                            {t('workspace.predicted_outcomes')}
                                        </div>
                                        <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.55)' }}>
                                            {t('workspace.base_pair', { label: predictedPairLabel })}
                                        </div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                                            {predictedOutcomes.map((o) => (
                                                <div
                                                    key={`predict-${o.rarity}`}
                                                    style={{
                                                        borderRadius: '0.35rem',
                                                        border: `1px solid ${getEquipmentRarityColor(o.rarity)}`,
                                                        color: getEquipmentRarityColor(o.rarity),
                                                        padding: '0.18rem 0.38rem',
                                                        fontSize: '0.6rem',
                                                        fontWeight: 700,
                                                    }}
                                                >
                                                    {t(`common.rarity_labels.${o.rarity.toUpperCase()}`)} {o.chancePct.toFixed(1)}%
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {selectedRecipe.ingredients.map((ingredient) => {
                                        const candidates = inventory.filter((s) => s.item_id === ingredient.item_id && s.quantity > 0);
                                        const selectedQty = getSelectedQtyForItem(ingredient.item_id);
                                        const done = selectedQty === ingredient.quantity;

                                        return (
                                            <div
                                                key={`ingredient-${ingredient.item_id}`}
                                                style={{
                                                    border: '1px solid rgba(255,255,255,0.12)',
                                                    borderRadius: '0.55rem',
                                                    background: 'rgba(255,255,255,0.03)',
                                                    padding: '0.5rem',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    gap: '0.4rem',
                                                }}
                                            >
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.7rem', color: 'rgba(255,255,255,0.9)' }}>
                                                        {renderItemIcon(ingredient.item, 14)}
                                                        {ingredient.item.name}
                                                    </div>
                                                    <div style={{ fontSize: '0.62rem', color: done ? '#34d399' : 'rgba(255,255,255,0.6)', fontWeight: 700 }}>
                                                        {selectedQty}/{ingredient.quantity}
                                                    </div>
                                                </div>

                                                {candidates.length === 0 ? (
                                                    <div style={{ fontSize: '0.62rem', color: '#fda4af' }}>{t('workspace.no_ingredient_in_inv')}</div>
                                                ) : (
                                                    candidates.map((slot) => {
                                                        const current = selectedQtyBySlot[slot.id] ?? 0;
                                                        const rarity = slot.equipment_rarity;
                                                        return (
                                                            <div
                                                                key={`slot-pick-${slot.id}`}
                                                                style={{
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'space-between',
                                                                    gap: '0.45rem',
                                                                    padding: '0.35rem 0.45rem',
                                                                    borderRadius: '0.42rem',
                                                                    border: '1px solid rgba(255,255,255,0.1)',
                                                                    background: 'rgba(10,5,0,0.48)',
                                                                }}
                                                            >
                                                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                                    <span style={{ fontSize: '0.64rem', color: rarity ? getEquipmentRarityColor(rarity) : 'rgba(255,255,255,0.85)' }}>
                                                                        Slot #{slot.slot + 1} {rarity ? `• ${t(`common.rarity_labels.${rarity.toUpperCase()}`)}` : `• ${t('workspace.normal')}`}
                                                                    </span>
                                                                    <span style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.5)' }}>{t('workspace.in_stock', { qty: slot.quantity })}</span>
                                                                </div>

                                                                <input
                                                                    type="number"
                                                                    min={0}
                                                                    max={slot.quantity}
                                                                    value={current}
                                                                    onChange={(e) => {
                                                                        const next = Math.min(slot.quantity, Math.max(0, Math.floor(Number(e.target.value) || 0)));
                                                                        setSelectedQtyBySlot((prev) => ({ ...prev, [slot.id]: next }));
                                                                    }}
                                                                    style={{
                                                                        width: '4rem',
                                                                        padding: '0.22rem 0.3rem',
                                                                        borderRadius: '0.35rem',
                                                                        border: '1px solid rgba(255,255,255,0.14)',
                                                                        background: 'rgba(22,13,5,0.45)',
                                                                        color: 'white',
                                                                        fontSize: '0.62rem',
                                                                    }}
                                                                />
                                                            </div>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.45rem', marginTop: '0.2rem', flexShrink: 0 }}>
                                    <button
                                        onClick={closeCookPicker}
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
                                    <button
                                        onClick={submitCookSelection}
                                        disabled={!recipeSelectionValid}
                                        style={{
                                            border: recipeSelectionValid ? '1px solid rgba(167,139,250,0.5)' : '1px solid rgba(255,255,255,0.12)',
                                            background: recipeSelectionValid ? 'rgba(167,139,250,0.22)' : 'rgba(255,255,255,0.08)',
                                            color: recipeSelectionValid ? '#e9d5ff' : 'rgba(255,255,255,0.55)',
                                            borderRadius: '0.4rem',
                                            fontSize: '0.65rem',
                                            fontWeight: 700,
                                            padding: '0.28rem 0.6rem',
                                            cursor: recipeSelectionValid ? 'pointer' : 'not-allowed',
                                        }}
                                    >
                                        {t('workspace.start_sewing', { defaultValue: 'Start Sewing' })}
                                    </button>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body,
            )}

            <RequirementModal modalState={requirementModal} setModalState={setRequirementModal} />
        </>
    );
};

export default TailorWorkspace;
