import { Composition } from "remotion";
import { VideoComposition } from "./VideoComposition";
import { COMPOSITION_ID, type RenderProps } from "./types";
import { defaultProject } from "../src/store/defaults";

// The values below are only placeholders for Remotion Studio. Every real
// render overrides them through calculateMetadata, driven by inputProps
// handed in by the Electron main process.
const previewDefaults: RenderProps = {
  musicWaveform: defaultProject.musicWaveform,
  musicColor: defaultProject.musicColor,
  speakers: [],
  width: 1080,
  height: 1920,
  fps: 30,
  durationSec: 10,
  audioFileName: null,
  analysis: null,
  spectrumFileName: null,
  spectrumBandCount: 0,
  subtitles: defaultProject.subtitles,
  narrationSegments: [],
};

export function RemotionRoot() {
  return (
    <Composition
      id={COMPOSITION_ID}
      component={VideoComposition}
      durationInFrames={300}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={previewDefaults}
      // Output dimensions, frame rate and length are all properties of the
      // user's project, not of this file — so they're derived from the props
      // rather than hardcoded above.
      calculateMetadata={({ props }) => ({
        width: props.width,
        height: props.height,
        fps: props.fps,
        durationInFrames: Math.max(1, Math.round(props.durationSec * props.fps)),
      })}
    />
  );
}
