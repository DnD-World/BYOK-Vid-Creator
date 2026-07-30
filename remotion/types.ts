// ---------------------------------------------------------------------------
// The contract between the Electron main process (which starts renders) and
// the Remotion composition (which draws them).
//
// Everything here crosses a process boundary and gets JSON-serialized into
// Remotion's inputProps, so it must stay plain data — no functions, no class
// instances, no Buffers.
// ---------------------------------------------------------------------------

import type {
  AudioAnalysis,
  NarrationSegment,
  OutlineShape,
  SubtitleConfig,
  TrackWaveform,
} from "../src/store/types";

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
  /** Diameter as a 0–1 fraction of frame width. Matches SpeakerConfig. */
  size: number;
  bgColor: string;
  borderColor: string;
  bgOpacity: number;
  borderOpacity: number;
  outlineShape: OutlineShape;
  /** This speaker's own waveform. Colour comes from borderColor above. */
  waveform: TrackWaveform;
  /** Filename (not path) of this speaker's viseme sheet inside Remotion's
   *  public dir, or null for a faceless disk. The main process copies the
   *  file in before bundling — same mechanism as the narration WAV, and for
   *  the same reason: a file:// src is blocked from the bundle's http:// origin. */
  sheetFileName: string | null;
};

export type RenderProps = {
  musicWaveform: TrackWaveform;
  musicColor: string;
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
   * Loudness + active-speaker data for that audio. null when rendering silent,
   * or when the user attached a file by hand that was never analysed — the
   * waveform then falls back to its placeholder animation.
   */
  analysis: AudioAnalysis | null;
  subtitles: SubtitleConfig;
  /** Narration lines with timing, from which subtitle cues are derived.
   *  Empty means nothing to show. */
  narrationSegments: NarrationSegment[];
};

export const COMPOSITION_ID = "byok-video";
