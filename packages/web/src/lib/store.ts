import type { User } from 'firebase/auth';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type MainStore = {
  title: string;
  user: User | null;
  _rehydrated: boolean;
  setUser: (user: User | null) => void;
  setHasRehydrated: (rehydrated: boolean) => void;
};

const useMainStore = create<MainStore>()(
  persist(
    (set) => ({
      title: 'Switchboard',
      user: null,
      _rehydrated: false,
      setUser: (user) => set({ user }),
      setHasRehydrated: (rehydrated) => set({ _rehydrated: rehydrated }),
    }),
    {
      name: 'switchboard',
      partialize: (state) => ({
        user: state.user,
      }),
      onRehydrateStorage: (state) => {
        return () => state.setHasRehydrated(true);
      },
    }
  )
);

export default useMainStore;
