import { create } from "zustand";
import {
  ProjectState,
  RenderSettings,
  WaveformConfig,
  SpeakerConfig,
  Fps,
} from "./types";
import { defaultProject } from "./defaults";

interface Actions {
  setRender: (p: Partial<RenderSettings>) => void;
  setWaveform: (p: Partial<WaveformConfig>) => void;
  setBgRelevancy: (v: number) => void;
  setFps: (fps: Fps) => void;
  updateSpeaker: (id: string, patch: Partial<SpeakerConfig>) => void;
  reset: () => void;
}

export const useProjectStore = create<ProjectState & Actions>((set) => ({
  ...defaultProject,

  setRender: (p) => set((s) => ({ render: { ...s.render, ...p } })),

  setWaveform: (p) => set((s) => ({ waveform: { ...s.waveform, ...p } })),

  setBgRelevancy: (v) => set({ bgRelevancy: v }),

  setFps: (fps) => set({ fps }),

  updateSpeaker: (id, patch) =>
    set((s) => ({
      speakers: s.speakers.map((sp) =>
        sp.id === id ? { ...sp, ...patch } : sp
      ),
    })),

  reset: () => set(defaultProject),
}));
