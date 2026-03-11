import type { CSSProperties, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, CheckCircle, X } from 'lucide-react';

export interface ConfirmDetail {
    label: string;
    value: ReactNode;
}

interface ConfirmDialogProps {
    open: boolean;
    title: string;
    description?: string;
    details?: ConfirmDetail[];
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: 'default' | 'danger' | 'warning';
    onConfirm: () => void;
    onCancel: () => void;
}

const ConfirmDialog = ({
    open,
    title,
    description,
    details = [],
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    variant = 'default',
    onConfirm,
    onCancel,
}: ConfirmDialogProps) => {
    const accentColor =
        variant === 'danger' ? '#ef4444' :
        variant === 'warning' ? '#f59e0b' :
        '#38bdf8';

    const confirmBtnStyle: CSSProperties = {
        borderRadius: '0.55rem',
        border: `1px solid ${accentColor}55`,
        background:
            variant === 'danger'
                ? 'linear-gradient(135deg, rgba(180,30,30,0.7), rgba(220,38,38,0.5))'
                : variant === 'warning'
                ? 'linear-gradient(135deg, rgba(180,100,9,0.7), rgba(234,88,12,0.5))'
                : 'linear-gradient(135deg, rgba(14,116,144,0.7), rgba(6,182,212,0.5))',
        color: variant === 'danger' ? '#fecaca' : variant === 'warning' ? '#fef3c7' : '#cffafe',
        padding: '0.45rem 1rem',
        fontSize: '0.78rem',
        fontWeight: 700,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.3rem',
        transition: 'opacity 0.15s',
    };

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    key="confirm-overlay"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onCancel}
                    style={overlayStyle}
                >
                    <motion.div
                        key="confirm-modal"
                        initial={{ opacity: 0, scale: 0.92, y: 16 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.92, y: 16 }}
                        transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                        onClick={(e) => e.stopPropagation()}
                        style={{ ...modalStyle, borderColor: `${accentColor}33` }}
                    >
                        {/* Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.6rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                {variant === 'danger' ? (
                                    <AlertTriangle size={18} color="#ef4444" />
                                ) : variant === 'warning' ? (
                                    <AlertTriangle size={18} color="#f59e0b" />
                                ) : (
                                    <CheckCircle size={18} color="#38bdf8" />
                                )}
                                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: accentColor }}>{title}</h3>
                            </div>
                            <button onClick={onCancel} style={closeBtnStyle}>
                                <X size={15} />
                            </button>
                        </div>

                        {/* Description */}
                        {description && (
                            <p style={{ margin: '0 0 0.6rem', fontSize: '0.72rem', color: '#94a3b8', lineHeight: 1.5 }}>
                                {description}
                            </p>
                        )}

                        {/* Detail rows */}
                        {details.length > 0 && (
                            <div style={detailsBox}>
                                {details.map((d, i) => (
                                    <div key={i} style={detailRow}>
                                        <span style={detailLabel}>{d.label}</span>
                                        <span style={detailValue}>{d.value}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Buttons */}
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.8rem' }}>
                            <button onClick={onCancel} style={cancelBtnStyle}>{cancelLabel}</button>
                            <button onClick={onConfirm} style={confirmBtnStyle}>{confirmLabel}</button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default ConfirmDialog;

// ─── Styles ─────────────────────────────────────────

const overlayStyle: CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(5,2,0,0.82)',
    backdropFilter: 'blur(6px)',
    zIndex: 60,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1rem',
};

const modalStyle: CSSProperties = {
    width: '100%',
    maxWidth: 440,
    borderRadius: '1rem',
    border: '1px solid rgba(56,189,248,0.25)',
    background: 'linear-gradient(135deg, rgba(16,10,4,0.98), rgba(8,5,2,0.98))',
    boxShadow: '0 24px 56px rgba(0,0,0,0.75)',
    padding: '1.1rem 1.2rem',
    fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
};

const closeBtnStyle: CSSProperties = {
    borderRadius: '0.4rem',
    border: '1px solid rgba(148,163,184,0.15)',
    background: 'transparent',
    color: '#64748b',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0.15rem',
};

const detailsBox: CSSProperties = {
    borderRadius: '0.6rem',
    border: '1px solid rgba(148,163,184,0.12)',
    background: 'rgba(0,0,0,0.3)',
    padding: '0.55rem 0.7rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.35rem',
};

const detailRow: CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '0.5rem',
};

const detailLabel: CSSProperties = {
    fontSize: '0.68rem',
    color: '#64748b',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
};

const detailValue: CSSProperties = {
    fontSize: '0.75rem',
    color: '#e2e8f0',
    fontWeight: 700,
    textAlign: 'right',
};

const cancelBtnStyle: CSSProperties = {
    borderRadius: '0.55rem',
    border: '1px solid rgba(148,163,184,0.2)',
    background: 'rgba(30,19,10,0.7)',
    color: '#94a3b8',
    padding: '0.45rem 0.9rem',
    fontSize: '0.78rem',
    fontWeight: 600,
    cursor: 'pointer',
};
