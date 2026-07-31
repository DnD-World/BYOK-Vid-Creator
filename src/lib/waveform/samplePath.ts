import type { TrackWaveform } from "../../store/types";

export interface PathPoint {
  x: number;
  y: number;
  /** Unit normal — the direction amplitude extends toward. */
  nx: number;
  ny: number;
}

/**
 * Evenly spaced anchor points along the waveform's path for a given
 * position, plus the outward-facing unit normal at each point (the
 * direction bars/dots/lines extend toward as amplitude increases).
 * Coordinates are in the 0..w / 0..h box the waveform renders into.
 *
 * `edgeFlush` toggles between hugging the literal edge (0% margin) and the
 * default inset (8% margin) — this is deliberately a toggle, not free-drag
 * positioning, since that's all that was actually needed.
 */
export interface RingOverride {
  cx: number;
  cy: number;
  r: number;
}

export function samplePath(
  position: TrackWaveform["position"],
  w: number,
  h: number,
  count: number,
  edgeFlush = false,
  /** Explicit centre and radius for a closed ring, used by the "speaker"
   *  position so a halo can sit around a face instead of the frame. */
  ring?: RingOverride
): PathPoint[] {
  const pts: PathPoint[] = [];
  const margin = edgeFlush ? 0.01 : 0.08;

  if (position === "circular" || position === "speaker") {
    const cx = ring ? ring.cx : w / 2;
    const cy = ring ? ring.cy : h / 2;
    const r = ring ? ring.r : Math.min(w, h) * (edgeFlush ? 0.48 : 0.34);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 - Math.PI / 2;
      pts.push({
        x: cx + Math.cos(a) * r,
        y: cy + Math.sin(a) * r,
        nx: Math.cos(a),
        ny: Math.sin(a),
      });
    }
    return pts;
  }

  if (position === "top" || position === "bottom") {
    const y = position === "top" ? h * margin : h * (1 - margin);
    const ny = position === "top" ? 1 : -1; // bars grow inward, toward center
    for (let i = 0; i < count; i++) {
      const x = w * (margin + (i / (count - 1)) * (1 - margin * 2));
      pts.push({ x, y, nx: 0, ny });
    }
    return pts;
  }

  // left / right
  const x = position === "left" ? w * margin : w * (1 - margin);
  const nx = position === "left" ? 1 : -1;
  for (let i = 0; i < count; i++) {
    const y = h * (margin + (i / (count - 1)) * (1 - margin * 2));
    pts.push({ x, y, nx, ny: 0 });
  }
  return pts;
}
