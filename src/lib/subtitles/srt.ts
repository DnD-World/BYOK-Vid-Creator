// ---------------------------------------------------------------------------
// SubRip (.srt) export.
//
// Built from the SAME cues the video burns in, so the file and the picture
// cannot disagree about when a line appears or where it breaks. That is the
// whole reason this takes cues rather than narration segments: segments are
// whole spoken lines, and a long one is split across several cues on screen.
//
// What it deliberately does NOT carry: uppercasing, colour, glow, position.
// Those are how the subtitles are *drawn*; an .srt is the text and its timing,
// and a player is entitled to draw it however it likes.
//
// Pure — no clock, no filesystem. The caller writes the string.
// ---------------------------------------------------------------------------

import type { SubtitleCue } from "./wordTiming";

/** `HH:MM:SS,mmm` — SubRip uses a comma for the decimal, not a full stop, and
 *  players are strict about it. */
function stamp(ms: number): string {
  const clamped = Math.max(0, Math.round(ms));
  const h = Math.floor(clamped / 3_600_000);
  const m = Math.floor((clamped % 3_600_000) / 60_000);
  const s = Math.floor((clamped % 60_000) / 1000);
  const milli = clamped % 1000;
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(milli, 3)}`;
}

export interface SrtOptions {
  /** Prefix each cue with the speaker's name, the way a transcript reads.
   *  Off by default: in a two-hander where both faces are on screen, the
   *  picture already says who is talking. */
  withSpeakerLabels?: boolean;
}

export function toSrt(cues: SubtitleCue[], opts: SrtOptions = {}): string {
  const blocks: string[] = [];

  for (const cue of cues) {
    const text = cue.words.map((w) => w.text).join(" ").trim();
    // Numbered from what was actually written, not from the loop index: a
    // skipped cue must not leave a hole in the sequence.
    if (!text) continue;
    // A zero-length cue is legal to write and invisible in every player, so
    // give it a floor rather than emitting a line nobody will ever see.
    const endMs = Math.max(cue.endMs, cue.startMs + 200);
    const body = opts.withSpeakerLabels && cue.speakerLabel
      ? `${cue.speakerLabel}: ${text}`
      : text;
    blocks.push(
      `${blocks.length + 1}\n${stamp(cue.startMs)} --> ${stamp(endMs)}\n${body}\n`
    );
  }

  // CRLF: SubRip predates everyone's opinions about line endings and the
  // players that are fussy are fussy in this direction.
  return blocks.join("\n").replace(/\n/g, "\r\n");
}
