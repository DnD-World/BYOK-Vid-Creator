// ---------------------------------------------------------------------------
// Auto-ducking: how loud the music is at a given instant.
//
// The rule a human engineer follows is not "turn it down while the voice is
// there" — it is "get out of the way just BEFORE the voice arrives, and come
// back slowly after it leaves". A gate that flips on the first loud sample
// always sounds like a mistake, because the duck lands a syllable late and the
// recovery lands on the next word.
//
// So this looks forward by `attackMs` and back by `releaseMs` in the narration's
// own analysis, and ramps. Forward-looking is free here and impossible live:
// the whole narration was analysed before a single frame was drawn.
//
// Pure — (analysis, timeMs) in, gain out. Remotion evaluates this per frame,
// out of order, across workers.
// ---------------------------------------------------------------------------

import type { AudioAnalysis } from "../../store/types";

/** Duck this far ahead of the first word. Long enough to be underway when the
 *  voice lands, short enough not to dip in a gap between two lines. */
export const DUCK_ATTACK_MS = 260;
/** And come back this slowly afterwards. Deliberately much longer than the
 *  attack: a fast recovery swells between every sentence. */
export const DUCK_RELEASE_MS = 700;

/**
 * 0 when nobody is speaking anywhere near `timeMs`, 1 in the middle of a line,
 * ramping in between.
 */
export function speechProximity(
  analysis: AudioAnalysis | null | undefined,
  timeMs: number,
  attackMs = DUCK_ATTACK_MS,
  releaseMs = DUCK_RELEASE_MS
): number {
  if (!analysis || !analysis.speaker || analysis.speaker.length === 0) return 0;

  const hz = analysis.hz > 0 ? analysis.hz : 60;
  const here = Math.round((timeMs / 1000) * hz);
  const ahead = Math.ceil((attackMs / 1000) * hz);
  const behind = Math.ceil((releaseMs / 1000) * hz);

  const from = Math.max(0, here - behind);
  const to = Math.min(analysis.speaker.length - 1, here + ahead);

  let strongest = 0;
  for (let i = from; i <= to; i++) {
    if (analysis.speaker[i] < 0) continue;
    if (i === here) return 1;
    const dtMs = ((i - here) / hz) * 1000;
    // Ahead of us: the voice is coming. Behind us: it has just gone.
    const span = dtMs > 0 ? attackMs : releaseMs;
    const closeness = span > 0 ? 1 - Math.abs(dtMs) / span : 0;
    if (closeness > strongest) strongest = closeness;
    // Nothing later in the window can beat a full duck, so stop early.
    if (strongest >= 1) return 1;
  }
  return Math.max(0, Math.min(1, strongest));
}

/**
 * The music's gain at `timeMs`.
 *
 * @param volume 0–1, the level when nothing is being said.
 * @param duck   0–1, the fraction of that level given up under speech.
 */
export function musicGainAt(
  narration: AudioAnalysis | null | undefined,
  timeMs: number,
  volume: number,
  duck: number
): number {
  const base = Math.max(0, Math.min(1, volume));
  if (base === 0) return 0;
  const amount = Math.max(0, Math.min(1, duck));
  if (amount === 0) return base;
  return base * (1 - amount * speechProximity(narration, timeMs));
}
