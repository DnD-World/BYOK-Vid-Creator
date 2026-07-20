import { create } from "zustand";
import { createProjectSlice, ProjectSlice } from "./slices/project";
import { createSpeakerSlice, SpeakerSlice } from "./slices/speakers";
import { createWaveformSlice, WaveformSlice } from "./slices/waveform";
import { createSubtitleSlice, SubtitleSlice } from "./slices/subtitles";
import { createAudioSlice, AudioSlice } from "./slices/audio";
import { createBackgroundSlice, BackgroundSlice } from "./slices/background";
import { createSettingsSlice, SettingsSlice } from "./slices/settings";

export type Store = ProjectSlice &
  SpeakerSlice &
  WaveformSlice &
  SubtitleSlice &
  AudioSlice &
  BackgroundSlice &
  SettingsSlice;

export const useStore = create<Store>()((...a) => ({
  ...createProjectSlice(...a),
  ...createSpeakerSlice(...a),
  ...createWaveformSlice(...a),
  ...createSubtitleSlice(...a),
  ...createAudioSlice(...a),
  ...createBackgroundSlice(...a),
  ...createSettingsSlice(...a),
}));
