// ---------------------------------------------------------------------------
// The waveform, as a PURE function of (config, size, timeMs).
//
// This file deliberately contains no clock of its own. `timeMs` arrives as a
// prop so the exact same component can be driven two different ways:
//
//   - live preview  -> WaveformRenderer.tsx feeds it requestAnimationFrame
//   - final render  -> remotion/WaveformTrack.tsx feeds it useCurrentFrame()
//
// Keeping it clock-free is what makes the export deterministic. Remotion
// renders frames out of order across parallel headless Chromium workers, so
// anything reading performance.now() / Date.now() / Math.random() here would
// produce a video that flickers frame to frame. Do not import those into this
// file — that is the entire reason it is separate from WaveformRenderer.
// ---------------------------------------------------------------------------

import type { AudioAnalysis, WaveformConfig } from "../../store/types";
import { samplePath, type PathPoint } from "../../lib/waveform/samplePath";
import {
  placeholderAmplitude,
  placeholderActiveTrack,
  shapedAmplitude,
} from "../../lib/waveform/amplitude";
import { sampleAnalysis } from "../../lib/waveform/audioAnalysis";

export interface WaveformSceneProps {
  config: WaveformConfig;
  width: number;
  height: number;
  /** Elapsed time into the timeline. The only clock this component has. */
  timeMs: number;
  /** Real narration audio. When absent the scene falls back to the
   *  placeholder animation so an empty project still looks alive. */
  analysis?: AudioAnalysis | null;
}

interface TrackDef {
  color: string;
  /** Always-animating tracks (e.g. music) ignore the active-speaker gate. */
  alwaysActive: boolean;
  /** Lane index — how far this track is offset from the others so multiple
   *  tracks don't visually merge into one another. */
  lane: number;
}

function tracksForBehavior(cfg: WaveformConfig): TrackDef[] {
  switch (cfg.behavior) {
    case "single":
      return [{ color: cfg.colorA, alwaysActive: true, lane: 0 }];
    case "single-colorshift":
      // One visual track, but its color swaps between speaker A/B colors
      // depending on which speaker is "active" — handled in the component,
      // not here (needs the live active-track index).
      return [{ color: cfg.colorA, alwaysActive: true, lane: 0 }];
    case "dual":
      return [
        { color: cfg.colorA, alwaysActive: false, lane: -1 },
        { color: cfg.colorB, alwaysActive: false, lane: 1 },
      ];
    case "dual-plus-music":
      return [
        { color: cfg.colorA, alwaysActive: false, lane: -1.5 },
        { color: cfg.colorB, alwaysActive: false, lane: 0 },
        { color: cfg.colorMusic, alwaysActive: true, lane: 1.5 },
      ];
    case "triple":
      return [
        { color: cfg.colorA, alwaysActive: true, lane: -1.5 },
        { color: cfg.colorB, alwaysActive: true, lane: 0 },
        { color: cfg.colorMusic, alwaysActive: true, lane: 1.5 },
      ];
  }
}

