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
  /** Gates the breathing glow / click flash / corner flare motion effects,
   *  independent of the OS-level prefers-reduced-motion (which always wins
   *  regardless of this). Default on. */
  motionEnabled: boolean;
  setMotionEnabled: (v: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      defaults: {
        ttsPrimary: "chatterbox-multilingual",
        ttsFallback: "piper",
        llmScenePlanner: "glm-5.2",
        defaultTransition: "fade_zoom",
        storageTarget: "local",
        azureRegion: "",
        // Dedicated venv shipped alongside the app. Deliberately NOT bare
        // "python"/"python3": on a machine with several tools installed, that
        // resolves to whichever venv happens to be first on PATH, and Piper's
        // long-lived server process then holds that unrelated environment's
        // files open — which is exactly what blocked an unrelated tool from
        // updating until its python was killed by hand.
        piperPythonPath: "./piper-venv/Scripts/python.exe",
        piperVoicesDir: "./piper-voices",
        chatterboxInstallPath: "",
        chatterboxPort: 8004,
        chatterboxExaggeration: 0.5,
        chatterboxCfgWeight: 0.5,
      },
      setDefault: (k, v) =>
        set((s) => ({ defaults: { ...s.defaults, [k]: v } })),

      accentColor: "#e8a24a",
      setAccentColor: (hex) => set({ accentColor: hex }),

      motionEnabled: true,
      setMotionEnabled: (v) => set({ motionEnabled: v }),
    }),
    { name: "byok-settings" } // saved to localStorage, survives restarts
  )
);
