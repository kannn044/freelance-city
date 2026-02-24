import { create } from 'zustand';
import api from '../lib/api';
import { normalizeUserJobFields, useAuthStore } from './authStore';
import type { EquipmentRarity } from '../lib/equipmentRarity';
import { getEquipmentRarityMultiplier } from '../lib/equipmentRarity';
import { DEFAULT_HUNGER_TASK_DECAY_PER_SEC, DEFAULT_DURABILITY_DECAY_PER_SEC, DEFAULT_FERRUM_MINING_CONFIG, type HungerTaskDecayConfig, type DurabilityDecayConfig, type FerrumMiningConfig } from '../lib/gameConstants';


// ─── Types ───────────────────────────────────────────

export interface RepairIngredient {
    item_id: number;
    item_name: string;
    item_icon: string;
    recipe_qty: number;
    repair_qty: number;
}

export interface RepairCostResult {
    ingredients: RepairIngredient[];
    missingPct: number;
    durability: number;
    maxDurability: number;
}

export interface Item {
    id: number;
    name: string;
    type: 'SEED' | 'RAW' | 'INGREDIENT' | 'MEAL' | 'EQUIPMENT';
    equipment_slot?: 'HEAD' | 'UPPER_BODY' | 'LOWER_BODY' | 'ARM' | 'GLOVE' | 'SHOE' | null;
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
    equipment_durability?: number | null;
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
    durability?: number;
    durability_updated_at?: string | null;
}

export interface WorkOrder {
    id: number;
    type: 'FARM' | 'COOK' | 'MINE' | 'SMELT';
    item_id: number;
    recipe_id: number | null;
    quantity: number;
    started_at: string;
    completes_at: string;
    paused_at?: string | null;
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
    equipment_rarity?: EquipmentRarity | null;
    item: Item;
    seller: {
        id: number;
        email: string;
        role: string;
        city_key?: string | null;
        city_name?: string | null;
    };
}

export interface SaleHistoryEntry {
    id: number;
    item_id: number;
    quantity: number;
    price: number;
    sold_at: string | null;
    total: number;
    buyer_name: string;
    equipment_rarity?: EquipmentRarity | null;
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

export interface IngredientSelection {
    slotId: number;
    quantity: number;
}

export interface WorkspaceRequirementInfo {
    requiredItemName: string;
    mustBeEquipped: boolean;
}

export interface WorkspaceActionResult {
    ok: boolean;
    message?: string;
    error?: string;
    code?: string;
    requirement?: WorkspaceRequirementInfo;
}

export interface EquipmentBoxOdds {
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
        slotWeights: Record<string, number>;
        note: string;
    };
    odds: EquipmentBoxOdds[];
    rarityOdds?: EquipmentBoxRarityOdds[];
}

export type { FerrumMiningConfig };

function mergeAuthUser(nextUser: any) {
    if (!nextUser) return;
    const prevUser = useAuthStore.getState().user as any;
    const merged = prevUser ? { ...prevUser, ...nextUser } : nextUser;
    useAuthStore.setState({ user: normalizeUserJobFields(merged) });
}

