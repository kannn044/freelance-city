import { useState, useEffect, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    Coins,
    LayoutDashboard,
    LogOut,
    ShoppingCart,
    ClipboardList,
    Package,
    Anchor,
    Map,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from './LanguageSwitcher';
import NotificationCenter from './NotificationCenter';
import iconCityStatusPng from '../assets/items/ui/icon_city_status.png';

interface TopNavBarProps {
    /** Optional slot for page-specific action buttons (e.g. Refresh) */
    rightExtra?: ReactNode;
}

const ROLE_THEME: Record<string, { color: string; bg: string; border: string }> = {
    MAYOR: {
        color: '#fbbf24',
        bg: 'rgba(251, 191, 36, 0.16)',
        border: '1px solid rgba(251, 191, 36, 0.4)',
    },
    CITIZEN: {
        color: '#22d3ee',
        bg: 'rgba(34, 211, 238, 0.14)',
        border: '1px solid rgba(34, 211, 238, 0.35)',
    },
};

type NavItem = {
    path: string;
    labelKey: string;
    icon: ReactNode;
    activeColor: string;
    activeBorder: string;
    activeBg: string;
};

const NAV_ITEMS: NavItem[] = [
    {
        path: '/dashboard',
        labelKey: 'nav.dashboard',
        icon: <LayoutDashboard size={14} />,
        activeColor: '#fbbf24',
        activeBorder: 'rgba(245, 158, 11, 0.55)',
        activeBg: 'rgba(245, 158, 11, 0.14)',
    },
    {
        path: '/marketplace',
        labelKey: 'nav.marketplace',
        icon: <ShoppingCart size={14} />,
        activeColor: '#fbbf24',
        activeBorder: 'rgba(245, 158, 11, 0.55)',
        activeBg: 'rgba(245, 158, 11, 0.14)',
    },
    {
        path: '/quests',
        labelKey: 'nav.quests',
        icon: <ClipboardList size={14} />,
        activeColor: '#fde68a',
        activeBorder: 'rgba(251, 191, 36, 0.55)',
        activeBg: 'rgba(251, 191, 36, 0.14)',
    },
    {
        path: '/cargo',
        labelKey: 'nav.cargo',
        icon: <Package size={14} />,
        activeColor: '#fbbf24',
        activeBorder: 'rgba(245, 158, 11, 0.55)',
        activeBg: 'rgba(245, 158, 11, 0.14)',
    },
    {
        path: '/port',
        labelKey: 'nav.port',
        icon: <Anchor size={14} />,
        activeColor: '#38bdf8',
        activeBorder: 'rgba(56, 189, 248, 0.55)',
        activeBg: 'rgba(56, 189, 248, 0.14)',
    },
    {
        path: '/world-map',
        labelKey: 'nav.worldMap',
        icon: <Map size={14} />,
        activeColor: '#38bdf8',
        activeBorder: 'rgba(56, 189, 248, 0.55)',
        activeBg: 'rgba(56, 189, 248, 0.14)',
    },
];

const TopNavBar: React.FC<TopNavBarProps> = ({ rightExtra }) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();
    const { user, logout } = useAuthStore();
    const [viewportWidth, setViewportWidth] = useState<number>(() =>
        typeof window !== 'undefined' ? window.innerWidth : 1280
    );

    useEffect(() => {
        const onResize = () => setViewportWidth(window.innerWidth);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    if (!user) return null;

    const isMobile = viewportWidth < 768;
    const isTablet = viewportWidth >= 768 && viewportWidth < 1100;
    const isCompact = viewportWidth < 900;
    const currentPath = location.pathname;

    const userRole = String(user.role ?? 'CITIZEN').toUpperCase();
    const roleTheme = ROLE_THEME[userRole] ?? ROLE_THEME.CITIZEN;

    return (
        <header
            style={{
                position: 'sticky',
                top: 0,
                zIndex: 40,
                borderBottom: '1px solid rgba(245, 158, 11, 0.15)',
                background: 'rgba(15, 8, 2, 0.88)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
            }}
        >
            <div
                style={{
                    maxWidth: '1280px',
                    margin: '0 auto',
                    display: 'flex',
                    minHeight: '3.75rem',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: isCompact ? '0.5rem' : '1rem',
                    padding: isMobile ? '0.6rem 0.9rem' : '0 1.5rem',
                    flexWrap: isCompact ? 'wrap' : 'nowrap',
                }}
            >
                {/* ── Logo ───────────────────────────── */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexShrink: 0 }}>
                    <motion.div
                        whileHover={{ scale: 1.1, rotate: 5 }}
                        style={{
                            display: 'flex',
                            height: '2.2rem',
                            width: '2.2rem',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: '0.65rem',
                            background: 'linear-gradient(135deg, rgba(245,158,11,0.18), rgba(234,88,12,0.15))',
                            border: '1px solid rgba(245,158,11,0.3)',
                            boxShadow: '0 0 14px rgba(245,158,11,0.22)',
                            cursor: 'pointer',
                        }}
                        onClick={() => navigate('/dashboard')}
                    >
                        <img
                            src={iconCityStatusPng}
                            alt="Freelance City"
                            style={{ width: '1.1rem', height: '1.1rem', objectFit: 'contain' }}
                        />
                    </motion.div>
                    {!isMobile && (
                        <span
                            style={{
                                fontSize: '1.05rem',
                                fontWeight: 700,
                                letterSpacing: '-0.02em',
                                background: 'linear-gradient(135deg, #fef3c7, #fde68a)',
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                                cursor: 'pointer',
                            }}
                            onClick={() => navigate('/dashboard')}
                        >
                            {t('dashboard.title')}
                        </span>
                    )}
                </div>

                {/* ── Nav Links ──────────────────────── */}
                <nav
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                        flex: isCompact ? '1 1 100%' : '0 0 auto',
                        order: isCompact ? 3 : 0,
                        justifyContent: isCompact ? 'center' : 'flex-start',
                    }}
                >
                    {NAV_ITEMS.map((item) => {
                        const isActive = currentPath === item.path;
                        return (
                            <motion.button
                                key={item.path}
                                whileHover={{ scale: 1.04 }}
                                whileTap={{ scale: 0.96 }}
                                onClick={() => navigate(item.path)}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.4rem',
                                    borderRadius: '0.6rem',
                                    border: `1px solid ${isActive ? item.activeBorder : 'rgba(245,158,11,0.2)'}`,
                                    background: isActive ? item.activeBg : 'transparent',
                                    color: isActive ? item.activeColor : '#94a3b8',
                                    fontSize: isTablet ? '0.7rem' : '0.75rem',
                                    fontWeight: isActive ? 700 : 500,
                                    padding: '0.38rem 0.65rem',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s',
                                    boxShadow: isActive ? `0 0 8px ${item.activeBg}` : 'none',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                {item.icon}
                                {t(item.labelKey)}
                            </motion.button>
                        );
                    })}
                </nav>

                {/* ── Right Section ──────────────────── */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: isMobile ? '0.5rem' : '0.75rem',
                        flexWrap: 'wrap',
                        justifyContent: 'flex-end',
                        flexShrink: 0,
                    }}
                >
                    {/* Page-specific extras (e.g. refresh button) */}
                    {rightExtra}

                    {/* Money pill */}
                    <motion.div
                        whileHover={{ scale: 1.05 }}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            borderRadius: '9999px',
                            background: 'rgba(52, 211, 153, 0.08)',
                            padding: isMobile ? '0.28rem 0.55rem' : '0.32rem 0.85rem',
                            border: '1px solid rgba(52, 211, 153, 0.2)',
                            boxShadow: '0 0 10px rgba(52, 211, 153, 0.08)',
                        }}
                    >
                        <Coins size={13} style={{ color: '#6ee7b7' }} />
                        <span
                            style={{
                                fontFamily: 'monospace',
                                fontWeight: 600,
                                color: '#6ee7b7',
                                fontSize: isMobile ? '0.75rem' : '0.82rem',
                            }}
                        >
                            {(user.money ?? 0).toLocaleString()}
                        </span>
                    </motion.div>

                    {/* Language switcher */}
                    <LanguageSwitcher compact={isMobile} />

                    {/* Notifications */}
                    <NotificationCenter />

                    {/* User info + logout */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                        {!isMobile && (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                <span
                                    style={{
                                        fontSize: '0.82rem',
                                        fontWeight: 600,
                                        color: '#e2e8f0',
                                        letterSpacing: '-0.01em',
                                    }}
                                >
                                    {user.email.split('@')[0]}
                                </span>
                                <span
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.25rem',
                                        fontSize: '0.65rem',
                                    }}
                                >
                                    <span
                                        style={{
                                            display: 'inline-block',
                                            width: '0.45rem',
                                            height: '0.45rem',
                                            borderRadius: '9999px',
                                            background: roleTheme.color,
                                            flexShrink: 0,
                                        }}
                                    />
                                    <span
                                        style={{
                                            color: roleTheme.color,
                                            background: roleTheme.bg,
                                            border: roleTheme.border,
                                            borderRadius: '9999px',
                                            padding: '0.08rem 0.45rem',
                                            fontWeight: 700,
                                            letterSpacing: '0.04em',
                                        }}
                                    >
                                        {userRole}
                                    </span>
                                </span>
                            </div>
                        )}
                        <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => { logout(); navigate('/'); }}
                            title={t('dashboard.logout')}
                            style={{
                                borderRadius: '0.5rem',
                                padding: '0.45rem',
                                color: '#94a3b8',
                                background: 'transparent',
                                border: '1px solid rgba(255,255,255,0.06)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'all 0.2s',
                            }}
                        >
                            <LogOut size={16} />
                        </motion.button>
                    </div>
                </div>
            </div>
        </header>
    );
};

export default TopNavBar;
