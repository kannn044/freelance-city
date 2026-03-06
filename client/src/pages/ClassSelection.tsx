import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { ArrowRight, Loader2, Sparkles, Building2, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const ClassSelection = () => {
    const { t } = useTranslation();
    const [selectedCity, setSelectedCity] = useState<string | null>(null);
    const [isConfirming, setIsConfirming] = useState(false);
    const navigate = useNavigate();
    const { fetchCities, cities, selectCity, isLoading } = useAuthStore();

    useEffect(() => {
        fetchCities();
    }, [fetchCities]);

    const sortedCities = useMemo(
        () => [...cities].sort((a, b) => Number(b.playable) - Number(a.playable)),
        [cities],
    );

    const selected = sortedCities.find((c) => c.key === selectedCity) ?? null;

    const handleSelect = (cityKey: string, playable: boolean) => {
        if (!playable) return;
        setSelectedCity(cityKey);
        setIsConfirming(true);
    };

    const handleConfirm = async () => {
        if (!selectedCity) return;
        try {
            await selectCity(selectedCity);
            navigate('/dashboard');
        } catch {
            // handled in store
        }
    };

    const handleCancel = () => {
        setIsConfirming(false);
        setSelectedCity(null);
    };

    return (
        <div className="min-h-screen bg-grid flex flex-col items-center justify-center relative overflow-hidden" style={{ padding: '2rem' }}>
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <motion.div
                    className="absolute w-[640px] h-[640px] rounded-full opacity-8"
                    style={{ background: 'radial-gradient(circle, #f59e0b 0%, transparent 70%)', top: '10%', left: '-10%' }}
                    animate={{ scale: [1, 1.08, 1], opacity: [0.05, 0.1, 0.05] }}
                    transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
                />
                <motion.div
                    className="absolute w-[640px] h-[640px] rounded-full opacity-8"
                    style={{ background: 'radial-gradient(circle, #fb923c 0%, transparent 70%)', bottom: '10%', right: '-10%' }}
                    animate={{ scale: [1, 1.08, 1], opacity: [0.05, 0.1, 0.05] }}
                    transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
                />
            </div>

            <motion.div className="text-center relative z-10" style={{ marginBottom: '2.5rem' }} initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
                <motion.div className="inline-flex items-center rounded-full text-xs font-semibold" style={{ background: 'rgba(245, 158, 11, 0.13)', border: '1px solid rgba(245, 158, 11, 0.3)', color: '#fbbf24', padding: '0.5rem 1.25rem', marginBottom: '1.25rem', gap: '0.5rem' }}>
                    <Sparkles className="w-3.5 h-3.5" />
                    {t('class_selection.ecosystem_scale_up')}
                </motion.div>
                <h1 className="text-4xl md:text-5xl font-bold bg-clip-text text-transparent" style={{ backgroundImage: 'linear-gradient(135deg, #fef3c7, #fde68a, #f59e0b)', marginBottom: '1rem' }}>
                    {t('class_selection.title')}
                </h1>
                <p className="text-text-secondary text-lg max-w-2xl mx-auto">{t('class_selection.subtitle')}</p>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 relative z-10 w-full" style={{ gap: '1rem', maxWidth: '72rem' }}>
                {sortedCities.map((city, index) => (
                    <motion.button
                        key={city.key}
                        type="button"
                        className="glass-card text-left"
                        style={{ padding: '1.2rem', border: city.playable ? '1px solid rgba(245,158,11,0.45)' : '1px solid rgba(148,163,184,0.25)', opacity: city.playable ? 1 : 0.6, cursor: city.playable ? 'pointer' : 'not-allowed' }}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: city.playable ? 1 : 0.6, y: 0 }}
                        transition={{ delay: index * 0.07 }}
                        whileHover={city.playable ? { y: -3 } : undefined}
                        onClick={() => handleSelect(city.key, city.playable)}
                        disabled={!city.playable}
                    >
                        <div className="flex items-start justify-between" style={{ marginBottom: '0.75rem' }}>
                            <div>
                                <div className="text-xs text-text-muted" style={{ marginBottom: '0.25rem' }}>{city.key}</div>
                                <h3 className="text-lg font-semibold text-text-primary">{city.name}</h3>
                            </div>
                            <span className="text-[11px] px-2 py-1 rounded-full" style={{ background: city.playable ? 'rgba(34,197,94,.15)' : 'rgba(148,163,184,.15)', color: city.playable ? '#4ade80' : '#cbd5e1' }}>
                                {city.playable ? t('class_selection.playable') : t('class_selection.locked')}
                            </span>
                        </div>

                        <div className="text-sm text-text-secondary flex flex-col" style={{ gap: '0.35rem' }}>
                            <div className="flex items-center" style={{ gap: '0.5rem' }}>
                                <Building2 className="w-3.5 h-3.5" /> {t('class_selection.tier')} {city.tier}
                            </div>
                            {city.description && (
                                <div className="text-xs" style={{ color: '#cbd5e1' }}>
                                    {city.description}
                                </div>
                            )}
                            {Array.isArray(city.occupations) && city.occupations.length > 0 && (
                                <div className="text-xs" style={{ color: '#fbbf24' }}>
                                    {t('class_selection.occupations')}: {city.occupations.join(' • ')}
                                </div>
                            )}
                            <div>{t('class_selection.treasury')}: {Number(city.treasury || 0).toLocaleString()}</div>
                            <div className="text-xs">{t('class_selection.taxes')}: {city.taxes.domesticPct}% / {city.taxes.exportPct}% / {city.taxes.importPct}%</div>
                            <div className="text-xs">
                                {t('class_selection.bonuses', {
                                    task: city.bonuses.task_time_reduction_pct.toFixed(1),
                                    shop: city.bonuses.npc_shop_discount_pct.toFixed(1),
                                    market: city.bonuses.market_fee_discount_pct.toFixed(1),
                                    rare: city.bonuses.rare_drop_bonus_pct.toFixed(1)
                                })}
                            </div>
                        </div>

                        {city.playable && (
                            <div className="mt-3 text-sm font-medium flex items-center" style={{ color: '#fbbf24', gap: '0.4rem' }}>
                                {t('class_selection.enter_city')} <ArrowRight className="w-4 h-4" />
                            </div>
                        )}
                    </motion.button>
                ))}
            </div>

            <AnimatePresence>
                {isConfirming && selected && (
                    <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <motion.div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleCancel} />
                        <motion.div className="glass-card max-w-md w-full relative z-10 text-center" initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} transition={{ type: 'spring', duration: 0.5 }} style={{ padding: '2rem 1.75rem' }}>
                            <ShieldCheck className="w-14 h-14 mx-auto" style={{ marginBottom: '1rem', color: '#fbbf24' }} />
                            <h3 className="text-2xl font-bold text-text-primary" style={{ marginBottom: '0.65rem' }}>{t('class_selection.confirm_title')}</h3>
                            <p className="text-text-secondary" style={{ marginBottom: '1.3rem' }}>
                                {t('class_selection.confirm_desc', { name: selected.name })}
                            </p>
                            <div className="text-xs text-text-muted" style={{ marginBottom: '1.4rem' }}>{t('class_selection.confirm_limit')}</div>
                            <div className="flex gap-3">
                                <button onClick={handleCancel} disabled={isLoading} className="btn-secondary flex-1" style={{ padding: '0.7rem 1rem' }}>{t('common.cancel')}</button>
                                <button onClick={handleConfirm} disabled={isLoading} className="btn-primary flex-1 flex items-center justify-center" style={{ padding: '0.7rem 1rem' }}>
                                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : t('class_selection.enter_city')}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default ClassSelection;
