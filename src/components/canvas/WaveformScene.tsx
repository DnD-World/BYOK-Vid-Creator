// ---------------------------------------------------------------------------
// The waveform, as a PURE function of (tracks, size, timeMs, analysis).
//
// No clock of its own — timeMs arrives as a prop so the same component is
// driven by requestAnimationFrame in the preview and by useCurrentFrame()
// during a render. That is what makes the export deterministic: Remotion
// renders frames out of order across parallel workers, so anything reading
// performance.now() / Date.now() / Math.random() here would flicker frame to
// frame. Do not import those into this file.
//
// Each track belongs to a speaker or to the music, and carries its own style,
// position and shape. There is no global "behavior" mode any more — which
// tracks exist and which are enabled is the behaviour.
// ---------------------------------------------------------------------------

import type { AudioAnalysis } from "../../store/types";
import { samplePath, type PathPoint } from "../../lib/waveform/samplePath";
import type { RenderTrack } from "../../lib/waveform/buildTracks";
import {
  placeholderAmplitude,
  placeholderActiveTrack,
  shapedAmplitude,
  bandAmplitude,
} from "../../lib/waveform/amplitude";
import { sparklesFor } from "../../lib/waveform/sparkle";
import { bubblesAt, surfaceAt } from "../../lib/waveform/emitters";
import { sampleAnalysis, type DecodedSpectrum } from "../../lib/waveform/audioAnalysis";

export interface WaveformSceneProps {
  tracks: RenderTrack[];
  width: number;
  height: number;
  /** Elapsed time into the timeline. The only clock this component has. */
  timeMs: number;
  analysis?: AudioAnalysis | null;
  /** Supplied by the render, which loads the spectrum from a file in the
   *  public dir instead of from inputProps. The preview leaves this unset and
   *  the spectrum inside `analysis` is used. */
  spectrum?: DecodedSpectrum | null;
  /** The music file's own analysis, when one is loaded. The music track reads
   *  this instead of the narration: a music waveform that dances to the voice
   *  is the tell that it is decoration rather than a meter. Absent, it falls
   *  back to the narration exactly as it always did. */
  musicAnalysis?: AudioAnalysis | null;
  musicSpectrum?: DecodedSpectrum | null;
}

