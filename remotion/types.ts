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
import type { Puppet } from "../src/store/puppetTypes";
import type { GlassConfig } from "./GlassPanel";

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
  /** This speaker's layered puppet, or null to fall back to `sheetFileName`.
   *
   *  The definition rides along in inputProps rather than as a file: it is a
   *  few KB of geometry, and the composition needs it before it can lay out a
   *  single frame. Its *art* is far too big for that and takes the same road
   *  the sheets do — see `puppetFiles` below. */
  puppet: Puppet | null;
  /** Layer file name (as written in the puppet) -> filename inside Remotion's
   *  public dir. Kept as a side map rather than rewriting `puppet.file` in
   *  place, so what the composition draws is the same definition the author
   *  tuned, and a mismatch shows up as a missing layer instead of as art that
   *  is subtly the wrong one. */
  puppetFiles: Record<string, string>;
};

/** One background clip, reduced to what the composition needs to draw it.
 *
 *  `sourceSec` is the provider's own reported length, carried across rather
 *  than measured: the file is on disk in the main process but its duration
 *  isn't known there without probing it, and the composition needs the number
 *  before it can decide whether a clip has to loop to fill its scene. */
export type RenderBackground = {
  startMs: number;
  endMs: number;
  /** Filename (not path) inside Remotion's public dir — same road the
   *  narration WAV and the viseme art take, for the same cross-origin reason. */
  fileName: string;
  sourceSec: number;
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
   *
   * Its `spectrum` is deliberately stripped: see spectrumFileName below.
   */
  analysis: AudioAnalysis | null;
  /**
   * Filename (not path) of the packed per-band spectrum inside the public dir,
   * or null if there isn't one.
   *
   * It travels as a file rather than inside inputProps because of its size: at
   * 60Hz and 24 bands, ten minutes of narration is 1.7MB of raw bytes, and
   * inputProps are serialised into the page for every render worker. The
   * narration WAV and the viseme sheets already take this road for their own
   * reasons, so the machinery to serve it was already here.
   */
  spectrumFileName: string | null;
  /** Band count for that file — the composition needs it to split the bytes
   *  into frames, and it is one number rather than a megabyte. */
  spectrumBandCount: number;
  /**
   * Filename (not path) of the music bed inside the public dir, or null. It is
   * mixed UNDER the narration rather than replacing it, and ducks out of the
   * way whenever `analysis` says somebody is speaking.
   */
  musicFileName: string | null;
  /** The music's own loudness + spectrum, so its waveform animates to the music
   *  instead of to the narration. null when it couldn't be analysed. */
  musicAnalysis: AudioAnalysis | null;
  /** Same file-not-inputProps arrangement the narration spectrum uses. */
  musicSpectrumFileName: string | null;
  musicSpectrumBandCount: number;
  /** Music level with nobody speaking, 0–1, and how much of it is given up
   *  under speech, 0–1. */
  musicVolume: number;
  musicDuck: number;
  /** Sound effects, already copied into the public dir. Each fires once at its
   *  own moment and is never ducked — an effect that gets out of the way of the
   *  voice it is punctuating is an effect nobody hears. */
  sfx: { fileName: string; atMs: number; volume: number }[];
  /** Background clips, in order. Empty renders the plain dark frame. */
  backgrounds: RenderBackground[];
  /** Scrim over the clips, 0–1. */
  backgroundDim: number;
  /** Blur over the clips, as a fraction of frame width. 0 = sharp. Pushes the
   *  footage back without darkening it, so avatars and text can carry their
   *  own surfaces over a bright clip. */
  backgroundBlur: number;
  /** A pane of glass over the background and waveform, or absent for none.
   *  Only those two layers are refracted — the avatars and subtitles draw
   *  after it and stay sharp, so you look THROUGH the pane at the scene. */
  glass?: GlassConfig | null;
  /** Crossfade between clips, in ms. */
  backgroundCrossfadeMs: number;
  subtitles: SubtitleConfig;
  /** The subtitle typeface, already downloaded and copied into the public dir,
   *  or null for the system stack. One entry per unicode subset — Greek and
   *  Latin are separate files, which is why this is a list and not a filename.
   *
   *  The composition registers these with @font-face and holds the render until
   *  they have loaded: a frame captured before the font arrives is a frame in
   *  the fallback typeface, and it would be scattered through the video rather
   *  than obviously wrong at the start. */
  subtitleFont: {
    family: string;
    weight: number;
    faces: { fileName: string; unicodeRange: string }[];
  } | null;
  /** Crossfade between viseme cells, in ms. */
  visemeFadeMs: number;
  /** Idle head motion intensity, 0–1. */
  idleMotion: number;
  /** Narration lines with timing, from which subtitle cues are derived.
   *  Empty means nothing to show. */
  narrationSegments: NarrationSegment[];
};

export const COMPOSITION_ID = "byok-video";
