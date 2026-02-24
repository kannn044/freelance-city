import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export type RequirementModalState = {
    open: boolean;
    title: string;
    description: string;
};

interface RequirementModalProps {
    modalState: RequirementModalState;
    setModalState: React.Dispatch<React.SetStateAction<RequirementModalState>>;
}

export const RequirementModal: React.FC<RequirementModalProps> = ({ modalState, setModalState }) => {
    const { t } = useTranslation();
    const navigate = useNavigate();

    if (typeof document === 'undefined') return null;

    return createPortal(
        <AnimatePresence>
            {modalState.open && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setModalState((prev) => ({ ...prev, open: false }))}
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
                            {modalState.title}
                        </div>
                        <div
                            style={{
                                fontSize: '0.72rem',
                                color: 'rgba(255,255,255,0.85)',
                                lineHeight: 1.55,
                                whiteSpace: 'pre-line',
                            }}
                        >
                            {modalState.description}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.45rem' }}>
                            <button
                                onClick={() => setModalState((prev) => ({ ...prev, open: false }))}
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
                                {t('workspace.close')}
                            </button>
                            <button
                                onClick={() => {
                                    setModalState((prev) => ({ ...prev, open: false }));
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
                                {t('workspace.go_to_npc')}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body,
    );
};
