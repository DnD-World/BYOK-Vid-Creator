// ---------------------------------------------------------------------------
// Reading side of the audio analysis. Both the live preview and the Remotion
// render go through this one function, so a bug here shows up in both rather
// than silently making the export disagree with what was on screen.
//
// Pure: same (analysis, timeMs) always gives the same result. No clock, no
// randomness — safe inside the deterministic render path.
// ---------------------------------------------------------------------------

import type { AudioAnalysis, AudioSpectrum } from "../../store/types";

/** The spectrum with its base64 unpacked — what the waveform actually reads. */
export interface DecodedSpectrum {
  bandCount: number;
  /** Frame-major, 0–255. Frame f band b is at f * bandCount + b. */
  bands: Uint8Array;
  peaks: Uint8Array;
}

export interface AudioMoment {
  /** 0–1 loudness at this instant. */
  level: number;
  /** Index of the speaker talking, or -1 for silence. */
  speaker: number;
  /** This frame's slice of the spectrum, or null when there isn't one. */
  bands: Uint8Array | null;
  peaks: Uint8Array | null;
  bandCount: number;
}

const SILENT: AudioMoment = { level: 0, speaker: -1, bands: null, peaks: null, bandCount: 0 };

function fromBase64(b64: string): Uint8Array {
  // atob in the browser and the render's headless Chromium; Buffer only in
  // Node. Both sides of this app are browsers, so atob is the common path.
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Decoding is ~1MB of base64 for a long narration and the waveform asks for a
// frame 24+ times a second, so the result is cached against the very object it
// came from. A WeakMap means a replaced analysis is collected with its cache.
const cache = new WeakMap<AudioSpectrum, DecodedSpectrum>();

export function decodeSpectrum(
  spectrum: AudioSpectrum | null | undefined
): DecodedSpectrum | null {
  if (!spectrum || !spectrum.bandCount) return null;
  const hit = cache.get(spectrum);
  if (hit) return hit;
  const decoded: DecodedSpectrum = {
    bandCount: spectrum.bandCount,
    bands: fromBase64(spectrum.bands),
    peaks: fromBase64(spectrum.peaks),
  };
  cache.set(spectrum, decoded);
  return decoded;
}

export function sampleAnalysis(
  analysis: AudioAnalysis | null | undefined,
  timeMs: number,
  /** Supplied by the render, which loads the spectrum from the public dir
   *  rather than from inputProps. Falls back to the inline one. */
  spectrum?: DecodedSpectrum | null
): AudioMoment | null {
  // null (not SILENT) means "no real audio exists" — the caller falls back to
  // the placeholder animation. Past the end of the audio we return real
  // silence instead, because there the answer genuinely is "nothing is
  // playing" rather than "we don't know".
  if (!analysis || analysis.amp.length === 0) return null;

  const i = Math.floor((timeMs / 1000) * analysis.hz);
  if (i < 0 || i >= analysis.amp.length) return SILENT;

  const spec = spectrum ?? decodeSpectrum(analysis.spectrum);
  if (!spec) {
    return { level: analysis.amp[i], speaker: analysis.speaker[i] ?? -1, bands: null, peaks: null, bandCount: 0 };
  }

  const from = i * spec.bandCount;
  const to = from + spec.bandCount;
  // A spectrum shorter than the envelope (truncated file, mismatched analysis)
  // degrades to the no-spectrum path rather than reading past the end.
  if (to > spec.bands.length) {
    return { level: analysis.amp[i], speaker: analysis.speaker[i] ?? -1, bands: null, peaks: null, bandCount: 0 };
  }

  return {
    level: analysis.amp[i],
    speaker: analysis.speaker[i] ?? -1,
    bands: spec.bands.subarray(from, to),
    peaks: spec.peaks.subarray(from, to),
    bandCount: spec.bandCount,
  };
}
