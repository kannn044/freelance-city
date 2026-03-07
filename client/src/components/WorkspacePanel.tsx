import { motion } from 'framer-motion';
import { useAuthStore } from '../stores/authStore';
import { useTranslation } from 'react-i18next';
import ProviderWorkspace from './workspaces/ProviderWorkspace';
import MinerWorkspace from './workspaces/MinerWorkspace';
import TechnicianWorkspace from './workspaces/TechnicianWorkspace';
import ChefWorkspace from './workspaces/ChefWorkspace';
import BlacksmithWorkspace from './workspaces/BlacksmithWorkspace';
import EngineerWorkspace from './workspaces/EngineerWorkspace';
import WeaverWorkspace from './workspaces/WeaverWorkspace';
import TailorWorkspace from './workspaces/TailorWorkspace';
import ForagerWorkspace from './workspaces/ForagerWorkspace';

const WorkspacePanel = () => {
    const { t } = useTranslation();
    const user = useAuthStore((s) => s.user);
    const firstJobWorkspaceMode = user?.city?.workspace_modes?.first_job ?? 'FARM';
    const secondaryJobWorkspaceMode = user?.city?.workspace_modes?.secondary_job ?? 'COOK';

    const doFirstJob = (user?.first_job_level ?? 0) > 0;
    const doSecondJob = (user?.secondary_job_level ?? 0) > 0;

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
                {!doFirstJob && !doSecondJob && (
                    <p style={{
                        fontSize: '0.75rem',
                        color: 'rgba(255,255,255,0.35)',
                        textAlign: 'center',
                        padding: '1rem 0',
                    }}>
                        {t('workspace.no_actions')}
                    </p>
                )}

                {doFirstJob && (
                    firstJobWorkspaceMode === 'MINE' ? <MinerWorkspace /> :
                        firstJobWorkspaceMode === 'EXTRACT' ? <TechnicianWorkspace /> :
                            firstJobWorkspaceMode === 'GATHER' ? <WeaverWorkspace /> :
                                firstJobWorkspaceMode === 'FORAGE' ? <ForagerWorkspace /> :
                                    <ProviderWorkspace />
                )}

                {doSecondJob && (
                    secondaryJobWorkspaceMode === 'SMELT' ? <BlacksmithWorkspace /> :
                        secondaryJobWorkspaceMode === 'REFINE' ? <EngineerWorkspace /> :
                            secondaryJobWorkspaceMode === 'SEW' ? <TailorWorkspace /> :
                                <ChefWorkspace />
                )}
            </motion.div>
        </div>
    );
};

export default WorkspacePanel;
