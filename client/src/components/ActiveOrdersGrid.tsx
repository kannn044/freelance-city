import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, CheckCircle, Sprout, ChefHat } from 'lucide-react';
import { useGameStore } from '../stores/gameStore';
import type { WorkOrder } from '../stores/gameStore';
import { renderItemIcon } from '../lib/itemVisual';
import { useAuthStore } from '../stores/authStore';

const ORDERS_COLUMN_HEIGHT = '20rem';
const PROVIDER_PLOT_SIZE = 132;
const PROVIDER_CELL_RADIUS = '0.5rem';
const PROVIDER_SEED_PLOTS = [
    {
        name: 'Vegetable Seed',
        label: 'Vegetable Seed Plot',
        accent: '#34d399',
        border: 'rgba(52,211,153,0.45)',
        bg: 'rgba(52,211,153,0.08)',
    },
    {
        name: 'Chicken Egg',
        label: 'Chicken Egg Plot',
        accent: '#facc15',
        border: 'rgba(250,204,21,0.45)',
        bg: 'rgba(250,204,21,0.08)',
    },
    {
        name: 'Beef Calf',
        label: 'Beef Calf Plot',
        accent: '#f87171',
        border: 'rgba(248,113,113,0.45)',
        bg: 'rgba(248,113,113,0.08)',
    },
] as const;

function getProviderBranchSkillLevel(seedName: string, user: ReturnType<typeof useAuthStore.getState>['user']): number {
    if (!user) return 0;
    if (seedName === 'Vegetable Seed') return Number(user.provider_skill_veg ?? 0);
    if (seedName === 'Chicken Egg') return Number(user.provider_skill_chicken ?? 0);
    if (seedName === 'Beef Calf') return Number(user.provider_skill_beef ?? 0);
    return 0;
}

function getUnlockedPlotCountBySkillLevel(level: number): number {
    if (level >= 4) return 3;
    if (level >= 2) return 2;
    return 1;
}

