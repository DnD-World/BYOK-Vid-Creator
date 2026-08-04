// ---------------------------------------------------------------------------
// Bar heights for the waveform.
//
// Two modes, and which one is in play depends only on whether real narration
// audio has been analysed yet:
//
//   bandAmplitude()    - real speech drives it, per frequency band. Each bar
//                        reads its own band, so bass and treble move
//                        independently the way they actually do.
//   shapedAmplitude()  - fallback for audio analysed without a spectrum.
//                        One loudness value spread across the bars by a shape
//                        function, which means every bar moves together.
//   placeholderAmplitude() - no audio yet, so the canvas still has to look
//                        alive. Pure function of (track, index, time).
//
// Both are deterministic: same inputs, same output, every time. Nothing here
// may read performance.now(), Date.now() or Math.random() — these run inside
// Remotion's parallel out-of-order render workers, where a wall clock would
// produce a video that flickers frame to frame.
// ---------------------------------------------------------------------------

/**
 * Spatial/temporal shape in roughly 0..1. On its own this is the placeholder
 * animation; scaled by a real loudness value it becomes the distribution of
 * that loudness across the bars.
 */
export function placeholderAmplitude(track: number, i: number, timeMs: number): number {
  const t = timeMs / 1000;
  // Small per-index step (was 0.7 rad — a huge jump between neighboring bars,
  // which is what made the waveform look jagged/angular instead of like a
  // flowing wave). 0.12 keeps adjacent samples strongly correlated.
  const spatial = i * 0.12 + track * 2.1;
  const a =
    Math.sin(t * 2.4 + spatial) * 0.5 +
    Math.sin(t * 1.1 + spatial * 0.6) * 0.3 +
    Math.sin(t * 0.5 + spatial * 0.25) * 0.2;
  return Math.max(0.05, Math.min(1, (a + 1) / 2));
}

/**
 * Real-audio bar height, from the spectrum. Bar `i` of `count` reads a band,
 * interpolated between the two nearest so a 56-bar ring off 24 bands is a
 * curve rather than 24 visible steps.
 *
 * There is deliberately no global loudness multiplier here. The band level IS
 * the height — that is the whole point of the change. Scaling every band by
 * one number is what the shape function used to do, and it is why the waveform
 * breathed in unison. Silence stays silent because every band is near zero
 * during it, not because something outside gates it.
 *
 * `closed` mirrors the spectrum around a ring: bar 0 and the last bar are
 * neighbours on a circle, so running low->high straight round would put a hard
 * seam where treble meets bass. Mirroring makes it symmetrical, which is also
 * what almost every circular visualiser does.
 */
export function bandAmplitude(
  bands: Uint8Array,
  bandCount: number,
  i: number,
  count: number,
  closed: boolean
): number {
  if (bandCount === 0 || count <= 0) return 0.01;

  const t = count === 1 ? 0 : i / count;
  const u = closed ? (t < 0.5 ? t * 2 : (1 - t) * 2) : t;

  const pos = u * (bandCount - 1);
  const lo = Math.floor(pos);
  const hi = Math.min(bandCount - 1, lo + 1);
  const f = pos - lo;
  const v = (bands[lo] * (1 - f) + bands[hi] * f) / 255;
  return Math.max(0.01, Math.min(1, v));
}

/**
 * Fallback bar height when audio was analysed but carries no spectrum — an
 * older analysis, or a render whose spectrum file failed to load. `level` sets
 * the ceiling and the shape term only varies bars relative to each other.
 */
export function shapedAmplitude(
  track: number,
  i: number,
  timeMs: number,
  level: number
): number {
  const shape = 0.45 + placeholderAmplitude(track, i, timeMs) * 0.55;
  return Math.max(0.01, Math.min(1, level * shape));
}

/**
 * Placeholder "which track is currently talking" gate, used only when there is
 * no analysed audio. Cycles a ~2.4s window per track so multi-track modes
 * still demonstrate the "only active speakers animate" rule.
 */
export function placeholderActiveTrack(trackCount: number, timeMs: number): number {
  if (trackCount <= 1) return 0;
  const cycle = 2400;
  return Math.floor(timeMs / cycle) % trackCount;
}
