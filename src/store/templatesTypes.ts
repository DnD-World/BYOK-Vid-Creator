import { RenderSettings, WaveformConfig, SpeakerConfig, Fps } from "./types";

/** A saved snapshot of the "look" of a project: render settings, waveform
 *  config, and speaker setup. Deliberately excludes backend defaults
 *  (TTS/LLM provider choices) and API keys — those live elsewhere. */
export interface ProjectTemplate {
  render: RenderSettings;
  fps: Fps;
  waveform: WaveformConfig;
  speakers: SpeakerConfig[];
  savedAt: number; // Date.now(), for display/sorting only
}
