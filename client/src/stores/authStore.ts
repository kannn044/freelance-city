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
    chef_level: number;
    chef_exp: number;
    satiety_buff: number;
}

interface AuthState {
    token: string | null;
    user: User | null;
    isLoading: boolean;
    error: string | null;
    login: (email: string, password: string) => Promise<void>;
    register: (email: string, password: string) => Promise<void>;
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
