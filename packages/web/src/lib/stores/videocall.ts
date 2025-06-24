import { create } from 'zustand';

type VideoCallStore = {
  videoStreams: {
    local: MediaStream | null;
    remote: MediaStream[];
  };
  setVideoStream: (stream: MediaStream, type: 'local' | 'remote') => void;
};
export const useVideoCallStore = create<VideoCallStore>()((set, get) => ({
  videoStreams: {
    local: null,
    remote: [],
  },

  setVideoStream: (stream, type) => {
    const state = get();
    let change = {};

    if (type === 'local') {
      change = { local: stream };
    }

    if (type === 'remote') {
      change = {
        videoStreams: { remote: [...state.videoStreams.remote, stream] },
      };
    }
    set({ videoStreams: { ...{ ...state.videoStreams, ...change } } });
  },
}));
