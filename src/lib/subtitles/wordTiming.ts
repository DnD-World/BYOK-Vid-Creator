// ---------------------------------------------------------------------------
// Turns narration segments into on-screen subtitle cues with per-word timing.
//
// The honest limitation, stated up front: TTS gives us the start and end of a
// whole spoken line, not of each word. Rather than pull in a forced aligner
// (another model, another multi-GB dependency, another thing to break), word
// timings are ESTIMATED by distributing the line's duration across its words
// in proportion to how long each word is.
//
// That is not frame-accurate, but for a highlight that moves along with the
// voice it reads as correct — errors stay well under a syllable on normal
// sentences. If word-level accuracy ever genuinely matters, this is the one
// function to replace, and nothing else has to change.
//
// Pure and deterministic: safe inside the render path.
// ---------------------------------------------------------------------------

import type { NarrationSegment } from "../../store/types";

export interface TimedWord {
  text: string;
  startMs: number;
  endMs: number;
}

export interface SubtitleCue {
  speakerId: string;
  speakerLabel: string;
  startMs: number;
  endMs: number;
  words: TimedWord[];
}

/** Trailing punctuation earns a little extra time, because a comma or full
 *  stop is where a voice actually slows down. Without this the highlight
 *  drifts ahead of the audio across a long sentence. */
function weightOf(word: string): number {
  const pause = /[,.;:!?…]$/.test(word) ? 2.5 : 0;
  return Math.max(1, word.length) + pause;
}

/**
 * Splits one segment into cues of at most `maxChars` printable characters, so
 * a long line becomes several sequential cues instead of overflowing the frame.
 */
function cuesForSegment(
  seg: NarrationSegment,
  maxChars: number,
  pauses: number[]
): SubtitleCue[] {
  const words = seg.text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  // MEASURED BEATS ESTIMATED, ALWAYS. When forced alignment has told us when
  // each word was really said, every guess below is skipped — there is nothing
  // left to drift.
  if (seg.words && seg.words.length === words.length) {
    const timed: TimedWord[] = seg.words.map((w) => ({
      text: w.text,
      startMs: w.startMs,
      endMs: w.endMs,
    }));
    return groupIntoCues(seg, timed, maxChars);
  }

  const totalMs = Math.max(1, seg.endMs - seg.startMs);
  const weights = words.map(weightOf);
  const weightSum = weights.reduce((a, b) => a + b, 0);

  // Walk the words once, converting weight into elapsed time as we go, so
  // rounding never accumulates into a drift by the end of the line.
  const timed: TimedWord[] = [];
  let acc = 0;
  for (let i = 0; i < words.length; i++) {
    const startMs = seg.startMs + Math.round((acc / weightSum) * totalMs);
    acc += weights[i];
    const endMs = seg.startMs + Math.round((acc / weightSum) * totalMs);
    timed.push({ text: words[i], startMs, endMs });
  }

  // ANCHOR THE ESTIMATE TO THE AUDIO.
  //
  // Everything above is a guess from letter counts, and a guess DRIFTS: one
  // slow word early on pushes every later word out, and by the end of a long
  // line the highlight is a phrase ahead of the voice. Ak saw exactly that and
  // I twice fixed a different layer of it.
  //
  // `pauses` are moments where the voice measurably stopped. A speaker pauses
  // at punctuation, so a pause is almost always a sentence or clause boundary —
  // which means it can be matched to a word boundary that follows punctuation,
  // and the words between two anchors re-spread over the time actually taken.
  //
  // That is forced alignment at the phrase level. It is not per-word truth, but
  // the error can no longer accumulate past the next pause, which is what makes
  // drift visible.
  const inside = pauses.filter((ms) => ms > seg.startMs + 150 && ms < seg.endMs - 150);
  if (inside.length > 0 && words.length > 2) {
    const anchors: { index: number; ms: number }[] = [];
    for (const ms of inside) {
      let best = -1;
      let bestCost = Infinity;
      for (let i = 1; i < words.length; i++) {
        const punctuated = /[,.;:!?…·]$/.test(words[i - 1]);
        // A boundary after punctuation is where a voice really stops, so it is
        // preferred strongly over a boundary in the middle of a phrase.
        const cost = Math.abs(timed[i].startMs - ms) + (punctuated ? 0 : 700);
        if (cost < bestCost) { bestCost = cost; best = i; }
      }
      // Too far from any plausible boundary means this pause belongs to
      // something else — a breath mid-phrase — and forcing it would be worse
      // than leaving the estimate alone.
      if (best > 0 && bestCost < 1600 && !anchors.some((a) => a.index === best)) {
        anchors.push({ index: best, ms });
      }
    }
    anchors.sort((a, b) => a.index - b.index);

    // Monotonic only. An anchor that would move a boundary backwards past its
    // predecessor is dropped rather than reordering the line.
    const kept = anchors.filter((a, i) => i === 0 || a.ms > anchors[i - 1].ms);

    let fromIdx = 0;
    let fromMs = seg.startMs;
    for (const a of [...kept, { index: words.length, ms: seg.endMs }]) {
      const span = a.ms - fromMs;
      const sub = weights.slice(fromIdx, a.index);
      const subSum = sub.reduce((x, y) => x + y, 0) || 1;
      let run = 0;
      for (let i = fromIdx; i < a.index; i++) {
        timed[i].startMs = Math.round(fromMs + (run / subSum) * span);
        run += weights[i];
        timed[i].endMs = Math.round(fromMs + (run / subSum) * span);
      }
      fromIdx = a.index;
      fromMs = a.ms;
    }
  }

  return groupIntoCues(seg, timed, maxChars);
}

/** Words with times in, display-sized cues out. Shared so that measured and
 *  estimated timings cannot be grouped by two different rules. */
function groupIntoCues(
  seg: NarrationSegment,
  timed: TimedWord[],
  maxChars: number
): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  let group: TimedWord[] = [];
  let groupChars = 0;
  const flush = () => {
    if (group.length === 0) return;
    cues.push({
      speakerId: seg.speakerId,
      speakerLabel: seg.speakerLabel,
      startMs: group[0].startMs,
      endMs: group[group.length - 1].endMs,
      words: group,
    });
    group = [];
    groupChars = 0;
  };

  for (const w of timed) {
    const added = w.text.length + (group.length > 0 ? 1 : 0);
    if (groupChars + added > maxChars && group.length > 0) flush();
    group.push(w);
    groupChars += added;
  }
  flush();

  return cues;
}

export function buildCues(
  segments: NarrationSegment[],
  maxChars = 42,
  /** Moments, in ms, where the narration audio measurably went quiet. Supplied
   *  by whoever built the narration, because only they have the audio. Without
   *  them every timing here is an estimate from letter counts. */
  pauses: number[] = []
): SubtitleCue[] {
  return segments.flatMap((seg) => cuesForSegment(seg, maxChars, pauses));
}

/** The cue on screen at `timeMs`, or null between cues. */
export function cueAt(cues: SubtitleCue[], timeMs: number): SubtitleCue | null {
  // Linear scan. Cue counts are in the hundreds even for a 10-minute video,
  // and staying linear keeps this trivially correct; revisit only if profiling
  // ever says otherwise.
  for (const c of cues) {
    if (timeMs >= c.startMs && timeMs < c.endMs) return c;
  }
  return null;
}
