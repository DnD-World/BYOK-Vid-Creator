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
function cuesForSegment(seg: NarrationSegment, maxChars: number): SubtitleCue[] {
  const words = seg.text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

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

  // Group into display-sized chunks.
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
  maxChars = 42
): SubtitleCue[] {
  return segments.flatMap((seg) => cuesForSegment(seg, maxChars));
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
