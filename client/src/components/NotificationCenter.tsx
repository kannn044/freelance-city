import { useEffect, useState, useRef, type CSSProperties } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { useShipmentStore } from '../stores/shipmentStore';

const NotificationCenter = () => {
    const {
        notifications,
        unreadCount,
        fetchNotifications,
        fetchUnreadCount,
        markNotificationRead,
        markAllNotificationsRead,
    } = useShipmentStore();

    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        fetchUnreadCount();
        const iv = setInterval(fetchUnreadCount, 10000);
        return () => clearInterval(iv);
    }, []);

    useEffect(() => {
        if (open) fetchNotifications();
    }, [open]);

    // Close on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    return (
        <div ref={ref} style={{ position: 'relative' }}>
            <button onClick={() => setOpen(!open)} style={bellBtn}>
                <Bell size={18} />
                {unreadCount > 0 && (
                    <span style={badgeStyle}>{unreadCount > 99 ? '99+' : unreadCount}</span>
                )}
            </button>

            {open && (
                <div style={dropdownStyle}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.8rem', color: '#e2e8f0' }}>Notifications</span>
                        {unreadCount > 0 && (
                            <button onClick={() => markAllNotificationsRead()} style={markAllBtn}>
                                <CheckCheck size={12} /> Mark all read
                            </button>
                        )}
                    </div>
                    <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                        {notifications.length === 0 && (
                            <div style={{ fontSize: '0.72rem', color: '#64748b', textAlign: 'center', padding: '1rem' }}>
                                No notifications
                            </div>
                        )}
                        {notifications.map((n) => (
                            <div
                                key={n.id}
                                onClick={() => { if (!n.is_read) markNotificationRead(n.id); }}
                                style={{
                                    padding: '0.4rem 0.5rem',
                                    borderBottom: '1px solid rgba(148,163,184,0.1)',
                                    background: n.is_read ? 'transparent' : 'rgba(56,189,248,0.06)',
                                    cursor: n.is_read ? 'default' : 'pointer',
                                    borderRadius: '0.3rem',
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.72rem', fontWeight: n.is_read ? 400 : 700, color: n.is_read ? '#94a3b8' : '#e2e8f0' }}>
                                        {n.title}
                                    </span>
                                    {!n.is_read && (
                                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#38bdf8', flexShrink: 0 }} />
                                    )}
                                </div>
                                <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '0.1rem' }}>{n.body}</div>
                                <div style={{ fontSize: '0.58rem', color: '#475569', marginTop: '0.1rem' }}>
                                    {new Date(n.created_at).toLocaleString()}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default NotificationCenter;

// ─── Styles ─────────────────────────────────────────

const bellBtn: CSSProperties = {
    background: 'none',
    border: 'none',
    color: '#94a3b8',
    cursor: 'pointer',
    position: 'relative',
    padding: '0.3rem',
    display: 'flex',
    alignItems: 'center',
};

const badgeStyle: CSSProperties = {
    position: 'absolute',
    top: -2,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: '50%',
    background: '#ef4444',
    color: '#fff',
    fontSize: '0.55rem',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 3px',
};

const dropdownStyle: CSSProperties = {
    position: 'absolute',
    top: '100%',
    right: 0,
    width: 320,
    maxHeight: 400,
    borderRadius: '0.85rem',
    border: '1px solid rgba(148,163,184,0.2)',
    background: 'linear-gradient(135deg, rgba(22,13,5,0.97), rgba(10,5,0,0.97))',
    boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
    padding: '0.6rem',
    zIndex: 100,
};

const markAllBtn: CSSProperties = {
    background: 'none',
    border: '1px solid rgba(56,189,248,0.3)',
    borderRadius: '0.4rem',
    color: '#38bdf8',
    fontSize: '0.6rem',
    padding: '0.15rem 0.4rem',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.2rem',
    fontWeight: 600,
};
