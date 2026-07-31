// ---------------------------------------------------------------------------
// Idle motion for a speaker's head.
//
// The problem this solves is not lip-sync. The mouth was already moving; the
// rest of the head was perfectly, unnaturally still, which is what made the
// avatars read as photographs with an animated mouth rather than as characters.
// A face that breathes and drifts a little reads as alive even when nothing
// else changes, and it costs one CSS transform.
//
// Deliberately tiny. Everything here is under 2% of the head's size, because
// the waveform halo is anchored to the speaker's stored position and does NOT
// follow — a head that visibly wanders inside its own ring looks broken, while
// one that breathes inside it looks intentional.
//
// PURE. Same (seed, timeMs, speaking) always gives the same transform, with no
// clock of its own — the same rule the waveform and subtitles follow, and for
// the same reason: Remotion renders frames out of order across parallel
// workers, so a wall clock here would produce a video that jitters.
// ---------------------------------------------------------------------------

export interface HeadMotion {
  /** Multiplier on the avatar's size. */
  scale: number;
  /** Degrees, positive = clockwise. */
  rotateDeg: number;
  /** Translation as a fraction of the avatar's size. */
  dx: number;
  dy: number;
}

export const STILL: HeadMotion = { scale: 1, rotateDeg: 0, dx: 0, dy: 0 };

/** Stable 0..1 from a speaker id, so two speakers breathe out of phase with
 *  each other instead of pulsing in unison like a pair of metronomes. */
function phaseOf(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

/**
 * @param amount 0 = perfectly still, 1 = as much as this is willing to move.
 * @param speaking Whoever is talking gets slightly more of everything and sits
 *   a touch larger. That difference is a free "who is talking" cue, on top of
 *   the waveform and the caption colour — three quiet signals agreeing beats
 *   one loud one.
 */
export function headMotion(
  seed: string,
  timeMs: number,
  speaking: boolean,
  amount = 1
): HeadMotion {
  if (amount <= 0) return STILL;

  const t = timeMs / 1000;
  const p = phaseOf(seed) * Math.PI * 2;
  const life = speaking ? 1 : 0.55;
  const a = amount * life;

  // Three periods that don't divide into each other, so the loop never lands
  // on an obvious repeat within a video's length.
  const breath = Math.sin(t * (Math.PI * 2) / 4.3 + p);
  const swayX = Math.sin(t * (Math.PI * 2) / 7.1 + p * 1.7);
  const swayY = Math.sin(t * (Math.PI * 2) / 5.9 + p * 0.6);
  const tilt = Math.sin(t * (Math.PI * 2) / 9.7 + p * 2.3);

  return {
    // The speaking head sits ~1.5% larger before breathing is added.
    scale: 1 + (speaking ? 0.015 : 0) * amount + breath * 0.011 * a,
    rotateDeg: tilt * 1.1 * a,
    dx: swayX * 0.008 * a,
    dy: swayY * 0.006 * a - breath * 0.004 * a,
  };
}

/** The CSS transform for a head, ready to append after the centring translate. */
export function motionTransform(m: HeadMotion, size: number): string {
  if (m === STILL) return "";
  return (
    ` translate(${(m.dx * size).toFixed(2)}px, ${(m.dy * size).toFixed(2)}px)` +
    ` rotate(${m.rotateDeg.toFixed(3)}deg)` +
    ` scale(${m.scale.toFixed(4)})`
  );
}
