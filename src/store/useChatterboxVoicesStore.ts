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

export const useChatterboxVoicesStore = create<ChatterboxVoicesState>((set) => ({
  predefinedVoices: [],
  referenceFiles: [],
  serverRunning: false,
  refresh: async () => {
    const running = await window.byok.tts.chatterbox.isRunning();
    set({ serverRunning: running });
    if (!running) return;
    const [predefined, refs] = await Promise.all([
      window.byok.tts.chatterbox.listPredefinedVoices(),
      window.byok.tts.chatterbox.listReferenceAudio(),
    ]);
    set({ predefinedVoices: predefined, referenceFiles: refs });
  },
}));
