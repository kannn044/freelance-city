import { motion } from 'framer-motion';
import { Pickaxe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '../../stores/gameStore';
import { useAuthStore } from '../../stores/authStore';
import { useState } from 'react';
import { RequirementModal, type RequirementModalState } from './RequirementModal';
import type { WorkspaceActionResult } from '../../stores/gameStore';

const LAYER_PLOT_SIZE = 3;

const resolveLayerFromRecipeId = (recipeId: number | null): 'SURFACE' | 'DEEP' | 'CORE' => {
    if (recipeId === 2) return 'DEEP';
    if (recipeId === 3) return 'CORE';
    return 'SURFACE';
};

const MinerWorkspace = () => {
    const { t } = useTranslation();
    const { startMine, ferrumMiningConfig, workOrders } = useGameStore();
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

    const getLayerOrderCount = (layerKey: 'SURFACE' | 'DEEP' | 'CORE') =>
        workOrders.filter(
            (o) => o.type === 'MINE' && !o.collected && resolveLayerFromRecipeId((o as any).recipe_id ?? null) === layerKey
        ).length;

    return (
        <>
            <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center' }}>
                <Pickaxe style={{ width: '0.7rem', height: '0.7rem', marginRight: '0.3rem' }} /> {t('workspace.mining_zones', { label: firstJobLabel })}
            </div>
            {([
                { key: 'SURFACE', label: t('workspace.mine_layers.SURFACE.label'), mins: ferrumMiningConfig.effectiveLayerTimeMins?.surface ?? ferrumMiningConfig.layerTimeMins.surface, note: t('workspace.mine_layers.SURFACE.note') },
                { key: 'DEEP', label: t('workspace.mine_layers.DEEP.label'), mins: ferrumMiningConfig.effectiveLayerTimeMins?.deep ?? ferrumMiningConfig.layerTimeMins.deep, note: t('workspace.mine_layers.DEEP.note') },
                { key: 'CORE', label: t('workspace.mine_layers.CORE.label'), mins: ferrumMiningConfig.effectiveLayerTimeMins?.core ?? ferrumMiningConfig.layerTimeMins.core, note: t('workspace.mine_layers.CORE.note') },
            ] as const).map((layer) => {
                const layerCount = getLayerOrderCount(layer.key);
                const layerFill = layerCount % LAYER_PLOT_SIZE;
                const layerFillDisplay = layerCount === 0 ? 0 : layerFill === 0 ? LAYER_PLOT_SIZE : layerFill;
                const isLayerFull = layerFillDisplay === LAYER_PLOT_SIZE;
                const layerDepthColor =
                    layer.key === 'CORE' ? 'rgba(239,68,68,0.55)' :
                    layer.key === 'DEEP' ? 'rgba(245,158,11,0.55)' :
                    'rgba(56,189,248,0.55)';
                const layerDepthColorDim =
                    layer.key === 'CORE' ? 'rgba(239,68,68,0.28)' :
                    layer.key === 'DEEP' ? 'rgba(245,158,11,0.28)' :
                    'rgba(56,189,248,0.28)';
                const layerDepthAccent =
                    layer.key === 'CORE' ? '#fca5a5' :
                    layer.key === 'DEEP' ? '#fde68a' :
                    '#67e8f9';
                return (
                <motion.button
                    key={layer.key}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleStartMine(layer.key)}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.6rem',
                        borderRadius: '0.5rem',
                        border: `1px solid ${isLayerFull ? layerDepthColor : layerDepthColorDim}`,
                        background: isLayerFull ? `${layerDepthColorDim.replace('0.28', '0.1')}` : 'rgba(22,13,5,0.45)',
                        color: 'rgba(255,255,255,0.9)',
                        fontSize: '0.73rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        gap: '0.2rem',
                        width: '100%',
                    }}
                >
                    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.15rem' }}>
                        <span>{layer.label}</span>
                        <span style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.6)', fontWeight: 400 }}>{layer.note}</span>
                        <span style={{ fontSize: '0.62rem', color: layerDepthAccent, fontWeight: 400 }}>
                            {t('workspace.mine_time_cost', { mins: layer.mins })}
                        </span>
                    </span>
                    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.18rem' }}>
                        <span style={{ fontSize: '0.65rem', color: layerDepthAccent, fontWeight: 600 }}>
                            {t('workspace.mine', { defaultValue: 'Mine' })}
                        </span>
                        {/* Plot slots */}
                        <span style={{ display: 'flex', gap: '0.18rem', alignItems: 'center' }}>
                            {Array.from({ length: LAYER_PLOT_SIZE }).map((_, i) => (
                                <span
                                    key={i}
                                    style={{
                                        width: '0.55rem',
                                        height: '0.55rem',
                                        borderRadius: '0.12rem',
                                        background: i < layerFillDisplay
                                            ? layerDepthAccent
                                            : 'rgba(255,255,255,0.12)',
                                        border: `1px solid ${i < layerFillDisplay ? layerDepthAccent : 'rgba(255,255,255,0.2)'}`,
                                        boxShadow: i < layerFillDisplay ? `0 0 5px ${layerDepthAccent}88` : 'none',
                                        transition: 'all 0.3s',
                                    }}
                                />
                            ))}
                        </span>
                        <span style={{ fontSize: '0.58rem', color: isLayerFull ? layerDepthAccent : 'rgba(255,255,255,0.35)', fontWeight: isLayerFull ? 700 : 400 }}>
                            {layerFillDisplay}/{LAYER_PLOT_SIZE} {isLayerFull ? '⚡ -10%' : ''}
                        </span>
                    </span>
                </motion.button>
                );
            })}

            <RequirementModal modalState={requirementModal} setModalState={setRequirementModal} />
        </>
    );
};

export default MinerWorkspace;

