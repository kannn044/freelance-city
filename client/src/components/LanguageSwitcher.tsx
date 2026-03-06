import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';

interface LanguageSwitcherProps {
  compact?: boolean;
}

const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({ compact = false }) => {
  const { i18n } = useTranslation();
  const isEN = i18n.language === 'en';

  const toggle = () => {
    i18n.changeLanguage(isEN ? 'th' : 'en');
  };

  return (
    <motion.button
      onClick={toggle}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      title={isEN ? 'Switch to Thai' : 'Switch to English'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.3rem',
        borderRadius: '9999px',
        border: '1px solid rgba(99,102,241,0.35)',
        background: 'rgba(99,102,241,0.1)',
        color: '#c7d2fe',
        fontSize: compact ? '0.72rem' : '0.78rem',
        fontWeight: 700,
        padding: compact ? '0.25rem 0.55rem' : '0.35rem 0.75rem',
        cursor: 'pointer',
        letterSpacing: '0.03em',
        transition: 'background 0.2s',
        userSelect: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ fontSize: compact ? '0.9rem' : '1rem' }}>
        {isEN ? '🇹🇭' : '🇺🇸'}
      </span>
      {!compact && (isEN ? 'TH' : 'EN')}
    </motion.button>
  );
};

export default LanguageSwitcher;
