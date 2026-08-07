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
  BackgroundScene,
  SfxClip,
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
  const lane = i === 0 ? 0 : i % 2 === 1 ? 1 : -1;
  return {
    ...sp,
    size,
    outlineShape: sp.outlineShape ?? "circle",
    // The waveform is merged OVER the defaults, not swapped in only when it is
    // missing entirely. A save written before `thickness`, `smoothing`, `lane`
    // or `sparkle` existed keeps every field it does have and gains the rest.
    //
    // Leaving them undefined is not a cosmetic gap: `lane` feeds a coordinate
    // multiply and `thickness` a stroke width, so undefined propagates as NaN
    // and the waveform silently renders NOTHING — no error, no clue, just a
    // missing waveform on a project that used to have one. Confirmed against a
    // real pre-branch autosave shape.
    waveform: { ...defaultTrackWaveform(lane), ...(sp.waveform ?? {}) },
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
  setMusic: (m: ProjectState["music"]) => void;
  setMusicMix: (p: { volume?: number; duck?: number }) => void;
  addSfx: (clip: Omit<SfxClip, "id">) => void;
  updateSfx: (id: string, patch: Partial<Omit<SfxClip, "id">>) => void;
  removeSfx: (id: string) => void;
  addSpeaker: () => void;
  /** Add a speaker from the library — everything except where they stand,
   *  which is assigned here so a recalled cast doesn't stack in one spot. */
  addSpeakerFrom: (preset: Omit<SpeakerConfig, "id" | "x" | "y">) => void;
  setBackgrounds: (scenes: BackgroundScene[]) => void;
  /** The two knobs that decide how the clips *look*, as opposed to which ones
   *  they are. One setter because they are always adjusted from the same place
   *  and neither is meaningful without the other. */
  setBackgroundStyle: (p: { dim?: number; crossfadeMs?: number }) => void;
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

  // Setting narration also gives a length to any background that was picked
  // before there was one.
  //
  // "Search by hand" stamps a whole-video clip with `endMs` read from the
  // narration, and with no narration that is 0. backgroundTiming() then drops
  // every clip whose endMs isn't greater than its startMs — correctly, since a
  // zero-length clip has no frames to draw — so the clip vanished from the
  // preview AND the render and stayed vanished, because nothing recomputed it
  // once the narration finally existed. Picking a background before writing the
  // script is not a mistake; silently keeping a dead clip is.
  //
  // Only spans that are still unresolved are touched (start 0, no usable end).
  // A clip with a real range was either planned per scene or trimmed by hand,
  // and neither should be overwritten just because narration was regenerated.
  setNarration: (narration) =>
    set((s) => {
      const endMs = narration?.segments.at(-1)?.endMs ?? 0;
      if (endMs <= 0) return { narration };
      let changed = false;
      const backgrounds = s.backgrounds.map((b) => {
        if (b.startMs === 0 && !(b.endMs > 0)) {
          changed = true;
          return { ...b, endMs };
        }
        return b;
      });
      return changed ? { narration, backgrounds } : { narration };
    }),

  setBackgrounds: (backgrounds) => set({ backgrounds }),

  setBackgroundStyle: (p) =>
    set((s) => ({
      backgroundDim: p.dim ?? s.backgroundDim,
      backgroundCrossfadeMs: p.crossfadeMs ?? s.backgroundCrossfadeMs,
    })),

  setAttachedAudio: (attachedAudio) => set({ attachedAudio }),

  setMusic: (music) => set({ music }),

  setMusicMix: (p) =>
    set((s) => ({
      musicVolume: p.volume ?? s.musicVolume,
      musicDuck: p.duck ?? s.musicDuck,
    })),

  addSfx: (clip) =>
    set((s) => ({ sfx: [...s.sfx, { ...clip, id: crypto.randomUUID() }] })),

  updateSfx: (id, patch) =>
    set((s) => ({ sfx: s.sfx.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),

  removeSfx: (id) => set((s) => ({ sfx: s.sfx.filter((c) => c.id !== id) })),

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
      backgroundDim: snap.backgroundDim ?? s.backgroundDim,
      backgroundCrossfadeMs: snap.backgroundCrossfadeMs ?? s.backgroundCrossfadeMs,
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
        // Worth persisting: the clips themselves are already cached under
        // userData by provider and id, so what is saved here is a few hundred
        // bytes of timing that points at files still on disk. Losing it means
        // re-planning and re-downloading a background set that never changed.
        backgrounds: s.backgrounds,
        backgroundDim: s.backgroundDim,
        backgroundCrossfadeMs: s.backgroundCrossfadeMs,
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
        // Same deal as the narration: the path survives, the megabytes don't.
        // App.tsx re-analyses on startup.
        music: s.music ? { filePath: s.music.filePath, analysis: null } : null,
        musicVolume: s.musicVolume,
        musicDuck: s.musicDuck,
        sfx: s.sfx,
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