export interface EquipmentBoxOpenResult {
    ok: boolean;
    message?: string;
    boxPrice?: number;
    rolled?: {
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
    taskDecay: HungerTaskDecayConfig;
    durabilityDecay: DurabilityDecayConfig;
    ferrumMiningConfig: FerrumMiningConfig;

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
    fetchRuntimeConfig: () => Promise<void>;
    fetchAll: () => Promise<void>;

    eatItem: (slotId: number) => Promise<void>;
    buyFromShop: (itemId: number, quantity: number) => Promise<void>;
    buyRecipeUnlock: (recipeId: number) => Promise<void>;
    openEquipmentBox: () => Promise<EquipmentBoxOpenResult>;
    startFarm: (itemId: number, quantity: number) => Promise<WorkspaceActionResult>;
    startMine: (layer: 'SURFACE' | 'DEEP' | 'CORE') => Promise<WorkspaceActionResult>;
    startCook: (recipeId: number, selectedIngredients?: IngredientSelection[]) => Promise<WorkspaceActionResult>;
    collectWork: (orderId: number) => Promise<void>;
    collectReadyWork: () => Promise<void>;
    cancelWork: (orderId: number) => Promise<void>;
    equipItem: (slotId: number) => Promise<void>;
    unequipItem: (slot: EquipmentSlotState['slot']) => Promise<void>;
    organizeInventory: (mode: 'combine' | 'sort-az') => Promise<void>;
    discardItem: (slotId: number, quantity?: number) => Promise<void>;
    createListing: (slotId: number, quantity: number, price: number) => Promise<void>;
    buyListing: (listingId: number, quantity?: number) => Promise<void>;
    cancelListing: (listingId: number) => Promise<void>;

    fetchRepairCost: (slotOrId: string | number) => Promise<RepairCostResult | null>;
    repairEquipment: (slotOrId: string | number) => Promise<boolean>;

    tickHunger: () => void;
    tickDurability: () => void;
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
    taskDecay: {
        farmPerPlot: DEFAULT_HUNGER_TASK_DECAY_PER_SEC.FARM_PER_PLOT,
        cookPerMenu: DEFAULT_HUNGER_TASK_DECAY_PER_SEC.COOK_PER_MENU,
    },
    durabilityDecay: {
        farm: DEFAULT_DURABILITY_DECAY_PER_SEC.FARM,
        cook: DEFAULT_DURABILITY_DECAY_PER_SEC.COOK,
        mine: DEFAULT_DURABILITY_DECAY_PER_SEC.MINE,
        smelt: DEFAULT_DURABILITY_DECAY_PER_SEC.SMELT,
    },
    ferrumMiningConfig: { ...DEFAULT_FERRUM_MINING_CONFIG },
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

    fetchRuntimeConfig: async () => {
        try {
            const { data } = await api.get('/game/runtime-config');
            const farmPerPlot = Number(data?.taskDecay?.farmPerPlot);
            const cookPerMenu = Number(data?.taskDecay?.cookPerMenu);

            set({
                taskDecay: {
                    farmPerPlot: Number.isFinite(farmPerPlot)
                        ? farmPerPlot
                        : DEFAULT_HUNGER_TASK_DECAY_PER_SEC.FARM_PER_PLOT,
                    cookPerMenu: Number.isFinite(cookPerMenu)
                        ? cookPerMenu
                        : DEFAULT_HUNGER_TASK_DECAY_PER_SEC.COOK_PER_MENU,
                },
                durabilityDecay: {
                    farm: Number.isFinite(Number(data?.durabilityDecay?.farm)) ? Number(data.durabilityDecay.farm) : DEFAULT_DURABILITY_DECAY_PER_SEC.FARM,
                    cook: Number.isFinite(Number(data?.durabilityDecay?.cook)) ? Number(data.durabilityDecay.cook) : DEFAULT_DURABILITY_DECAY_PER_SEC.COOK,
                    mine: Number.isFinite(Number(data?.durabilityDecay?.mine)) ? Number(data.durabilityDecay.mine) : DEFAULT_DURABILITY_DECAY_PER_SEC.MINE,
                    smelt: Number.isFinite(Number(data?.durabilityDecay?.smelt)) ? Number(data.durabilityDecay.smelt) : DEFAULT_DURABILITY_DECAY_PER_SEC.SMELT,
                },
                ferrumMiningConfig: data?.ferrumMining ?? get().ferrumMiningConfig,
            });
        } catch (err) {
            console.error('fetchRuntimeConfig error', err);
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
            get().fetchRuntimeConfig(),
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
            mergeAuthUser(data.user);
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
                mergeAuthUser(data.user);
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
                mergeAuthUser(data.user);
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
            return {
                ok: true,
                message: data.message,
            } satisfies WorkspaceActionResult;
        } catch (err: any) {
            const payload = err.response?.data ?? {};
            const errorMessage = payload.error || 'Failed to start farm';
            set({ actionMessage: errorMessage });
            return {
                ok: false,
                error: errorMessage,
                code: payload.code,
                requirement: payload.requirement,
            } satisfies WorkspaceActionResult;
        }
    },

    startMine: async (layer) => {
        try {
            const { data } = await api.post('/game/workspace/start', {
                type: 'FARM',
                mode: 'MINE',
                layer,
                quantity: 1,
            });
            set({ actionMessage: data.message });
            get().fetchWorkOrders();
            useAuthStore.getState().fetchMe();
            return {
                ok: true,
                message: data.message,
            } satisfies WorkspaceActionResult;
        } catch (err: any) {
            const payload = err.response?.data ?? {};
            const errorMessage = payload.error || 'Failed to start mining expedition';
            set({ actionMessage: errorMessage });
            return {
                ok: false,
                error: errorMessage,
                code: payload.code,
                requirement: payload.requirement,
            } satisfies WorkspaceActionResult;
        }
    },

    startCook: async (recipeId, selectedIngredients = []) => {
        try {
            const { data } = await api.post('/game/workspace/start', {
                type: 'COOK',
                recipeId,
                selectedIngredients,
            });
            set({ actionMessage: data.message });
            get().fetchInventory();
            get().fetchWorkOrders();
            return {
                ok: true,
                message: data.message,
            } satisfies WorkspaceActionResult;
        } catch (err: any) {
            const payload = err.response?.data ?? {};
            const errorMessage = payload.error || 'Failed to start cooking';
            set({ actionMessage: errorMessage });
            return {
                ok: false,
                error: errorMessage,
                code: payload.code,
                requirement: payload.requirement,
            } satisfies WorkspaceActionResult;
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
                mergeAuthUser(data.user);
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
                mergeAuthUser(data.user);
            }
        } catch (err: any) {
            set({ actionMessage: err.response?.data?.error || 'Failed to collect ready work' });
        }
    },

