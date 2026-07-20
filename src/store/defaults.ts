import { ProjectState } from "./types";

export const defaultProject: ProjectState = {
  render: {
    format: "9:16",
    width: 1080,
    height: 1920,
    durationSec: 180,
    engine: "remotion",
  },
  waveform: {
    position: "circular",
    behavior: "single-colorshift",
    style: "bars",
    colorA: "#ff9a3c",
    colorB: "#3cb4ff",
    colorMusic: "#8a8a8a",
  },
  bgRelevancy: 0.5,
  fps: 24,
  speakers: [],
};
