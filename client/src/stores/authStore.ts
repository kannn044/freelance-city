import { create } from 'zustand';
import api from '../lib/api';

interface User {
    id: number;
    email: string;
    role: 'CITIZEN' | 'MAYOR' | string;
    money: number;
    hunger: number;
    first_job_level: number;
    first_job_exp: number;
    first_job_skill_veg?: number;
    first_job_skill_chicken?: number;
    first_job_skill_beef?: number;
    secondary_job_level: number;
    secondary_job_exp: number;
    secondary_job_skill_veg?: number;
    secondary_job_skill_chicken?: number;
    secondary_job_skill_beef?: number;
    satiety_buff: number;
    buff_expires_at?: string | null;
    city_key?: string | null;
    city_selected_at?: string | null;
    city?: {
        key: string;
        name: string;
        description?: string;
        occupations?: string[];
        occupation_labels?: {
            first_job: string;
            secondary_job: string;
        };
        workspace_modes?: {
            first_job: 'FARM' | 'MINE';
            secondary_job: 'COOK' | 'SMELT';
        };
        first_job_special_task_item_name?: string | null;
        tier: number;
        treasury: number;
        taxes: {
            domesticPct: number;
            exportPct: number;
            importPct: number;
        };
        mayorUserId?: number | null;
        bonuses: {
            task_time_reduction_pct: number;
            npc_shop_discount_pct: number;
            market_fee_discount_pct: number;
            rare_drop_bonus_pct: number;
        };
    } | null;
}

const toNumber = (value: unknown, fallback = 0): number => {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
};

const normalizeCityMetadata = (rawCity: any) => {
    if (!rawCity) return rawCity;

    const rawOccupationLabels = rawCity.occupation_labels ?? {};
    const rawWorkspaceModes = rawCity.workspace_modes ?? {};

    return {
        ...rawCity,
        occupation_labels: {
            first_job: rawOccupationLabels.first_job ?? 'First Job',
            secondary_job: rawOccupationLabels.secondary_job ?? 'Secondary Job',
        },
        workspace_modes: {
            first_job: rawWorkspaceModes.first_job ?? 'FARM',
            secondary_job: rawWorkspaceModes.secondary_job ?? 'COOK',
        },
        first_job_special_task_item_name:
            rawCity.first_job_special_task_item_name ?? null,
    };
};

export const normalizeUserJobFields = (rawUser: any): User => {
    if (!rawUser) return rawUser;

    const firstJobLevel = toNumber(rawUser.first_job_level);
    const firstJobExp = toNumber(rawUser.first_job_exp);
    const secondaryJobLevel = toNumber(rawUser.secondary_job_level);
    const secondaryJobExp = toNumber(rawUser.secondary_job_exp);

    const firstJobSkillVeg = toNumber(rawUser.first_job_skill_veg);
    const firstJobSkillChicken = toNumber(rawUser.first_job_skill_chicken);
    const firstJobSkillBeef = toNumber(rawUser.first_job_skill_beef);

    const secondaryJobSkillVeg = toNumber(rawUser.secondary_job_skill_veg);
    const secondaryJobSkillChicken = toNumber(rawUser.secondary_job_skill_chicken);
    const secondaryJobSkillBeef = toNumber(rawUser.secondary_job_skill_beef);

    return {
        ...rawUser,
        city: normalizeCityMetadata(rawUser.city),
        first_job_level: firstJobLevel,
        first_job_exp: firstJobExp,
        first_job_skill_veg: firstJobSkillVeg,
        first_job_skill_chicken: firstJobSkillChicken,
        first_job_skill_beef: firstJobSkillBeef,
        secondary_job_level: secondaryJobLevel,
        secondary_job_exp: secondaryJobExp,
        secondary_job_skill_veg: secondaryJobSkillVeg,
        secondary_job_skill_chicken: secondaryJobSkillChicken,
        secondary_job_skill_beef: secondaryJobSkillBeef,
    } as User;
};

interface CityOption {
    key: string;
    name: string;
    playable: boolean;
    description?: string;
    occupations?: string[];
    occupation_labels?: {
        first_job: string;
        secondary_job: string;
    };
    workspace_modes?: {
        first_job: 'FARM' | 'MINE';
        secondary_job: 'COOK' | 'SMELT';
    };
    first_job_special_task_item_name?: string | null;
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
    selectClass: (jobSlot: 'first_job' | 'secondary_job') => Promise<void>;
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
            set({ token: data.token, user: normalizeUserJobFields(data.user), isLoading: false });
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
            set({ token: data.token, user: normalizeUserJobFields(data.user), isLoading: false });
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
            set({ cities: (data.cities || []).map(normalizeCityMetadata) });
        } catch {
            // keep silent, fallback handled in UI
        }
    },

    selectCity: async (cityKey) => {
        set({ isLoading: true, error: null });
        try {
            const { data } = await api.post('/auth/select-city', { cityKey });
            set({ user: normalizeUserJobFields(data.user), isLoading: false });
        } catch (err: any) {
            set({
                error: err.response?.data?.error || 'Failed to select city',
                isLoading: false,
            });
            throw err;
        }
    },

    selectClass: async (jobSlot) => {
        set({ isLoading: true, error: null });
        try {
            const { data } = await api.post('/auth/select-class', { job_slot: jobSlot });
            set({ user: normalizeUserJobFields(data.user), isLoading: false });
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
            set({ user: normalizeUserJobFields(data.user), isLoading: false });
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
            set({ user: normalizeUserJobFields(data.user), isLoading: false });
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
