// ---------------------------------------------------------------------------
// Glitter on a waveform.
//
// Sparks are thrown off the LOUD parts and nowhere else. Scattering them evenly
// would just add noise over the whole frame; tying them to amplitude means the
// glitter is a second reading of the audio rather than decoration laid on top,
// so it lands on the beat without anything having to detect a beat.
//
// PURE, like everything else on the render path: same (seed, time) always gives
// the same sparks. Remotion renders frames out of order across parallel
// workers, so a Math.random() here would make the glitter flicker differently
// in the preview and in the export, and differently on every re-render.
// ---------------------------------------------------------------------------

export interface Spark {
  x: number;
  y: number;
  /** Radius in px. */
  r: number;
  /** 0–1. */
  opacity: number;
  /** Degrees — the cross is rotated so they don't all align into a grid. */
  rotate: number;
}

/** Stable 0..1 from two integers. Same construction as the blink and idle
 *  seeds, for the same reason: two tracks must not sparkle in lockstep. */
function hash01(a: number, b: number): number {
  let h = 2166136261 ^ Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export interface SparkleOptions {
  /** 0 = off, 1 = as much as this is willing to throw. */
  amount: number;
  /** Bar tips, already positioned. */
  tips: { x: number; y: number }[];
  /** Amplitude per tip, 0–1 — the gate for whether a tip sparks at all. */
  amps: number[];
  timeMs: number;
  /** Distinguishes tracks so two waveforms don't twinkle identically. */
  seed: number;
  /** Scales spark size with the artwork around it. */
  scale: number;
}

/** Only the top of a bar's travel throws sparks. Below this the waveform is
 *  just moving, not peaking, and glitter on every bar reads as static. */
const GATE = 0.45;

/** How long one spark lives. Short — a spark that lingers becomes a dot. */
const LIFE_MS = 420;

/** Sparks per tip per life cycle, at full amount. */
const PER_TIP = 3;

export function sparklesFor({
  amount, tips, amps, timeMs, seed, scale,
}: SparkleOptions): Spark[] {
  if (amount <= 0) return [];
  const out: Spark[] = [];

  for (let i = 0; i < tips.length; i++) {
    const amp = amps[i] ?? 0;
    if (amp < GATE) continue;
    // Loud tips throw more, so the glitter thickens with the music instead of
    // being a constant drizzle.
    const strength = (amp - GATE) / (1 - GATE);

    for (let k = 0; k < PER_TIP; k++) {
      // Each spark belongs to a numbered cycle. Advancing the cycle with time
      // is what makes them appear and vanish without any state being kept
      // between frames.
      const phase = hash01(i * 31 + k, seed) * LIFE_MS;
      const cycle = Math.floor((timeMs + phase) / LIFE_MS);
      const age = ((timeMs + phase) % LIFE_MS) / LIFE_MS;

      // A fresh roll per cycle, so a spark lands somewhere new each time
      // rather than blinking in the same spot forever.
      const rx = hash01(i * 977 + k, cycle + seed * 7);
      const ry = hash01(i * 613 + k, cycle * 3 + seed);
      const rs = hash01(i * 421 + k, cycle * 5 + seed);

      // Thin out the weaker tips by dropping most of their sparks entirely.
      if (rs > 0.35 + strength * 0.65) continue;

      // Scatter around the tip, biased outward — sparks fly off the end of a
      // bar, they don't sit on it.
      const spread = scale * (2.2 + rs * 3.4);
      const x = tips[i].x + (rx - 0.5) * spread * 2;
      const y = tips[i].y + (ry - 0.5) * spread * 2;

      // Fade in fast, out slow: a glint, not a pulse.
      const fade = age < 0.18 ? age / 0.18 : 1 - (age - 0.18) / 0.82;

      out.push({
        x,
        y,
        r: scale * (0.62 + rs * 0.85) * (0.5 + strength * 0.5),
        opacity: Math.max(0, fade) * amount * (0.45 + strength * 0.55),
        rotate: rx * 90,
      });
    }
  }

  return out;
}
