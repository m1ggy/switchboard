import type { User } from 'firebase/auth';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type MainStore = {
  title: string;
  user: User | null;
  _rehydrated: boolean;
  setUser: (user: User | null) => void;
  setHasRehydrated: (rehydrated: boolean) => void;
  sendMessageModalShown: boolean;
  setSendMessageModalShown: (flag: boolean) => void;
  createContactModalShown: boolean;
  setCreateContactModalShown: (flag: boolean) => void;
  dialerModalShown: boolean;
  setDialerModalShown: (flag: boolean) => void;
};

const useMainStore = create<MainStore>()(
  persist(
    (set) => ({
      title: 'Switchboard',
      user: null,
      _rehydrated: false,
      setUser: (user) => set({ user }),
      setHasRehydrated: (rehydrated) => set({ _rehydrated: rehydrated }),
      sendMessageModalShown: false,
      setSendMessageModalShown: (sendMessageModalShown) =>
        set({ sendMessageModalShown }),
      createContactModalShown: false,
      setCreateContactModalShown: (createContactModalShown) =>
        set({ createContactModalShown }),
      dialerModalShown: false,
      setDialerModalShown: (dialerModalShown) => set({ dialerModalShown }),
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
