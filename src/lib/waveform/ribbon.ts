// ---------------------------------------------------------------------------
// A wide ribbon wrapped round the face, twisting as it goes.
//
// WHAT MAKES IT READ AS A RIBBON RATHER THAN A THICK RING. A flat band seen
// face-on shows its full width; the same band turned edge-on collapses to a
// line. So the width at an angle is not a constant — it is the cosine of how
// far the surface has twisted at that point. Follow it round and the band
// swells, pinches to a hairline, and opens out again, which is exactly what a
// streamer does.
//
// And on the far side of a pinch you are looking at the OTHER FACE. That is why
// this returns which face is showing rather than leaving the caller to guess:
// the colour flip and the pinch are the same event, and if they are computed
// separately they drift apart by a slice and the twist stops reading.
//
// SAME RULE AS EVERYTHING ELSE HERE: a pure function of angle and time. Remotion
// draws frames out of order, so a twist that advanced by a step each tick would
// give a different video every render. Nothing accumulates; ask for a moment
// twice and you get the same answer.
// ---------------------------------------------------------------------------

export interface RibbonTwist {
  /** 0 at a pinch (edge-on, a hairline) to 1 face-on. Multiply the ribbon's
   *  half-width by this. */
  openness: number;
  /** Which face the viewer is looking at. Flips through every pinch. */
  front: boolean;
  /** The SIGNED half-width multiplier, -1 to 1.
   *
   *  Offsetting the two edges by ±this rather than by ±openness is what makes
   *  the twist a twist: the offset passes through zero at a pinch and comes out
   *  negative, so the edge that was outside crosses to the inside. Offset by
   *  the absolute value and the edges merely touch and bounce apart, which is a
   *  waist, not a turn. `front` is the sign of this same number, so the colour
   *  flip cannot land a slice away from the crossing. */
  lean: number;
  /** How far the ribbon's CENTRE has swung off the guide curve, -1 to 1.
   *
   *  Without this the twist is invisible on a circular ring. Narrowing is then
   *  the only thing that changes anywhere on the shape, and a band that only
   *  narrows reads as a string of sausages — which is exactly what it looked
   *  like. It read correctly on a SQUARE only because the spine already swings
   *  out at the corners, and that swing was doing the work.
   *
   *  A ribbon wound round a ring sits on the surface of a tube, so its centre
   *  circles the guide as it goes. That puts the swing a quarter turn out of
   *  phase with the width: widest as it crosses the guide, a hairline at the
   *  far side of the swing. The two together are a twist; either alone is not. */
  swing: number;
}

export interface RibbonOptions {
  /** Full twists in one trip round the ring. 3 gives six pinches, which is
   *  enough to read as a twist without turning the band into a barber pole.
   *
   *  MUST BE A WHOLE NUMBER. The ribbon is a closed loop, so the twist has to
   *  come back to where it started after 2π. At 2.5 it came back half a turn
   *  out — the band arrived at angle 0 showing the opposite face and jumped,
   *  which Ak saw as the right-hand middle being malformed. It is the only
   *  place on the ring where a seam can appear, and this is why. */
  turns?: number;
  /** How long the twist takes to travel once round, in ms. Negative runs the
   *  other way.
   *
   *  DELIBERATELY SLOW, and this is the whole reason the ribbon "only rotated".
   *  A phase of `turns x angle + w x t` is a travelling wave, and on a ring a
   *  travelling wave is indistinguishable from the pattern being spun: adding
   *  time is exactly the same as subtracting angle. However much twisting the
   *  maths contained, the eye saw a rigid object turning. */
  periodMs?: number;
  /** How long one rock takes, in ms, and how far it rocks, in radians.
   *
   *  This is what a twist actually looks like. Rocking the phase back and forth
   *  is NOT equivalent to a rotation, because it reverses: the pinches stay
   *  roughly where they are and the surface rolls through them, which is what
   *  happens when you twist a real ribbon between your fingers. */
  rockMs?: number;
  rock?: number;
  /** A slower second turn laid over the first, so the pinches are unevenly
   *  spaced and the whole thing does not look machined. 0 disables it. */
  wander?: number;
  /** How many times the wander cycles per trip round. A WHOLE NUMBER, for
   *  exactly the same reason as `turns` — a term that does not close leaves the
   *  same seam, and it is easy to fix one and forget the other. */
  wanderTurns?: number;
}

