// ---------------------------------------------------------------------------
// What a puppet's eyes and brows do, moment to moment.
//
// This is the half of the layered puppet that the sprite sheet could never
// express. A sheet bakes one pair of eyes and one pair of brows into each of
// its nine faces, so a character physically cannot blink in the middle of a
// word or raise a brow at a question mark. Splitting the layers apart made it
// possible; this module is what actually makes it happen.
//
// Two independent things live here because they are driven by two different
// clocks:
//
//   - BLINKING is time-driven. It has nothing to do with the script; a face
//     blinks while talking, while listening, and over silence.
//   - BROWS are script-driven. They react to punctuation, which is the only
//     emotional signal the text actually carries.
//
// PURE, like everything else on the render path: same inputs, same answer, no
// clock of its own, no randomness. Remotion renders frames out of order across
// parallel workers, so anything stateful here would produce a video whose eyes
// blink at different times depending on how the work happened to be split.
// ---------------------------------------------------------------------------

import type { NarrationSegment } from "../../store/types";
import { buildCues } from "../subtitles/wordTiming";

/** Lid state names, matching the keys in a puppet's `eyes.lids`. */
export type LidState = "open" | "half" | "closed";

// ---------------------------------------------------------------------------
// Blinking
// ---------------------------------------------------------------------------

/** A blink, start to finish. Real ones are 100–150ms; at 30fps that is about
 *  four frames, which is exactly enough for half → closed → closed → half and
 *  is why the "half" lid asset earns its place. Any faster and the eye appears
 *  to teleport shut. */
const BLINK_MS = 150;

/** Roughly one blink per window, so ~16/minute — the low end of the resting
 *  human rate. Deliberately low: an avatar that blinks at a true conversational
 *  rate reads as nervous on a 30-second clip. */
const WINDOW_MS = 3800;

/** How often a window gets a second blink right after the first. People blink
 *  in pairs more than they blink evenly, and this is most of what separates
 *  "alive" from "metronome". */
const DOUBLE_CHANCE = 0.22;

/** Stable 0..1 from a string. Same construction as idleMotion's phase — two
 *  speakers must not blink in unison, which is the single most artificial
 *  thing a pair of avatars can do. */
