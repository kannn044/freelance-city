import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { Hammer, Key, Scroll, Flame, Loader2, Wrench, Cog, Shield } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from '../components/LanguageSwitcher';

const LoginPage = () => {
    const { t } = useTranslation();
    const [isRegister, setIsRegister] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const navigate = useNavigate();
    const { login, register, isLoading, error, clearError } = useAuthStore();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        clearError();

        if (isRegister && password !== confirmPassword) {
            useAuthStore.setState({ error: t('auth.passwords_do_not_match') });
            return;
        }

        try {
            if (isRegister) {
                await register(email, password);
            } else {
                await login(email, password);
            }
            const user = useAuthStore.getState().user;
            if ((Number(user?.first_job_level ?? 0) < 1) && (Number(user?.secondary_job_level ?? 0) < 1)) {
                navigate('/select-class');
            } else {
                navigate('/dashboard');
            }
        } catch {
            // Error is handled in the store
        }
    };

    const toggleMode = () => {
        setIsRegister(!isRegister);
        clearError();
        setPassword('');
        setConfirmPassword('');
    };

    // Stable ember particles — only generated once
    const embers = useMemo(() =>
        Array.from({ length: 22 }, (_, i) => ({
            id: i,
            left: `${5 + Math.random() * 90}%`,
            delay: `${Math.random() * 10}s`,
            duration: `${7 + Math.random() * 9}s`,
            size: `${2 + Math.random() * 3.5}px`,
            drift: `${-30 + Math.random() * 60}px`,
            hue: Math.random() > 0.5 ? '#fbbf24' : '#f97316',
        })), []);

    return (
        <div className="bg-forge min-h-screen flex items-center justify-center p-6 relative overflow-hidden">
            {/* Language Switcher */}
            <div style={{ position: 'absolute', top: '1.25rem', right: '1.25rem', zIndex: 20 }}>
                <LanguageSwitcher />
            </div>

            {/* Ember particles */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                {embers.map((e) => (
                    <span
                        key={e.id}
                        style={{
                            position: 'absolute',
                            bottom: '-8px',
                            left: e.left,
                            width: e.size,
                            height: e.size,
                            borderRadius: '50%',
                            background: `radial-gradient(circle, ${e.hue} 0%, #92400e 100%)`,
                            filter: 'blur(0.8px)',
                            // @ts-ignore css custom prop
                            '--drift': e.drift,
                            animation: `ember-rise ${e.duration} ${e.delay} infinite ease-in`,
                        } as React.CSSProperties}
                    />
                ))}
                {/* Forge floor glow */}
                <div style={{
                    position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)',
                    width: '70%', height: '220px',
                    background: 'radial-gradient(ellipse at bottom, rgba(234, 88, 12, 0.13) 0%, transparent 70%)',
                }} />
            </div>

            {/* ── Forge Card ── */}
            <motion.div
                initial={{ opacity: 0, y: 32, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
                className="forge-card w-full max-w-md relative z-10"
                style={{ padding: '2.75rem 2.5rem' }}
            >
                {/* ── Iron corner brackets ── */}
                {(['tl','tr','bl','br'] as const).map((corner) => (
                    <div key={corner} style={{
                        position: 'absolute',
                        width: 18, height: 18,
                        ...(corner === 'tl' && { top: -1, left: -1, borderTop: '2px solid #f59e0b', borderLeft:  '2px solid #f59e0b' }),
                        ...(corner === 'tr' && { top: -1, right: -1, borderTop: '2px solid #f59e0b', borderRight: '2px solid #f59e0b' }),
                        ...(corner === 'bl' && { bottom: -1, left: -1, borderBottom: '2px solid #f59e0b', borderLeft:  '2px solid #f59e0b' }),
                        ...(corner === 'br' && { bottom: -1, right: -1, borderBottom: '2px solid #f59e0b', borderRight: '2px solid #f59e0b' }),
                    }} />
                ))}

                {/* ── Logo & Title ── */}
                <motion.div
                    className="text-center"
                    style={{ marginBottom: '2.25rem' }}
                    initial={{ opacity: 0, y: -12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2, duration: 0.5 }}
                >
                    <motion.div
                        className="inline-flex items-center justify-center"
                        style={{
                            width: 72, height: 72,
                            background: 'linear-gradient(145deg, #92400e 0%, #1c0900 100%)',
                            border: '2px solid rgba(245, 158, 11, 0.45)',
                            borderRadius: '1rem',
                            marginBottom: '1.25rem',
                            animation: 'forge-pulse 2.8s ease-in-out infinite',
                        }}
                        whileHover={{ scale: 1.1, rotate: -10 }}
                        transition={{ type: 'spring', stiffness: 280 }}
                    >
                        <Hammer className="w-9 h-9" style={{ color: '#fbbf24' }} />
                    </motion.div>

                    <h1
                        className="text-3xl font-bold"
                        style={{
                            background: 'linear-gradient(135deg, #fef3c7 0%, #fbbf24 50%, #f59e0b 100%)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            backgroundClip: 'text',
                            letterSpacing: '0.05em',
                            animation: 'title-flicker 9s ease-in-out infinite',
                        }}
                    >
                        ⚒ Freelance City
                    </h1>
                    <p style={{
                        color: '#a07850',
                        fontSize: '0.75rem',
                        marginTop: '0.5rem',
                        letterSpacing: '0.14em',
                        textTransform: 'uppercase',
                    }}>
                        {isRegister ? '— Forge Your Account —' : '— Enter the Workshop —'}
                    </p>
                </motion.div>

                {/* ── Error ── */}
                <AnimatePresence>
                    {error && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            style={{
                                background: 'rgba(220, 38, 38, 0.1)',
                                border: '1px solid rgba(220, 38, 38, 0.35)',
                                borderRadius: '0.375rem',
                                color: '#fca5a5',
                                padding: '0.75rem 1rem',
                                marginBottom: '1.25rem',
                                fontSize: '0.875rem',
                                fontWeight: 500,
                            }}
                        >
                            {error}
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* ── Form ── */}
                <form onSubmit={handleSubmit}>
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={isRegister ? 'register' : 'login'}
                            initial={{ opacity: 0, x: isRegister ? 20 : -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: isRegister ? -20 : 20 }}
                            transition={{ duration: 0.3 }}
                            style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
                        >
                            {/* Email */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 600, color: '#a07850', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
                                    📜 {t('auth.email_placeholder')}
                                </label>
                                <div className="relative">
                                    <Scroll className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#6b4c30' }} />
                                    <input
                                        id="email-input"
                                        type="email"
                                        placeholder="adventurer@city.forge"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="input-forge"
                                        style={{ paddingLeft: '2.5rem' }}
                                        required
                                    />
                                </div>
                            </div>

                            {/* Password */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 600, color: '#a07850', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
                                    🗝 {t('auth.password_placeholder')}
                                </label>
                                <div className="relative">
                                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#6b4c30' }} />
                                    <input
                                        id="password-input"
                                        type="password"
                                        placeholder="••••••••"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="input-forge"
                                        style={{ paddingLeft: '2.5rem' }}
                                        required
                                        minLength={6}
                                    />
                                </div>
                            </div>

                            {/* Confirm Password */}
                            {isRegister && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                >
                                    <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 600, color: '#a07850', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
                                        🔒 {t('auth.confirm_password_placeholder')}
                                    </label>
                                    <div className="relative">
                                        <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#6b4c30' }} />
                                        <input
                                            id="confirm-password-input"
                                            type="password"
                                            placeholder="••••••••"
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            className="input-forge"
                                            style={{ paddingLeft: '2.5rem' }}
                                            required
                                            minLength={6}
                                        />
                                    </div>
                                </motion.div>
                            )}
                        </motion.div>
                    </AnimatePresence>

                    {/* Submit button */}
                    <motion.button
                        id="submit-btn"
                        type="submit"
                        className="btn-forge w-full flex items-center justify-center gap-2"
                        style={{ marginTop: '1.75rem' }}
                        disabled={isLoading}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.97 }}
                    >
                        {isLoading ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <>
                                <Flame className="w-4 h-4" />
                                {isRegister ? 'Craft Account' : 'Enter Forge'}
                            </>
                        )}
                    </motion.button>
                </form>

                {/* Divider with crafting icons */}
                <div className="flex items-center gap-3" style={{ marginTop: '1.75rem', marginBottom: '1rem' }}>
                    <div style={{ flex: 1, height: '1px', background: 'linear-gradient(to right, transparent, rgba(245,158,11,0.22))' }} />
                    <div className="flex items-center gap-2" style={{ color: '#6b4c30' }}>
                        <Wrench className="w-3.5 h-3.5" />
                        <Cog className="w-3.5 h-3.5" />
                        <Shield className="w-3.5 h-3.5" />
                    </div>
                    <div style={{ flex: 1, height: '1px', background: 'linear-gradient(to left, transparent, rgba(245,158,11,0.22))' }} />
                </div>

                {/* Toggle */}
                <div className="text-center">
                    <motion.button
                        id="toggle-mode-btn"
                        onClick={toggleMode}
                        className="toggle-forge"
                        whileHover={{ scale: 1.03 }}
                    >
                        {isRegister
                            ? '← Already an adventurer? Sign in'
                            : 'New to the city? Register here →'}
                    </motion.button>
                </div>
            </motion.div>
        </div>
    );
};

export default LoginPage;
