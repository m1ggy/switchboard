import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type InboxStore = {
  activeMessengerContactId: string | null;
  setActiveMessagerContactId: (activeMessengerContactId: string | null) => void;
  _rehydrated: boolean;
  setHasRehydrated: (rehydrated: boolean) => void;
};

const useInboxStore = create<InboxStore>()(
  persist(
    (set) => ({
      activeMessengerContactId: null,
      setActiveMessagerContactId(activeMessengerContactId) {
        set({ activeMessengerContactId });
      },
      _rehydrated: false,
      setHasRehydrated: (rehydrated) => set({ _rehydrated: rehydrated }),
    }),
    {
      name: 'inbox',
      onRehydrateStorage: (state) => {
        return () => state.setHasRehydrated(true);
      },
    }
  )
);

export default useInboxStore;
