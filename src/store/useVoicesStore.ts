import { create } from "zustand";

export interface Voice {
  id: string;
  name: string;
  onnxPath: string;
}

// Discovered Piper voices — derived from scanning disk, not a user fact,
// so this is deliberately NOT persisted. Shared between the TTS test panel
// and the per-speaker voice picker so both see the same scanned list.

interface VoicesState {
  voices: Voice[];
  scanning: boolean;
  error: string | null;
  scan: (dir: string) => Promise<void>;
}

export const useVoicesStore = create<VoicesState>((set) => ({
  voices: [],
  scanning: false,
  error: null,
  scan: async (dir: string) => {
    set({ scanning: true, error: null });
    try {
      const found = await window.byok.tts.listPiperVoices(dir);
      set({
        voices: found,
        error: found.length === 0 ? "No .onnx voice models found in that folder." : null,
      });
    } catch (e: any) {
      set({ error: e?.message ?? String(e) });
    } finally {
      set({ scanning: false });
    }
  },
}));
