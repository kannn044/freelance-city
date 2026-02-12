import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { Mail, Lock, ArrowRight, Gamepad2, Loader2 } from 'lucide-react';

const LoginPage = () => {
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
            useAuthStore.setState({ error: 'Passwords do not match' });
            return;
        }

        try {
            if (isRegister) {
                await register(email, password);
            } else {
                await login(email, password);
            }
            const user = useAuthStore.getState().user;
            if (user?.role === 'NONE') {
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

    return (
        <div className="min-h-screen bg-grid flex items-center justify-center p-6 relative overflow-hidden">
            {/* Animated background orbs */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <motion.div
                    className="absolute w-96 h-96 rounded-full opacity-10"
                    style={{
                        background: 'radial-gradient(circle, #6366f1 0%, transparent 70%)',
                        top: '10%',
                        left: '10%',
                    }}
                    animate={{ x: [0, 50, 0], y: [0, 30, 0] }}
                    transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }}
                />
                <motion.div
                    className="absolute w-80 h-80 rounded-full opacity-10"
                    style={{
                        background: 'radial-gradient(circle, #a78bfa 0%, transparent 70%)',
                        bottom: '10%',
                        right: '10%',
                    }}
                    animate={{ x: [0, -40, 0], y: [0, -20, 0] }}
                    transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
                />
                <motion.div
                    className="absolute w-64 h-64 rounded-full opacity-8"
                    style={{
                        background: 'radial-gradient(circle, #22d3ee 0%, transparent 70%)',
                        top: '50%',
                        right: '30%',
                    }}
                    animate={{ x: [0, 30, 0], y: [0, -40, 0] }}
                    transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
                />
            </div>

            {/* Login Card */}
            <motion.div
                initial={{ opacity: 0, y: 30, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                className="glass-card glow-indigo w-full max-w-md relative z-10"
                style={{ padding: '3rem 2.5rem' }}
            >
                {/* Logo & Title */}
                <motion.div
                    className="text-center"
                    style={{ marginBottom: '2.5rem' }}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2, duration: 0.5 }}
                >
                    <motion.div
                        className="inline-flex items-center justify-center w-16 h-16 rounded-2xl"
                        style={{
                            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                            boxShadow: '0 0 30px rgba(99, 102, 241, 0.3)',
                            marginBottom: '1.25rem',
                        }}
                        whileHover={{ scale: 1.1, rotate: 5 }}
                        transition={{ type: 'spring', stiffness: 300 }}
                    >
                        <Gamepad2 className="w-8 h-8 text-white" />
                    </motion.div>
                    <h1
                        className="text-3xl font-bold bg-clip-text text-transparent"
                        style={{
                            backgroundImage: 'linear-gradient(135deg, #c7d2fe, #e0e7ff, #a5b4fc)',
                        }}
                    >
                        Freelance City
                    </h1>
                    <p className="text-text-secondary text-sm" style={{ marginTop: '0.75rem' }}>
                        Build your empire. Feed the city.
                    </p>
                </motion.div>

                {/* Error Message */}
                <AnimatePresence>
                    {error && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="rounded-lg text-sm font-medium"
                            style={{
                                background: 'rgba(239, 68, 68, 0.1)',
                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                color: '#fca5a5',
                                padding: '0.875rem 1rem',
                                marginBottom: '1.5rem',
                            }}
                        >
                            {error}
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Form */}
                <form onSubmit={handleSubmit}>
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={isRegister ? 'register' : 'login'}
                            initial={{ opacity: 0, x: isRegister ? 20 : -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: isRegister ? -20 : 20 }}
                            transition={{ duration: 0.3 }}
                            style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}
                        >
                            {/* Email */}
                            <div className="relative">
                                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                                <input
                                    id="email-input"
                                    type="email"
                                    placeholder="Email address"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="input-cyber"
                                    style={{ paddingLeft: '2.75rem' }}
                                    required
                                />
                            </div>

                            {/* Password */}
                            <div className="relative">
                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                                <input
                                    id="password-input"
                                    type="password"
                                    placeholder="Password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="input-cyber"
                                    style={{ paddingLeft: '2.75rem' }}
                                    required
                                    minLength={6}
                                />
                            </div>

                            {/* Confirm Password (Register only) */}
                            {isRegister && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="relative"
                                >
                                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                                    <input
                                        id="confirm-password-input"
                                        type="password"
                                        placeholder="Confirm password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        className="input-cyber"
                                        style={{ paddingLeft: '2.75rem' }}
                                        required
                                        minLength={6}
                                    />
                                </motion.div>
                            )}
                        </motion.div>
                    </AnimatePresence>

                    {/* Submit Button */}
                    <motion.button
                        id="submit-btn"
                        type="submit"
                        className="btn-cyber w-full flex items-center justify-center gap-2"
                        style={{ marginTop: '1.75rem' }}
                        disabled={isLoading}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                    >
                        {isLoading ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <>
                                {isRegister ? 'Create Account' : 'Sign In'}
                                <ArrowRight className="w-4 h-4" />
                            </>
                        )}
                    </motion.button>
                </form>

                {/* Toggle Login/Register */}
                <div className="text-center" style={{ marginTop: '2rem' }}>
                    <motion.button
                        id="toggle-mode-btn"
                        onClick={toggleMode}
                        className="text-sm text-text-secondary hover:text-neon-indigo transition-colors"
                        whileHover={{ scale: 1.02 }}
                    >
                        {isRegister
                            ? 'Already have an account? Sign in'
                            : "Don't have an account? Register"}
                    </motion.button>
                </div>

                {/* Decorative bottom line */}
                <div className="flex justify-center" style={{ marginTop: '2rem' }}>
                    <motion.div
                        className="h-1 rounded-full"
                        style={{ background: 'linear-gradient(90deg, #6366f1, #a78bfa, #6366f1)' }}
                        initial={{ width: 0 }}
                        animate={{ width: 80 }}
                        transition={{ delay: 0.5, duration: 0.8, ease: 'easeOut' }}
                    />
                </div>
            </motion.div>
        </div>
    );
};

export default LoginPage;
