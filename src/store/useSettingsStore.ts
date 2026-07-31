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

const INITIAL_DEFAULTS: BackendDefaults = {
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
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      defaults: INITIAL_DEFAULTS,
      setDefault: (k, v) =>
        set((s) => ({ defaults: { ...s.defaults, [k]: v } })),

      accentColor: "#e8a24a",
      setAccentColor: (hex) => set({ accentColor: hex }),

      motionEnabled: true,
      setMotionEnabled: (v) => set({ motionEnabled: v }),
    }),
    {
      name: "byok-settings", // saved to localStorage, survives restarts
      version: 1,

      // persist's default merge is SHALLOW, so the whole `defaults` object came
      // from localStorage and every value added or changed since that blob was
      // written was silently shadowed. On this machine that meant an empty
      // piperVoicesDir (so "Scan for Voices" was disabled forever, with nothing
      // on screen saying why) and a bare "python3" — the exact value the comment
      // above exists to prevent. Deep-merging `defaults` means a field added in
      // a later version always arrives with its default.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SettingsState>;
        return {
          ...current,
          ...p,
          defaults: { ...current.defaults, ...(p.defaults ?? {}) },
        };
      },

      // v0 blobs carry stale bundled-Piper paths. Dropping them lets the current
      // defaults apply once; anything the user sets afterwards persists normally.
      migrate: (persisted, version) => {
        if (version === 0 && persisted && typeof persisted === "object") {
          const state = persisted as { defaults?: Partial<BackendDefaults> };
          if (state.defaults) {
            const { piperPythonPath: _p, piperVoicesDir: _v, ...rest } = state.defaults;
            return { ...state, defaults: rest };
          }
        }
        return persisted;
      },
    }
  )
);
