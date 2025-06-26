import { create } from 'zustand';
import type { JitsiMeetJS } from '../jitsi';

type VideoCallStore = {
  currentCallContactId: string | null;
  setCurrentCallContactId: (currentCallContactId: string) => void;
};

type VideoCallStreamStore = {
  remote: JitsiMeetJS.JitsiTrack[];
  local: JitsiMeetJS.JitsiTrack | null;
  localAudio: JitsiMeetJS.JitsiTrack | null;
  addRemote: (track: JitsiMeetJS.JitsiTrack) => void;
  removeRemote: (track: JitsiMeetJS.JitsiTrack) => void;
  setLocal: (track: JitsiMeetJS.JitsiTrack) => void;
  removeLocal: (track: JitsiMeetJS.JitsiTrack) => void;
  setLocalAudio: (track: JitsiMeetJS.JitsiTrack) => void;
};

export const useVideoCallStreamStore = create<VideoCallStreamStore>()(
  (set, get) => ({
    remote: [],
    local: null,
    addRemote: (track) => set({ remote: [...get().remote, track] }),
    removeRemote: (track) => {
      const remote = get().remote;

      const filtered = remote.filter(
        (rtrack) => rtrack.getTrack().id === track.getTrack().id
      );

      set({ remote: filtered });
    },
    setLocal: (track) => set({ local: track }),
    removeLocal: () => set({ local: null }),
    localAudio: null,
    setLocalAudio: (track) => set({ localAudio: track }),
  })
);

export const useVideoCallStore = create<VideoCallStore>()((set) => ({
  currentCallContactId: null,
  setCurrentCallContactId: (currentCallContactId) =>
    set({ currentCallContactId }),
}));
