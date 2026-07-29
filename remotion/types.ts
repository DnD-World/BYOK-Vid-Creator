// ---------------------------------------------------------------------------
// The contract between the Electron main process (which starts renders) and
// the Remotion composition (which draws them).
//
// Everything here crosses a process boundary and gets JSON-serialized into
// Remotion's inputProps, so it must stay plain data — no functions, no class
// instances, no Buffers.
// ---------------------------------------------------------------------------

import type { WaveformConfig } from "../src/store/types";

// Declared as `type` aliases rather than `interface` on purpose. Remotion
// constrains composition props to `Record<string, unknown>`, and TypeScript
// only grants an implicit index signature to type aliases — an interface is
// not assignable to Record<string, unknown> because it can be augmented
// later. Switching these to `interface` will break the Composition generic.

/** A speaker reduced to just what the video needs to draw it. */
export type RenderSpeaker = {
  id: string;
  label: string;
  /** 0–1, fraction of frame width/height. Matches SpeakerConfig. */
  x: number;
  y: number;
  /** Diameter, in pixels of the *preview* canvas. Scaled at render time. */
  size: number;
  bgColor: string;
  borderColor: string;
  bgOpacity: number;
  borderOpacity: number;
};

export type RenderProps = {
  waveform: WaveformConfig;
  speakers: RenderSpeaker[];
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  /**
   * Filename (not path) of a WAV inside the Remotion public dir, or null for
   * a silent render. The main process copies the narration file in before
   * bundling — see electron/render/renderVideo.ts.
   */
  audioFileName: string | null;
  /**
   * Width the speaker `size` values were authored against, so they can be
   * scaled up to the real output resolution. The preview canvas is much
   * smaller than 1080x1920, and without this every avatar renders as a dot.
   */
  authoredWidth: number;
};

export const COMPOSITION_ID = "byok-video";
