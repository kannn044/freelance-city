import { motion } from 'framer-motion';
import { Cpu } from 'lucide-react';
import { renderItemIcon } from '../../lib/itemVisual';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '../../stores/gameStore';
import { useState } from 'react';
import { RequirementModal, type RequirementModalState } from './RequirementModal';
import type { WorkspaceActionResult } from '../../stores/gameStore';

const TechnicianWorkspace = () => {
    const { t } = useTranslation();
    const { inventory, startFarm } = useGameStore();

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

    const handleStartExtract = async (itemId: number) => {
        // Technically uses startFarm because the backend routes FARM -> EXTRACT for Voltara automatically
        const result = await startFarm(itemId, 1);
        openRequirementModalFromResult(result);
    };

    return (
        <>
            <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <Cpu style={{ width: '0.7rem', height: '0.7rem' }} /> {t('workspace.extract_catalyst', { defaultValue: 'Perform Extraction' })}
            </div>
            {seedSlots.length === 0 ? (
                <p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.35)' }}>
                    {t('workspace.no_extraction_materials', { defaultValue: 'No extraction materials found.' })}
                </p>
            ) : (
                seedSlots.map((slot) => (
                    <motion.button
                        key={slot.id}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => slot.item && handleStartExtract(slot.item.id)}
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

            <RequirementModal modalState={requirementModal} setModalState={setRequirementModal} />
        </>
    );
};

export default TechnicianWorkspace;
