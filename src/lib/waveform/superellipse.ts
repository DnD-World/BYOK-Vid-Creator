// ---------------------------------------------------------------------------
// One equation for circle, rounded square and square.
//
// The ring styles all work in angle-and-radius, so the only thing that decides
// whether a waveform is round or square is how far the base shape sits from the
// centre at a given angle. A superellipse gives all three from one exponent —
// no separate code paths, no per-shape special cases, and anything in between
// is available for free.
//
//   |x/a|^n + |y/b|^n = 1
//
//   n = 2   a circle
//   n ≈ 4   a rounded square, the squircle an app icon uses
//   n → ∞   a square
//   n = 1   a diamond, which nobody asked for but comes along anyway
//
// Deliberately NOT a rounded-rectangle path with corner arcs. That is the
// obvious way to draw a squircle and it is the wrong tool here: it gives a
// path, and what these styles need is a RADIUS AT AN ANGLE — one number, asked
// for a hundred and twenty-eight times a frame, at arbitrary angles a path
// cannot answer.
// ---------------------------------------------------------------------------

import type { OutlineShape } from "../../store/types";

/** The exponent behind each frame shape.
 *
 *  "none" means no frame is DRAWN, not that the avatar is square — the art is
 *  round either way, so its waveform stays round. Same rule the glass disc
 *  follows. */
export function exponentFor(shape: OutlineShape | undefined): number {
  switch (shape) {
    case "square": return 12;
    case "rounded": return 4.5;
    default: return 2;      // circle, none, or unset
  }
}

/**
 * How far the shape sits from its centre at `angle`, as a multiple of the
 * radius a circle would have.
 *
 * Always 1 for a circle, and up to about 1.41 at the corners of a square —
 * which is correct and worth expecting: a square's corner IS further from the
 * middle than its edge. Callers sizing something against a face should measure
 * against the shortest direction, not the longest, or a square waveform will
 * sit further out than the round one it replaced.
 */
export function shapeRadius(angle: number, exponent: number): number {
  if (exponent === 2) return 1;                    // the common case, free
  const c = Math.abs(Math.cos(angle));
  const s = Math.abs(Math.sin(angle));
  // Guard the degenerate axes: cos or sin is 0 there and a large exponent
  // sends the other term to 1, which is right, but 0^big underflows first.
  const denom = Math.pow(Math.pow(c, exponent) + Math.pow(s, exponent), 1 / exponent);
  return denom > 1e-6 ? 1 / denom : 1;
}
