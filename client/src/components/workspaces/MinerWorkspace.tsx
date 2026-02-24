import { motion } from 'framer-motion';
import { Pickaxe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '../../stores/gameStore';
import { useAuthStore } from '../../stores/authStore';
import { useState } from 'react';
import { RequirementModal, type RequirementModalState } from './RequirementModal';
import type { WorkspaceActionResult } from '../../stores/gameStore';

const MinerWorkspace = () => {
    const { t } = useTranslation();
    const { startMine, ferrumMiningConfig } = useGameStore();
    const user = useAuthStore((s) => s.user);
    const firstJobLabel = user?.city?.occupation_labels?.first_job ?? 'First Job';

    const [requirementModal, setRequirementModal] = useState<RequirementModalState>({
        open: false,
        title: '',
        description: '',
    });

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

    const handleStartMine = async (layer: 'SURFACE' | 'DEEP' | 'CORE') => {
        const result = await startMine(layer);
        openRequirementModalFromResult(result);
    };

    return (
        <>
            <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center' }}>
                <Pickaxe style={{ width: '0.7rem', height: '0.7rem', marginRight: '0.3rem' }} /> {t('workspace.mining_zones', { label: firstJobLabel })}
            </div>
            {([
                { key: 'SURFACE', label: t('workspace.mine_layers.SURFACE.label'), mins: ferrumMiningConfig.effectiveLayerTimeMins?.surface ?? ferrumMiningConfig.layerTimeMins.surface, note: t('workspace.mine_layers.SURFACE.note') },
                { key: 'DEEP', label: t('workspace.mine_layers.DEEP.label'), mins: ferrumMiningConfig.effectiveLayerTimeMins?.deep ?? ferrumMiningConfig.layerTimeMins.deep, note: t('workspace.mine_layers.DEEP.note') },
                { key: 'CORE', label: t('workspace.mine_layers.CORE.label'), mins: ferrumMiningConfig.effectiveLayerTimeMins?.core ?? ferrumMiningConfig.layerTimeMins.core, note: t('workspace.mine_layers.CORE.note') },
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
                        {t('workspace.mine_time_cost', { mins: layer.mins })}
                    </span>
                </motion.button>
            ))}

            <RequirementModal modalState={requirementModal} setModalState={setRequirementModal} />
        </>
    );
};

export default MinerWorkspace;
