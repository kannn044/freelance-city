import { create } from 'zustand';
import api from '../lib/api';
import type { Item } from './gameStore';

// ─── Types ───────────────────────────────────────────

export interface CargoBoxItem {
    id: number;
    item_id: number;
    quantity: number;
    equipment_rarity?: string | null;
    equipment_durability?: number | null;
    enchant_level?: number | null;
    special_stats?: Record<string, string | null>;
    item: Item;
}

export interface CargoBox {
    id: number;
    owner_id: number;
    size: 'S' | 'M' | 'L';
    status: 'EMPTY' | 'PACKING' | 'PACKED' | 'LISTED' | 'SOLD' | 'ON_SHIP' | 'AT_PORT' | 'CLAIMED' | 'PIRATED';
    slot_capacity: number;
    items: CargoBoxItem[];
    created_at: string;
}

export interface PurchaseOrder {
    id: number;
    listing_id: number;
    buyer_id: number;
    seller_id: number;
    cargo_box_id: number;
    price: number;
    locked_amount: number;
    status: string;
    ship_id?: number | null;
    expires_at: string;
    settled_at?: string | null;
    export_tax?: number | null;
    import_tax?: number | null;
    created_at: string;
    cargo_box?: CargoBox;
    listing?: { item?: Item; quantity: number };
}

export interface Ship {
    id: number;
    type: 'PUBLIC' | 'PRIVATE';
    origin_city: string;
    dest_city: string;
    status: 'DOCKED' | 'SAILING' | 'ARRIVED';
    capacity: number;
    departs_at?: string | null;
    departed_at?: string | null;
    arrives_at?: string | null;
    rps_sequence?: string | null;
    cargo: ShipCargo[];
}

export interface ShipCargo {
    id: number;
    ship_id: number;
    order_id: number;
    cargo_box_id: number;
}

export interface PortCargoBox extends CargoBox {
    source_type: 'trade' | 'pirate';
}

export interface Notification {
    id: number;
    type: string;
    title: string;
    body: string;
    is_read: boolean;
    metadata?: string | null;
    created_at: string;
}

export interface WorldMapShip {
    id: number;
    type: string;
    origin_city: string;
    dest_city: string;
    status: string;
    departs_at?: string | null;
    departed_at?: string | null;
    arrives_at?: string | null;
    cargo_count: number;
    rps_slots_filled: number;
    rps_slots_total: number;
    owner_id?: number | null;
}

interface ShipmentState {
    // Cargo
    cargoBoxes: CargoBox[];
    fetchCargoBoxes: () => Promise<void>;
    buyCargoBox: (size: 'S' | 'M' | 'L') => Promise<{ ok: boolean; error?: string }>;
    packCargo: (boxId: number, slotId: number, quantity: number) => Promise<{ ok: boolean; error?: string }>;
    unpackCargo: (boxId: number, boxItemId: number, quantity: number) => Promise<{ ok: boolean; error?: string }>;
    finalizeCargo: (boxId: number) => Promise<{ ok: boolean; error?: string }>;
    discardCargo: (boxId: number) => Promise<{ ok: boolean; error?: string }>;

    // Market / Orders
    orders: PurchaseOrder[];
    sellCargoListing: (boxId: number, price: number) => Promise<{ ok: boolean; error?: string }>;
    buyCargoListing: (listingId: number) => Promise<{ ok: boolean; error?: string }>;
    fetchOrders: () => Promise<void>;
    cancelOrder: (orderId: number) => Promise<{ ok: boolean; error?: string }>;

    // Ships
    publicSchedule: Ship[];
    fetchPublicSchedule: () => Promise<void>;
    loadPublicShip: (orderId: number, shipId: number) => Promise<{ ok: boolean; error?: string }>;
    rentPrivateShip: (size: 'S' | 'M' | 'L', originCity: string, destCity: string, rpsSequence: string[]) => Promise<{ ok: boolean; shipId?: number; error?: string }>;
    loadPrivateShip: (orderId: number, shipId: number) => Promise<{ ok: boolean; error?: string }>;
    dispatchPrivateShip: (shipId: number) => Promise<{ ok: boolean; error?: string }>;

    // World Map
    worldMapShips: WorldMapShip[];
    fetchWorldMapShips: () => Promise<void>;

    // Port
    portBoxes: PortCargoBox[];
    fetchPort: () => Promise<void>;
    claimCargo: (boxId: number) => Promise<{ ok: boolean; error?: string }>;