function hash01(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

/** Where a blink sits inside window `k`, and whether it doubles. */
function windowBlinks(seed: string, k: number): number[] {
  const start = hash01(`${seed}:${k}:at`) * (WINDOW_MS - BLINK_MS * 2.5);
  const blinks = [k * WINDOW_MS + start];
  if (hash01(`${seed}:${k}:dbl`) < DOUBLE_CHANCE) {
    // 90–170ms of open eye between the two, which is what a real double blink
    // looks like; longer and it reads as two unrelated blinks.
    blinks.push(blinks[0] + BLINK_MS + 90 + hash01(`${seed}:${k}:gap`) * 80);
  }
  return blinks;
}

/**
 * The lid state at a moment.
 *
 * @param amount 0 disables blinking entirely — the same master "how alive is
 *   this face" control the head motion uses. A face that holds perfectly still
 *   but keeps blinking looks stranger than one that does neither.
 */
export function blinkAt(seed: string, timeMs: number, amount = 1): LidState {
  if (amount <= 0 || timeMs < 0) return "open";

  // The previous window is checked too: a blink placed near the end of its
  // window finishes inside the next one, and missing that would clip it.
  const k = Math.floor(timeMs / WINDOW_MS);
  for (const kk of [k - 1, k]) {
    if (kk < 0) continue;
    for (const start of windowBlinks(seed, kk)) {
      const p = (timeMs - start) / BLINK_MS;
      if (p < 0 || p > 1) continue;
      // Down and up are not symmetric: a real blink snaps shut and opens more
      // slowly, so the closed phase sits early rather than in the middle.
      if (p < 0.18) return "half";
      if (p < 0.62) return "closed";
      return "half";
    }
  }
  return "open";
}

// ---------------------------------------------------------------------------
// Brows
// ---------------------------------------------------------------------------

/**
 * Punctuation → brow set.
 *
 * Note `;` — in Greek that is the QUESTION MARK, not a semicolon, and this app
 * is Greek-first. Getting this wrong would leave every Greek question with a
 * flat, uninterested face.
 *
 * The names are the conventional brow-set keys (`puppet/*.spec.json`). A puppet
 * missing one falls back rather than drawing no brow at all — see `resolveBrow`.
 * This table is the whole emotional vocabulary and is meant to be retuned: to
 * get the sceptical single raised brow the puppets are capable of, give one
 * side "happy" and the other "serious" for a question.
 */
const BROW_FOR: { test: RegExp; set: string }[] = [
  // Ellipsis first — "…" and "..." would otherwise match the full-stop rule.
  { test: /(…|\.\.\.)$/, set: "sad" },
  { test: /[;?]$/, set: "happy" },
  { test: /!$/, set: "angry" },
];

/** The resting face. Not `undefined`: a puppet asked for no brow set draws no
 *  brows at all, which reads as missing art rather than as a neutral face. */
export const BROW_REST = "serious";

export interface BrowSpan {
  startMs: number;
  endMs: number;
  set: string;
}

/** Brows lead the voice slightly — they move as the phrase turns, not after
 *  it lands. A brow that rises on the question mark itself is always late. */
const BROW_LEAD_MS = 220;
/** And hold a moment after, rather than snapping back the instant the word
 *  ends, which looks like a twitch. */
const BROW_HOLD_MS = 320;

/**
 * Brow spans per speaker, from the punctuation in their lines.
 *
 * Built off `buildCues` for the same reason the viseme tracks are: those word
 * timings are what the subtitles and the mouth already use, and a brow driven
 * by an independently-derived clock would drift against the face it belongs to.
 */
export function buildSpeakerBrowTracks(
  segments: NarrationSegment[]
): Record<string, BrowSpan[]> {
  const tracks: Record<string, BrowSpan[]> = {};

  for (const seg of segments) {
    const cues = buildCues([seg], Number.MAX_SAFE_INTEGER);
    for (const cue of cues) {
      for (const w of cue.words) {
        const hit = BROW_FOR.find((r) => r.test.test(w.text));
        if (!hit) continue;
        (tracks[seg.speakerId] ??= []).push({
          startMs: Math.max(0, w.startMs - BROW_LEAD_MS),
          endMs: w.endMs + BROW_HOLD_MS,
          set: hit.set,
        });
      }
    }
  }

  return tracks;
}

/** The brow set at a moment. Later spans win where two overlap — a short line
 *  ending "…;" should ask the question, not trail off. */
export function browAt(spans: BrowSpan[] | undefined, timeMs: number): string {
  if (!spans) return BROW_REST;
  let set = BROW_REST;
  for (const s of spans) {
    if (timeMs >= s.startMs && timeMs < s.endMs) set = s.set;
  }
  return set;
}

// ---------------------------------------------------------------------------
// Head pose
// ---------------------------------------------------------------------------

/**
 * Rotation and offset of the HEAD GROUP, inside the avatar.
 *
 * Distinct from `idleMotion`, which moves the whole disk. This moves the head
 * relative to the shoulders, which is the thing a sprite sheet could never do
 * and the reason every layer was anchored to the head in the first place: one
 * transform here carries the eyes, brows and mouth with it, correctly, for
 * free.
 */
export interface HeadPose {
  /** Degrees, positive = clockwise. */
  rotateDeg: number;
  /** Offsets as a fraction of head width. */
  dx: number;
  dy: number;
}

export const HEAD_STILL: HeadPose = { rotateDeg: 0, dx: 0, dy: 0 };

export type HeadGestureKind = "tilt" | "shake" | "droop" | "bob";

export interface HeadSpan {
  startMs: number;
  endMs: number;
  kind: HeadGestureKind;
}

/**
 * Punctuation → head gesture, deliberately parallel to `BROW_FOR`.
 *
 * The two are read from the same marks on purpose: a question raises the brows
 * AND cocks the head, because in a real performance those happen together. Two
 * independent tables would let them drift into disagreeing about the same
 * sentence.
 */
const HEAD_FOR: { test: RegExp; kind: HeadGestureKind }[] = [
  // Laughter first: "χαχα!" is a laugh, not an exclamation, and the general
  // `!` rule below would otherwise claim it. Both the Greek χα and the Latin
  // ha are matched, because a Greek script routinely carries both.
  { test: /^(χα|χά|χο|ha|he){2,}[!.…]*$/i, kind: "bob" },
  { test: /(…|\.\.\.)$/, kind: "droop" },
  { test: /[;?]$/, kind: "tilt" },
  { test: /!$/, kind: "shake" },
];

/** A gesture runs a little longer than the brow it accompanies: the head is
 *  heavier than an eyebrow and settles more slowly. */
const HEAD_LEAD_MS = 180;
const HEAD_HOLD_MS = 520;

export function buildSpeakerHeadTracks(
  segments: NarrationSegment[]
): Record<string, HeadSpan[]> {
  const tracks: Record<string, HeadSpan[]> = {};

  for (const seg of segments) {
    const cues = buildCues([seg], Number.MAX_SAFE_INTEGER);
    for (const cue of cues) {
      for (const w of cue.words) {
        const hit = HEAD_FOR.find((r) => r.test.test(w.text));
        if (!hit) continue;
        (tracks[seg.speakerId] ??= []).push({
          startMs: Math.max(0, w.startMs - HEAD_LEAD_MS),
          endMs: w.endMs + HEAD_HOLD_MS,
          kind: hit.kind,
        });
      }
    }
  }

  return tracks;
}

/** Smooth 0→1→0 across a span: rises, holds, falls. Linear in and out reads
 *  as a mechanism sliding rather than as a head moving. */
function arc(p: number): number {
  if (p <= 0 || p >= 1) return 0;
  const ease = (x: number) => x * x * (3 - 2 * x);
  if (p < 0.28) return ease(p / 0.28);
  if (p > 0.62) return ease((1 - p) / 0.38);
  return 1;
}

/**
 * The pose at a moment: a continuous idle sway, plus whatever gesture the
 * script asks for.
 *
 * HONEST NAMING: this leans the WHOLE CHARACTER, not the head alone. The
 * layered puppet separates the FEATURES (eyes, brows, mouth) from the base,
 * but the base itself is one drawing of head *and* shoulders — measured, not
 * assumed: kaiti.png carries opaque pixels from y=17 to y=1021 of 1024. There
 * is no seam to pivot a neck at, so a true head-on-shoulders tilt needs the
 * head exported as its own layer, which the current art cannot supply.
 *
 * A whole-body lean still reads well on chibi proportions at these angles, and
 * it is what the gesture vocabulary below is tuned for. Do not raise the
 * amplitudes to "make the tilt more obvious" — past a few degrees the missing
 * neck becomes visible and it starts to look like the character is toppling.
 *
 * @param amount the master "how alive is this" control, shared with blinking
 *   and the body's idle drift. 0 is genuinely still.
 */
export function headPoseAt(
  seed: string,
  spans: HeadSpan[] | undefined,
  timeMs: number,
  amount = 1
): HeadPose {
  if (amount <= 0) return HEAD_STILL;

  // Idle sway scales with the setting; GESTURES largely do not. A gesture is a
  // punctuation beat the script asked for, so halving it at the default 0.5
  // simply made questions and emphasis illegible — turning the ambient life
  // down should not mute the performance.
  const gesture = 0.65 + 0.35 * amount;

  const t = timeMs / 1000;
  const p = hash01(seed) * Math.PI * 2;

  // Idle sway — small, and on periods that don't divide into each other or
  // into the body's own drift, so the head never locks in step with the
  // shoulders and start reading as one rigid piece.
  let rotateDeg = Math.sin(t * (Math.PI * 2) / 8.3 + p) * 1.4 * amount;
  let dx = Math.sin(t * (Math.PI * 2) / 11.7 + p * 1.4) * 0.012 * amount;
  let dy = 0;

  for (const s of spans ?? []) {
    if (timeMs < s.startMs || timeMs >= s.endMs) continue;
    const a = arc((timeMs - s.startMs) / (s.endMs - s.startMs)) * gesture;
    if (a <= 0) continue;

    if (s.kind === "tilt") {
      // Cocked to one side, consistently per character rather than randomly —
      // a person tilts their head the same way each time, and alternating it
      // looks like a glitch.
      const side = hash01(`${seed}:tilt`) < 0.5 ? -1 : 1;
      rotateDeg += side * 6.5 * a;
      dx += side * 0.02 * a;
    } else if (s.kind === "shake") {
      // A damped oscillation, not a sustained wobble: it hits hardest at the
      // start and dies out, which is what emphasis actually looks like.
      const local = (timeMs - s.startMs) / 1000;
      rotateDeg += Math.sin(local * Math.PI * 2 * 5.5) * 4.2 * a * Math.exp(-local * 2.2);
      dx += Math.sin(local * Math.PI * 2 * 5.5) * 0.014 * a * Math.exp(-local * 2.2);
    } else if (s.kind === "bob") {
      // Laughing: the head throws BACK and bounces, rather than nodding
      // forward. The vertical bounce runs at twice the rotation's rate — the
      // head comes up once per laugh but bobs on each syllable, which is what
      // separates a laugh from a nod.
      const local = (timeMs - s.startMs) / 1000;
      rotateDeg += -3.5 * a + Math.sin(local * Math.PI * 2 * 3.2) * 2.2 * a;
      dy += -0.014 * a + Math.abs(Math.sin(local * Math.PI * 2 * 6.4)) * 0.02 * a;
    } else {
      // Droop: down and slightly forward, the trailing-off gesture.
      rotateDeg += 3 * a;
      dy += 0.022 * a;
    }
  }

  return { rotateDeg, dx, dy };
}
