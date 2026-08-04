import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  ProjectState,
  RenderSettings,
  SpeakerConfig,
  SubtitleConfig,
  TrackWaveform,
  Fps,
  NarrationResult,
} from "./types";
import type { ProjectPreset } from "./templatesTypes";
import { defaultProject } from "./defaults";
import { defaultTrackWaveform } from "../lib/waveform/buildTracks";

const SPEAKER_COLORS = ["#e8a24a", "#4ac2e8"]; // speaker1 / speaker2 from tailwind theme

/** Templates saved before `size` became a fraction hold raw preview pixels
 *  (e.g. 160). Valid fractions are 0–1, so anything above 1 is unambiguously
 *  a legacy value — convert it against the preview canvas width it was
 *  authored on. Templates persist in localStorage, so this can't be skipped
 *  by assuming a fresh install. */
const LEGACY_AUTHORED_WIDTH = 560;

/** Brings a speaker from any older preset up to the current shape: pixel sizes
 *  become fractions, and speakers saved before waveforms moved onto them get a
 *  default one rather than crashing the renderer with an undefined config. */
function migrateSpeaker(sp: SpeakerConfig, i: number): SpeakerConfig {
  const size = sp.size > 1 ? Math.min(1, sp.size / LEGACY_AUTHORED_WIDTH) : sp.size;
  return {
    ...sp,
    size,
    outlineShape: sp.outlineShape ?? "circle",
    waveform: sp.waveform ?? defaultTrackWaveform(i === 0 ? 0 : i % 2 === 1 ? 1 : -1),
  };
}

interface Actions {
  setRender: (p: Partial<RenderSettings>) => void;
  setMusicWaveform: (p: Partial<TrackWaveform>) => void;
  setMusicColor: (c: string) => void;
  /** Patch one speaker's own waveform. Kept separate from updateSpeaker so
   *  callers don't have to spread the nested object by hand every time. */
  setSpeakerWaveform: (id: string, p: Partial<TrackWaveform>) => void;
  setSubtitles: (p: Partial<SubtitleConfig>) => void;
  setBgRelevancy: (v: number) => void;
  setPauses: (p: { sameMs?: number; turnMs?: number }) => void;
  setVisemeFadeMs: (v: number) => void;
  setIdleMotion: (v: number) => void;
  setFps: (fps: Fps) => void;
  setScript: (text: string) => void;
  setLanguage: (lang: string) => void;
  setNarration: (n: NarrationResult | null) => void;
  setAttachedAudio: (a: ProjectState["attachedAudio"]) => void;
  addSpeaker: () => void;
  /** Add a speaker from the library — everything except where they stand,
   *  which is assigned here so a recalled cast doesn't stack in one spot. */
  addSpeakerFrom: (preset: Omit<SpeakerConfig, "id" | "x" | "y">) => void;
  removeSpeaker: (id: string) => void;
  updateSpeaker: (id: string, patch: Partial<SpeakerConfig>) => void;
  loadSnapshot: (snap: ProjectPreset) => void;
  /** Replace the whole project — used by "Open project…". */
  loadProject: (p: Partial<ProjectState>) => void;
  reset: () => void;
}

