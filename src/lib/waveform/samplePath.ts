import type { WaveformConfig } from "../../store/types";

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
 */
export function samplePath(
  position: WaveformConfig["position"],
  w: number,
  h: number,
  count: number
): PathPoint[] {
  const pts: PathPoint[] = [];

  if (position === "circular") {
    const cx = w / 2;
    const cy = h / 2;
    const r = Math.min(w, h) * 0.34;
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
    const y = position === "top" ? h * 0.08 : h * 0.92;
    const ny = position === "top" ? 1 : -1; // bars grow inward, toward center
    for (let i = 0; i < count; i++) {
      const x = w * (0.08 + (i / (count - 1)) * 0.84);
      pts.push({ x, y, nx: 0, ny });
    }
    return pts;
  }

  // left / right
  const x = position === "left" ? w * 0.08 : w * 0.92;
  const nx = position === "left" ? 1 : -1;
  for (let i = 0; i < count; i++) {
    const y = h * (0.08 + (i / (count - 1)) * 0.84);
    pts.push({ x, y, nx, ny: 0 });
  }
  return pts;
}
