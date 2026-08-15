// ---------------------------------------------------------------------------
// Particles, sparks and bubbles that exist without remembering anything.
//
// THE RULE THAT SHAPES ALL OF THIS. The live preview draws frames in order and
// could happily keep a list of particles, nudging each one along every tick.
// The renderer cannot: Remotion draws frames OUT OF ORDER and several at once,
// so frame 400 may be drawn before frame 12 and neither can ask what the other
// saw. A particle system written the ordinary way would produce a different
// video on every render, and frames within one video that disagree.
//
// So nothing here accumulates. Every particle is derived from the clock: it was
// born at a known moment, and where it is now follows from how long ago that
// was. Ask for time t twice and you get the same answer; ask in any order and
// you still do.
//
// WHERE THE RANDOMNESS COMES FROM. Real randomness would break the same rule,
// so each particle's angle, speed and size come from a hash of its own index.
// It looks scattered and it is completely repeatable — the same trick the
// viseme and idle-motion code already uses.
// ---------------------------------------------------------------------------

/** A hash → 0..1. Deterministic, cheap, and good enough to look random.
 *
 *  Nothing here may call Math.random(): two render workers drawing neighbouring
 *  frames would disagree about a particle that is meant to be the same one.
 *
 *  MEASURED over the seeds this code actually generates — burst time × 131 plus
 *  index × 7919 — 252 samples land with a mean of 0.464 and no decile holding
 *  fewer than 17 or more than 35. Even enough that particles scatter rather than
 *  clump. It is noticeably worse on tiny consecutive seeds (0, 1, 2 …), which is
 *  why the seeds are spread apart by those primes rather than being counters. */
