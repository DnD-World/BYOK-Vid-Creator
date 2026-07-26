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
    scale: 1,
    density: 48,
    dotSize: 1,
    edgeFlush: false,
    ringInnerRadius: 0.2,
    ringSize: 1,
    ringX: 0.5,
    ringY: 0.5,
  },
  bgRelevancy: 0.5,
  fps: 24,
  speakers: [],
  script: "",
  language: "el",
};
