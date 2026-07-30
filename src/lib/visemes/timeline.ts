// `type` on VisemeId is load-bearing: it's a type-only export, and importing it
// as a value makes this module unusable by any tool that erases types per-file
// instead of whole-program (isolatedModules, Node's --experimental-strip-types).
import { graphemeToViseme, VISEME, type VisemeId } from "./visemeMap";

export interface WordTiming { word: string; start: number; end: number; } // seconds
export interface VisemeFrame { t: number; viseme: VisemeId; }             // seconds

// fps comes from the setup dashboard (10 / 24 / 30 — see below)
export function buildVisemeTrack(
  words: WordTiming[],
  fps: number,
  minHoldFrames = 2 // never swap faster than this many frames
): VisemeFrame[] {
  const frames: VisemeFrame[] = [];
  const minHold = minHoldFrames / fps;

  for (const w of words) {
    const vs = graphemeToViseme(w.word);
    const dur = w.end - w.start;
    const per = dur / vs.length;
    vs.forEach((v, i) => {
      const t = w.start + i * per;
      const last = frames[frames.length - 1];
      if (last && last.viseme === v) return;      // dedupe repeats
      if (last && t - last.t < minHold) return;   // enforce min hold
      frames.push({ t, viseme: v });
    });
  }
  // trailing rest
  const lastWord = words[words.length - 1];
  if (lastWord) frames.push({ t: lastWord.end, viseme: VISEME.NEUTRAL });
  return frames;
}

/** Viseme in effect at time `t` (seconds). Binary search rather than a scan:
 *  this is called once per speaker per frame, so on a 10-minute 30fps render
 *  a linear walk over a few thousand keyframes turns into tens of millions of
 *  comparisons for no reason. Tracks are always built in ascending `t`. */
export function visemeAt(track: VisemeFrame[], t: number): VisemeId {
  let lo = 0;
  let hi = track.length - 1;
  let v: VisemeId = VISEME.NEUTRAL;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (track[mid].t <= t) {
      v = track[mid].viseme;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return v;
}
