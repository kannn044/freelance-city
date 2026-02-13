import { create } from 'zustand';
import api from '../lib/api';
import { useAuthStore } from './authStore';

// ─── Types ───────────────────────────────────────────

export interface Item {
    id: number;
    name: string;
    type: 'SEED' | 'RAW' | 'INGREDIENT' | 'MEAL' | 'EQUIPMENT';
    equipment_slot?: 'HEAD' | 'UPPER_BODY' | 'LOWER_BODY' | 'ARM' | 'GLOVE' | 'SHOE' | null;
    equipment_role?: 'PROVIDER' | 'CHEF' | 'NONE' | null;
    effect_key?: string | null;
    effect_value?: number | null;
    effect_value2?: number | null;
    buy_price: number | null;
    sell_price: number | null;
    kcal: number | null;
    buff_pct: number | null;
    buff_mins: number | null;
    max_stack: number;
    grow_mins: number | null;
    icon: string;
    exp_value: number;
}

export interface InventorySlot {
    id: number;
    slot: number;
    item_id: number | null;
    quantity: number;
    item: Item | null;
}

export interface EquipmentSlotState {
    slot: 'HEAD' | 'UPPER_BODY' | 'LOWER_BODY' | 'ARM' | 'GLOVE' | 'SHOE';
    item_id: number | null;
    item_name: string | null;
    item_icon: string | null;
}

export interface WorkOrder {
    id: number;
    type: 'FARM' | 'COOK';
    item_id: number;
    recipe_id: number | null;
    quantity: number;
    started_at: string;
    completes_at: string;
    collected: boolean;
    item: Item;
}

export interface MarketListing {
    id: number;
    seller_id: number;
    item_id: number;
    quantity: number;
    price: number;
    status: string;
    created_at: string;
    item: Item;
    seller: { id: number; email: string; role: string };
}

export interface Recipe {
    id: number;
    name: string;
    output_item_id: number;
    output_qty: number;
    cook_mins: number;
    unlock_price?: number;
    output_item: Item;
    ingredients: { item_id: number; quantity: number; item: Item }[];
}

export interface EquipmentBoxOdds {
    role: 'PROVIDER' | 'CHEF';
    slot: 'HEAD' | 'UPPER_BODY' | 'LOWER_BODY' | 'ARM' | 'GLOVE' | 'SHOE';
    chancePct: number;
}

export interface EquipmentBoxInfo {
    box: {
        name: string;
        price: number;
        description: string;
    };
    formula: {
        roleBias: { PROVIDER: number; CHEF: number };
        slotWeights: Record<string, number>;
        note: string;
    };
    odds: EquipmentBoxOdds[];
}

interface GameState {
    // Data
    inventory: InventorySlot[];
    equipment: EquipmentSlotState[];
    workOrders: WorkOrder[];
    marketListings: MarketListing[];
    shopItems: Item[];
    recipes: Recipe[];
    recipeShop: Recipe[];
    equipmentBoxInfo: EquipmentBoxInfo | null;

    // Client-side hunger interpolation
    hunger: number;
    hungerUpdatedAt: number; // timestamp ms
    satietyBuff: number;
    buffExpiresAt: number | null;

    // Loading
    isLoading: boolean;
    actionMessage: string | null;

    // Actions
    fetchInventory: () => Promise<void>;
    fetchWorkOrders: () => Promise<void>;
    fetchMarket: () => Promise<void>;
    fetchShop: () => Promise<void>;
    fetchRecipes: () => Promise<void>;
    fetchRecipeShop: () => Promise<void>;
    fetchEquipmentBoxInfo: () => Promise<void>;
    fetchAll: () => Promise<void>;

    eatItem: (slotId: number) => Promise<void>;
    buyFromShop: (itemId: number, quantity: number) => Promise<void>;
    buyRecipeUnlock: (recipeId: number) => Promise<void>;
    openEquipmentBox: () => Promise<void>;
    startFarm: (itemId: number, quantity: number) => Promise<void>;
    startCook: (recipeId: number) => Promise<void>;
    collectWork: (orderId: number) => Promise<void>;
    collectReadyWork: () => Promise<void>;
    equipItem: (slotId: number) => Promise<void>;
    unequipItem: (slot: EquipmentSlotState['slot']) => Promise<void>;
    createListing: (slotId: number, quantity: number, price: number) => Promise<void>;
    buyListing: (listingId: number) => Promise<void>;

    tickHunger: () => void;
    clearMessage: () => void;
}

