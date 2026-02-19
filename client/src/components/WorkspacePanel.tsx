import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '../stores/gameStore';
import { useAuthStore } from '../stores/authStore';
import { Sprout, UtensilsCrossed, Pickaxe } from 'lucide-react';
import { renderItemIcon } from '../lib/itemVisual';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { getEquipmentRarityColor, getEquipmentRarityLabel, type EquipmentRarity } from '../lib/equipmentRarity';
import type { IngredientSelection, WorkspaceActionResult } from '../stores/gameStore';
import { useNavigate } from 'react-router-dom';

type CookMixRule = {
    key: `${EquipmentRarity}+${EquipmentRarity}`;
    outcomes: Array<{ rarity: EquipmentRarity; chance: number }>;
};

const COOK_MIX_RULES: CookMixRule[] = [
    { key: 'NORMAL+NORMAL', outcomes: [{ rarity: 'NORMAL', chance: 1 }] },
    { key: 'NORMAL+RARE', outcomes: [{ rarity: 'NORMAL', chance: 0.7 }, { rarity: 'RARE', chance: 0.3 }] },
    { key: 'NORMAL+EPIC', outcomes: [{ rarity: 'NORMAL', chance: 0.8 }, { rarity: 'RARE', chance: 0.2 }] },
    { key: 'NORMAL+LEGENDARY', outcomes: [{ rarity: 'NORMAL', chance: 0.9 }, { rarity: 'RARE', chance: 0.1 }] },
    { key: 'RARE+RARE', outcomes: [{ rarity: 'RARE', chance: 0.5 }, { rarity: 'NORMAL', chance: 0.5 }] },
    { key: 'RARE+EPIC', outcomes: [{ rarity: 'NORMAL', chance: 0.35 }, { rarity: 'RARE', chance: 0.55 }, { rarity: 'EPIC', chance: 0.1 }] },
    { key: 'RARE+LEGENDARY', outcomes: [{ rarity: 'NORMAL', chance: 0.35 }, { rarity: 'RARE', chance: 0.6 }, { rarity: 'EPIC', chance: 0.05 }] },
    { key: 'EPIC+EPIC', outcomes: [{ rarity: 'NORMAL', chance: 0.25 }, { rarity: 'RARE', chance: 0.35 }, { rarity: 'EPIC', chance: 0.4 }] },
    { key: 'EPIC+LEGENDARY', outcomes: [{ rarity: 'NORMAL', chance: 0.2 }, { rarity: 'RARE', chance: 0.35 }, { rarity: 'EPIC', chance: 0.45 }] },
    { key: 'LEGENDARY+LEGENDARY', outcomes: [{ rarity: 'NORMAL', chance: 0.1 }, { rarity: 'RARE', chance: 0.2 }, { rarity: 'EPIC', chance: 0.35 }, { rarity: 'LEGENDARY', chance: 0.35 }] },
];

const rarityRank: Record<EquipmentRarity, number> = {
    NORMAL: 0,
    RARE: 1,
    EPIC: 2,
    LEGENDARY: 3,
};

const sortPair = (a: EquipmentRarity, b: EquipmentRarity): `${EquipmentRarity}+${EquipmentRarity}` => {
    return rarityRank[a] <= rarityRank[b] ? `${a}+${b}` : `${b}+${a}`;
};

const getCookMixOutcomes = (a: EquipmentRarity, b: EquipmentRarity) => {
    const key = sortPair(a, b);
    const rule = COOK_MIX_RULES.find((r) => r.key === key);
    const outcomes = rule?.outcomes ?? [{ rarity: 'NORMAL' as EquipmentRarity, chance: 1 }];
    const total = outcomes.reduce((sum, o) => sum + Math.max(0, o.chance), 0) || 1;
    return outcomes.map((o) => ({
        rarity: o.rarity,
        chancePct: (Math.max(0, o.chance) / total) * 100,
    }));
};

