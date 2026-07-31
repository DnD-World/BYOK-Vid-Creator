// ---------------------------------------------------------------------------
// Saved speakers — a face plus a voice plus a look, reusable across projects.
//
// The point is narrow and worth stating: setting up a speaker means picking a
// 15MB sprite sheet off disk, choosing an engine, choosing a voice, and tuning
// two colours and a frame. Doing that again for every video is the single most
// repetitive thing in the app, and none of it is project-specific.
//
// Stored by id rather than by name so renaming a saved speaker doesn't orphan
// it, and separately from the project so it survives Reset.
// ---------------------------------------------------------------------------

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SpeakerConfig } from "./types";

/** Everything about a speaker except where they stand in this particular
 *  video. Position is left out on purpose — it is a property of a shot, not of
 *  a character, and inheriting it would drop every recalled speaker on top of
 *  the last one. */
export type SavedSpeaker = Omit<SpeakerConfig, "id" | "x" | "y"> & {
  savedId: string;
  savedAt: number;
};

interface State {
  speakers: SavedSpeaker[];
  save: (sp: SpeakerConfig) => void;
  remove: (savedId: string) => void;
  rename: (savedId: string, label: string) => void;
}

export const useSpeakerLibraryStore = create<State>()(
  persist(
    (set) => ({
      speakers: [],

      // Saving the same label twice replaces rather than duplicates — the
      // common case is tweaking a character and re-saving, and a library full
      // of "Καίτη", "Καίτη", "Καίτη" helps nobody.
      save: (sp) =>
        set((s) => {
          const { id: _id, x: _x, y: _y, ...rest } = sp;
          const entry: SavedSpeaker = {
            ...rest,
            savedId: crypto.randomUUID(),
            savedAt: Date.now(),
          };
          const others = s.speakers.filter(
            (e) => e.label.trim().toLowerCase() !== sp.label.trim().toLowerCase()
          );
          return { speakers: [entry, ...others] };
        }),

      remove: (savedId) =>
        set((s) => ({ speakers: s.speakers.filter((e) => e.savedId !== savedId) })),

      rename: (savedId, label) =>
        set((s) => ({
          speakers: s.speakers.map((e) => (e.savedId === savedId ? { ...e, label } : e)),
        })),
    }),
    { name: "byok-speaker-library", version: 1 }
  )
);
