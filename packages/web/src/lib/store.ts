import type { User } from 'firebase/auth';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type ActiveNumber = {
  id: string;
  number: string;
  label: string;
};
type ActiveCompany = {
  id: string;
  name: string;
};

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
  incomingCallDialogShown: boolean;
  setIncomingCallDialogShown: (flag: boolean) => void;
  activeNumber: ActiveNumber | null;
  activeCompany: ActiveCompany | null;
  setActiveNumber: (number: ActiveNumber | null) => void;
  setActiveCompany: (company: ActiveCompany | null) => void;
  companySwitcherDialogShown: boolean;
  setCompanySwitcherDialogShown: (flag: boolean) => void;
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
      incomingCallDialogShown: false,
      setIncomingCallDialogShown: (incomingCallDialogShown) =>
        set({ incomingCallDialogShown }),
      activeCompany: null,
      activeNumber: null,
      setActiveCompany: (activeCompany) => set({ activeCompany }),
      setActiveNumber: (activeNumber) => set({ activeNumber }),
      companySwitcherDialogShown: false,
      setCompanySwitcherDialogShown: (companySwitcherDialogShown) =>
        set({ companySwitcherDialogShown }),
    }),
    {
      name: 'switchboard',
      partialize: (state) => ({
        user: state.user,
        activeCompany: state.activeCompany,
        activeNumber: state.activeNumber,
      }),
      onRehydrateStorage: (state) => {
        return () => state.setHasRehydrated(true);
      },
    }
  )
);

export default useMainStore;
