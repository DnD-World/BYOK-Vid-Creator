import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ProjectTemplate } from "./templatesTypes";

// Saved project templates (render + waveform + speaker setup). Non-secret —
// persisted the same way as other app settings (localStorage via zustand).
// API keys are NOT part of this and never touch this store.

interface TemplatesState {
  templates: Record<string, ProjectTemplate>;
  saveTemplate: (name: string, snapshot: Omit<ProjectTemplate, "savedAt">) => void;
  deleteTemplate: (name: string) => void;
}

export const useTemplatesStore = create<TemplatesState>()(
  persist(
    (set) => ({
      templates: {},
      saveTemplate: (name, snapshot) =>
        set((s) => ({
          templates: {
            ...s.templates,
            [name]: { ...snapshot, savedAt: Date.now() },
          },
        })),
      deleteTemplate: (name) =>
        set((s) => {
          const next = { ...s.templates };
          delete next[name];
          return { templates: next };
        }),
    }),
    { name: "byok-templates" }
  )
);
