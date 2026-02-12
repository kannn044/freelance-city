import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { Sprout, ChefHat, ArrowRight, Loader2, Sparkles } from 'lucide-react';

type ClassType = 'PROVIDER' | 'CHEF';

interface ClassCard {
    id: ClassType;
    title: string;
    subtitle: string;
    description: string;
    icon: React.ReactNode;
    color: string;
    glowColor: string;
    borderColor: string;
    gradient: string;
    traits: string[];
}

const classes: ClassCard[] = [
    {
        id: 'PROVIDER',
        title: 'The Provider',
        subtitle: 'Supplier Class',
        description: 'Master of resources. You feed the city.',
        icon: <Sprout className="w-12 h-12" />,
        color: 'text-provider-primary',
        glowColor: 'rgba(52, 211, 153, 0.4)',
        borderColor: 'rgba(52, 211, 153, 0.3)',
        gradient: 'linear-gradient(135deg, rgba(52, 211, 153, 0.15), rgba(16, 185, 129, 0.05))',
        traits: ['Farm animals & crops', 'Produce raw materials', 'Supply the economy'],
    },
    {
        id: 'CHEF',
        title: 'The Chef',
        subtitle: 'Crafter Class',
        description: 'Master of flavors. You fuel the workforce.',
        icon: <ChefHat className="w-12 h-12" />,
        color: 'text-chef-primary',
        glowColor: 'rgba(251, 146, 60, 0.4)',
        borderColor: 'rgba(251, 146, 60, 0.3)',
        gradient: 'linear-gradient(135deg, rgba(251, 146, 60, 0.15), rgba(245, 158, 11, 0.05))',
        traits: ['Cook meals & recipes', 'Provide satiety buffs', 'Fuel the workforce'],
    },
];

