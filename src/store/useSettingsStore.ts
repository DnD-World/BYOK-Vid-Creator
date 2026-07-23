import { create } from "zustand";
import { persist } from "zustand/middleware";
import { BackendDefaults } from "./settingsTypes";

// Non-secret backend preferences only. API keys live exclusively in the
// Electron-side encrypted vault (see electron/keyStore.ts + BackendPanel,
// which talk to it via window.byok.keys) — never in this zustand store or
// localStorage, since that would defeat the point of OS-level encryption.

interface SettingsState {
  defaults: BackendDefaults;
  setDefault: <K extends keyof BackendDefaults>(
    k: K,
    v: BackendDefaults[K]
  ) => void;
  /** Hex string, e.g. "#e8a24a". Drives the --accent-*-rgb CSS variables
   *  applied in App.tsx, which every accent-* Tailwind class reads from. */
  accentColor: string;
  setAccentColor: (hex: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      defaults: {
        ttsPrimary: "coqui-xtts-v2",
        ttsFallback: "piper",
        llmScenePlanner: "glm-5.2",
        defaultTransition: "fade_zoom",
        storageTarget: "local",
        azureRegion: "",
        piperPythonPath: "python3",
        piperVoicesDir: "",
      },
      setDefault: (k, v) =>
        set((s) => ({ defaults: { ...s.defaults, [k]: v } })),

      accentColor: "#e8a24a",
      setAccentColor: (hex) => set({ accentColor: hex }),
    }),
    { name: "byok-settings" } // saved to localStorage, survives restarts
  )
);