    cancelWork: async (orderId) => {
        try {
            const { data } = await api.post(`/game/workspace/cancel/${orderId}`);
            set({
                inventory: data.slots ?? get().inventory,
                workOrders: data.orders ?? get().workOrders,
                actionMessage: data.message,
            });
        } catch (err: any) {
            set({ actionMessage: err.response?.data?.error || 'Failed to cancel order' });
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
            // Refresh work orders – server reconciles pauses after equip
            get().fetchWorkOrders();
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
            // Refresh work orders – server reconciles pauses after unequip
            get().fetchWorkOrders();
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

    discardItem: async (slotId, quantity) => {
        try {
            const { data } = await api.post('/game/inventory/discard', { slotId, quantity });
            set({
                inventory: data.slots ?? get().inventory,
                equipment: data.equipment ?? get().equipment,
                actionMessage: data.message,
            });
        } catch (err: any) {
            set({ actionMessage: err.response?.data?.error || 'Failed to discard item' });
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
                mergeAuthUser(data.user);
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
                mergeAuthUser(data.user);
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

    fetchRepairCost: async (slotOrId) => {
        try {
            const query = typeof slotOrId === 'number' ? `?slotId=${slotOrId}` : `?slot=${slotOrId}`;
            const { data } = await api.get(`/game/equipment/repair-cost${query}`);
            return data as RepairCostResult;
        } catch (err: any) {
            set({ actionMessage: err.response?.data?.error || 'Failed to get repair cost' });
            return null;
        }
    },

    repairEquipment: async (slotOrId) => {
        try {
            const payload = typeof slotOrId === 'number' ? { slotId: slotOrId } : { slot: slotOrId };
            const { data } = await api.post('/game/equipment/repair', payload);
            set({
                inventory: data.slots ?? get().inventory,
                equipment: data.equipment ?? get().equipment,
                actionMessage: data.message,
            });
            return true;
        } catch (err: any) {
            set({ actionMessage: err.response?.data?.error || 'Failed to repair equipment' });
            return false;
        }
    },

    tickHunger: () => {
        const { hunger, hungerUpdatedAt, satietyBuff, buffExpiresAt, workOrders, equipment, taskDecay } = get();
        const now = Date.now();
        const elapsed = now - hungerUpdatedAt;
        if (elapsed <= 0) return;

        const activeOrders = workOrders.filter((o) => {
            const start = new Date(o.started_at).getTime();
            const end = new Date(o.completes_at).getTime();
            return now >= start && now < end;
        });

        const farmBySeed = new Map<string, { count: number; burnMultiplier: number }>();
        let activeCookMenus = 0;

        const hasSafetyHelmet = equipment.some((eq) => eq.slot === 'HEAD' && String(eq.item_name ?? '').toLowerCase() === 'safety helmet');

        for (const order of activeOrders) {
            if (order.type === 'FARM' || order.type === 'MINE') {
                const isMiningPermit = String(order.item?.name ?? '') === 'Ferrum Mining Permit';
                const isDeepOrCore = order.recipe_id === 2 || order.recipe_id === 3;
                const burnMultiplier = isMiningPermit && isDeepOrCore && !hasSafetyHelmet ? 2 : 1;
                const key = `${order.item_id}:${order.recipe_id ?? 0}:${burnMultiplier}`;
                const prev = farmBySeed.get(key) ?? { count: 0, burnMultiplier };
                farmBySeed.set(key, { count: prev.count + 1, burnMultiplier });
            } else if (order.type === 'COOK' || order.type === 'SMELT') {
                activeCookMenus += 1;
            }
        }

        let activeProviderPlots = 0;
        let weightedProviderPlots = 0;
        for (const block of farmBySeed.values()) {
            const plots = Math.ceil(block.count / 9);
            activeProviderPlots += plots;
            weightedProviderPlots += plots * block.burnMultiplier;
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
        const providerDecay = elapsedSec * weightedProviderPlots * taskDecay.farmPerPlot;
        const chefDecay = elapsedSec * activeCookMenus * taskDecay.cookPerMenu * (1 - equipCookPctReduction);
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

    tickDurability: () => {
        const { equipment, workOrders, durabilityDecay } = get();
        const now = Date.now();

        const activeOrders = workOrders.filter((o) => {
            const start = new Date(o.started_at).getTime();
            const end = new Date(o.completes_at).getTime();
            return now >= start && now < end && !o.paused_at;
        });

        if (activeOrders.length === 0) return;

        const updated = equipment.map((eq) => {
            if (!eq.item_id || eq.durability == null || eq.durability <= 0) return eq;

            const lastUpdated = eq.durability_updated_at
                ? new Date(eq.durability_updated_at).getTime()
                : now;
            if (now <= lastUpdated) return eq;

            let totalDecay = 0;
            for (const order of activeOrders) {
                const orderStart = new Date(order.started_at).getTime();
                const orderEnd = new Date(order.completes_at).getTime();
                const overlapStart = Math.max(lastUpdated, orderStart);
                const overlapEnd = Math.min(now, orderEnd);
                if (overlapEnd <= overlapStart) continue;

                const overlapSec = (overlapEnd - overlapStart) / 1000;
                const orderType = order.type.toUpperCase();
                let rate = 0;
                if (orderType === 'FARM') rate = durabilityDecay.farm;
                else if (orderType === 'COOK') rate = durabilityDecay.cook;
                else if (orderType === 'MINE') rate = durabilityDecay.mine;
                else if (orderType === 'SMELT') rate = durabilityDecay.smelt;
                totalDecay += overlapSec * rate;
            }

            if (totalDecay <= 0) return { ...eq, durability_updated_at: new Date(now).toISOString() };

            return {
                ...eq,
                durability: Math.max(0, eq.durability - totalDecay),
                durability_updated_at: new Date(now).toISOString(),
            };
        });

        set({ equipment: updated });
    },

    setActionMessage: (message) => set({ actionMessage: message }),
    clearMessage: () => set({ actionMessage: null }),
}));
