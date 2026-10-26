import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authAPI } from '../api/client';

const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isLoading: false,
      error: null,

      setTokens: (accessToken, refreshToken) => {
        localStorage.setItem('access_token', accessToken);
        localStorage.setItem('refresh_token', refreshToken);
        set({ accessToken, refreshToken });
      },

      login: async (email, password) => {
        set({ isLoading: true, error: null });
        try {
          const res = await authAPI.login({ email, password });
          const { access_token, refresh_token } = res.data;

          localStorage.setItem('access_token', access_token);
          localStorage.setItem('refresh_token', refresh_token);

          const meRes = await authAPI.me();
          set({
            user: meRes.data,
            accessToken: access_token,
            refreshToken: refresh_token,
            isLoading: false,
          });

          return { success: true, role: meRes.data.role };
        } catch (err) {
          const detail = err.response?.data?.detail;
          let msg = 'Login failed. Please try again.';
          if (Array.isArray(detail)) {
            msg = detail.map(d => d.msg.replace('Value error, ', '')).join(' ');
          } else if (typeof detail === 'string') {
            msg = detail;
          } else if (!err.response) {
            msg = 'Cannot connect to backend server. Please verify Uvicorn is running on port 8000.';
          }
          set({ error: msg, isLoading: false });
          return { success: false, error: msg };
        }
      },

      register: async (data) => {
        set({ isLoading: true, error: null });
        try {
          await authAPI.register(data);
          set({ isLoading: false });
          return { success: true };
        } catch (err) {
          const detail = err.response?.data?.detail;
          let msg = 'Registration failed. Please check your inputs.';
          if (Array.isArray(detail)) {
            msg = detail.map(d => d.msg.replace('Value error, ', '')).join(' ');
          } else if (typeof detail === 'string') {
            msg = detail;
          } else if (!err.response) {
            msg = 'Cannot connect to backend server. Please verify Uvicorn is running on port 8000.';
          }
          set({ error: msg, isLoading: false });
          return { success: false, error: msg };
        }
      },

      logout: () => {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        set({ user: null, accessToken: null, refreshToken: null, error: null });
      },

      fetchMe: async () => {
        try {
          const res = await authAPI.me();
          set({ user: res.data });
        } catch {
          get().logout();
        }
      },

      isAuthenticated: () => !!get().user && !!localStorage.getItem('access_token'),
      isDoctor: () => get().user?.role === 'doctor',
      isPatient: () => get().user?.role === 'patient',
    }),
    {
      name: 'neuroscan-auth',
      partialize: (state) => ({ user: state.user }),
    }
  )
);

export default useAuthStore;
