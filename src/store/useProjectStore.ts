import { create } from "zustand";
import { ProjectState, RenderSettings, WaveformConfig } from "./types";
import { defaultProject } from "./defaults";

interface Actions {
  setRender: (p: Partial<RenderSettings>) => void;
  setWaveform: (p: Partial<WaveformConfig>) => void;
  setBgRelevancy: (v: number) => void;
  reset: () => void;
}

export const useProjectStore = create<ProjectState & Actions>((set) => ({
  ...defaultProject,

  setRender: (p) =>
    set((s) => ({ render: { ...s.render, ...p } })),

  setWaveform: (p) =>
    set((s) => ({ waveform: { ...s.waveform, ...p } })),

  setBgRelevancy: (v) => set({ bgRelevancy: v }),

  reset: () => set(defaultProject),

// --- add to existing ProjectState interface ---
fps: 10 | 24 | 30;
setFps: (fps: 10 | 24 | 30) => void;

speakers: SpeakerConfig[];
updateSpeaker: (id: string, patch: Partial<SpeakerConfig>) => void;

// --- add SpeakerConfig type ---
export interface SpeakerConfig {
  id: string;
  label: string;              // "Male Dog" / "Female"
  sheetUrl: string;
  bgOpacity: number;          // default 0
  borderOpacity: number;      // default 1
  bgColor: string;
  borderColor: string;
  x: number; y: number; size: number; // canvas position
}

// --- add to store impl ---
fps: 24,
setFps: (fps) => set({ fps }),
speakers: [],
updateSpeaker: (id, patch) => set((s) => ({
  speakers: s.speakers.map(sp => sp.id === id ? { ...sp, ...patch } : sp),
})),

