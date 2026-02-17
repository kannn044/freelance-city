import { create } from 'zustand';
import api from '../lib/api';
import { useAuthStore } from './authStore';
import type { EquipmentRarity } from '../lib/equipmentRarity';
import { getEquipmentRarityMultiplier } from '../lib/equipmentRarity';
import { HUNGER_TASK_DECAY_PER_SEC } from '../lib/gameConstants';

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
    equipment_rarity?: EquipmentRarity | null;
    item: Item | null;
}

export interface EquipmentSlotState {
    slot: 'HEAD' | 'UPPER_BODY' | 'LOWER_BODY' | 'ARM' | 'GLOVE' | 'SHOE';
    item_id: number | null;
    item_name: string | null;
    item_icon: string | null;
    item_rarity?: EquipmentRarity | null;
    effect_key?: string | null;
    effect_value?: number | null;
    effect_value2?: number | null;
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

export interface SaleHistoryEntry {
    id: number;
    item_id: number;
    quantity: number;
    price: number;
    sold_at: string | null;
    total: number;
    buyer_name: string;
    item: Item;
    buyer?: { id: number; email: string; role: string } | null;
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

export interface EquipmentBoxRarityOdds {
    rarity: EquipmentRarity;
    chancePct: number;
    buffMultiplier: number;
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
    rarityOdds?: EquipmentBoxRarityOdds[];
}

export interface EquipmentBoxOpenResult {
    ok: boolean;
    message?: string;
    boxPrice?: number;
    rolled?: {
        role: 'PROVIDER' | 'CHEF';
        slot: 'HEAD' | 'UPPER_BODY' | 'LOWER_BODY' | 'ARM' | 'GLOVE' | 'SHOE';
        rarity: EquipmentRarity;
        buffMultiplier: number;
        item: Item | null;
    };
    error?: string;
}

interface GameState {
    // Data
    inventory: InventorySlot[];
    equipment: EquipmentSlotState[];
    workOrders: WorkOrder[];
    marketListings: MarketListing[];
    salesHistory: SaleHistoryEntry[];
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
    fetchSalesHistory: () => Promise<void>;
    fetchShop: () => Promise<void>;
    fetchRecipes: () => Promise<void>;
    fetchRecipeShop: () => Promise<void>;
    fetchEquipmentBoxInfo: () => Promise<void>;
    fetchAll: () => Promise<void>;

    eatItem: (slotId: number) => Promise<void>;
    buyFromShop: (itemId: number, quantity: number) => Promise<void>;
    buyRecipeUnlock: (recipeId: number) => Promise<void>;
    openEquipmentBox: () => Promise<EquipmentBoxOpenResult>;
    startFarm: (itemId: number, quantity: number) => Promise<void>;
    startCook: (recipeId: number) => Promise<void>;
    collectWork: (orderId: number) => Promise<void>;
    collectReadyWork: () => Promise<void>;
    equipItem: (slotId: number) => Promise<void>;
    unequipItem: (slot: EquipmentSlotState['slot']) => Promise<void>;
    organizeInventory: (mode: 'combine' | 'sort-az') => Promise<void>;
    createListing: (slotId: number, quantity: number, price: number) => Promise<void>;
    buyListing: (listingId: number, quantity?: number) => Promise<void>;
    cancelListing: (listingId: number) => Promise<void>;