/**
 * How the ribbon is presented at `angle`.
 *
 * The phase is angle × turns plus a term in time, so the pinches travel round
 * the ring rather than sitting at fixed points — a twist parked at the same
 * angle for nine minutes reads as a dent in the artwork, not as motion.
 */
export function ribbonTwistAt(
  angle: number,
  timeMs: number,
  opts: RibbonOptions = {}
): RibbonTwist {
  // Rounded rather than trusted. A fractional turn count does not close the
  // loop, and the resulting seam is subtle enough to survive review — it did.
  const turns = Math.max(1, Math.round(opts.turns ?? 3));
  const wanderTurns = Math.max(1, Math.round(opts.wanderTurns ?? 2));
  const periodMs = opts.periodMs ?? 30000;
  const rockMs = opts.rockMs ?? 2400;
  const rock = opts.rock ?? 2.2;
  const wander = opts.wander ?? 0.55;

  const phase =
    angle * turns +
    // The rocking term does the twisting. It has no angle in it, so it moves
    // the whole pattern — but it reverses, and a rotation that reverses is a
    // roll, not a spin.
    Math.sin((timeMs / rockMs) * Math.PI * 2) * rock +
    // A slow drift underneath, so the pinches do not sit at the same six angles
    // for nine minutes. Small enough not to read as spinning on its own.
    (timeMs / periodMs) * Math.PI * 2 +
    // A second, slower turn so the pinches are unevenly spaced. It closes too,
    // and at a different rate from the first, so the two drift against each
    // other and the pattern does not repeat within a shot.
    Math.sin(angle * wanderTurns + timeMs / 3300) * wander;

  const c = Math.cos(phase);
  // The honest foreshortening is |cos|, which spends most of its time thin. The
  // power opens the band out and keeps the pinch sharp — the ribbon is meant to
  // be seen, not to spend the shot on its edge.
  const open = Math.pow(Math.abs(c), 0.7);
  return {
    openness: open,
    front: c >= 0,
    lean: c >= 0 ? open : -open,
    swing: Math.sin(phase),
  };
}

/**
 * The underside, derived from the face colour rather than picked separately.
 *
 * A speaker's waveform IS their outline colour — that invariant is why the
 * colour lives on the speaker and not on the track. A second colour chosen by
 * hand would be the one part of the waveform that could drift away from the
 * face it belongs to, so the back face is turned away from the light instead:
 * darker, less saturated, nudged cool. It reads as the same ribbon seen from
 * behind, which is what it is.
 */
export function backFaceColor(hex: string): string {
  const c = parseHex(hex);
  if (!c) return hex;
  // Toward a dark blue-grey rather than toward black: a face that darkens
  // straight to black reads as a hole punched in the ribbon, and the twist
  // stops being a turn.
  const mix = (v: number, toward: number) => v * 0.42 + toward * 0.28;
  return toHex(mix(c.r, 26), mix(c.g, 34), mix(c.b, 58));
}

/**
 * The same colour with light on it, for the sheen down the middle of the band.
 *
 * A LIGHTER COLOUR, not white at partial alpha, and the difference is not
 * cosmetic. The slices are drawn overlapping so no seams show between them —
 * which is only true while they are opaque. Any transparency in the fill makes
 * each overlap composite twice and the ribbon comes out finely striped, as it
 * did. Every stop is solid; the highlight is mixed in here instead.
 */
export function litFaceColor(hex: string, amount: number): string {
  const c = parseHex(hex);
  if (!c) return hex;
  const a = Math.max(0, Math.min(1, amount));
  const mix = (v: number) => v + (255 - v) * a;
  return toHex(mix(c.r), mix(c.g), mix(c.b));
}

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const num = parseInt(full, 16);
  if (!Number.isFinite(num) || full.length !== 6) return null;
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function toHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0"))
      .join("")
  );
}
