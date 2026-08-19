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

import { useMemo } from "react";
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
import { bubblesAt, surfaceAt, findBursts, particlesAt } from "../../lib/waveform/emitters";
import { exponentFor, shapeRadius } from "../../lib/waveform/superellipse";
import { ribbonTwistAt, backFaceColor, litFaceColor } from "../../lib/waveform/ribbon";
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

/** Half of one orbit, as a path.
 *
 *  WHY HALVES. An orbit reads as a loop in SPACE rather than an oval on glass
 *  only because the half nearer the viewer is brighter than the half behind.
 *  Drawn as one ellipse it is a flat ring, whatever else is done to it.
 *
 *  WHY A PATH AND NOT <ellipse>. Two reasons, and both are load-bearing. The
 *  radius answers the voice at the ANGLE the voice is loud, so it is not an
 *  ellipse at all. And the avatar must never be touched: any point that would
 *  fall inside `inner` is pushed back out to it, so a loud moment makes the
 *  loop bigger and can never make it eat the face. An <ellipse> can do neither.
 */
function orbitHalf(
  near: boolean,
  radius: number,
  squash: number,
  inner: number,
  ampAtAngle: (turns: number) => number
): string {
  const STEPS = 96;
  const pts: string[] = [];
  for (let i = 0; i <= STEPS; i++) {
    const turns = i / STEPS;
    const a = turns * Math.PI * 2;
    // In SVG y grows downwards, so the near half is the bottom of the ellipse.
    if ((Math.sin(a) > 0) !== near) continue;
    const swell = 1 + ampAtAngle(turns) * 0.14;
    let x = Math.cos(a) * radius * swell;
    let y = Math.sin(a) * radius * squash * swell;
    const dist = Math.hypot(x, y) || 1;
    if (dist < inner) { const k = inner / dist; x *= k; y *= k; }
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return pts.length ? "M" + pts.join(" L") : "";
}

/** One orbit: a far half, a near half, and the glow under both. */
function Orbit({
  radius, squash, rotationDeg, inner, color, coreWidth, glowWidth, opacity, ampAtAngle,
}: {
  radius: number; squash: number; rotationDeg: number; inner: number;
  color: string; coreWidth: number; glowWidth: number; opacity: number;
  ampAtAngle: (turns: number) => number;
}) {
  const far = orbitHalf(false, radius, squash, inner, ampAtAngle);
  const near = orbitHalf(true, radius, squash, inner, ampAtAngle);
  return (
    <g opacity={opacity} transform={`rotate(${rotationDeg.toFixed(1)})`}>
      <path d={far} fill="none" stroke={color} strokeWidth={coreWidth} opacity={0.28} />
      <path d={near} fill="none" stroke={color} strokeWidth={glowWidth} opacity={0.35}
        style={{ filter: "blur(7px)" }} />
      <path d={near} fill="none" stroke={color} strokeWidth={coreWidth} strokeLinecap="round" />
    </g>
  );
}

/** How many loops each orbit look has, and how they are dressed.
 *
 *  One table rather than four code paths: the looks differ only in count,
 *  speed, weight and whether the core breathes. Anything else and they would
 *  drift apart the first time one of them was tuned. */
const ORBIT_LOOKS: Record<string, {
  count: number; weight: number; glow: number; speeds: number[]; swellCore: boolean;
}> = {
  orbits:      { count: 3, weight: 1.0, glow: 1.0, speeds: [1, 0.8, 1.3], swellCore: false },
  orbitsCalm:  { count: 2, weight: 1.2, glow: 1.0, speeds: [1, 0.7], swellCore: false },
  orbitsShell: { count: 5, weight: 0.7, glow: 0.7, speeds: [0.6, 0.82, 1.04, 1.26, 1.48], swellCore: false },
  orbitsSwell: { count: 2, weight: 1.0, glow: 1.1, speeds: [1, 0.9], swellCore: true },
};

export function WaveformScene({
  tracks, width, height, timeMs, analysis, spectrum, musicAnalysis, musicSpectrum,
}: WaveformSceneProps) {
  if (width <= 0 || height <= 0 || tracks.length === 0) return null;

  const frameMin = Math.min(width, height);
  const moment = sampleAnalysis(analysis, timeMs, spectrum);
  const musicMoment = musicAnalysis
    ? sampleAnalysis(musicAnalysis, timeMs, musicSpectrum)
    : null;

  // ONSETS, found once. Every particle style needs to know when the voice
  // struck, and every frame needs the same answer — so this is derived from the
  // analysis rather than from whatever the current frame happens to see.
  const bursts = useMemo(() => {
    if (!analysis) return [];
    return findBursts(
      analysis.durationMs,
      (ms) => sampleAnalysis(analysis, ms, spectrum)?.level ?? 0
    );
  }, [analysis, spectrum]);

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
        // PARTICLES, SPARKS and BLOOM — all three derived from the clock rather
        // than accumulated, so they survive being rendered out of order. The
        // ring they are born on follows the speaker's own frame shape, like the
        // boil does.
        if (cfg.style === "particles" || cfg.style === "sparks" || cfg.style === "bloomBars") {
          const cx = halo ? halo.cx : width * cfg.ringX;
          const cy = halo ? halo.cy : height * cfg.ringY;
          const base = halo ? halo.r : frameMin * 0.28;
          const expo = exponentFor(track.outlineShape ?? undefined);
          const sparks = cfg.style === "sparks";

          // Sparks scatter far and wide; particles stay a tidier corona.
          const live = active
            ? particlesAt(bursts, timeMs, {
                ringRadius: base,
                lifeMs: sparks ? 1100 : 900,
                perBurst: sparks ? 44 : 16,
                speed: sparks ? 0.9 : 0.55,
                spread: sparks ? 1.7 : 0.5,
                swirl: sparks ? 0.9 : 0.25,
              })
            : [];

          const bars =
            cfg.style !== "sparks" ? (
              <g
                // The bloom is the whole point of bloomBars, and it scales with
                // the moment rather than being a constant halo.
                filter={cfg.style === "bloomBars" ? `url(#glow-${ti})` : undefined}
              >
                {[...Array(density)].map((_, i) => {
                  const a = (i / density) * Math.PI * 2 - Math.PI / 2;
                  const k = shapeRadius(a, expo);
                  const r1 = base * k;
                  const r2 = r1 + Math.min(1, ampAt(i, density, true)) * maxLen;
                  return (
                    <line
                      key={i}
                      x1={cx + Math.cos(a) * r1} y1={cy + Math.sin(a) * r1}
                      x2={cx + Math.cos(a) * r2} y2={cy + Math.sin(a) * r2}
                      stroke={track.color}
                      strokeWidth={Math.max(1.5, frameMin * 0.004 * cfg.thickness)}
                      strokeLinecap="round"
                    />
                  );
                })}
              </g>
            ) : null;

          return (
            <g key={ti} opacity={opacity}>
              {cfg.style === "bloomBars" && (
                <defs>
                  <filter id={`glow-${ti}`} x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation={frameMin * 0.006 * (0.4 + (src?.level ?? 0))} result="b" />
                    <feMerge>
                      <feMergeNode in="b" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
              )}
              {bars}
              {live.map((p, i) => {
                // Born on the shape, not on a circle, so a square frame throws
                // its sparks from its own edge.
                const k = shapeRadius(p.angle, expo);
                const scale = 1 / p.z;
                const size = Math.max(
                  0.8,
                  (sparks ? 1.8 : 3.2) * scale * (frameMin / 900) * cfg.dotSize
                );
                return (
                  <circle
                    key={i}
                    cx={cx + Math.cos(p.angle) * p.radius * k}
                    cy={cy + Math.sin(p.angle) * p.radius * k}
                    r={size}
                    fill={sparks && p.seed > 0.65 ? "#ffffff" : track.color}
                    opacity={p.life * p.life * Math.min(1, scale)}
                  />
                );
              })}
            </g>
          );
        }

        // RIBBON. A wide two-sided band wrapped round the face, twisting as it
        // goes — a colour per face, and the flip happens at the pinch where the
        // band turns edge-on. It rides the SAME boiling surface the boil does,
        // which is what Ak asked for: the ribbon should churn like the pot, not
        // sit still and spin.
        if (cfg.style === "ribbon") {
          const cx = halo ? halo.cx : width * cfg.ringX;
          const cy = halo ? halo.cy : height * cfg.ringY;
          // The SPINE sits clear of the artwork rather than starting at its
          // edge the way the boil's inner rim does — a ribbon is a strip with a
          // centre line, not a band filling the space around a face.
          const r0 = halo
            ? halo.r * (0.86 + cfg.ringInnerRadius * 0.6)
            : frameMin * 0.5 * Math.max(0.12, cfg.ringInnerRadius);
          const band = (halo ? halo.r * 0.95 : frameMin * 0.17) * cfg.scale;

          // Same gating as the boil, and for the same reason: `moment` is the
          // whole mix, so `active` is the only thing that knows whose turn it
          // is, and it has to gate the SWELL rather than only the colour.
          const here = active ? src?.level ?? 0 : 0;
          const levelAt = (ms: number) => sampleAnalysis(analysis, ms, spectrum)?.level ?? 0.25;
          const bubbles = bubblesAt(timeMs, levelAt);
          const shape = (v: number) => Math.pow(Math.min(1, v), 1.9);
          const gain = active ? 0.45 + here * 0.85 : 0.06;
          const expo = exponentFor(track.outlineShape ?? undefined);

          // WIDE FOR A RIBBON, which is not the same as thick. The first pass
          // used 0.30 of the band — a strip more than half the radius across —
          // and each stretch between two pinches came out roughly twice as long
          // as it was wide. That is a petal, and five of them round a face is a
          // flower. At 0.10 a stretch is about six times its width, which is
          // what reads as a ribbon. Thickness scales it, so it can still be
          // fattened deliberately rather than by accident.
          const halfW = band * 0.10 * cfg.thickness;
          const back = backFaceColor(track.color);

          const STEPS = 180;
          // The GUIDE: the curve the ribbon is wound around, boiling in and out.
          // Shape-aware, so a square frame gets a square ribbon.
          const guideAt = (ang: number) =>
            (r0 + shape(surfaceAt(bubbles, ang) * gain) * band * 0.26) *
            shapeRadius(ang, expo);
          const twistAt = (ang: number) => ribbonTwistAt(ang, timeMs, {});
          // The tube the ribbon is wound on, as a radius. Comparable to the
          // ribbon's own width — much smaller and the swing is invisible, which
          // is the state it shipped in.
          const tube = halfW * 1.05;
          // The SPINE swings around the guide as the ribbon turns. This is what
          // makes the twist readable on a circle: see `swing` in ribbon.ts, and
          // the sausages that were there without it.
          const spineAt = (ang: number) => guideAt(ang) + tube * twistAt(ang).swing;
          // A floor under the width. A ribbon exactly edge-on is a hairline, not
          // nothing — letting it reach zero punches a hole in the band and reads
          // as a dropped frame rather than as a turn.
          // NOT scaled by the shape. The SPINE follows the superellipse, so a
          // square frame gets a square ribbon — but a ribbon's width is a
          // property of the ribbon, not of where it happens to be. Scaling it
          // too made the band 1.41x fatter at each corner of a square, which
          // read as the ribbon bunching up in the corners.
          const halfAt = (ang: number) => halfW * Math.max(0.05, twistAt(ang).openness);

          const slices = [];
          // The two EDGES, kept as their own polylines. They are what a ribbon
          // is read by — and they cross each other at every pinch, because past
          // a twist the edge that was on the outside is on the inside. Stroking
          // them is what separates a ribbon from a smear of fill.
          const edgeA: { x: number; y: number }[] = [];
          const edgeB: { x: number; y: number }[] = [];
          for (let i = 0; i < STEPS; i++) {
            const a0 = (i / STEPS) * Math.PI * 2;
            const a1 = ((i + 1) / STEPS) * Math.PI * 2;
            const a = (a0 + a1) / 2;
            const t = twistAt(a);
            {
              const off = halfW * t.lean;
              const s = spineAt(a);
              edgeA.push({ x: cx + Math.cos(a) * (s + off), y: cy + Math.sin(a) * (s + off) });
              edgeB.push({ x: cx + Math.cos(a) * (s - off), y: cy + Math.sin(a) * (s - off) });
            }
            // JUST enough overlap to cover antialiasing between neighbours, and
            // no more. The boil can afford 0.6 because its gradient fades to
            // nothing at both ends, so an overlap there is invisible. The
            // ribbon's fill is opaque edge to edge, so each slice repainted 60%
            // of the last one with a gradient aimed a couple of degrees
            // differently — which came out as a herringbone down the band.
            const pad = (a1 - a0) * 0.08;
            const p = (ang: number, r: number) =>
              `${(cx + Math.cos(ang) * r).toFixed(2)} ${(cy + Math.sin(ang) * r).toFixed(2)}`;
            const outer = (ang: number) => spineAt(ang) + halfAt(ang);
            const inner = (ang: number) => spineAt(ang) - halfAt(ang);
            slices.push({
              d:
                `M ${p(a0 - pad, outer(a0 - pad))} L ${p(a1 + pad, outer(a1 + pad))}` +
                ` L ${p(a1 + pad, inner(a1 + pad))} L ${p(a0 - pad, inner(a0 - pad))} Z`,
              // FLAT, one colour per slice. There was a gradient across the
              // width here, and it herringboned the whole band: its colour
              // bands run perpendicular to that slice's own radius, so they
              // kink by the angle between neighbours — two degrees, 180 times
              // round, at full contrast. Shading a slice by how square-on it is
              // gives the turn without any structure inside the band to kink.
              //
              // It also suits the artwork better. The puppets are flat vector;
              // a glossy shaded tube round a flat drawing was the wrong object.
              // Face-on catches the light, edge-on goes matte. That shading is
              // what makes the pinch read as a turn rather than a gap — and the
              // UNDERSIDE catches much less of it, which is what keeps the two
              // sides reading as two colours instead of two shades of one.
              fill: t.front
                ? litFaceColor(track.color, 0.06 + t.openness * 0.34)
                : litFaceColor(back, 0.02 + t.openness * 0.12),
            });
          }

          return (
            <g key={ti} opacity={opacity}>
              {slices.map((s, i) => (
                <path key={i} d={s.d} fill={s.fill} />
              ))}
              {/* Both edges, lit. Drawn over the fill and in white rather than
                  in either face colour — an edge catches light whichever side
                  of the ribbon it is bounding, and tinting it would make the
                  crossing at each pinch look like a mistake. */}
              {[edgeA, edgeB].map((edge, e) => (
                <path
                  key={`edge-${e}`}
                  d={toPathD(edge, true, true)}
                  fill="none"
                  stroke="#ffffff"
                  strokeOpacity={0.5}
                  strokeWidth={Math.max(1, frameMin * 0.0022 * cfg.thickness)}
                  strokeLinejoin="round"
                />
              ))}
            </g>
          );
        }

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
          // Thicker than the first pass. The version Ak called "3D like" had a
          // deep band with a bright core inside it; narrowing it to hug the face
          // flattened it into a generic outline.
          const band = (halo ? halo.r * 0.95 : frameMin * 0.17) * cfg.scale;

          // FOLLOWS THE VOICE. `src` is this track's own moment — the speaker's
          // level when they are speaking, and nothing when they are not — where
          // the first version sampled the whole mix and boiled through everyone
          // else's lines.
          // SILENT WHEN THIS SPEAKER IS SILENT. `moment` is the whole mix, the
          // same object for every track, so reading a level from it made both
          // rings boil through everyone's lines. `active` is the only thing here
          // that knows whose turn it is, and it has to gate the SWELL — dimming
          // the colour while the surface still churns is what it looked like
          // before, and it read as both of them talking at once.
          const here = active ? src?.level ?? 0 : 0;
          const levelAt = (ms: number) => sampleAnalysis(analysis, ms, spectrum)?.level ?? 0.25;
          const bubbles = bubblesAt(timeMs, levelAt);

          // APEX SPARINGLY. A surface pinned at full height reads as a solid
          // blob and stops meaning anything. This curve keeps ordinary speech
          // in the lower half of the range and lets only a genuinely loud
          // moment reach the top — roughly a tenth of the time on normal
          // narration.
          const shape = (v: number) => Math.pow(Math.min(1, v), 1.9);
          // A listening speaker keeps a thin living rim rather than vanishing —
          // an outline that dies completely reads as a bug, not as silence.
          const gain = active ? 0.45 + here * 0.85 : 0.06;

          // ROUND, ROUNDED-SQUARE OR SQUARE, from one exponent. The ring
          // follows whatever frame the speaker was given, so a square avatar
          // does not get a circular halo.
          const expo = exponentFor(track.outlineShape ?? undefined);

          const STEPS = 160;
          const slices = [];
          for (let i = 0; i < STEPS; i++) {
            const a0 = (i / STEPS) * Math.PI * 2;
            const a1 = ((i + 1) / STEPS) * Math.PI * 2;
            const a = (a0 + a1) / 2;
            const swell = shape(surfaceAt(bubbles, a) * gain);
            // Measured along the shape, so a corner reaches further than an
            // edge exactly as the frame does.
            const k = shapeRadius(a, expo);
            const inner = (r0 - (0.10 + swell * 0.06) * band) * k;
            const outer = (r0 + (0.26 + swell * 0.74) * band) * k;
            const pad = (a1 - a0) * 0.6;
            const outerAt = (ang: number) =>
              (r0 + (0.26 + shape(surfaceAt(bubbles, ang) * gain) * 0.74) * band) *
              shapeRadius(ang, expo);
            const innerAt = (ang: number) =>
              (r0 - (0.10 + shape(surfaceAt(bubbles, ang) * gain) * 0.06) * band) *
              shapeRadius(ang, expo);
            const p = (ang: number, r: number) =>
              `${(cx + Math.cos(ang) * r).toFixed(2)} ${(cy + Math.sin(ang) * r).toFixed(2)}`;
            slices.push({
              // The gradient belongs to THIS slice's band, not to the frame — so
              // the bright core rides outward with the swell instead of sitting
              // at a fixed radius, which is what made it read as a disc filling
              // up rather than light coming off a bubble.
              // Straight edges, not arcs. An arc is a circle by definition, so
              // a superellipse drawn with arcs quietly stays round however the
              // radii are computed. At 160 slices the difference is invisible.
              d: `M ${p(a0 - pad, outerAt(a0 - pad))} L ${p(a1 + pad, outerAt(a1 + pad))}` +
                 ` L ${p(a1 + pad, innerAt(a1 + pad))} L ${p(a0 - pad, innerAt(a0 - pad))} Z`,
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
                    {/* A hard bright core with a long fade out is what gives it
                        depth. An even ramp across the band is the flat, generic
                        outline it had become. */}
                    <stop offset="0%" stopColor={track.color} stopOpacity={0} />
                    <stop offset="12%" stopColor="#ffffff" stopOpacity={(0.25 + s.swell * 0.5) * 0.7} />
                    <stop offset="22%" stopColor={track.color} stopOpacity={0.75 + s.swell * 0.25} />
                    <stop offset="55%" stopColor={track.color} stopOpacity={0.3 + s.swell * 0.4} />
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

        // ORBITS. Loops round the face, never through it.
        if (ORBIT_LOOKS[cfg.style]) {
          const look = ORBIT_LOOKS[cfg.style];
          const cx = halo ? halo.cx : width * cfg.ringX;
          const cy = halo ? halo.cy : height * cfg.ringY;
          // The avatar's own radius is the floor. With no face to ring, the
          // inner radius setting stands in for one.
          const inner = halo
            ? halo.r * 1.06
            : Math.max(frameMin * 0.08, frameMin * 0.5 * cfg.ringInnerRadius);
          // CLOSE TO THE FACE. The first cut used 2.1x the head and the loops
          // sprawled across the whole frame, crossing the other speaker. An
          // orbit belongs to the face it circles, so the outermost sits a bit
          // over half a head clear of it.
          const outer = halo
            ? halo.r * (1.12 + 0.42 * cfg.ringSize)
            : frameMin * 0.3 * cfg.ringSize;
          const level = active ? ampAt(0, 1, true) : 0;

          return (
            <g key={ti} transform={`translate(${cx} ${cy})`} opacity={opacity}>
              {look.swellCore && (
                <circle r={inner * (1 + level * 0.3)} fill={track.color} opacity={0.18}
                  style={{ filter: `blur(${(frameMin * 0.03).toFixed(1)}px)` }} />
              )}
              {[...Array(look.count)].map((_, oi) => {
                const speed = look.speeds[oi] ?? 1;
                // Every loop sits at its own distance, so five do not stack.
                const spread = look.count === 1 ? 0.5 : oi / (look.count - 1);
                const radius = inner + (outer - inner) * (0.5 + spread * 0.5) * (0.9 + level * 0.25);
                // DERIVED FROM TIME, never accumulated — Remotion renders frames
                // out of order and in parallel, so a spin that counted upwards
                // would differ between workers. See emitters.ts.
                const squash = Math.cos(timeMs / 900 * speed + oi * 2.1) * 0.88;
                const rotationDeg = (timeMs / (40 / speed) + oi * 61) % 360;
                return (
                  <Orbit
                    key={oi}
                    radius={radius}
                    squash={squash}
                    rotationDeg={rotationDeg}
                    inner={inner}
                    color={track.color}
                    coreWidth={Math.max(1.5, frameMin * 0.0035 * cfg.thickness * look.weight)}
                    glowWidth={Math.max(3, frameMin * 0.012 * cfg.thickness * look.weight * look.glow)}
                    opacity={oi === 0 ? 1 : 0.8}
                    // READ BETWEEN THE BANDS. Snapping each point to its
                    // nearest of 24 bands puts 24 corners in a loop that is
                    // supposed to be a smooth curve, and the eye reads the
                    // result as scribble. Cosine between neighbours instead.
                    ampAtAngle={(turns) => {
                      if (!active) return 0;
                      const f = turns * 24;
                      const i = Math.floor(f);
                      const frac = f - i;
                      const a = ampAt(i % 24, 24, true);
                      const b = ampAt((i + 1) % 24, 24, true);
                      return a + (b - a) * (1 - Math.cos(frac * Math.PI)) / 2;
                    }}
                  />
                );
              })}
            </g>
          );
        }

        // MESH — the last few seconds of voice, laid back in perspective.
        //
        // The history is READ FROM THE ANALYSIS at past timestamps rather than
        // remembered between frames, for the same reason everything else here
        // is: frames are rendered out of order, so a row kept from "last frame"
        // would be a different row on every worker.
        if (cfg.style === "mesh") {
          const ROWS = 26;
          const COLS = Math.max(8, Math.min(48, density));
          const STEP_MS = 90;
          // The horizon sits below the middle so the landscape stays under the
          // cast rather than growing up through their faces.
          const horizon = height * 0.52;
          const front = height * 0.94;
          const lift = height * 0.22 * cfg.scale;

          const rows = [...Array(ROWS)].map((_, r) => {
            const at = timeMs - r * STEP_MS;
            const past = at < 0 ? null : sampleAnalysis(analysis, at, spectrum);
            return [...Array(COLS)].map((_, c) => {
              if (!past) return 0;
              return past.bands
                ? bandAmplitude(past.bands, past.bandCount, c, COLS, false)
                : shapedAmplitude(ti, c, at, past.level);
            });
          });

          const project = (r: number, c: number): [number, number] => {
            const p = r / ROWS;
            const depth = Math.pow(p, 1.5);
            const y0 = front + (horizon - front) * depth;
            const wide = width * 0.9 * (1 - depth * 0.72);
            const x = width / 2 + (c / (COLS - 1) - 0.5) * wide;
            return [x, y0 - rows[r][c] * lift * (1 - depth * 0.5)];
          };

          const rowPath = (r: number) =>
            "M" + [...Array(COLS)].map((_, c) => project(r, c).map((n) => n.toFixed(1)).join(",")).join(" L");
          const colPath = (c: number) =>
            "M" + [...Array(ROWS)].map((_, r) => project(r, c).map((n) => n.toFixed(1)).join(",")).join(" L");

          return (
            <g key={ti} opacity={opacity}>
              {[...Array(COLS)].map((_, c) => (
                <path key={`c${c}`} d={colPath(c)} fill="none" stroke={track.color}
                  strokeWidth={Math.max(0.5, frameMin * 0.0008 * cfg.thickness)} opacity={0.16} />
              ))}
              {[...Array(ROWS)].map((_, r) => {
                const fade = 1 - r / ROWS;
                return (
                  <path key={`r${r}`} d={rowPath(r)} fill="none" stroke={track.color}
                    strokeWidth={Math.max(0.6, frameMin * 0.0016 * cfg.thickness * (0.4 + fade))}
                    opacity={0.15 + fade * 0.75} />
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
