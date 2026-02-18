import { create } from 'zustand';
import api from '../lib/api';

interface User {
    id: number;
    email: string;
    role: 'NONE' | 'PROVIDER' | 'CHEF';
    money: number;
    hunger: number;
    provider_level: number;
    provider_exp: number;
    provider_skill_veg?: number;
    provider_skill_chicken?: number;
    provider_skill_beef?: number;
    chef_level: number;
    chef_exp: number;
    satiety_buff: number;
    buff_expires_at?: string | null;
    city_key?: string | null;
    city_selected_at?: string | null;
    city?: {
        key: string;
        name: string;
        tier: number;
        treasury: number;
        taxes: {
            domesticPct: number;
            exportPct: number;
            importPct: number;
        };
        bonuses: {
            task_time_reduction_pct: number;
            npc_shop_discount_pct: number;
            market_fee_discount_pct: number;
            rare_drop_bonus_pct: number;
        };
    } | null;
}

interface CityOption {
    key: string;
    name: string;
    playable: boolean;
    description?: string;
    occupations?: string[];
    tier: number;
    treasury: number;
    taxes: {
        domesticPct: number;
        exportPct: number;
        importPct: number;
    };
    bonuses: {
        task_time_reduction_pct: number;
        npc_shop_discount_pct: number;
        market_fee_discount_pct: number;
        rare_drop_bonus_pct: number;
    };
}

interface AuthState {
    token: string | null;
    user: User | null;
    isLoading: boolean;
    error: string | null;
    cities: CityOption[];
    login: (email: string, password: string) => Promise<void>;
    register: (email: string, password: string) => Promise<void>;
    fetchCities: () => Promise<void>;
    selectCity: (cityKey: string) => Promise<void>;
    selectClass: (role: 'PROVIDER' | 'CHEF') => Promise<void>;
    unlockOccupation: () => Promise<void>;
    fetchMe: () => Promise<void>;
    logout: () => void;
    clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
    token: localStorage.getItem('fc_token'),
    user: null,
    isLoading: false,
    error: null,
    cities: [],

    login: async (email, password) => {
        set({ isLoading: true, error: null });
        try {
            const { data } = await api.post('/auth/login', { email, password });
            localStorage.setItem('fc_token', data.token);
            set({ token: data.token, user: data.user, isLoading: false });
        } catch (err: any) {
            set({
                error: err.response?.data?.error || 'Login failed',
                isLoading: false,
            });
            throw err;
        }
    },

    register: async (email, password) => {
        set({ isLoading: true, error: null });
        try {
            const { data } = await api.post('/auth/register', { email, password });
            localStorage.setItem('fc_token', data.token);
            set({ token: data.token, user: data.user, isLoading: false });
        } catch (err: any) {
            set({
                error: err.response?.data?.error || 'Registration failed',
                isLoading: false,
            });
            throw err;
        }
    },

    fetchCities: async () => {
        try {
            const { data } = await api.get('/auth/cities');
            set({ cities: data.cities || [] });
        } catch {
            // keep silent, fallback handled in UI
        }
    },

    selectCity: async (cityKey) => {
        set({ isLoading: true, error: null });
        try {
            const { data } = await api.post('/auth/select-city', { cityKey });
            set({ user: data.user, isLoading: false });
        } catch (err: any) {
            set({
                error: err.response?.data?.error || 'Failed to select city',
                isLoading: false,
            });
            throw err;
        }
    },

    selectClass: async (role) => {
        set({ isLoading: true, error: null });
        try {
            const { data } = await api.post('/auth/select-class', { role });
            set({ user: data.user, isLoading: false });
        } catch (err: any) {
            set({
                error: err.response?.data?.error || 'Failed to select class',
                isLoading: false,
            });
            throw err;
        }
    },

    unlockOccupation: async () => {
        set({ isLoading: true, error: null });
        try {
            const { data } = await api.post('/auth/unlock-occupation');
            set({ user: data.user, isLoading: false });
        } catch (err: any) {
            set({
                error: err.response?.data?.error || 'Failed to unlock occupation',
                isLoading: false,
            });
            throw err;
        }
    },

    fetchMe: async () => {
        const token = get().token;
        if (!token) return;
        set({ isLoading: true });
        try {
            const { data } = await api.get('/auth/me');
            console.log('Fetched user data:', data);
            set({ user: data.user, isLoading: false });
        } catch {
            localStorage.removeItem('fc_token');
            set({ token: null, user: null, isLoading: false });
        }
    },

    logout: () => {
        localStorage.removeItem('fc_token');
        set({ token: null, user: null, error: null });
    },

    clearError: () => set({ error: null }),
}));