    tickHunger: () => void;
    setActionMessage: (message: string | null) => void;
    clearMessage: () => void;
}

export const useGameStore = create<GameState>((set, get) => ({
    inventory: [],
    equipment: [],
    workOrders: [],
    marketListings: [],
    salesHistory: [],
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

    fetchSalesHistory: async () => {
        try {
            const { data } = await api.get('/game/market/sales-history');
            set({ salesHistory: data.history ?? [] });
        } catch (err) {
            console.error('fetchSalesHistory error', err);
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
            get().fetchSalesHistory(),
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
                    ? {
                        ...get().equipmentBoxInfo!,
                        odds: data.odds ?? get().equipmentBoxInfo!.odds,
                        rarityOdds: data.rarityOdds ?? get().equipmentBoxInfo!.rarityOdds,
                    }
                    : get().equipmentBoxInfo,
            });
            if (data.user) {
                useAuthStore.setState({ user: data.user });
            }
            return {
                ok: true,
                message: data.message,
                boxPrice: data.boxPrice,
                rolled: data.rolled,
            } satisfies EquipmentBoxOpenResult;
        } catch (err: any) {
            const errorMessage = err.response?.data?.error || 'Failed to open equipment box';
            set({ actionMessage: errorMessage });
            return {
                ok: false,
                error: errorMessage,
            } satisfies EquipmentBoxOpenResult;
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

    organizeInventory: async (mode) => {
        try {
            const { data } = await api.post('/game/inventory/organize', { mode });
            set({
                inventory: data.slots ?? get().inventory,
                equipment: data.equipment ?? get().equipment,
                actionMessage: data.message,
            });
        } catch (err: any) {
            set({ actionMessage: err.response?.data?.error || 'Failed to organize inventory' });
        }
    },

    createListing: async (slotId, quantity, price) => {
        try {
            const { data } = await api.post('/game/market/sell', { slotId, quantity, price });
            set({ actionMessage: data.message });
            get().fetchInventory();
            get().fetchMarket();
            get().fetchSalesHistory();

            // Update user state (levels, exp)
            if (data.user) {
                useAuthStore.setState({ user: data.user });
            }
        } catch (err: any) {
            set({ actionMessage: err.response?.data?.error || 'Failed to create listing' });
        }
    },

    buyListing: async (listingId, quantity = 1) => {
        try {
            const { data } = await api.post(`/game/market/buy/${listingId}`, { quantity });
            set({ actionMessage: data.message });
            get().fetchInventory();
            get().fetchMarket();
            get().fetchSalesHistory();

            // Update user state (money)
            if (data.user) {
                useAuthStore.setState({ user: data.user });
            }
        } catch (err: any) {
            set({ actionMessage: err.response?.data?.error || 'Failed to buy listing' });
        }
    },

    cancelListing: async (listingId) => {
        try {
            const { data } = await api.post(`/game/market/cancel/${listingId}`);
            set({
                inventory: data.slots ?? get().inventory,
                actionMessage: data.message,
            });
            get().fetchMarket();
            get().fetchSalesHistory();
        } catch (err: any) {
            set({ actionMessage: err.response?.data?.error || 'Failed to cancel listing' });
        }
    },

    tickHunger: () => {
        const { hunger, hungerUpdatedAt, satietyBuff, buffExpiresAt, workOrders, equipment } = get();
        const now = Date.now();
        const elapsed = now - hungerUpdatedAt;
        if (elapsed <= 0) return;

        const activeOrders = workOrders.filter((o) => {
            const start = new Date(o.started_at).getTime();
            const end = new Date(o.completes_at).getTime();
            return now >= start && now < end;
        });

        const farmBySeed = new Map<number, number>();
        let activeCookMenus = 0;

        for (const order of activeOrders) {
            if (order.type === 'FARM') {
                farmBySeed.set(order.item_id, (farmBySeed.get(order.item_id) ?? 0) + 1);
            } else if (order.type === 'COOK') {
                activeCookMenus += 1;
            }
        }

        let activeProviderPlots = 0;
        for (const count of farmBySeed.values()) {
            activeProviderPlots += Math.ceil(count / 9);
        }

        let equipFlatReductionPerMin = 0;
        let equipCookPctReduction = 0;
        for (const eq of equipment) {
            if (!eq.item_id || !eq.effect_key) continue;
            const mult = getEquipmentRarityMultiplier(eq.item_rarity as EquipmentRarity | null | undefined);
            const v = Number(eq.effect_value ?? 0) * mult;

            if (eq.effect_key === 'hunger_decay_reduction_per_min') {
                equipFlatReductionPerMin += v;
            }
            if (eq.effect_key === 'cook_state_hunger_decay_reduction_pct') {
                equipCookPctReduction += v;
            }
        }
        equipCookPctReduction = Math.max(0, Math.min(0.9, equipCookPctReduction));

        const elapsedSec = elapsed / 1000;
        const providerDecay = elapsedSec * activeProviderPlots * HUNGER_TASK_DECAY_PER_SEC.FARM_PER_PLOT;
        const chefDecay = elapsedSec * activeCookMenus * HUNGER_TASK_DECAY_PER_SEC.COOK_PER_MENU * (1 - equipCookPctReduction);
        let decay = providerDecay + chefDecay;

        if (satietyBuff > 0 && buffExpiresAt && now < buffExpiresAt) {
            decay *= (1 - satietyBuff);
        }

        if (equipFlatReductionPerMin > 0) {
            decay = Math.max(0, decay - (equipFlatReductionPerMin / 60) * elapsedSec);
        }

        const newHunger = Math.max(0, hunger - decay);
        set({ hunger: newHunger, hungerUpdatedAt: now });
    },

    setActionMessage: (message) => set({ actionMessage: message }),
    clearMessage: () => set({ actionMessage: null }),
}));
