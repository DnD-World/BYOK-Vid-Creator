// ---------------------------------------------------------------------------
// Reading side of the audio analysis. Both the live preview and the Remotion
// render go through this one function, so a bug here shows up in both rather
// than silently making the export disagree with what was on screen.
//
// Pure: same (analysis, timeMs) always gives the same result. No clock, no
// randomness — safe inside the deterministic render path.
// ---------------------------------------------------------------------------

import type { AudioAnalysis } from "../../store/types";

export interface AudioMoment {
  /** 0–1 loudness at this instant. */
  level: number;
  /** Index of the speaker talking, or -1 for silence. */
  speaker: number;
}

const SILENT: AudioMoment = { level: 0, speaker: -1 };

export function sampleAnalysis(
  analysis: AudioAnalysis | null | undefined,
  timeMs: number
): AudioMoment | null {
  // null (not SILENT) means "no real audio exists" — the caller falls back to
  // the placeholder animation. Past the end of the audio we return real
  // silence instead, because there the answer genuinely is "nothing is
  // playing" rather than "we don't know".
  if (!analysis || analysis.amp.length === 0) return null;

  const i = Math.floor((timeMs / 1000) * analysis.hz);
  if (i < 0 || i >= analysis.amp.length) return SILENT;

  return { level: analysis.amp[i], speaker: analysis.speaker[i] ?? -1 };
}
