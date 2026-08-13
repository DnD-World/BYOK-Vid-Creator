import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ProjectTemplate } from "./templatesTypes";
import { builtinPresets } from "./builtinPresets";

// Saved presets — everything that decides how a video LOOKS, and nothing about
// what it says. Non-secret, persisted the same way as other app settings
// (localStorage via zustand). API keys are NOT part of this and never touch
// this store.
//
// The nine built-ins are seeded in here rather than living as a separate list
// the panel has to merge. After seeding there is exactly one kind of preset:
// editing a built-in edits a stored preset like any other, deleting one
// deletes it, and resetting copies the code version back over it. A panel that
// had to reason about two kinds is how "you can use these but not change them"
// happened in the first place.

interface TemplatesState {
  templates: Record<string, ProjectTemplate>;
  saveTemplate: (name: string, snapshot: Omit<ProjectTemplate, "savedAt">) => void;
  deleteTemplate: (name: string) => void;
  /** Put a built-in back the way it shipped. Does nothing for a preset that
   *  was never a built-in — there is no default to return to. */
  resetToDefault: (name: string) => void;
  /** Add any built-in the stored set is missing, without touching edits to the
   *  ones already there. Runs on rehydrate, so a new built-in in a later
   *  version arrives without a reinstall and without overwriting your work. */
  seedBuiltins: () => void;
}

function builtinsByName(): Record<string, ProjectTemplate> {
  const out: Record<string, ProjectTemplate> = {};
  for (const { name, ...preset } of builtinPresets()) out[name] = preset;
  return out;
}

export const useTemplatesStore = create<TemplatesState>()(
  persist(
    (set) => ({
      templates: {},
      saveTemplate: (name, snapshot) =>
        set((s) => ({
          templates: {
            ...s.templates,
            // builtIn survives an edit. It is not a claim that the preset is
            // untouched — it is what makes "Reset to default" know there is a
            // default to find.
            [name]: { ...snapshot, builtIn: s.templates[name]?.builtIn, savedAt: Date.now() },
          },
        })),
      deleteTemplate: (name) =>
        set((s) => {
          const next = { ...s.templates };
          delete next[name];
          return { templates: next };
        }),
      resetToDefault: (name) =>
        set((s) => {
          const original = builtinsByName()[name];
          if (!original) return s;
          return { templates: { ...s.templates, [name]: { ...original, savedAt: Date.now() } } };
        }),
      seedBuiltins: () =>
        set((s) => {
          const next = { ...s.templates };
          for (const [name, preset] of Object.entries(builtinsByName())) {
            // Missing only. A built-in you edited is yours, and a deleted one
            // coming back on next launch would be a bug, not a feature — so
            // deleting a built-in has to survive too. That is the cost of
            // seeding on rehydrate, and it is paid in the panel: deleting a
            // built-in is offered as "Reset", never as "Delete".
            if (!(name in next)) next[name] = { ...preset, savedAt: Date.now() };
          }
          return { templates: next };
        }),
    }),
    {
      name: "byok-templates",
      onRehydrateStorage: () => (state) => {
        state?.seedBuiltins();
      },
    }
  )
);