export const useProjectStore = create<ProjectState & Actions>()(
  persist(
    (set) => ({
  ...defaultProject,

  setRender: (p) => set((s) => ({ render: { ...s.render, ...p } })),

  setMusicWaveform: (p) => set((s) => ({ musicWaveform: { ...s.musicWaveform, ...p } })),

  setMusicColor: (musicColor) => set({ musicColor }),

  setSpeakerWaveform: (id, p) =>
    set((s) => ({
      speakers: s.speakers.map((sp) =>
        sp.id === id ? { ...sp, waveform: { ...sp.waveform, ...p } } : sp
      ),
    })),

  setSubtitles: (p) => set((s) => ({ subtitles: { ...s.subtitles, ...p } })),

  setBgRelevancy: (v) => set({ bgRelevancy: v }),

  setPauses: (p) =>
    set((s) => ({
      pauseSameMs: p.sameMs ?? s.pauseSameMs,
      pauseTurnMs: p.turnMs ?? s.pauseTurnMs,
    })),

  setVisemeFadeMs: (visemeFadeMs) => set({ visemeFadeMs }),

  setIdleMotion: (idleMotion) => set({ idleMotion }),

  setFps: (fps) => set({ fps }),

  setScript: (text) => set({ script: text }),

  setLanguage: (lang) => set({ language: lang }),

  setNarration: (narration) => set({ narration }),

  setAttachedAudio: (attachedAudio) => set({ attachedAudio }),

  addSpeaker: () =>
    set((s) => {
      const n = s.speakers.length;
      const next: SpeakerConfig = {
        id: crypto.randomUUID(),
        label: `Speaker ${n + 1}`,
        sheetPath: undefined,
        bgOpacity: 0,
        borderOpacity: 1,
        bgColor: "#1a1a1a",
        borderColor: SPEAKER_COLORS[n % SPEAKER_COLORS.length],
        // x/y are 0–1 fractions of the frame, so position holds up across
        // any output resolution. Alternate left/right so new speakers don't
        // stack on top of each other.
        x: n % 2 === 0 ? 0.3 : 0.7,
        y: 0.6,
        // Fraction of frame width, like x/y — not pixels.
        size: 0.28,
        outlineShape: "circle",
        // Alternate lanes so a second speaker's waveform doesn't draw exactly
        // on top of the first one's.
        waveform: defaultTrackWaveform(n === 0 ? 0 : n % 2 === 1 ? 1 : -1),
      };
      return { speakers: [...s.speakers, next] };
    }),

  addSpeakerFrom: (preset) =>
    set((s) => {
      const n = s.speakers.length;
      return {
        speakers: [
          ...s.speakers,
          {
            ...preset,
            id: crypto.randomUUID(),
            x: n % 2 === 0 ? 0.3 : 0.7,
            y: 0.6,
          },
        ],
      };
    }),

  removeSpeaker: (id) =>
    set((s) => ({ speakers: s.speakers.filter((sp) => sp.id !== id) })),

  updateSpeaker: (id, patch) =>
    set((s) => ({
      speakers: s.speakers.map((sp) =>
        sp.id === id ? { ...sp, ...patch } : sp
      ),
    })),

  // Every field falls back to the current default, so a partial or older
  // preset loads rather than throwing or blanking the project.
  loadSnapshot: (snap) =>
    set((s) => ({
      render: snap.render ?? s.render,
      fps: snap.fps ?? s.fps,
      musicWaveform: snap.musicWaveform ?? defaultProject.musicWaveform,
      musicColor: snap.musicColor ?? defaultProject.musicColor,
      subtitles: snap.subtitles ?? s.subtitles,
      speakers: (snap.speakers ?? s.speakers).map(migrateSpeaker),
    })),

  loadProject: (p) =>
    set(() => ({
      ...defaultProject,
      ...p,
      // Nested objects get merged over the defaults rather than replacing them,
      // so a project saved before a field existed still opens with that field
      // at its default instead of undefined. Same shallow-merge trap that made
      // "Scan for Voices" un-clickable; it is not getting a second outing.
      render: { ...defaultProject.render, ...(p.render ?? {}) },
      subtitles: { ...defaultProject.subtitles, ...(p.subtitles ?? {}) },
      musicWaveform: { ...defaultProject.musicWaveform, ...(p.musicWaveform ?? {}) },
      speakers: (p.speakers ?? []).map(migrateSpeaker),
    })),

  reset: () => set(defaultProject),
    }),
    {
      name: "byok-project", // the autosave
      version: 1,

      // The analysis is deliberately dropped: for a ten-minute narration it is
      // megabytes of base64 spectrum, and localStorage has single-digit MB to
      // give. The WAV it came from is still on disk, so App.tsx re-analyses it
      // on startup — a second of work rather than a quota error that silently
      // stops every future autosave.
      partialize: (s) => ({
        render: s.render,
        musicWaveform: s.musicWaveform,
        musicColor: s.musicColor,
        subtitles: s.subtitles,
        bgRelevancy: s.bgRelevancy,
        pauseSameMs: s.pauseSameMs,
        pauseTurnMs: s.pauseTurnMs,
        visemeFadeMs: s.visemeFadeMs,
        idleMotion: s.idleMotion,
        fps: s.fps,
        speakers: s.speakers,
        script: s.script,
        language: s.language,
        narration: s.narration
          ? { filePath: s.narration.filePath, segments: s.narration.segments, analysis: null }
          : null,
        attachedAudio: s.attachedAudio
          ? { filePath: s.attachedAudio.filePath, analysis: null }
          : null,
      }),

      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<ProjectState>;
        return {
          ...current,
          ...p,
          render: { ...current.render, ...(p.render ?? {}) },
          subtitles: { ...current.subtitles, ...(p.subtitles ?? {}) },
          musicWaveform: { ...current.musicWaveform, ...(p.musicWaveform ?? {}) },
          speakers: (p.speakers ?? current.speakers).map(migrateSpeaker),
        };
      },
    }
  )
);