const ClassSelection = () => {
    const [selectedClass, setSelectedClass] = useState<ClassType | null>(null);
    const [isConfirming, setIsConfirming] = useState(false);
    const navigate = useNavigate();
    const { selectClass, isLoading } = useAuthStore();

    const handleSelect = (classId: ClassType) => {
        setSelectedClass(classId);
        setIsConfirming(true);
    };

    const handleConfirm = async () => {
        if (!selectedClass) return;
        try {
            await selectClass(selectedClass);
            navigate('/dashboard');
        } catch {
            // Error handled in store
        }
    };

    const handleCancel = () => {
        setIsConfirming(false);
        setSelectedClass(null);
    };

    return (
        <div className="min-h-screen bg-grid flex flex-col items-center justify-center relative overflow-hidden" style={{ padding: '2rem' }}>
            {/* Background effects */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <motion.div
                    className="absolute w-[600px] h-[600px] rounded-full opacity-8"
                    style={{
                        background: 'radial-gradient(circle, #34d399 0%, transparent 70%)',
                        top: '20%',
                        left: '-10%',
                    }}
                    animate={{ scale: [1, 1.1, 1], opacity: [0.05, 0.1, 0.05] }}
                    transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
                />
                <motion.div
                    className="absolute w-[600px] h-[600px] rounded-full opacity-8"
                    style={{
                        background: 'radial-gradient(circle, #fb923c 0%, transparent 70%)',
                        bottom: '20%',
                        right: '-10%',
                    }}
                    animate={{ scale: [1, 1.1, 1], opacity: [0.05, 0.1, 0.05] }}
                    transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
                />
            </div>

            {/* Header */}
            <motion.div
                className="text-center relative z-10"
                style={{ marginBottom: '3.5rem' }}
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
            >
                <motion.div
                    className="inline-flex items-center rounded-full text-xs font-semibold"
                    style={{
                        background: 'rgba(99, 102, 241, 0.15)',
                        border: '1px solid rgba(99, 102, 241, 0.3)',
                        color: '#a5b4fc',
                        padding: '0.5rem 1.25rem',
                        marginBottom: '1.25rem',
                        gap: '0.5rem',
                    }}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.3 }}
                >
                    <Sparkles className="w-3.5 h-3.5" />
                    Choose Your Path
                </motion.div>
                <h1
                    className="text-4xl md:text-5xl font-bold bg-clip-text text-transparent"
                    style={{
                        backgroundImage: 'linear-gradient(135deg, #c7d2fe, #e0e7ff, #a5b4fc)',
                        marginBottom: '1rem',
                    }}
                >
                    Select Your Class
                </h1>
                <p className="text-text-secondary text-lg max-w-md mx-auto">
                    Your choice defines your role in the city's economy. Choose wisely — this cannot be undone.
                </p>
            </motion.div>

            {/* Class Cards */}
            <div className="flex flex-col md:flex-row relative z-10 w-full" style={{ gap: '2.5rem', maxWidth: '56rem', padding: '0 1.5rem' }}>
                {classes.map((cls, index) => (
                    <motion.div
                        key={cls.id}
                        id={`class-card-${cls.id.toLowerCase()}`}
                        className="flex-1 cursor-pointer relative group"
                        initial={{ opacity: 0, y: 40 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 + index * 0.15, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                        whileHover={{
                            scale: 1.05,
                            transition: { duration: 0.3, ease: 'easeOut' },
                        }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => handleSelect(cls.id)}
                    >
                        {/* Card */}
                        <motion.div
                            className="glass-card h-full flex flex-col items-center text-center transition-all duration-300"
                            style={{
                                padding: '2.5rem 2rem',
                                background: selectedClass === cls.id ? cls.gradient : undefined,
                                borderColor: selectedClass === cls.id ? cls.borderColor : undefined,
                            }}
                            whileHover={{
                                boxShadow: `0 0 40px ${cls.glowColor}, 0 0 80px ${cls.glowColor.replace('0.4', '0.15')}`,
                                borderColor: cls.borderColor,
                            }}
                        >
                            {/* Icon */}
                            <motion.div
                                className={`${cls.color} rounded-2xl`}
                                style={{
                                    background: cls.gradient,
                                    padding: '1.25rem',
                                    marginBottom: '2rem',
                                }}
                                whileHover={{
                                    rotate: [0, -5, 5, 0],
                                    transition: { duration: 0.5 },
                                }}
                            >
                                {cls.icon}
                            </motion.div>

                            {/* Title */}
                            <h2 className={`text-2xl font-bold ${cls.color}`} style={{ marginBottom: '0.25rem' }}>
                                {cls.title}
                            </h2>
                            <span className="text-xs font-semibold uppercase tracking-wider text-text-muted" style={{ marginBottom: '1.25rem', display: 'block' }}>
                                {cls.subtitle}
                            </span>

                            {/* Description */}
                            <p className="text-text-secondary text-sm leading-relaxed" style={{ marginBottom: '2rem' }}>
                                {cls.description}
                            </p>

                            {/* Traits */}
                            <div className="w-full" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '2rem' }}>
                                {cls.traits.map((trait, i) => (
                                    <motion.div
                                        key={trait}
                                        className="flex items-center text-sm text-text-secondary"
                                        style={{ gap: '0.625rem' }}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: 0.5 + index * 0.15 + i * 0.1 }}
                                    >
                                        <div
                                            className="w-1.5 h-1.5 rounded-full shrink-0"
                                            style={{
                                                backgroundColor: cls.id === 'PROVIDER' ? '#34d399' : '#fb923c',
                                            }}
                                        />
                                        {trait}
                                    </motion.div>
                                ))}
                            </div>

                            {/* Select indicator */}
                            <div
                                className="mt-auto flex items-center text-sm font-medium transition-all duration-300 opacity-50 group-hover:opacity-100"
                                style={{ color: cls.id === 'PROVIDER' ? '#34d399' : '#fb923c', gap: '0.5rem' }}
                            >
                                Select Class
                                <ArrowRight className="w-4 h-4" />
                            </div>
                        </motion.div>
                    </motion.div>
                ))}
            </div>

            {/* Confirmation Modal */}
            <AnimatePresence>
                {isConfirming && selectedClass && (
                    <motion.div
                        className="fixed inset-0 z-50 flex items-center justify-center p-4"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        {/* Backdrop */}
                        <motion.div
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={handleCancel}
                        />

                        {/* Modal */}
                        <motion.div
                            className="glass-card max-w-sm w-full relative z-10 text-center"
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            transition={{ type: 'spring', duration: 0.5 }}
                            style={{
                                padding: '2.5rem 2rem',
                                boxShadow: `0 0 60px ${selectedClass === 'PROVIDER'
                                    ? 'rgba(52, 211, 153, 0.2)'
                                    : 'rgba(251, 146, 60, 0.2)'
                                    }`,
                            }}
                        >
                            <h3 className="text-xl font-bold text-text-primary" style={{ marginBottom: '0.75rem' }}>
                                Confirm Your Choice
                            </h3>
                            <p className="text-text-secondary text-sm" style={{ marginBottom: '2rem' }}>
                                You are about to become{' '}
                                <span
                                    className="font-semibold"
                                    style={{
                                        color: selectedClass === 'PROVIDER' ? '#34d399' : '#fb923c',
                                    }}
                                >
                                    {selectedClass === 'PROVIDER' ? 'The Provider' : 'The Chef'}
                                </span>
                                . This choice is permanent.
                            </p>

                            <div className="flex" style={{ gap: '0.75rem' }}>
                                <motion.button
                                    id="cancel-class-btn"
                                    onClick={handleCancel}
                                    className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium text-text-secondary transition-colors"
                                    style={{
                                        background: 'rgba(255, 255, 255, 0.05)',
                                        border: '1px solid rgba(255, 255, 255, 0.1)',
                                    }}
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                >
                                    Go Back
                                </motion.button>
                                <motion.button
                                    id="confirm-class-btn"
                                    onClick={handleConfirm}
                                    disabled={isLoading}
                                    className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold text-white flex items-center justify-center gap-2"
                                    style={{
                                        background:
                                            selectedClass === 'PROVIDER'
                                                ? 'linear-gradient(135deg, #059669, #10b981)'
                                                : 'linear-gradient(135deg, #ea580c, #f97316)',
                                        boxShadow: `0 0 20px ${selectedClass === 'PROVIDER'
                                            ? 'rgba(52, 211, 153, 0.3)'
                                            : 'rgba(251, 146, 60, 0.3)'
                                            }`,
                                    }}
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                >
                                    {isLoading ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        'Confirm'
                                    )}
                                </motion.button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default ClassSelection;