function offsetPoints(
  base: PathPoint[],
  position: WaveformConfig["position"],
  lane: number,
  frameMin: number
): PathPoint[] {
  if (lane === 0) return base;
  // Proportional to frame size (not a fixed px nudge) and generous enough
  // that multiple simultaneous tracks read as distinct lanes/rings instead
  // of merging into visual noise.
  const laneGap = frameMin * (position === "circular" ? 0.09 : 0.06);
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

/** One tilted glowing ellipse — the building block of the rings style.
 *  Multiple of these per track, at different tilt/size/speed, is what
 *  gives the "chaotic overlapping orbits" look instead of one clean ring. */
function RingEllipse({
  r, squash, rotationDeg, color, glowWidth, coreWidth, opacity,
}: {
  r: number; squash: number; rotationDeg: number; color: string;
  glowWidth: number; coreWidth: number; opacity: number;
}) {
  return (
    <g opacity={opacity} transform={`rotate(${rotationDeg.toFixed(1)})`}>
      <ellipse rx={r} ry={r * squash} fill="none" stroke={color} strokeWidth={glowWidth}
        opacity={0.3} style={{ filter: "blur(6px)" }} />
      <ellipse rx={r} ry={r * squash} fill="none" stroke={color} strokeWidth={coreWidth} />
    </g>
  );
}

export function WaveformScene({ config, width, height, timeMs, analysis }: WaveformSceneProps) {
  if (width <= 0 || height <= 0) return null;

  const density = Math.round(config.density) || 48;
  const frameMin = Math.min(width, height);
  const base = samplePath(config.position, width, height, density, config.edgeFlush);
  const tracks = tracksForBehavior(config);
  const closed = config.position === "circular";
  const maxLen = frameMin * 0.14 * config.scale;

  // The single branch that decides whether this is a real audio visualisation
  // or the placeholder. Everything below reads from these two values.
  const moment = sampleAnalysis(analysis, timeMs);
  const activeIdx = moment ? moment.speaker : placeholderActiveTrack(tracks.length, timeMs);
  const ampFor = (ti: number, i: number) =>
    moment ? shapedAmplitude(ti, i, timeMs, moment.level) : placeholderAmplitude(ti, i, timeMs);

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
    >
      {tracks.map((track, ti) => {
        const isColorShift = config.behavior === "single-colorshift";
        const shiftIdx = moment ? moment.speaker : placeholderActiveTrack(2, timeMs);
        const color = isColorShift
          ? shiftIdx === 1
            ? config.colorB
            : config.colorA
          : track.color;
        const active = track.alwaysActive || ti === activeIdx;
        // With real audio the loudness already collapses the bars during a
        // pause, so dimming the inactive track as well would double-mute it.
        const opacity = active ? 1 : moment ? 0.5 : 0.22;

        if (config.style === "rings") {
          // Chaotic overlapping-orbit cluster: 2 ellipses per track at
          // different tilt/squash/speed so they read as layered planetary
          // rings rather than one clean circle. ringInnerRadius reserves
          // open space in the middle for a speaker avatar to sit in.
          const cx = width * config.ringX;
          const cy = height * config.ringY;
          const innerR = frameMin * 0.5 * config.ringInnerRadius;
          const clusterR = frameMin * 0.42 * config.ringSize;
          const avgAmp =
            [...Array(6)].reduce((sum, _, i) => sum + ampFor(ti, i * 7), 0) / 6;

          const ringsForTrack = [0, 1].map((ri) => {
            const seed = ti * 2 + ri;
            const r =
              innerR +
              (clusterR - innerR) * (0.55 + 0.45 * ((seed * 37) % 100) / 100) *
                (0.85 + avgAmp * 0.3);
            const squash = 0.28 + 0.22 * Math.sin(timeMs / (1800 + seed * 240) + seed * 2.3);
            const speed = 30 + (seed % 3) * 14; // different orbital speeds
            const direction = seed % 2 === 0 ? 1 : -1;
            const rotationDeg = ((timeMs / speed) * direction + seed * 73) % 360;
            const glowWidth = Math.max(2, frameMin * 0.01);
            const coreWidth = Math.max(1.5, frameMin * 0.0035);
            return (
              <RingEllipse
                key={ri}
                r={r} squash={squash} rotationDeg={rotationDeg}
                color={color} glowWidth={glowWidth} coreWidth={coreWidth}
                opacity={opacity * (ri === 0 ? 1 : 0.75)}
              />
            );
          });

          return (
            <g key={ti} transform={`translate(${cx} ${cy})`}>
              {ringsForTrack}
            </g>
          );
        }

        const points = offsetPoints(base, config.position, track.lane, frameMin);
        const amps = points.map((_, i) => (active ? ampFor(ti, i) : 0.06));
        const barWidth = Math.max(1.5, (frameMin * 0.9) / density / 2);

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
                      r={Math.max(1.5, barWidth * 0.9 * config.dotSize * (0.4 + amps[i]))}
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