function rand01(seed: number): number {
  let x = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

/** One emission moment: when it happened and how hard. */
export interface Burst {
  atMs: number;
  /** 0–1. Decides how many particles and how fast they leave. */
  power: number;
}

/**
 * Find the moments worth emitting on, from the audio itself.
 *
 * Derived ONCE from the analysis rather than per frame, so every frame agrees
 * about when the bursts were — and so a burst lands on an actual consonant
 * rather than on a timer.
 *
 * `levelAt` is whatever the caller uses as loudness for a moment; a rise beyond
 * `threshold` above the local average counts as an onset. `minGapMs` stops a
 * long loud syllable becoming a hundred bursts.
 */
export function findBursts(
  durationMs: number,
  levelAt: (ms: number) => number,
  opts: { stepMs?: number; threshold?: number; minGapMs?: number } = {}
): Burst[] {
  const step = opts.stepMs ?? 1000 / 60;
  const threshold = opts.threshold ?? 0.08;
  const minGap = opts.minGapMs ?? 90;

  const out: Burst[] = [];
  let avg = levelAt(0);
  let lastAt = -Infinity;

  for (let ms = 0; ms < durationMs; ms += step) {
    const level = levelAt(ms);
    const rise = level - avg;
    avg += (level - avg) * 0.08;
    if (rise > threshold && ms - lastAt >= minGap) {
      out.push({ atMs: ms, power: Math.min(1, rise / (threshold * 3)) });
      lastAt = ms;
    }
  }
  return out;
}

export interface Particle {
  /** Position in polar coordinates around the ring's centre. */
  angle: number;
  radius: number;
  /** 1 at birth, 0 at death — callers use it for alpha and size. */
  life: number;
  /** Perspective depth. >1 is further away: smaller and cooler. */
  z: number;
  /** Stable per-particle 0–1, for anything that should vary but not flicker. */
  seed: number;
}

export interface ParticleOptions {
  /** Where particles are born, in the same units as `radius`. */
  ringRadius: number;
  /** How long one lives. */
  lifeMs?: number;
  /** Born per unit of burst power. */
  perBurst?: number;
  /** Outward speed, in radius units per second, before power scales it. */
  speed?: number;
  /** How far off its birth angle a particle may head, in radians. 0 keeps it
   *  on a spoke; larger scatters it. */
  spread?: number;
  /** Sideways drift as it travels, so paths curve instead of being spokes. */
  swirl?: number;
}

/**
 * Every particle alive at `timeMs`, computed rather than remembered.
 *
 * Walks back over the bursts that are still within a lifetime and reconstructs
 * their particles. Cost is bounded by lifetime × emission rate, not by how long
 * the video has been running — a particle system that has been going for nine
 * minutes costs exactly what it cost in the first second.
 */
export function particlesAt(
  bursts: Burst[],
  timeMs: number,
  opts: ParticleOptions
): Particle[] {
  const lifeMs = opts.lifeMs ?? 900;
  const perBurst = opts.perBurst ?? 14;
  const speed = opts.speed ?? 0.55;
  const spread = opts.spread ?? 0.5;
  const swirl = opts.swirl ?? 0.25;

  const out: Particle[] = [];

  // Bursts are in order, so walk back from the newest that has happened.
  let i = bursts.length - 1;
  while (i >= 0 && bursts[i].atMs > timeMs) i--;

  for (; i >= 0; i--) {
    const b = bursts[i];
    const ageMs = timeMs - b.atMs;
    if (ageMs > lifeMs) break;          // everything older is dead
    const life = 1 - ageMs / lifeMs;
    const ageSec = ageMs / 1000;
    const n = Math.max(1, Math.round(perBurst * b.power));

    for (let k = 0; k < n; k++) {
      const s = b.atMs * 131 + k * 7919;
      const r1 = rand01(s), r2 = rand01(s + 1), r3 = rand01(s + 2);
      const born = r1 * Math.PI * 2;
      out.push({
        angle: born + (r2 - 0.5) * spread + swirl * ageSec * (r3 - 0.5),
        radius: opts.ringRadius * (1 + speed * ageSec * (0.4 + b.power) * (0.6 + r3)),
        life,
        z: 0.6 + r2 * 0.9,
        seed: r1,
      });
    }
  }
  return out;
}

export interface Bubble {
  /** Centre of the swell. */
  angle: number;
  /** Angular half-width, in radians. */
  width: number;
  /** 0–1, how far out it pushes at its peak. */
  height: number;
  /** 0 → 1 → 0 across its life. */
  swell: number;
}

/**
 * The bubbles alive at `timeMs`.
 *
 * Boiling rather than waving, and the difference matters: a bump swells at ONE
 * angle, peaks, and subsides, while others do the same elsewhere on their own
 * schedule. Local in space, finite in time, uncoordinated.
 *
 * Emission is on a fixed grid rather than on audio onsets — a boil is not
 * percussive, and tying it to consonants made it flicker. Loudness decides how
 * big each bubble gets, not whether it exists, so the surface keeps moving in a
 * pause the way a pot off the boil does.
 */
export function bubblesAt(
  timeMs: number,
  levelAt: (ms: number) => number,
  opts: { everyMs?: number; lifeMs?: number } = {}
): Bubble[] {
  const every = opts.everyMs ?? 220;
  const lifeMs = opts.lifeMs ?? 1300;

  const out: Bubble[] = [];
  const newest = Math.floor(timeMs / every);
  const oldest = Math.floor((timeMs - lifeMs) / every);

  for (let n = oldest; n <= newest; n++) {
    const bornMs = n * every;
    const ageMs = timeMs - bornMs;
    if (ageMs < 0 || ageMs > lifeMs) continue;

    const r1 = rand01(n * 2654435761), r2 = rand01(n * 2654435761 + 1);
    const loud = levelAt(bornMs);
    out.push({
      angle: r1 * Math.PI * 2,
      width: 0.35 + r2 * 0.75,
      height: 0.3 + r2 * 0.5 + loud * 0.6,
      // Rises, holds briefly, subsides — a bubble, not a spike.
      swell: Math.sin((ageMs / lifeMs) * Math.PI),
    });
  }
  return out;
}

/** How far the surface is pushed out at `angle`, given the live bubbles.
 *
 *  Each bubble contributes a smooth hump around its own centre, and they add —
 *  two bubbles near each other make one larger swell, which is what a boiling
 *  surface actually does. */
export function surfaceAt(bubbles: Bubble[], angle: number): number {
  let sum = 0;
  for (const b of bubbles) {
    let d = Math.abs(angle - b.angle);
    if (d > Math.PI) d = Math.PI * 2 - d;    // shortest way round the circle
    if (d > b.width * 2) continue;
    sum += Math.exp(-(d * d) / (b.width * b.width)) * b.swell * b.height;
  }
  return Math.min(1, sum);
}