function offsetPoints(
  base: PathPoint[],
  position: RenderTrack["cfg"]["position"],
  lane: number,
  frameMin: number
): PathPoint[] {
  if (lane === 0) return base;
  // Proportional to frame size, not a fixed pixel nudge — a fixed offset made
  // multiple tracks visually merge at high resolutions.
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

/** A short segment lying across the bar's direction at distance `len` — the
 *  peak-hold cap. The normal is the direction the bar grows, so the cap runs
 *  along its perpendicular. */
function capLine(p: PathPoint, len: number, barWidth: number) {
  const cx = p.x + p.nx * len;
  const cy = p.y + p.ny * len;
  const half = barWidth * 0.8;
  return {
    x1: cx + p.ny * half,
    y1: cy - p.nx * half,
    x2: cx - p.ny * half,
    y2: cy + p.nx * half,
  };
}

/** Rolling average across neighbouring bars. This is what turns a spiky,
 *  jagged read into a flowing one, and it's exposed as a per-track control
 *  because how smooth it should be is a taste decision, not a constant. */
function smoothAmps(amps: number[], amount: number, closed: boolean): number[] {
  if (amount <= 0 || amps.length < 3) return amps;
  const radius = Math.max(1, Math.round(amount * 4));
  const out = new Array<number>(amps.length);
  for (let i = 0; i < amps.length; i++) {
    let sum = 0;
    let n = 0;
    for (let k = -radius; k <= radius; k++) {
      let j = i + k;
      if (closed) j = (j + amps.length) % amps.length;
      else if (j < 0 || j >= amps.length) continue;
      sum += amps[j];
      n++;
    }
    // Blend toward the average rather than replacing, so `amount` is a dial
    // and not an on/off switch.
    out[i] = amps[i] * (1 - amount) + (sum / n) * amount;
  }
  return out;
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

/** One tilted glowing ellipse — the building block of the rings style. */
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

export function WaveformScene({
  tracks, width, height, timeMs, analysis, spectrum, musicAnalysis, musicSpectrum,
}: WaveformSceneProps) {
  if (width <= 0 || height <= 0 || tracks.length === 0) return null;

  const frameMin = Math.min(width, height);
  const moment = sampleAnalysis(analysis, timeMs, spectrum);
  const musicMoment = musicAnalysis
    ? sampleAnalysis(musicAnalysis, timeMs, musicSpectrum)
    : null;

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
    >
      {tracks.map((track, ti) => {
        const cfg = track.cfg;
        const density = Math.max(8, Math.round(cfg.density));
        // A halo around a face needs the face's own centre and radius. Music
        // has no face, so it falls back to ringing the frame.
        const halo =
          cfg.position === "speaker" && track.anchor
            ? {
                cx: track.anchor.x * width,
                cy: track.anchor.y * height,
                // Just clear of the artwork, scaled by the ring control so it
                // can be pushed out into a wide corona.
                r: ((track.anchor.size * width) / 2) * (1.14 * cfg.ringSize),
              }
            : undefined;
        const closed = cfg.position === "circular" || cfg.position === "speaker";
        // Bars around a small face have to be measured against the face, not
        // the frame — 14% of a 1080px frame is longer than the head it rings.
        const maxLen = halo ? halo.r * 0.6 * cfg.scale : frameMin * 0.14 * cfg.scale;

        // Music is always live. A speaker's waveform animates only on their own
        // lines — except when the audio has no speaker attribution at all
        // (a hand-attached file), where "unknown" means everyone is live.
        const isMusic = track.speakerIndex === null;
        const active = moment
          ? isMusic || moment.speaker === -1 || moment.speaker === track.speakerIndex
          : isMusic || placeholderActiveTrack(tracks.length, timeMs) === ti;
        const opacity = active ? 1 : moment ? 0.5 : 0.22;

        // The music track animates to the music when there is any, and to the
        // narration when there isn't — which is what it has always done, and is
        // still better than a placeholder sine.
        const src = isMusic && musicMoment ? musicMoment : moment;

        // Three sources, in order of how real they are: the spectrum, the bare
        // loudness envelope, and the placeholder animation.
        const ampAt = (i: number, count: number, ring: boolean) =>
          src?.bands
            ? bandAmplitude(src.bands, src.bandCount, i, count, ring)
            : src
              ? shapedAmplitude(ti, i, timeMs, src.level)
              : placeholderAmplitude(ti, i, timeMs);
        const peakAt = (i: number, count: number, ring: boolean) =>
          src?.peaks ? bandAmplitude(src.peaks, src.bandCount, i, count, ring) : 0;

        // BOILING. Bumps that swell where they start and subside there, while
        // others do the same elsewhere on their own schedule — not a spectrum
        // pulsing in place, and not one crest travelling round.
        //
        // Every bubble is derived from the clock rather than carried frame to
        // frame, so this survives being rendered out of order. See
        // lib/waveform/emitters.ts.
        // BOILING. Bumps that swell where they start and subside there, while
        // others do the same elsewhere on their own schedule.
        //
        // Every bubble is derived from the clock rather than carried frame to
        // frame, so this survives being rendered out of order. See
        // lib/waveform/emitters.ts.
        if (cfg.style === "boil") {
          // AROUND THE FACE, not the frame. The first version read
          // cfg.ringX/ringY — frame fractions — so it boiled in the middle of
          // the picture with nobody in it. `halo` is the same centre and radius
          // the bars use to ring a speaker, and it already exists here.
          const cx = halo ? halo.cx : width * cfg.ringX;
          const cy = halo ? halo.cy : height * cfg.ringY;
          // ringInnerRadius sizes the hole, so a face can be given room without
          // touching the swell. Against the halo when there is one — a fraction
          // of the frame is meaningless around a head.
          const r0 = halo
            ? halo.r * (0.7 + cfg.ringInnerRadius * 0.9)
            : frameMin * 0.5 * Math.max(0.12, cfg.ringInnerRadius);
          const band = (halo ? halo.r * 0.55 : frameMin * 0.17) * cfg.scale;

          // FOLLOWS THE VOICE. `src` is this track's own moment — the speaker's
          // level when they are speaking, and nothing when they are not — where
          // the first version sampled the whole mix and boiled through everyone
          // else's lines.
          const here = src?.level ?? 0;
          const levelAt = (ms: number) =>
            (sampleAnalysis(analysis, ms, spectrum)?.level ?? 0.25) * (active ? 1 : 0.25);
          const bubbles = bubblesAt(timeMs, levelAt);

          // APEX SPARINGLY. A surface pinned at full height reads as a solid
          // blob and stops meaning anything. This curve keeps ordinary speech
          // in the lower half of the range and lets only a genuinely loud
          // moment reach the top — roughly a tenth of the time on normal
          // narration.
          const shape = (v: number) => Math.pow(Math.min(1, v), 1.9);
          const gain = 0.45 + here * 0.75;

          const STEPS = 128;
          const slices = [];
          for (let i = 0; i < STEPS; i++) {
            const a0 = (i / STEPS) * Math.PI * 2;
            const a1 = ((i + 1) / STEPS) * Math.PI * 2;
            const a = (a0 + a1) / 2;
            const swell = shape(surfaceAt(bubbles, a) * gain);
            const inner = r0 - (0.10 + swell * 0.06) * band;
            const outer = r0 + (0.26 + swell * 0.74) * band;
            const pad = (a1 - a0) * 0.6;
            const p = (ang: number, r: number) =>
              `${(cx + Math.cos(ang) * r).toFixed(2)} ${(cy + Math.sin(ang) * r).toFixed(2)}`;
            slices.push({
              // The gradient belongs to THIS slice's band, not to the frame — so
              // the bright core rides outward with the swell instead of sitting
              // at a fixed radius, which is what made it read as a disc filling
              // up rather than light coming off a bubble.
              d: `M ${p(a0 - pad, outer)} A ${outer} ${outer} 0 0 1 ${p(a1 + pad, outer)}` +
                 ` L ${p(a1 + pad, inner)} A ${inner} ${inner} 0 0 0 ${p(a0 - pad, inner)} Z`,
              x1: cx + Math.cos(a) * inner, y1: cy + Math.sin(a) * inner,
              x2: cx + Math.cos(a) * outer, y2: cy + Math.sin(a) * outer,
              swell,
            });
          }

          return (
            <g key={ti} opacity={opacity}>
              <defs>
                {slices.map((s, i) => (
                  <linearGradient
                    key={i}
                    id={`boil-${ti}-${i}`}
                    gradientUnits="userSpaceOnUse"
                    x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
                  >
                    <stop offset="0%" stopColor={track.color} stopOpacity={0} />
                    <stop offset="30%" stopColor={track.color} stopOpacity={0.45 + s.swell * 0.5} />
                    <stop offset="60%" stopColor={track.color} stopOpacity={0.28 + s.swell * 0.42} />
                    <stop offset="100%" stopColor={track.color} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              {slices.map((s, i) => (
                <path key={i} d={s.d} fill={`url(#boil-${ti}-${i})`} />
              ))}
            </g>
          );
        }

        if (cfg.style === "rings") {
          const cx = width * cfg.ringX;
          const cy = height * cfg.ringY;
          const innerR = frameMin * 0.5 * cfg.ringInnerRadius;
          const clusterR = frameMin * 0.42 * cfg.ringSize;
          const avgAmp = [...Array(6)].reduce((s, _, i) => s + ampAt(i * 7, 42, false), 0) / 6;

          return (
            <g key={ti} transform={`translate(${cx} ${cy})`}>
              {[0, 1].map((ri) => {
                const seed = ti * 2 + ri;
                const r =
                  innerR +
                  (clusterR - innerR) *
                    (0.55 + (0.45 * ((seed * 37) % 100)) / 100) *
                    (0.85 + avgAmp * 0.3);
                const squash = 0.28 + 0.22 * Math.sin(timeMs / (1800 + seed * 240) + seed * 2.3);
                const speed = 30 + (seed % 3) * 14;
                const direction = seed % 2 === 0 ? 1 : -1;
                const rotationDeg = ((timeMs / speed) * direction + seed * 73) % 360;
                return (
                  <RingEllipse
                    key={ri}
                    r={r}
                    squash={squash}
                    rotationDeg={rotationDeg}
                    color={track.color}
                    glowWidth={Math.max(2, frameMin * 0.01 * cfg.thickness)}
                    coreWidth={Math.max(1.5, frameMin * 0.0035 * cfg.thickness)}
                    opacity={opacity * (ri === 0 ? 1 : 0.75)}
                  />
                );
              })}
            </g>
          );
        }

        const base = samplePath(cfg.position, width, height, density, cfg.edgeFlush, halo);
        // Lane gaps are proportional to the frame, which would throw a halo
        // clear across the screen — around a face they scale with the face.
        const points = offsetPoints(
          base,
          closed ? "circular" : cfg.position,
          cfg.lane,
          halo ? halo.r : frameMin
        );
        const n = points.length;
        const raw = points.map((_, i) => (active ? ampAt(i, n, closed) : 0.06));
        const amps = smoothAmps(raw, cfg.smoothing, closed);
        // Caps get the same neighbour smoothing as the bars they sit above,
        // otherwise they drift off the tips of a smoothed waveform.
        const caps = active
          ? smoothAmps(points.map((_, i) => peakAt(i, n, closed)), cfg.smoothing, closed)
          : null;
        // Bar width follows the circumference the bars are spread around, so a
        // halo on a small face gets fine bars rather than a solid ring.
        const spread = halo ? halo.r * 2 * Math.PI : frameMin * 0.9;
        const barWidth = Math.max(1, (spread / density / 2) * cfg.thickness);

        // Glitter, thrown off the loud tips only. Rendered ABOVE the waveform
        // itself for every style, so it is one element rather than something
        // each branch of the switch has to remember to draw.
        const sparks =
          cfg.sparkle > 0 && active
            ? sparklesFor({
                amount: cfg.sparkle,
                tips: points.map((p, i) => extend(p, amps[i] * maxLen)),
                amps,
                timeMs,
                seed: ti + 1,
                scale: Math.max(1.5, barWidth * 1.1),
              })
            : [];
        const glitter = sparks.length > 0 && (
          <g key={`sp-${ti}`} opacity={opacity}>
            {sparks.map((s, i) => (
              <g key={i} transform={`translate(${s.x.toFixed(2)} ${s.y.toFixed(2)}) rotate(${s.rotate.toFixed(1)})`}>
                {/* A four-point glint: a bright core with two crossed
                    strokes. A plain dot reads as a stray pixel; the cross is
                    what makes it read as a spark of light. */}
                <circle r={s.r} fill="#fff" opacity={s.opacity} />
                <line x1={-s.r * 3} y1={0} x2={s.r * 3} y2={0}
                  stroke={track.color} strokeWidth={s.r * 0.5}
                  strokeLinecap="round" opacity={s.opacity * 0.8} />
                <line x1={0} y1={-s.r * 3} x2={0} y2={s.r * 3}
                  stroke={track.color} strokeWidth={s.r * 0.5}
                  strokeLinecap="round" opacity={s.opacity * 0.8} />
              </g>
            ))}
          </g>
        );

        const withGlitter = (body: JSX.Element) =>
          glitter ? (
            <g key={ti}>
              {body}
              {glitter}
            </g>
          ) : (
            body
          );

        switch (cfg.style) {
          case "bars":
            return withGlitter(
              <g key={ti} opacity={opacity}>
                {points.map((p, i) => {
                  const tip = extend(p, amps[i] * maxLen);
                  return (
                    <line key={i} x1={p.x} y1={p.y} x2={tip.x} y2={tip.y}
                      stroke={track.color} strokeWidth={barWidth} strokeLinecap="round" />
                  );
                })}
                {/* Peak-hold caps. Only drawn once they've pulled clear of the
                    bar, so a rising bar doesn't wear a cap fused to its tip. */}
                {caps?.map((c, i) =>
                  c - amps[i] < 0.06 ? null : (
                    <line
                      key={`cap-${i}`}
                      {...capLine(points[i], c * maxLen, barWidth)}
                      stroke={track.color}
                      strokeWidth={Math.max(1, barWidth * 0.5)}
                      strokeLinecap="round"
                      opacity={0.55}
                    />
                  )
                )}
              </g>
            );
          case "mirror":
            return withGlitter(
              <g key={ti} opacity={opacity}>
                {points.map((p, i) => {
                  const out = extend(p, amps[i] * maxLen);
                  const inn = extend(p, -amps[i] * maxLen * 0.7);
                  return (
                    <g key={i}>
                      <line x1={p.x} y1={p.y} x2={out.x} y2={out.y}
                        stroke={track.color} strokeWidth={barWidth} strokeLinecap="round" />
                      <line x1={p.x} y1={p.y} x2={inn.x} y2={inn.y}
                        stroke={track.color} strokeWidth={barWidth} strokeLinecap="round" opacity={0.5} />
                    </g>
                  );
                })}
                {caps?.map((c, i) =>
                  c - amps[i] < 0.06 ? null : (
                    <line
                      key={`cap-${i}`}
                      {...capLine(points[i], c * maxLen, barWidth)}
                      stroke={track.color}
                      strokeWidth={Math.max(1, barWidth * 0.5)}
                      strokeLinecap="round"
                      opacity={0.55}
                    />
                  )
                )}
              </g>
            );
          case "dots":
            return withGlitter(
              <g key={ti} opacity={opacity}>
                {points.map((p, i) => {
                  const tip = extend(p, amps[i] * maxLen);
                  return (
                    <circle key={i} cx={tip.x} cy={tip.y}
                      r={Math.max(1, barWidth * 0.9 * cfg.dotSize * (0.4 + amps[i]))}
                      fill={track.color} />
                  );
                })}
              </g>
            );
          case "lines":
          case "wave":
          default: {
            const outline = points.map((p, i) => extend(p, amps[i] * maxLen));
            return withGlitter(
              <path key={ti} d={toPathD(outline, closed, cfg.style === "wave")}
                fill="none" stroke={track.color}
                strokeWidth={Math.max(1, barWidth * 0.8)}
                strokeLinejoin="round" opacity={opacity} />
            );
          }
        }
      })}
    </svg>
  );
}
