import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, CheckCircle, Sprout, ChefHat } from 'lucide-react';
import { useGameStore } from '../stores/gameStore';
import type { WorkOrder } from '../stores/gameStore';

const ORDERS_COLUMN_HEIGHT = '20rem';

function formatTimeLeft(completesAt: string): string {
    const diff = new Date(completesAt).getTime() - Date.now();
    if (diff <= 0) return 'Ready!';
    const mins = Math.floor(diff / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
}

function getRemainingMs(completesAt: string): number {
    return Math.max(0, new Date(completesAt).getTime() - Date.now());
}

function getProgress(order: WorkOrder): number {
    const start = new Date(order.started_at).getTime();
    const end = new Date(order.completes_at).getTime();
    const now = Date.now();
    if (now >= end) return 100;
    return Math.min(100, ((now - start) / (end - start)) * 100);
}

const ActiveOrdersGrid = () => {
    const { workOrders, collectWork } = useGameStore();
    const [, setTick] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => setTick((t) => t + 1), 1000);
        return () => clearInterval(interval);
    }, []);

    const providerOrders = workOrders
        .filter((o) => o.type === 'FARM')
        .sort((a, b) => getRemainingMs(a.completes_at) - getRemainingMs(b.completes_at));

    const chefOrders = workOrders
        .filter((o) => o.type === 'COOK')
        .sort((a, b) => getRemainingMs(a.completes_at) - getRemainingMs(b.completes_at));

    const renderOrderCard = (order: WorkOrder, accent: 'provider' | 'chef') => {
        const progress = getProgress(order);
        const ready = progress >= 100;

        const color = accent === 'provider' ? '#34d399' : '#fb923c';
        const border = accent === 'provider'
            ? '1px solid rgba(52, 211, 153, 0.22)'
            : '1px solid rgba(251, 146, 60, 0.22)';
        const bg = accent === 'provider'
            ? 'rgba(52, 211, 153, 0.04)'
            : 'rgba(251, 146, 60, 0.04)';

        return (
            <motion.div
                key={order.id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                    background: bg,
                    border,
                    borderRadius: '0.75rem',
                    padding: '0.7rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.45rem',
                }}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                        <span style={{ fontSize: '1rem', lineHeight: 1 }}>{order.item.icon}</span>
                        <div style={{ minWidth: 0 }}>
                            <div
                                style={{
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    color: 'rgba(255,255,255,0.92)',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                }}
                            >
                                {order.item.name}
                            </div>
                            <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.45)' }}>
                                x{order.quantity}
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        {ready ? (
                            <CheckCircle style={{ width: '0.8rem', height: '0.8rem', color: '#34d399' }} />
                        ) : (
                            <Clock style={{ width: '0.8rem', height: '0.8rem', color }} />
                        )}
                        <span style={{ fontSize: '0.62rem', fontWeight: 600, color: ready ? '#34d399' : color }}>
                            {formatTimeLeft(order.completes_at)}
                        </span>
                    </div>
                </div>

                <div
                    style={{
                        height: '0.25rem',
                        borderRadius: '0.25rem',
                        background: 'rgba(255,255,255,0.07)',
                        overflow: 'hidden',
                    }}
                >
                    <div
                        style={{
                            height: '100%',
                            width: `${progress}%`,
                            borderRadius: '0.25rem',
                            background: ready
                                ? 'linear-gradient(90deg, #34d399, #10b981)'
                                : accent === 'provider'
                                    ? 'linear-gradient(90deg, #34d399, #10b981)'
                                    : 'linear-gradient(90deg, #fb923c, #f97316)',
                            transition: 'width 1s linear',
                        }}
                    />
                </div>

                {ready && (
                    <motion.button
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => collectWork(order.id)}
                        style={{
                            padding: '0.35rem 0.65rem',
                            borderRadius: '0.5rem',
                            border: 'none',
                            background: 'linear-gradient(135deg, #34d399, #10b981)',
                            color: 'white',
                            fontSize: '0.68rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                        }}
                    >
                        ✅ Collect
                    </motion.button>
                )}
            </motion.div>
        );
    };

    return (
        <div
            style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: '0.9rem',
            }}
        >
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    border: '1px solid rgba(52, 211, 153, 0.2)',
                    borderRadius: '0.8rem',
                    background: 'rgba(52, 211, 153, 0.02)',
                    height: ORDERS_COLUMN_HEIGHT,
                    minHeight: ORDERS_COLUMN_HEIGHT,
                    overflow: 'hidden',
                }}
            >
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.65rem 0.8rem',
                    borderBottom: '1px solid rgba(52, 211, 153, 0.18)',
                    color: '#34d399',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                }}>
                    <Sprout style={{ width: '0.9rem', height: '0.9rem' }} /> Provider Orders
                </div>
                <div
                    style={{
                        flex: 1,
                        minHeight: 0,
                        padding: '0.65rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.55rem',
                        overflowY: 'auto',
                        overflowX: 'hidden',
                    }}
                >
                    <AnimatePresence>
                        {providerOrders.length === 0 ? (
                            <p style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.35)', textAlign: 'center', padding: '0.8rem 0' }}>
                                No provider orders
                            </p>
                        ) : (
                            providerOrders.map((order) => renderOrderCard(order, 'provider'))
                        )}
                    </AnimatePresence>
                </div>
            </div>

            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    border: '1px solid rgba(251, 146, 60, 0.2)',
                    borderRadius: '0.8rem',
                    background: 'rgba(251, 146, 60, 0.02)',
                    height: ORDERS_COLUMN_HEIGHT,
                    minHeight: ORDERS_COLUMN_HEIGHT,
                    overflow: 'hidden',
                }}
            >
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.65rem 0.8rem',
                    borderBottom: '1px solid rgba(251, 146, 60, 0.18)',
                    color: '#fb923c',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                }}>
                    <ChefHat style={{ width: '0.9rem', height: '0.9rem' }} /> Chef Orders
                </div>
                <div
                    style={{
                        flex: 1,
                        minHeight: 0,
                        padding: '0.65rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.55rem',
                        overflowY: 'auto',
                        overflowX: 'hidden',
                    }}
                >
                    <AnimatePresence>
                        {chefOrders.length === 0 ? (
                            <p style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.35)', textAlign: 'center', padding: '0.8rem 0' }}>
                                No chef orders
                            </p>
                        ) : (
                            chefOrders.map((order) => renderOrderCard(order, 'chef'))
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
};

export default ActiveOrdersGrid;
