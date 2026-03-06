import { motion } from 'framer-motion';
import { Scissors } from 'lucide-react';
import { renderItemIcon } from '../../lib/itemVisual';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '../../stores/gameStore';
import { useState } from 'react';
import { RequirementModal, type RequirementModalState } from './RequirementModal';
import type { WorkspaceActionResult } from '../../stores/gameStore';

const PLOT_SIZE = 6;

const WeaverWorkspace = () => {
    const { t } = useTranslation();
    const { inventory, startFarm, workOrders } = useGameStore();

    const [requirementModal, setRequirementModal] = useState<RequirementModalState>({
        open: false,
        title: '',
        description: '',
    });

    const seedSlots = inventory.filter((s) => s.item?.type === 'SEED');


    const openRequirementModalFromResult = (result: WorkspaceActionResult) => {
        if (result.ok) return;
        const requirement = result.requirement;
        if (!requirement?.requiredItemName) {
            setRequirementModal({
                open: true,
                title: t('workspace.cannot_start_job'),
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

    const handleStartGather = async (itemId: number) => {
        // Backend routes FARM -> GATHER for Textilis automatically based on city
        const result = await startFarm(itemId, 1);
        openRequirementModalFromResult(result);
    };

    return (
        <>
            <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <Scissors style={{ width: '0.7rem', height: '0.7rem' }} />
                {t('workspace.gather_fibers', { defaultValue: 'Gather Fibers' })}
            </div>
            {seedSlots.length === 0 ? (
                <p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.35)' }}>
                    {t('workspace.no_gather_materials', { defaultValue: 'No gathering materials found. Buy Cotton Seed or Sheep Fleece Pouch from the shop.' })}
                </p>
            ) : (
                seedSlots.map((slot) => {
                    const filledSlots = slot.item ? workOrders.filter((o) => (o.type === 'GATHER' || o.type === 'FARM') && o.item_id === slot.item!.id && !o.collected).length : 0;
                    const plotFill = filledSlots % PLOT_SIZE;
                    const plotFillDisplay = filledSlots === 0 ? 0 : plotFill === 0 ? PLOT_SIZE : plotFill;
                    const isPlotFull = plotFillDisplay === PLOT_SIZE;
                    return (
                        <motion.button
                            key={slot.id}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => slot.item && handleStartGather(slot.item.id)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '0.55rem 0.6rem',
                                borderRadius: '0.5rem',
                                border: `1px solid ${isPlotFull ? 'rgba(167,139,250,0.5)' : 'rgba(167,139,250,0.2)'}`,
                                background: isPlotFull ? 'rgba(167,139,250,0.1)' : 'rgba(167,139,250,0.04)',
                                color: 'rgba(255,255,255,0.9)',
                                fontSize: '0.75rem',
                                fontWeight: 500,
                                cursor: 'pointer',
                            }}
                        >
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.1rem' }}>
                                {renderItemIcon(slot.item, 15)} {slot.item?.name} (x{slot.quantity})
                            </span>
                            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.15rem' }}>
                                <span style={{ fontSize: '0.65rem', color: 'rgba(167,139,250,0.7)', fontWeight: 600 }}>
                                    {t('workspace.gather', { defaultValue: 'Gather' })}
                                </span>
                                <span style={{ fontSize: '0.58rem', color: isPlotFull ? '#a78bfa' : 'rgba(255,255,255,0.35)', fontWeight: isPlotFull ? 700 : 400 }}>
                                    {plotFillDisplay}/{PLOT_SIZE} {isPlotFull ? '⚡ -10%' : ''}
                                </span>
                            </span>
                        </motion.button>
                    );
                })
            )}

            <RequirementModal modalState={requirementModal} setModalState={setRequirementModal} />
        </>
    );
};

export default WeaverWorkspace;