const HUNGER_DECAY_PER_MS = (2400 / 180) / (60 * 1000); // ~13.33 Kcal/min in ms

export const useGameStore = create<GameState>((set, get) => ({
    inventory: [],
    equipment: [],
    workOrders: [],
    marketListings: [],
    shopItems: [],
    recipes: [],
    recipeShop: [],
    equipmentBoxInfo: null,
    hunger: 2400,
    hungerUpdatedAt: Date.now(),
    satietyBuff: 0,
    buffExpiresAt: null,
    isLoading: false,
    actionMessage: null,

    fetchInventory: async () => {
        try {
            const { data } = await api.get('/game/inventory');
            set({ inventory: data.slots, equipment: data.equipment ?? [] });
        } catch (err) {
            console.error('fetchInventory error', err);
        }
    },

    fetchWorkOrders: async () => {
        try {
            const { data } = await api.get('/game/workspace');
            set({ workOrders: data.orders });
        } catch (err) {
            console.error('fetchWorkOrders error', err);
        }
    },

    fetchMarket: async () => {
        try {
            const { data } = await api.get('/game/market');
            set({ marketListings: data.listings });
        } catch (err) {
            console.error('fetchMarket error', err);
        }
    },

    fetchShop: async () => {
        try {
            const { data } = await api.get('/game/shop');
            set({ shopItems: data.items });
        } catch (err) {
            console.error('fetchShop error', err);
        }
    },

    fetchRecipes: async () => {
        try {
            const { data } = await api.get('/game/recipes');
            set({ recipes: data.recipes });
        } catch (err) {
            console.error('fetchRecipes error', err);
        }
    },

    fetchRecipeShop: async () => {
        try {
            const { data } = await api.get('/game/shop/recipes');
            set({ recipeShop: data.recipes });
        } catch (err) {
            console.error('fetchRecipeShop error', err);
        }
    },

    fetchEquipmentBoxInfo: async () => {
        try {
            const { data } = await api.get('/game/shop/equipment-box');
            set({ equipmentBoxInfo: data });
        } catch (err) {
            console.error('fetchEquipmentBoxInfo error', err);
        }
    },

    fetchAll: async () => {
        set({ isLoading: true });
        const authUser = useAuthStore.getState().user;
        if (authUser) {
            set({
                hunger: authUser.hunger,
                hungerUpdatedAt: Date.now(),
            });
        }
        await Promise.all([
            get().fetchInventory(),
            get().fetchWorkOrders(),
            get().fetchMarket(),
            get().fetchShop(),
            get().fetchRecipes(),
            get().fetchRecipeShop(),
            get().fetchEquipmentBoxInfo(),
        ]);
        set({ isLoading: false });
    },

    eatItem: async (slotId) => {
        try {
            const { data } = await api.post(`/game/eat/${slotId}`);
            set({
                inventory: data.slots,
                hunger: data.user.hunger,
                hungerUpdatedAt: Date.now(),
                satietyBuff: data.user.satiety_buff || 0,
                buffExpiresAt: data.user.buff_expires_at ? new Date(data.user.buff_expires_at).getTime() : null,
                actionMessage: data.message,
            });
            useAuthStore.getState().fetchMe();
        } catch (err: any) {
            set({ actionMessage: err.response?.data?.error || 'Failed to eat' });
        }
    },

    buyFromShop: async (itemId, quantity) => {
        try {
            const { data } = await api.post('/game/shop/buy', { itemId, quantity });
            set({
                inventory: data.slots,
                actionMessage: data.message,
            });
            // Update user state (money, hunger, levels)
            useAuthStore.setState({ user: data.user });
            // Re-fetch shop in case occupation state changed
            get().fetchShop();
        } catch (err: any) {
            set({ actionMessage: err.response?.data?.error || 'Failed to buy' });
        }
    },

    buyRecipeUnlock: async (recipeId) => {
        try {
            const { data } = await api.post('/game/shop/recipes/buy', { recipeId });
            set({ actionMessage: data.message });
            if (data.user) {
                useAuthStore.setState({ user: data.user });
            }
            await Promise.all([get().fetchRecipes(), get().fetchRecipeShop()]);
        } catch (err: any) {
            set({ actionMessage: err.response?.data?.error || 'Failed to unlock recipe' });
        }
    },

    openEquipmentBox: async () => {
        try {
            const { data } = await api.post('/game/shop/equipment-box/open');
            set({
                inventory: data.slots ?? get().inventory,
                actionMessage: data.message,
                equipmentBoxInfo: get().equipmentBoxInfo
                    ? { ...get().equipmentBoxInfo!, odds: data.odds ?? get().equipmentBoxInfo!.odds }
                    : get().equipmentBoxInfo,
            });
            if (data.user) {
                useAuthStore.setState({ user: data.user });
            }
        } catch (err: any) {
            set({ actionMessage: err.response?.data?.error || 'Failed to open equipment box' });
        }
    },

    startFarm: async (itemId, quantity) => {
        try {
            const { data } = await api.post('/game/workspace/start', {
                type: 'FARM',
                itemId,
                quantity,
            });
            set({ actionMessage: data.message });
            get().fetchInventory();
            get().fetchWorkOrders();
        } catch (err: any) {
            set({ actionMessage: err.response?.data?.error || 'Failed to start farm' });
        }
    },

    startCook: async (recipeId) => {
        try {
            const { data } = await api.post('/game/workspace/start', {
                type: 'COOK',
                recipeId,
            });
            set({ actionMessage: data.message });
            get().fetchInventory();
            get().fetchWorkOrders();
        } catch (err: any) {
            set({ actionMessage: err.response?.data?.error || 'Failed to start cooking' });
        }
    },

    collectWork: async (orderId) => {
        try {
            const { data } = await api.post(`/game/workspace/collect/${orderId}`);
            set({
                inventory: data.slots,
                actionMessage: data.message,
            });
            get().fetchWorkOrders();

            // Update user state (levels, exp) after collecting work
            if (data.user) {
                useAuthStore.setState({ user: data.user });
            }
        } catch (err: any) {
            set({ actionMessage: err.response?.data?.error || 'Failed to collect' });
        }
    },

    collectReadyWork: async () => {
        try {
            const { data } = await api.post('/game/workspace/collect-ready');
            set({
                inventory: data.slots ?? get().inventory,
                actionMessage: data.message,
            });
            get().fetchWorkOrders();
            if (data.user) {
                useAuthStore.setState({ user: data.user });
            }
        } catch (err: any) {
            set({ actionMessage: err.response?.data?.error || 'Failed to collect ready work' });
        }
    },

    equipItem: async (slotId) => {
        try {
            const { data } = await api.post('/game/equipment/equip', { slotId });
            set({
                inventory: data.slots ?? get().inventory,
                equipment: data.equipment ?? get().equipment,
                actionMessage: data.message,
            });
        } catch (err: any) {
            set({ actionMessage: err.response?.data?.error || 'Failed to equip item' });
        }
    },

    unequipItem: async (slot) => {
        try {
            const { data } = await api.post('/game/equipment/unequip', { slot });
            set({
                inventory: data.slots ?? get().inventory,
                equipment: data.equipment ?? get().equipment,
                actionMessage: data.message,
            });
        } catch (err: any) {
            set({ actionMessage: err.response?.data?.error || 'Failed to unequip item' });
        }
    },

    createListing: async (slotId, quantity, price) => {
        try {
            const { data } = await api.post('/game/market/sell', { slotId, quantity, price });
            set({ actionMessage: data.message });
            get().fetchInventory();
            get().fetchMarket();

            // Update user state (levels, exp)
            if (data.user) {
                useAuthStore.setState({ user: data.user });
            }
        } catch (err: any) {
            set({ actionMessage: err.response?.data?.error || 'Failed to create listing' });
        }
    },

    buyListing: async (listingId) => {
        try {
            const { data } = await api.post(`/game/market/buy/${listingId}`);
            set({ actionMessage: data.message });
            get().fetchInventory();
            get().fetchMarket();

            // Update user state (money)
            if (data.user) {
                useAuthStore.setState({ user: data.user });
            }
        } catch (err: any) {
            set({ actionMessage: err.response?.data?.error || 'Failed to buy listing' });
        }
    },

    tickHunger: () => {
        const { hunger, hungerUpdatedAt, satietyBuff, buffExpiresAt } = get();
        const now = Date.now();
        const elapsed = now - hungerUpdatedAt;

        let rate = HUNGER_DECAY_PER_MS;
        if (satietyBuff > 0 && buffExpiresAt && now < buffExpiresAt) {
            rate *= (1 - satietyBuff);
        }

        const newHunger = Math.max(0, hunger - rate * elapsed);
        set({ hunger: newHunger, hungerUpdatedAt: now });
    },

    clearMessage: () => set({ actionMessage: null }),
}));
