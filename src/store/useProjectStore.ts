import { create } from "zustand";
import {
  ProjectState,
  RenderSettings,
  WaveformConfig,
  SpeakerConfig,
  SubtitleConfig,
  Fps,
  NarrationResult,
} from "./types";
import { defaultProject } from "./defaults";

const SPEAKER_COLORS = ["#e8a24a", "#4ac2e8"]; // speaker1 / speaker2 from tailwind theme

/** Templates saved before `size` became a fraction hold raw preview pixels
 *  (e.g. 160). Valid fractions are 0–1, so anything above 1 is unambiguously
 *  a legacy value — convert it against the preview canvas width it was
 *  authored on. Templates persist in localStorage, so this can't be skipped
 *  by assuming a fresh install. */
const LEGACY_AUTHORED_WIDTH = 560;

function normalizeSpeakerSize(sp: SpeakerConfig): SpeakerConfig {
  if (sp.size > 1) {
    return { ...sp, size: Math.min(1, sp.size / LEGACY_AUTHORED_WIDTH) };
  }
  return sp;
}

interface Actions {
  setRender: (p: Partial<RenderSettings>) => void;
  setWaveform: (p: Partial<WaveformConfig>) => void;
  setSubtitles: (p: Partial<SubtitleConfig>) => void;
  setBgRelevancy: (v: number) => void;
  setFps: (fps: Fps) => void;
  setScript: (text: string) => void;
  setLanguage: (lang: string) => void;
  setNarration: (n: NarrationResult | null) => void;
  setAttachedAudio: (a: ProjectState["attachedAudio"]) => void;
  addSpeaker: () => void;
  removeSpeaker: (id: string) => void;
  updateSpeaker: (id: string, patch: Partial<SpeakerConfig>) => void;
  loadSnapshot: (snap: {
    render: RenderSettings;
    fps: Fps;
    waveform: WaveformConfig;
    speakers: SpeakerConfig[];
  }) => void;
  reset: () => void;
}

export const useProjectStore = create<ProjectState & Actions>((set) => ({
  ...defaultProject,

  setRender: (p) => set((s) => ({ render: { ...s.render, ...p } })),

  setWaveform: (p) => set((s) => ({ waveform: { ...s.waveform, ...p } })),

  setSubtitles: (p) => set((s) => ({ subtitles: { ...s.subtitles, ...p } })),

  setBgRelevancy: (v) => set({ bgRelevancy: v }),

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
      };
      return { speakers: [...s.speakers, next] };
    }),

  removeSpeaker: (id) =>
    set((s) => ({ speakers: s.speakers.filter((sp) => sp.id !== id) })),

  updateSpeaker: (id, patch) =>
    set((s) => ({
      speakers: s.speakers.map((sp) =>
        sp.id === id ? { ...sp, ...patch } : sp
      ),
    })),

  loadSnapshot: (snap) =>
    set({
      render: snap.render,
      fps: snap.fps,
      waveform: snap.waveform,
      speakers: snap.speakers.map(normalizeSpeakerSize),
    }),

  reset: () => set(defaultProject),
}));
