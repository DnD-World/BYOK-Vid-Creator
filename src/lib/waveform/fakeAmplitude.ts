// ---------------------------------------------------------------------------
// PLACEHOLDER audio analysis — stands in for real TTS-audio amplitude data
// until Phase 2 (real audio pipeline) lands. Everything here is a pure
// function of (track, sample index, elapsed ms): same inputs always produce
// the same output, matching the project's "deterministic" design philosophy
// (this is NOT random noise — replaying the same timeline gives identical
// motion, same as the rest of the render pipeline will).
// ---------------------------------------------------------------------------

export function fakeAmplitude(track: number, i: number, timeMs: number): number {
  const t = timeMs / 1000;
  const phase = i * 0.7 + track * 2.1;
  const a =
    Math.sin(t * 2.4 + phase) * 0.5 +
    Math.sin(t * 5.1 + phase * 1.3) * 0.3 +
    Math.sin(t * 0.9 + phase * 0.4) * 0.2;
  return Math.max(0.05, Math.min(1, (a + 1) / 2));
}

/**
 * Placeholder "which track is currently talking" gate, until real
 * diarization/timing data exists. Cycles a ~2.4s window per track so
 * multi-track modes visibly demonstrate the "only active speakers animate"
 * rule from the spec.
 */
export function fakeActiveTrack(trackCount: number, timeMs: number): number {
  if (trackCount <= 1) return 0;
  const cycle = 2400;
  return Math.floor(timeMs / cycle) % trackCount;
}
