import { create } from "zustand";

export interface ChatterboxVoice {
  id: string;
  label: string;
}

// Discovered Chatterbox predefined voices + reference audio files — derived
// from querying the running server, not a user fact, so deliberately NOT
// persisted. Shared between ChatterboxTestPanel (which populates it once
// the server starts) and the per-speaker voice picker in App.tsx.

interface ChatterboxVoicesState {
  predefinedVoices: ChatterboxVoice[];
  referenceFiles: ChatterboxVoice[];
  serverRunning: boolean;
  refresh: () => Promise<void>;
}

export const useChatterboxVoicesStore = create<ChatterboxVoicesState>((set, get) => ({
  predefinedVoices: [],
  referenceFiles: [],
  serverRunning: false,

  /**
   * Ask the server whether it is there, and pick up its voices if it is.
   *
   * SAFE TO CALL ON A TIMER, which is the point. `serverRunning` used to be
   * set once — when Start Server succeeded — and never revisited, so the panel
   * kept showing "running ✓" after the server had gone and every request
   * failed with "failed to fetch" underneath a green tick. The server goes away
   * more often than you'd think: in dev, any main-process edit restarts
   * Electron and takes its child with it.
   *
   * The voice lists are only re-fetched when they're actually needed — on the
   * transition from down to up, or if they somehow ended up empty. A poll that
   * pulled two lists every few seconds would be a poll nobody could leave on.
   */
  refresh: async () => {
    const running = await window.byok?.tts?.chatterbox?.isRunning().catch(() => false);
    const was = get().serverRunning;
    set({ serverRunning: !!running });

    if (!running) {
      // Don't keep offering voices from a server that isn't there — picking one
      // would only fail later, further from the cause.
      if (was) set({ predefinedVoices: [], referenceFiles: [] });
      return;
    }

    const needLists = !was || get().predefinedVoices.length === 0;
    if (!needLists) return;

    const [predefined, refs] = await Promise.all([
      window.byok.tts.chatterbox.listPredefinedVoices(),
      window.byok.tts.chatterbox.listReferenceAudio(),
    ]);
    set({ predefinedVoices: predefined, referenceFiles: refs });
  },
}));
