import { useEffect, useRef, useState } from "react";
import type { WaveformConfig } from "../../store/types";
import { samplePath, type PathPoint } from "../../lib/waveform/samplePath";
import { fakeAmplitude, fakeActiveTrack } from "../../lib/waveform/fakeAmplitude";

interface Props {
  config: WaveformConfig;
  width: number;
  height: number;
}

interface TrackDef {
  color: string;
  /** Always-animating tracks (e.g. music) ignore the active-speaker gate. */
  alwaysActive: boolean;
  /** Ring offset (circular) / lane offset (linear) so multiple tracks don't overlap. */
  laneOffset: number;
}

const SAMPLE_COUNT = 48;

function tracksForBehavior(cfg: WaveformConfig): TrackDef[] {
  switch (cfg.behavior) {
    case "single":
      return [{ color: cfg.colorA, alwaysActive: true, laneOffset: 0 }];
    case "single-colorshift":
      // One visual track, but its color swaps between speaker A/B colors
      // depending on which speaker is "active" — handled in the component,
      // not here (needs the live active-track index).
      return [{ color: cfg.colorA, alwaysActive: true, laneOffset: 0 }];
    case "dual":
      return [
        { color: cfg.colorA, alwaysActive: false, laneOffset: -1 },
        { color: cfg.colorB, alwaysActive: false, laneOffset: 1 },
      ];
    case "dual-plus-music":
      return [
        { color: cfg.colorA, alwaysActive: false, laneOffset: -1.4 },
        { color: cfg.colorB, alwaysActive: false, laneOffset: 0 },
        { color: cfg.colorMusic, alwaysActive: true, laneOffset: 1.4 },
      ];
    case "triple":
      return [
        { color: cfg.colorA, alwaysActive: true, laneOffset: -1.4 },
        { color: cfg.colorB, alwaysActive: true, laneOffset: 0 },
        { color: cfg.colorMusic, alwaysActive: true, laneOffset: 1.4 },
      ];
  }
}

function offsetPoints(base: PathPoint[], position: WaveformConfig["position"], lane: number): PathPoint[] {
  if (lane === 0) return base;
  // For circular, lane shifts the ring radius (via the normal direction).
  // For linear positions, lane shifts along the lane's own axis.
  const laneGap = position === "circular" ? 14 : 10;
  return base.map((p) => ({
    ...p,
    x: p.x + p.nx * lane * laneGap,
    y: p.y + p.ny * lane * laneGap,
  }));
}

function extend(p: PathPoint, len: number) {
  return { x: p.x + p.nx * len, y: p.y + p.ny * len };
}

function toPathD(points: { x: number; y: number }[], closed: boolean, smooth: boolean): string {
  if (points.length === 0) return "";
  const pts = closed ? [...points, points[0]] : points;
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const cur = pts[i];
    if (!smooth) {
      d += ` L ${cur.x.toFixed(1)} ${cur.y.toFixed(1)}`;
    } else {
      const prev = pts[i - 1];
      const mx = (prev.x + cur.x) / 2;
      const my = (prev.y + cur.y) / 2;
      d += ` Q ${prev.x.toFixed(1)} ${prev.y.toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`;
    }
  }
  if (closed) d += " Z";
  return d;
}

export function WaveformRenderer({ config, width, height }: Props) {
  const [timeMs, setTimeMs] = useState(0);
  const rafRef = useRef<number>();

  useEffect(() => {
    const start = performance.now();
    const loop = (now: number) => {
      setTimeMs(now - start);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  if (width <= 0 || height <= 0) return null;

  const base = samplePath(config.position, width, height, SAMPLE_COUNT);
  const tracks = tracksForBehavior(config);
  const closed = config.position === "circular";
  const maxLen = Math.min(width, height) * 0.14;
  const activeIdx = fakeActiveTrack(tracks.length, timeMs);

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
    >
      {tracks.map((track, ti) => {
        const isColorShift = config.behavior === "single-colorshift";
        const color = isColorShift
          ? fakeActiveTrack(2, timeMs) === 0
            ? config.colorA
            : config.colorB
          : track.color;
        const active = track.alwaysActive || ti === activeIdx;
        const opacity = active ? 1 : 0.22;
        const points = offsetPoints(base, config.position, track.laneOffset);

        const amps = points.map((_, i) =>
          active ? fakeAmplitude(ti, i, timeMs) : 0.06
        );

        const barWidth = Math.max(1.5, (Math.min(width, height) * 0.9) / SAMPLE_COUNT / 2);

        switch (config.style) {
          case "bars": {
            return (
              <g key={ti} opacity={opacity}>
                {points.map((p, i) => {
                  const tip = extend(p, amps[i] * maxLen);
                  return (
                    <line
                      key={i}
                      x1={p.x} y1={p.y}
                      x2={tip.x} y2={tip.y}
                      stroke={color}
                      strokeWidth={barWidth}
                      strokeLinecap="round"
                    />
                  );
                })}
              </g>
            );
          }
          case "mirror": {
            return (
              <g key={ti} opacity={opacity}>
                {points.map((p, i) => {
                  const out = extend(p, amps[i] * maxLen);
                  const inn = extend(p, -amps[i] * maxLen * 0.7);
                  return (
                    <g key={i}>
                      <line x1={p.x} y1={p.y} x2={out.x} y2={out.y}
                        stroke={color} strokeWidth={barWidth} strokeLinecap="round" />
                      <line x1={p.x} y1={p.y} x2={inn.x} y2={inn.y}
                        stroke={color} strokeWidth={barWidth} strokeLinecap="round" opacity={0.5} />
                    </g>
                  );
                })}
              </g>
            );
          }
          case "dots": {
            return (
              <g key={ti} opacity={opacity}>
                {points.map((p, i) => {
                  const tip = extend(p, amps[i] * maxLen);
                  return (
                    <circle
                      key={i}
                      cx={tip.x} cy={tip.y}
                      r={Math.max(1.5, barWidth * 0.9 * (0.4 + amps[i]))}
                      fill={color}
                    />
                  );
                })}
              </g>
            );
          }
          case "lines":
          case "wave":
          default: {
            const smooth = config.style === "wave";
            const outline = points.map((p, i) => extend(p, amps[i] * maxLen));
            return (
              <path
                key={ti}
                d={toPathD(outline, closed, smooth)}
                fill="none"
                stroke={color}
                strokeWidth={Math.max(1.5, barWidth * 0.8)}
                strokeLinejoin="round"
                opacity={opacity}
              />
            );
          }
        }
      })}
    </svg>
  );
}