    // Pirate
    pirateCooldown: { canAttackAt: string | null; onCooldown: boolean };
    launchPirateAttack: (shipId: number, size: 'S' | 'M' | 'L', rpsSequence: string[]) => Promise<{ ok: boolean; result?: string; error?: string }>;
    fetchPirateCooldown: () => Promise<void>;
    pirateHistory: any[];
    fetchPirateHistory: () => Promise<void>;

    // Notifications
    notifications: Notification[];
    unreadCount: number;
    fetchNotifications: () => Promise<void>;
    fetchUnreadCount: () => Promise<void>;
    markNotificationRead: (id: number) => Promise<void>;
    markAllNotificationsRead: () => Promise<void>;

    // Message
    shipmentMessage: string | null;
    setShipmentMessage: (msg: string | null) => void;
}

export const useShipmentStore = create<ShipmentState>((set, get) => ({
    cargoBoxes: [],
    orders: [],
    publicSchedule: [],
    worldMapShips: [],
    portBoxes: [],
    pirateCooldown: { canAttackAt: null, onCooldown: false },
    pirateHistory: [],
    notifications: [],
    unreadCount: 0,
    shipmentMessage: null,

    // ─── Cargo ─────────────────────────────────────
    fetchCargoBoxes: async () => {
        try {
            const { data } = await api.get('/game/cargo');
            set({ cargoBoxes: data.boxes ?? [] });
        } catch (err) { console.error('fetchCargoBoxes error', err); }
    },

    buyCargoBox: async (size) => {
        try {
            const { data } = await api.post('/game/cargo/buy', { size });
            set({ cargoBoxes: data.boxes ?? [] });
            return { ok: true };
        } catch (err: any) {
            return { ok: false, error: err.response?.data?.error || 'Failed' };
        }
    },

    packCargo: async (boxId, slotId, quantity) => {
        try {
            const { data } = await api.post('/game/cargo/pack', { boxId, slotId, quantity });
            set({ cargoBoxes: data.boxes ?? [] });
            return { ok: true };
        } catch (err: any) {
            return { ok: false, error: err.response?.data?.error || 'Failed' };
        }
    },

    unpackCargo: async (boxId, boxItemId, quantity) => {
        try {
            const { data } = await api.post('/game/cargo/unpack', { boxId, boxItemId, quantity });
            set({ cargoBoxes: data.boxes ?? [] });
            return { ok: true };
        } catch (err: any) {
            return { ok: false, error: err.response?.data?.error || 'Failed' };
        }
    },

    finalizeCargo: async (boxId) => {
        try {
            const { data } = await api.post(`/game/cargo/finalize/${boxId}`);
            set({ cargoBoxes: data.boxes ?? [] });
            return { ok: true };
        } catch (err: any) {
            return { ok: false, error: err.response?.data?.error || 'Failed' };
        }
    },

    discardCargo: async (boxId) => {
        try {
            const { data } = await api.delete(`/game/cargo/${boxId}`);
            set({ cargoBoxes: data.boxes ?? [] });
            return { ok: true };
        } catch (err: any) {
            return { ok: false, error: err.response?.data?.error || 'Failed' };
        }
    },

    // ─── Market / Orders ───────────────────────────
    sellCargoListing: async (boxId, price) => {
        try {
            await api.post('/game/market/sell-cargo', { cargoBoxId: boxId, price });
            await get().fetchCargoBoxes();
            // Also refresh market listings so own listings appear immediately
            const { useGameStore } = await import('./gameStore');
            await useGameStore.getState().fetchMarket();
            return { ok: true };
        } catch (err: any) {
            return { ok: false, error: err.response?.data?.error || 'Failed' };
        }
    },

    buyCargoListing: async (listingId) => {
        try {
            await api.post(`/game/market/buy-cargo/${listingId}`);
            await get().fetchOrders();
            return { ok: true };
        } catch (err: any) {
            return { ok: false, error: err.response?.data?.error || 'Failed' };
        }
    },

    fetchOrders: async () => {
        try {
            const { data } = await api.get('/game/orders');
            set({ orders: data.orders });
        } catch (err) { console.error('fetchOrders error', err); }
    },

    cancelOrder: async (orderId) => {
        try {
            await api.post(`/game/orders/cancel/${orderId}`);
            await get().fetchOrders();
            return { ok: true };
        } catch (err: any) {
            return { ok: false, error: err.response?.data?.error || 'Failed' };
        }
    },

    // ─── Ships ─────────────────────────────────────
    fetchPublicSchedule: async () => {
        try {
            const { data } = await api.get('/game/ship/public-schedule');
            set({ publicSchedule: data.ships });
        } catch (err) { console.error('fetchPublicSchedule error', err); }
    },

    loadPublicShip: async (orderId, shipId) => {
        try {
            await api.post('/game/ship/public/load', { orderId, shipId });
            await Promise.all([get().fetchOrders(), get().fetchPublicSchedule()]);
            return { ok: true };
        } catch (err: any) {
            return { ok: false, error: err.response?.data?.error || 'Failed' };
        }
    },

    rentPrivateShip: async (size, originCity, destCity, rpsSequence) => {
        try {
            const { data } = await api.post('/game/ship/private/rent', { size, originCity, destCity, rpsSequence });
            return { ok: true, shipId: data.ship.id };
        } catch (err: any) {
            return { ok: false, error: err.response?.data?.error || 'Failed' };
        }
    },

    loadPrivateShip: async (orderId, shipId) => {
        try {
            await api.post('/game/ship/private/load', { shipId, orderId });
            await get().fetchOrders();
            return { ok: true };
        } catch (err: any) {
            return { ok: false, error: err.response?.data?.error || 'Failed' };
        }
    },

    dispatchPrivateShip: async (shipId) => {
        try {
            await api.post('/game/ship/private/dispatch', { shipId });
            await Promise.all([get().fetchOrders(), get().fetchWorldMapShips()]);
            return { ok: true };
        } catch (err: any) {
            return { ok: false, error: err.response?.data?.error || 'Failed' };
        }
    },

    // ─── World Map ─────────────────────────────────
    fetchWorldMapShips: async () => {
        try {
            const { data } = await api.get('/game/world-map/ships');
            set({ worldMapShips: data.ships ?? [] });
        } catch (err) { console.error('fetchWorldMap error', err); }
    },

    // ─── Port ──────────────────────────────────────
    fetchPort: async () => {
        try {
            const { data } = await api.get('/game/port');
            set({ portBoxes: data.boxes ?? [] });
        } catch (err) { console.error('fetchPort error', err); }
    },

    claimCargo: async (boxId) => {
        try {
            await api.post(`/game/port/claim/${boxId}`);
            await get().fetchPort();
            return { ok: true };
        } catch (err: any) {
            return { ok: false, error: err.response?.data?.error || 'Failed' };
        }
    },

    // ─── Pirate ────────────────────────────────────
    launchPirateAttack: async (shipId, size, rpsSequence) => {
        try {
            const { data } = await api.post('/game/pirate/attack', { shipId, size, rpsSequence });
            await get().fetchPirateCooldown();
            return { ok: true, result: data.result };
        } catch (err: any) {
            return { ok: false, error: err.response?.data?.error || 'Failed' };
        }
    },

    fetchPirateCooldown: async () => {
        try {
            const { data } = await api.get('/game/pirate/cooldown');
            set({ pirateCooldown: data });
        } catch (err) { console.error('fetchPirateCooldown error', err); }
    },

    fetchPirateHistory: async () => {
        try {
            const { data } = await api.get('/game/pirate/history');
            set({ pirateHistory: data.attacks });
        } catch (err) { console.error('fetchPirateHistory error', err); }
    },

    // ─── Notifications ─────────────────────────────
    fetchNotifications: async () => {
        try {
            const { data } = await api.get('/game/notifications');
            set({ notifications: data.notifications });
        } catch (err) { console.error('fetchNotifications error', err); }
    },

    fetchUnreadCount: async () => {
        try {
            const { data } = await api.get('/game/notifications/unread-count');
            set({ unreadCount: data.count });
        } catch (err) { console.error('fetchUnreadCount error', err); }
    },

    markNotificationRead: async (id) => {
        try {
            await api.post(`/game/notifications/read/${id}`);
            set((s) => ({
                notifications: s.notifications.map((n) => n.id === id ? { ...n, is_read: true } : n),
                unreadCount: Math.max(0, s.unreadCount - 1),
            }));
        } catch (err) { console.error('markNotificationRead error', err); }
    },

    markAllNotificationsRead: async () => {
        try {
            await api.post('/game/notifications/read-all');
            set((s) => ({
                notifications: s.notifications.map((n) => ({ ...n, is_read: true })),
                unreadCount: 0,
            }));
        } catch (err) { console.error('markAllRead error', err); }
    },

    setShipmentMessage: (msg) => set({ shipmentMessage: msg }),
}));
