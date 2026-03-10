import { motion } from 'framer-motion';
import { Leaf } from 'lucide-react';
import { renderItemIcon } from '../../lib/itemVisual';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '../../stores/gameStore';
import { useState } from 'react';
import { RequirementModal, type RequirementModalState } from './RequirementModal';
import type { WorkspaceActionResult } from '../../stores/gameStore';

const PLOT_SIZE = 6;

const ForagerWorkspace = () => {
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

    const handleStartForage = async (itemId: number) => {
        const itemOrders = workOrders.filter(
            (o) => o.type === 'FORAGE' && o.item_id === itemId && !o.collected
        );
        if (itemOrders.some(o => new Date(o.completes_at).getTime() <= Date.now())) {
            setRequirementModal({
                open: true,
                title: t('workspace.cannot_start_job'),
                description: t('workspace.collect_first_desc'),
            });
            return;
        }
        const result = await startFarm(itemId, 1);
        openRequirementModalFromResult(result);
    };

    return (
        <>
            <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <Leaf style={{ width: '0.7rem', height: '0.7rem' }} /> {t('workspace.forage_seeds', { defaultValue: 'Forage' })}
            </div>
            {seedSlots.length === 0 ? (
                <p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.35)' }}>
                    {t('workspace.no_seeds')}
                </p>
            ) : (
                seedSlots.map((slot) => {
                    const itemOrders = slot.item ? workOrders.filter((o) => o.type === 'FORAGE' && o.item_id === slot.item!.id && !o.collected) : [];
                    const isReadyBlocked = itemOrders.some(o => new Date(o.completes_at).getTime() <= Date.now());
                    const filledSlots = itemOrders.length;
                    const plotFill = filledSlots % PLOT_SIZE;
                    const plotFillDisplay = filledSlots === 0 ? 0 : plotFill === 0 ? PLOT_SIZE : plotFill;
                    const isPlotFull = plotFillDisplay === PLOT_SIZE;
                    return (
                        <motion.button
                            key={slot.id}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => slot.item && handleStartForage(slot.item.id)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '0.55rem 0.6rem',
                                borderRadius: '0.5rem',
                                border: `1px solid ${isReadyBlocked ? 'rgba(251,191,36,0.55)' : isPlotFull ? 'rgba(134,239,172,0.5)' : 'rgba(255,255,255,0.12)'}`,
                                background: isReadyBlocked ? 'rgba(251,191,36,0.07)' : isPlotFull ? 'rgba(134,239,172,0.07)' : 'rgba(255,255,255,0.03)',
                                color: 'rgba(255,255,255,0.9)',
                                fontSize: '0.75rem',
                                fontWeight: 500,
                                cursor: 'pointer',
                            }}
                        >
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                {renderItemIcon(slot.item, 15)} {slot.item?.name} (x{slot.quantity})
                            </span>
                            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.15rem' }}>
                                <span style={{ fontSize: '0.65rem', color: isReadyBlocked ? '#fbbf24' : 'rgba(134,239,172,0.7)', fontWeight: 600 }}>
                                    {t('workspace.forage', { defaultValue: 'Forage' })}
                                </span>
                                <span style={{ fontSize: '0.58rem', color: isReadyBlocked ? '#fbbf24' : isPlotFull ? '#86efac' : 'rgba(255,255,255,0.35)', fontWeight: isReadyBlocked || isPlotFull ? 700 : 400 }}>
                                    {isReadyBlocked ? t('workspace.collect_first_label') : `${plotFillDisplay}/${PLOT_SIZE}${isPlotFull ? ' ⚡ -10%' : ''}`}
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

export default ForagerWorkspace;