const WorkspacePanel = () => {
    const navigate = useNavigate();
    const { inventory, recipes, recipeShop, startFarm, startMine, startCook, ferrumMiningConfig } = useGameStore();
    const user = useAuthStore((s) => s.user);
    const firstJobWorkspaceMode = user?.city?.workspace_modes?.first_job ?? 'FARM';
    const secondaryJobWorkspaceMode = user?.city?.workspace_modes?.secondary_job ?? 'COOK';
    const isSecondarySmeltMode = secondaryJobWorkspaceMode === 'SMELT';
    const isMiningMode = firstJobWorkspaceMode === 'MINE';
    const firstJobLabel = user?.city?.occupation_labels?.first_job ?? 'First Job';
    const secondaryJobLabel = user?.city?.occupation_labels?.secondary_job ?? 'Secondary Job';

    const canFarm = (user?.first_job_level ?? 0) > 0;
    const canCook = (user?.secondary_job_level ?? 0) > 0;
    const [selectedRecipeId, setSelectedRecipeId] = useState<number | null>(null);
    const [selectedQtyBySlot, setSelectedQtyBySlot] = useState<Record<number, number>>({});
    const [requirementModal, setRequirementModal] = useState<{
        open: boolean;
        title: string;
        description: string;
    }>({
        open: false,
        title: '',
        description: '',
    });

    // Seeds in inventory (for first job farming/mining)
    const seedSlots = inventory.filter((s) => s.item?.type === 'SEED');
    const visibleRecipes = recipes;
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
    const predictedPairLabel = `${getEquipmentRarityLabel(pairA)} + ${getEquipmentRarityLabel(pairB)}`;

    const openCookPicker = (recipeId: number) => {
        setSelectedRecipeId(recipeId);
        setSelectedQtyBySlot({});
    };

    const closeCookPicker = () => {
        setSelectedRecipeId(null);
        setSelectedQtyBySlot({});
    };

    const openRequirementModalFromResult = (result: WorkspaceActionResult) => {
        if (result.ok) return;
        const requirement = result.requirement;
        if (!requirement?.requiredItemName) {
            setRequirementModal({
                open: true,
                title: isSecondarySmeltMode ? 'ไม่สามารถเริ่มหลอมได้' : 'ไม่สามารถเริ่มงานได้',
                description: result.error ?? 'เกิดข้อผิดพลาดในการเริ่มงาน',
            });
            return;
        }

        const howTo = requirement.mustBeEquipped
            ? `กรุณาสวมใส่ ${requirement.requiredItemName} ก่อนเริ่มงานนี้`
            : `กรุณามี ${requirement.requiredItemName} ในกระเป๋าก่อนเริ่มงานนี้`;

        setRequirementModal({
            open: true,
            title: 'ไม่สามารถเริ่มงานได้',
            description: `${result.error ?? 'เงื่อนไขไม่ผ่าน'}\n\n${howTo}\nสามารถซื้อได้ที่ NPC Shop`,
        });
    };

    const handleStartMine = async (layer: 'SURFACE' | 'DEEP' | 'CORE') => {
        const result = await startMine(layer);
        openRequirementModalFromResult(result);
    };

    const handleStartFarm = async (itemId: number) => {
        const result = await startFarm(itemId, 1);
        openRequirementModalFromResult(result);
    };

    const submitCookSelection = async () => {
        if (!selectedRecipe) return;
        const selections: IngredientSelection[] = Object.entries(selectedQtyBySlot)
            .map(([slotId, quantity]) => ({ slotId: Number(slotId), quantity: Number(quantity) }))
            .filter((x) => Number.isInteger(x.slotId) && x.slotId > 0 && Number.isInteger(x.quantity) && x.quantity > 0);

        const result = await startCook(selectedRecipe.id, selections);
        if (result.ok) {
            closeCookPicker();
            return;
        }
        openRequirementModalFromResult(result);
    };

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.6rem',
                height: 'auto',
                overflowY: 'auto',
                overflowX: 'hidden',
                boxSizing: 'border-box',
                borderRadius: '0.75rem',
            }}
        >
            <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                    overflow: 'hidden',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '0.5rem',
                    background: 'rgba(255,255,255,0.02)',
                    padding: '0.55rem',
                }}
            >
                {!canFarm && !canCook && (
                    <p style={{
                        fontSize: '0.75rem',
                        color: 'rgba(255,255,255,0.35)',
                        textAlign: 'center',
                        padding: '1rem 0',
                    }}>
                        No workspace actions available yet.
                    </p>
                )}

                {canFarm && (
                    <>
                        {isMiningMode ? (
                            <>
                                <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center' }}>
                                    <Pickaxe style={{ width: '0.7rem', height: '0.7rem' }} /> {firstJobLabel} Mining Zones
                                </div>
                                {([
                                    { key: 'SURFACE', label: 'Surface Layer', mins: ferrumMiningConfig.layerTimeMins.surface, note: 'Low risk, common ore veins' },
                                    { key: 'DEEP', label: 'Deep Layer', mins: ferrumMiningConfig.layerTimeMins.deep, note: 'Higher steel chance, helmet recommended' },
                                    { key: 'CORE', label: 'Core Layer', mins: ferrumMiningConfig.layerTimeMins.core, note: 'High-value zone, heavy fatigue' },
                                ] as const).map((layer) => (
                                    <motion.button
                                        key={layer.key}
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                        onClick={() => handleStartMine(layer.key)}
                                        style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'flex-start',
                                            justifyContent: 'space-between',
                                            padding: '0.6rem',
                                            borderRadius: '0.5rem',
                                            border: '1px solid rgba(56,189,248,0.28)',
                                            background: 'rgba(15,23,42,0.45)',
                                            color: 'rgba(255,255,255,0.9)',
                                            fontSize: '0.73rem',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            gap: '0.2rem',
                                        }}
                                    >
                                        <span>{layer.label}</span>
                                        <span style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.6)' }}>{layer.note}</span>
                                        <span style={{ fontSize: '0.62rem', color: '#67e8f9' }}>
                                            Time ~{layer.mins}m • Cost {ferrumMiningConfig.hungerCostPerExpedition} hunger
                                        </span>
                                    </motion.button>
                                ))}
                            </>
                        ) : (
                            <>
                                <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                    <Sprout style={{ width: '0.7rem', height: '0.7rem' }} /> Farm your seeds
                                </div>
                                {seedSlots.length === 0 ? (
                                    <p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.35)' }}>
                                        No seeds in inventory.
                                    </p>
                                ) : (
                                    seedSlots.map((slot) => (
                                        <motion.button
                                            key={slot.id}
                                            whileHover={{ scale: 1.02 }}
                                            whileTap={{ scale: 0.98 }}
                                            onClick={() => slot.item && handleStartFarm(slot.item.id)}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                padding: '0.55rem 0.6rem',
                                                borderRadius: '0.5rem',
                                                border: '1px solid rgba(255,255,255,0.12)',
                                                background: 'rgba(255,255,255,0.03)',
                                                color: 'rgba(255,255,255,0.9)',
                                                fontSize: '0.75rem',
                                                fontWeight: 500,
                                                cursor: 'pointer',
                                            }}
                                        >
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                                {renderItemIcon(slot.item, 15)} {slot.item?.name} (x{slot.quantity})
                                            </span>
                                        </motion.button>
                                    ))
                                )}
                            </>
                        )}
                    </>
                )}

                {canCook && (
                    <>
                        <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <UtensilsCrossed style={{ width: '0.7rem', height: '0.7rem' }} /> {isSecondarySmeltMode ? `${secondaryJobLabel} Smelter` : `${secondaryJobLabel} Recipes`}
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
                                        border: '1px solid rgba(255,255,255,0.12)',
                                        background: 'rgba(255,255,255,0.03)',
                                        color: 'rgba(255,255,255,0.8)',
                                        fontSize: '0.7rem',
                                        cursor: 'pointer',
                                        textAlign: 'left',
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
                            <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.42)' }}>
                                Some recipes are locked. Buy recipe scrolls in NPC Shop.
                            </div>
                        )}

                        {visibleRecipes.length === 0 && recipeShop.length === 0 && (
                            <p style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.25)', fontStyle: 'italic' }}>
                                No recipes available.
                            </p>
                        )}
                    </>
                )}
            </motion.div>

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
                                background: 'rgba(2,6,23,0.62)',
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
                                    border: '1px solid rgba(255,255,255,0.14)',
                                    background: 'rgba(15,23,42,0.96)',
                                    padding: '0.85rem',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '0.55rem',
                                }}
                            >
                            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'rgba(255,255,255,0.92)' }}>
                                {isSecondarySmeltMode ? 'เลือกวัตถุดิบสำหรับการหลอม' : 'เลือกวัตถุดิบสำหรับการปรุง'} {selectedRecipe.name}
                            </div>
                            <div style={{ fontSize: '0.64rem', color: 'rgba(255,255,255,0.55)' }}>
                                เลือกจาก inventory slot เพื่อควบคุม rarity ของผลผลิต
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
                                        border: '1px solid rgba(255,255,255,0.12)',
                                        borderRadius: '0.55rem',
                                        background: 'rgba(255,255,255,0.03)',
                                        padding: '0.5rem',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '0.3rem',
                                    }}
                                >
                                    <div style={{ fontSize: '0.66rem', fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>
                                        โอกาสผลลัพธ์ที่คาดการณ์ (Realtime)
                                    </div>
                                    <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.55)' }}>
                                        Base Pair: {predictedPairLabel}
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
                                                {getEquipmentRarityLabel(o.rarity)} {o.chancePct.toFixed(1)}%
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
                                                <div style={{ fontSize: '0.62rem', color: '#fda4af' }}>ไม่มีวัตถุดิบชนิดนี้ใน inventory</div>
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
                                                                background: 'rgba(2,6,23,0.48)',
                                                            }}
                                                        >
                                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                                <span style={{ fontSize: '0.64rem', color: rarity ? getEquipmentRarityColor(rarity) : 'rgba(255,255,255,0.85)' }}>
                                                                    Slot #{slot.slot + 1} {rarity ? `• ${getEquipmentRarityLabel(rarity)}` : '• Normal'}
                                                                </span>
                                                                <span style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.5)' }}>มีอยู่ x{slot.quantity}</span>
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
                                                                    background: 'rgba(15,23,42,0.45)',
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
                                        Cancel
                                    </button>
                                    <button
                                        onClick={submitCookSelection}
                                        disabled={!recipeSelectionValid}
                                        style={{
                                            border: '1px solid rgba(34,197,94,0.4)',
                                            background: recipeSelectionValid ? 'rgba(34,197,94,0.22)' : 'rgba(255,255,255,0.08)',
                                            color: recipeSelectionValid ? '#bbf7d0' : 'rgba(255,255,255,0.55)',
                                            borderRadius: '0.4rem',
                                            fontSize: '0.65rem',
                                            fontWeight: 700,
                                            padding: '0.28rem 0.6rem',
                                            cursor: recipeSelectionValid ? 'pointer' : 'not-allowed',
                                        }}
                                    >
                                        {isSecondarySmeltMode ? 'Start Smelting' : 'Start Cooking'}
                                    </button>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body,
            )}

            {typeof document !== 'undefined' && createPortal(
                <AnimatePresence>
                    {requirementModal.open && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setRequirementModal((prev) => ({ ...prev, open: false }))}
                            style={{
                                position: 'fixed',
                                inset: 0,
                                background: 'rgba(2,6,23,0.62)',
                                zIndex: 10000,
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
                                    maxWidth: '26rem',
                                    borderRadius: '0.75rem',
                                    border: '1px solid rgba(251,191,36,0.35)',
                                    background: 'rgba(15,23,42,0.97)',
                                    padding: '0.9rem',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '0.6rem',
                                }}
                            >
                                <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#fde68a' }}>
                                    {requirementModal.title}
                                </div>
                                <div
                                    style={{
                                        fontSize: '0.72rem',
                                        color: 'rgba(255,255,255,0.85)',
                                        lineHeight: 1.55,
                                        whiteSpace: 'pre-line',
                                    }}
                                >
                                    {requirementModal.description}
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.45rem' }}>
                                    <button
                                        onClick={() => setRequirementModal((prev) => ({ ...prev, open: false }))}
                                        style={{
                                            border: '1px solid rgba(255,255,255,0.16)',
                                            background: 'rgba(255,255,255,0.06)',
                                            color: 'white',
                                            borderRadius: '0.4rem',
                                            fontSize: '0.68rem',
                                            padding: '0.32rem 0.6rem',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        ปิด
                                    </button>
                                    <button
                                        onClick={() => {
                                            setRequirementModal((prev) => ({ ...prev, open: false }));
                                            navigate('/marketplace');
                                        }}
                                        style={{
                                            border: '1px solid rgba(34,197,94,0.45)',
                                            background: 'rgba(34,197,94,0.22)',
                                            color: '#bbf7d0',
                                            borderRadius: '0.4rem',
                                            fontSize: '0.68rem',
                                            fontWeight: 700,
                                            padding: '0.32rem 0.62rem',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        ไปที่ NPC Shop
                                    </button>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body,
            )}
        </div>
    );
};

export default WorkspacePanel;
