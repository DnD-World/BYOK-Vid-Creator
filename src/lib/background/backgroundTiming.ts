// ---------------------------------------------------------------------------
// When each background clip is on screen, in frames.
//
// This is the ONLY place that arithmetic lives. The render draws the clips with
// @remotion/transitions; the preview draws them with two <video> elements and
// an opacity ramp. Two completely different mechanisms — which is exactly how a
// preview and an export drift apart. They agree because both take their frame
// numbers from here and neither is allowed to compute its own.
//
// The rule TransitionSeries follows: a transition consumes the LAST t frames of
// the outgoing sequence and the FIRST t frames of the incoming one. So a clip
// that should own the stretch [s_i, s_i+1) is given (s_i+1 − s_i) + t frames,
// and the series lands the next one exactly where it belongs:
//
//   offset_i = Σ(dur_j, j<i) − i·t = s_i − s_0
//
// Pure: no clock, no filesystem, nothing measured. Frame counts come out the
// same on every render worker.
// ---------------------------------------------------------------------------

export interface BackgroundClip {
  startMs: number;
  endMs: number;
  /** Length of the source file in seconds, as the provider reported it — 0 when
   *  unknown. A clip shorter than the stretch it has to cover loops. */
  sourceSec: number;
}

export interface BackgroundSlot {
  /** Index into the clips array this slot was built from. Carried through
   *  because the slots are sorted and filtered, so position is not identity. */
  index: number;
  /** Absolute, in the composition's own timeline. */
  startFrame: number;
  durationInFrames: number;
  /** Restart the source every this many frames; 0 = it is long enough to play
   *  straight through. */
  loopInFrames: number;
}

export interface BackgroundTiming {
  slots: BackgroundSlot[];
  /** Crossfade length in frames. 0 means hard cuts. */
  transitionInFrames: number;
  fps: number;
}

const EMPTY: BackgroundTiming = { slots: [], transitionInFrames: 0, fps: 30 };

/**
 * Lay the clips out on the timeline.
 *
 * Each clip runs until the *next one starts*, not until its own `endMs`: a plan
 * with a gap in it would otherwise show a black flash between two backgrounds,
 * which reads as a bug rather than as a choice. Overlaps collapse the same way.
 */
export function backgroundTiming(
  clips: BackgroundClip[],
  crossfadeMs: number,
  fps: number
): BackgroundTiming {
  if (!Number.isFinite(fps) || fps <= 0) return EMPTY;

  const ordered = clips
    .map((clip, index) => ({ clip, index }))
    .filter(
      ({ clip }) =>
        Number.isFinite(clip.startMs) &&
        Number.isFinite(clip.endMs) &&
        clip.endMs > clip.startMs
    )
    .sort((a, b) => a.clip.startMs - b.clip.startMs);

  if (ordered.length === 0) return { ...EMPTY, fps };

  const toFrames = (ms: number) => Math.max(0, Math.round((ms / 1000) * fps));

  // Lengths first, then positions accumulated from them. Rounding each start
  // independently would let a slot's declared startFrame disagree with where
  // TransitionSeries actually puts it — by a frame, occasionally, which is the
  // kind of drift that is invisible until subtitles land on the wrong shot.
  const lengths = ordered.map(({ clip }, i) => {
    const from = toFrames(clip.startMs);
    const to = i === ordered.length - 1 ? toFrames(clip.endMs) : toFrames(ordered[i + 1].clip.startMs);
    return Math.max(1, to - from);
  });

  // A transition eats into both neighbours, so it can never be more than half
  // the shortest clip: a 600ms crossfade between two 400ms scenes is not a
  // crossfade, it is a dissolve with nothing in the middle of it.
  const shortest = Math.min(...lengths);
  const wanted = Math.max(0, Math.round((crossfadeMs / 1000) * fps));
  const transitionInFrames =
    ordered.length < 2 ? 0 : Math.max(0, Math.min(wanted, Math.floor(shortest / 2)));

  let cursor = toFrames(ordered[0].clip.startMs);
  const slots: BackgroundSlot[] = ordered.map(({ clip, index }, i) => {
    const startFrame = cursor;
    cursor += lengths[i];
    // Every clip but the last carries the outgoing half of its transition.
    const durationInFrames =
      lengths[i] + (i === ordered.length - 1 ? 0 : transitionInFrames);
    const sourceFrames = Math.floor((clip.sourceSec || 0) * fps);
    return {
      index,
      startFrame,
      durationInFrames,
      loopInFrames: sourceFrames >= 1 && sourceFrames < durationInFrames ? sourceFrames : 0,
    };
  });

  return { slots, transitionInFrames, fps };
}

export interface BackgroundLayer {
  index: number;
  /** 0–1. Later entries in the returned array draw on top of earlier ones. */
  opacity: number;
  /** Where in the source file this frame is, seconds, already wrapped for a
   *  looping clip. */
  sourceSec: number;
}

/**
 * Which clips are on screen at `frame`, and how opaque.
 *
 * Matches what `TransitionSeries` + `fade()` draws, deliberately: the outgoing
 * clip stays fully opaque and the incoming one ramps up over it. Fading both
 * would show the black behind them at the midpoint.
 */
export function backgroundLayersAt(
  timing: BackgroundTiming,
  frame: number
): BackgroundLayer[] {
  const out: BackgroundLayer[] = [];
  for (let i = 0; i < timing.slots.length; i++) {
    const slot = timing.slots[i];
    const local = frame - slot.startFrame;
    if (local < 0 || local >= slot.durationInFrames) continue;
    const t = timing.transitionInFrames;
    const opacity = i === 0 || t === 0 ? 1 : Math.min(1, Math.max(0, local / t));
    const srcFrame = slot.loopInFrames > 0 ? local % slot.loopInFrames : local;
    out.push({ index: slot.index, opacity, sourceSec: srcFrame / timing.fps });
  }
  return out;
}
