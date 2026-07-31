import { ProjectState } from "./types";
import { defaultTrackWaveform } from "../lib/waveform/buildTracks";

export const defaultProject: ProjectState = {
  render: {
    format: "9:16",
    width: 1080,
    height: 1920,
    durationSec: 180,
    engine: "remotion",
  },
  // Music defaults to off: most projects start with narration only, and an
  // always-animating track with no music behind it looks broken.
  musicWaveform: { ...defaultTrackWaveform(0), enabled: false, style: "lines", position: "bottom" },
  musicColor: "#8a8a8a",
  subtitles: {
    enabled: true,
    position: "bottom",
    fontSize: 0.055,
    color: "#ffffff",
    activeColor: "#ff9a3c",
    strokeColor: "#000000",
    strokeWidth: 0.14,
    activeGlow: 0.6,
    activeFromSpeaker: true,
    uppercase: false,
    maxChars: 42,
  },
  bgRelevancy: 0.5,
  pauseSameMs: 120,
  pauseTurnMs: 340,
  visemeFadeMs: 70,
  fps: 24,
  speakers: [],
  script: "",
  language: "el",
  narration: null,
  attachedAudio: null,
};
