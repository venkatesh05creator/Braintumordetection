import { create } from 'zustand';
import { alertsAPI } from '../api/client';
import useAuthStore from './authStore';

/**
 * Shared unread-alert count for the doctor sidebar badge.
 * Only doctors have alerts server-side, so patients always see 0.
 */
const useAlertsStore = create((set) => ({
  unreadCount: 0,

  fetchUnread: async () => {
    const user = useAuthStore.getState().user;
    if (user?.role !== 'doctor') {
      set({ unreadCount: 0 });
      return;
    }
    try {
      const res = await alertsAPI.list(true);
      set({ unreadCount: res.data.length });
    } catch {
      // Unauthorized / backend offline — don't show a stale badge
      set({ unreadCount: 0 });
    }
  },

  setUnreadCount: (n) => set({ unreadCount: n }),
}));

export default useAlertsStore;
