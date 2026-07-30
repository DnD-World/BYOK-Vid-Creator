// ---------------------------------------------------------------------------
// Bar heights for the waveform.
//
// Two modes, and which one is in play depends only on whether real narration
// audio has been analysed yet:
//
//   shapedAmplitude()  - real speech drives it. `level` is the measured
//                        loudness at this instant; the shape function only
//                        decides how that loudness is distributed across bars.
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
 * Real-audio bar height. `level` (0–1) is the measured loudness of the
 * narration at this instant and sets the ceiling; the shape term only varies
 * bars relative to each other, never lifts them above the true level.
 *
 * The consequence that matters: in a pause between lines `level` is ~0, so the
 * waveform genuinely goes still instead of idling. That silence is what makes
 * the motion read as driven by the voice rather than decorative.
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
