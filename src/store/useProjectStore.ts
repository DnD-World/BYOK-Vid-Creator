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
}));
