import { create } from "zustand";
import {
  ProjectState,
  RenderSettings,
  WaveformConfig,
  SpeakerConfig,
  Fps,
} from "./types";
import { defaultProject } from "./defaults";

const SPEAKER_COLORS = ["#e8a24a", "#4ac2e8"]; // speaker1 / speaker2 from tailwind theme

interface Actions {
  setRender: (p: Partial<RenderSettings>) => void;
  setWaveform: (p: Partial<WaveformConfig>) => void;
  setBgRelevancy: (v: number) => void;
  setFps: (fps: Fps) => void;
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

  setBgRelevancy: (v) => set({ bgRelevancy: v }),

  setFps: (fps) => set({ fps }),

  addSpeaker: () =>
    set((s) => {
      const n = s.speakers.length;
      const next: SpeakerConfig = {
        id: crypto.randomUUID(),
        label: `Speaker ${n + 1}`,
        sheetUrl: "",
        bgOpacity: 0,
        borderOpacity: 1,
        bgColor: "#1a1a1a",
        borderColor: SPEAKER_COLORS[n % SPEAKER_COLORS.length],
        // x/y are 0–1 fractions of the frame, so position holds up across
        // any output resolution. Alternate left/right so new speakers don't
        // stack on top of each other.
        x: n % 2 === 0 ? 0.3 : 0.7,
        y: 0.6,
        size: 160,
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
      speakers: snap.speakers,
    }),

  reset: () => set(defaultProject),
}));
