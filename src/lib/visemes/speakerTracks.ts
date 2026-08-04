// ---------------------------------------------------------------------------
// One viseme track per speaker, built from the narration's word timings.
//
// Tracks are built PER SEGMENT and concatenated, rather than from all of a
// speaker's words at once. buildVisemeTrack appends a closing NEUTRAL at the
// end of the words it is given, so doing it per segment means each speaker
// returns to a closed mouth at the end of every line — which is what makes a
// speaker sit still while the other one talks, for free.
//
// Pure and deterministic. Shared by the preview and the render so the mouth
// can't say different things in each.
// ---------------------------------------------------------------------------

import type { NarrationSegment } from "../../store/types";
import { buildCues } from "../subtitles/wordTiming";
import { buildVisemeTrack, type VisemeFrame, type WordTiming } from "./timeline";

export type SpeakerVisemeTracks = Record<string, VisemeFrame[]>;

export function buildSpeakerVisemeTracks(
  segments: NarrationSegment[],
  fps: number
): SpeakerVisemeTracks {
  const tracks: SpeakerVisemeTracks = {};
  if (segments.length === 0 || fps <= 0) return tracks;

  // Reuse the subtitle word timings so the mouth and the highlighted word are
  // driven by exactly the same numbers — if they diverged, the mismatch would
  // be visible and maddening to debug.
  for (const seg of segments) {
    const cues = buildCues([seg], Number.MAX_SAFE_INTEGER);
    const words: WordTiming[] = cues.flatMap((c) =>
      c.words.map((w) => ({ word: w.text, start: w.startMs / 1000, end: w.endMs / 1000 }))
    );
    if (words.length === 0) continue;

    const track = buildVisemeTrack(words, fps);
    tracks[seg.speakerId] = (tracks[seg.speakerId] ?? []).concat(track);
  }

  return tracks;
}
