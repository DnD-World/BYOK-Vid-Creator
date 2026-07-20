import { ProjectState } from "./types";

export const defaultProject: ProjectState = {
  render: { aspect: "16:9", fps: 30, storage: "local" },
  speakers: [],
  waveform: {
    shape: "bars",
    position: "bottom",
    mode: "single-colorshift",
    colors: ["#e8a24a", "#4ac2e8"],
  },
  bgRelevancy: 0.5,
  minClipDuration: 2.5, // strobe guard
};
