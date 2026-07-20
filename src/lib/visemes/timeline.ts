import { graphemeToViseme, VisemeId, VISEME } from "./visemeMap";

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

export function visemeAt(track: VisemeFrame[], t: number): VisemeId {
  let v: VisemeId = VISEME.NEUTRAL;
  for (const f of track) { if (f.t <= t) v = f.viseme; else break; }
  return v;
}