function formatTimeLeft(completesAt: string): string {
    const diff = new Date(completesAt).getTime() - Date.now();
    if (diff <= 0) return 'Ready!';
    const mins = Math.floor(diff / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
}

function isQueuedChefOrder(order: WorkOrder): boolean {
    if (order.type !== 'COOK') return false;
    return Date.now() < new Date(order.started_at).getTime();
}

function getRemainingMs(completesAt: string): number {
    return Math.max(0, new Date(completesAt).getTime() - Date.now());
}

function getProgress(order: WorkOrder): number {
    const start = new Date(order.started_at).getTime();
    const end = new Date(order.completes_at).getTime();
    const now = Date.now();
    if (now >= end) return 100;
    if (now <= start) return 0;
    return Math.max(0, Math.min(100, ((now - start) / (end - start)) * 100));
}

const ActiveOrdersGrid = () => {
    const { workOrders, collectWork, collectReadyWork } = useGameStore();
    const user = useAuthStore((s) => s.user);
    const [, setTick] = useState(0);
    const providerSlotBySeedRef = useRef<Record<string, Map<number, number>>>({});

    const showProviderColumn = (user?.provider_level ?? 0) > 0;
    const showChefColumn = (user?.chef_level ?? 0) > 0;

    useEffect(() => {
        const interval = setInterval(() => setTick((t) => t + 1), 1000);
        return () => clearInterval(interval);
    }, []);

    const providerOrders = workOrders
        .filter((o) => o.type === 'FARM')
        .sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());

    const chefOrders = workOrders
        .filter((o) => o.type === 'COOK')
        .sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());

    const readyCount = workOrders.filter((o) => getRemainingMs(o.completes_at) <= 0).length;
    const providerPlotsByType = PROVIDER_SEED_PLOTS.map((seedType) => {
        const branchSkillLevel = getProviderBranchSkillLevel(seedType.name, user);
        const unlockedPlots = getUnlockedPlotCountBySkillLevel(branchSkillLevel);
        const typeOrders = providerOrders.filter((o) => o.item?.name === seedType.name);
        const slotMap = providerSlotBySeedRef.current[seedType.name] ?? new Map<number, number>();
        providerSlotBySeedRef.current[seedType.name] = slotMap;

        const currentIds = new Set(typeOrders.map((o) => o.id));

        // Clean old collected/removed order ids
        for (const existingId of Array.from(slotMap.keys())) {
            if (!currentIds.has(existingId)) {
                slotMap.delete(existingId);
            }
        }

        const usedIndexes = new Set<number>();
        for (const order of typeOrders) {
            const existingIndex = slotMap.get(order.id);
            if (typeof existingIndex === 'number') {
                usedIndexes.add(existingIndex);
            }
        }

        const findFirstFreeIndex = () => {
            let idx = 0;
            while (usedIndexes.has(idx)) idx += 1;
            return idx;
        };

        // Assign only new orders to the first empty slot; existing orders keep their slot forever
        for (const order of typeOrders) {
            if (slotMap.has(order.id)) continue;
            const freeIndex = findFirstFreeIndex();
            slotMap.set(order.id, freeIndex);
            usedIndexes.add(freeIndex);
        }

        const highestSlotIndex = usedIndexes.size > 0 ? Math.max(...Array.from(usedIndexes)) : -1;
        const plotCount = Math.max(unlockedPlots, Math.max(1, Math.floor(highestSlotIndex / 9) + 1));
        const allSlots = Array.from({ length: plotCount * 9 }, () => null as WorkOrder | null);

        for (const order of typeOrders) {
            const slotIndex = slotMap.get(order.id);
            if (typeof slotIndex === 'number' && slotIndex >= 0 && slotIndex < allSlots.length) {
                allSlots[slotIndex] = order;
            }
        }

        const plots = Array.from({ length: plotCount }, (_, plotIndex) => {
            const start = plotIndex * 9;
            const slots = allSlots.slice(start, start + 9);
            const orders = slots.filter((o): o is WorkOrder => o !== null);
            return {
                index: plotIndex,
                orders,
                slots,
                filled: orders.length,
                full: orders.length === 9,
            };
        });

        return {
            ...seedType,
            branchSkillLevel,
            unlockedPlots,
            ordersCount: typeOrders.length,
            plots,
        };
    });

    const renderOrderCard = (order: WorkOrder, accent: 'provider' | 'chef') => {
        const progress = getProgress(order);
        const ready = progress >= 100;
        const queued = isQueuedChefOrder(order);
        const timeLabel = ready ? 'Ready!' : queued ? 'Queued' : formatTimeLeft(order.completes_at);

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
                        {renderItemIcon(order.item, 16)}
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
                        <span style={{ fontSize: '0.62rem', fontWeight: 600, color: ready ? '#34d399' : queued ? '#facc15' : color }}>
                            {timeLabel}
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

    const renderProviderPlotCell = (
        order: WorkOrder | null,
        index: number,
        palette: { accent: string; border: string; bg: string }
    ) => {
        if (!order) {
            return (
                <div
                    key={`provider-empty-${index}`}
                    style={{
                        width: '100%',
                        aspectRatio: '1 / 1',
                        borderRadius: PROVIDER_CELL_RADIUS,
                        border: `1px solid ${palette.border}`,
                        background: `linear-gradient(145deg, ${palette.bg}, rgba(15,23,42,0.12))`,
                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -8px 18px rgba(0,0,0,0.12)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.6rem',
                        color: 'rgba(255,255,255,0.28)',
                    }}
                >
                    +
                </div>
            );
        }

        const ready = getRemainingMs(order.completes_at) <= 0;
        return (
            <motion.div
                key={`provider-order-${order.id}`}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={() => {
                    if (ready) collectWork(order.id);
                }}
                style={{
                    width: '100%',
                    aspectRatio: '1 / 1',
                    borderRadius: PROVIDER_CELL_RADIUS,
                    border: ready ? `1px solid ${palette.accent}` : `1px solid ${palette.border}`,
                    background: ready
                        ? `linear-gradient(145deg, ${palette.bg}, rgba(255,255,255,0.08))`
                        : `linear-gradient(145deg, ${palette.bg}, rgba(15,23,42,0.12))`,
                    boxShadow: ready
                        ? `0 0 18px ${palette.bg}, inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -10px 18px rgba(0,0,0,0.16)`
                        : 'inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -10px 18px rgba(0,0,0,0.16)',
                    padding: '0.2rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    cursor: ready ? 'pointer' : 'default',
                }}
            >
                {renderItemIcon(order.item, 20)}
                <div
                    style={{
                        position: 'absolute',
                        right: '0.2rem',
                        top: '0.2rem',
                        width: '0.5rem',
                        height: '0.5rem',
                        borderRadius: '9999px',
                        background: ready ? palette.accent : 'rgba(255,255,255,0.2)',
                        boxShadow: ready ? `0 0 10px ${palette.bg}` : 'none',
                    }}
                />
            </motion.div>
        );
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <motion.button
                    whileHover={{ scale: readyCount > 0 ? 1.02 : 1 }}
                    whileTap={{ scale: readyCount > 0 ? 0.98 : 1 }}
                    onClick={() => collectReadyWork()}
                    disabled={readyCount === 0}
                    style={{
                        padding: '0.4rem 0.7rem',
                        borderRadius: '0.45rem',
                        border: '1px solid rgba(52,211,153,0.35)',
                        background: readyCount > 0 ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.04)',
                        color: readyCount > 0 ? '#34d399' : 'rgba(255,255,255,0.45)',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        cursor: readyCount > 0 ? 'pointer' : 'not-allowed',
                    }}
                >
                    ✅ Collect All Ready ({readyCount})
                </motion.button>
            </div>

            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns:
                        showProviderColumn && showChefColumn
                            ? 'repeat(2, minmax(260px, 1fr))'
                            : 'minmax(260px, 1fr)',
                    gap: '0.9rem',
                }}
            >
                {showProviderColumn && (
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
                                gap: '0.45rem',
                                overflowY: 'auto',
                                overflowX: 'hidden',
                            }}
                        >
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {providerPlotsByType.map((seedType) => (
                                    <div key={`seed-type-${seedType.name}`} style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                        <div style={{ fontSize: '0.63rem', fontWeight: 700, color: seedType.accent }}>
                                            {seedType.label} • {seedType.ordersCount} order(s)
                                        </div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.55rem', alignItems: 'flex-start' }}>
                                            {seedType.plots.map((plot) => (
                                                <div
                                                    key={`provider-plot-${seedType.name}-${plot.index}`}
                                                    style={{
                                                        border: plot.full ? `1px solid ${seedType.accent}` : `1px solid ${seedType.border}`,
                                                        background: plot.full ? seedType.bg : 'rgba(255,255,255,0.02)',
                                                        borderRadius: '0.65rem',
                                                        padding: '0.35rem',
                                                        boxShadow: plot.full ? `0 0 12px ${seedType.bg}` : 'none',
                                                        width: 'fit-content',
                                                        overflow: 'visible',
                                                    }}
                                                >
                                                    <div
                                                        style={{
                                                            width: `${PROVIDER_PLOT_SIZE}px`,
                                                            height: `${PROVIDER_PLOT_SIZE}px`,
                                                            display: 'grid',
                                                            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                                                            gridTemplateRows: 'repeat(3, minmax(0, 1fr))',
                                                            gap: '0.24rem',
                                                            boxSizing: 'border-box',
                                                            borderRadius: '0.5rem',
                                                        }}
                                                    >
                                                        {plot.slots.map((order, i) =>
                                                            renderProviderPlotCell(order, plot.index * 9 + i, {
                                                                accent: seedType.accent,
                                                                border: seedType.border,
                                                                bg: seedType.bg,
                                                            })
                                                        )}
                                                    </div>
                                                    <div style={{ marginTop: '0.25rem', fontSize: '0.55rem', color: plot.full ? seedType.accent : 'rgba(255,255,255,0.55)' }}>
                                                        Plot {plot.index + 1}: {plot.filled}/9 {plot.full ? '• Bonus 10%' : ''}
                                                        {plot.orders.length > 0 && (
                                                            <>
                                                                {' • '}
                                                                {`${formatTimeLeft(
                                                                    plot.orders.reduce((soonest, current) =>
                                                                        getRemainingMs(current.completes_at) < getRemainingMs(soonest.completes_at)
                                                                            ? current
                                                                            : soonest
                                                                    ).completes_at
                                                                )}`}
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {showChefColumn && (
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
                )}

                {!showProviderColumn && !showChefColumn && (
                    <div
                        style={{
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '0.8rem',
                            background: 'rgba(255,255,255,0.02)',
                            padding: '1rem',
                            fontSize: '0.75rem',
                            color: 'rgba(255,255,255,0.5)',
                            textAlign: 'center',
                        }}
                    >
                        No active occupation yet.
                    </div>
                )}
            </div>
        </div>
    );
};

export default ActiveOrdersGrid;
