// ---------------------------------------------------------------------------
// A pane of glass, with what is behind it actually bent.
//
// WHY IT IS BUILT THIS WAY. CSS `backdrop-filter` can blur and tint what is
// behind an element, and that is all it can do — it cannot displace, and
// Chromium does not accept an SVG filter reference there. Real glass does not
// blur what is behind it; it MOVES it, and it splits the colours at the edges
// because the three wavelengths bend by different amounts.
//
// So the content behind the pane is rendered a SECOND time, inside an SVG
// filter and clipped to the pane's shape. That is the cost: whatever is put
// behind glass is drawn twice per frame. It is charged deliberately and only
// over the pane's own rectangle.
//
// WHAT MUST NOT BE AFFECTED. Only the layers passed as `children` are bent —
// the background clips and the waveform. The avatars and the subtitles are
// drawn by the composition AFTER this, so they sit in front of the glass and
// stay sharp, which is the whole point: you are looking through the pane at
// the scene, not at a photograph of the scene with everything smeared.
// ---------------------------------------------------------------------------

import { AbsoluteFill } from "remotion";
import type { ReactNode } from "react";

export interface GlassConfig {
  /** Pane rectangle, as fractions of the frame. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Corner radius as a fraction of the pane's shorter side. */
  radius: number;
  /** How far the glass moves what is behind it, as a fraction of frame width.
   *  0.01 is a noticeable ripple; 0.03 is a funhouse. */
  displace: number;
  /** Separation between the red and blue displacement, 0–1. This is the
   *  red/green/blue fringing: the three channels are displaced by slightly
   *  different amounts, exactly as a real lens splits them. */
  chroma: number;
  /** Size of the ripples, as a fraction of frame width. Larger = slower,
   *  more liquid; smaller = frosted, busy. */
  scale: number;
  /** Blur applied behind the pane, as a fraction of frame width. */
  blur: number;
  tint: string;
  tintOpacity: number;
  /** Edge highlight strength, 0–1. Glass is legible as glass because of what
   *  its rim does to the light, far more than because of the blur. */
  edge: number;
  /** How fast the ripples drift. 0 freezes them. */
  driftHz: number;
}

export const defaultGlass = (): GlassConfig => ({
  x: 0.06,
  y: 0.3,
  w: 0.88,
  h: 0.4,
  radius: 0.12,
  displace: 0.014,
  chroma: 0.35,
  scale: 0.09,
  blur: 0.002,
  tint: "#9fd8ff",
  tintOpacity: 0.06,
  edge: 0.8,
  driftHz: 0.05,
});

/** Keep only one channel, preserving alpha. Feeding three differently
 *  displaced copies through these and screening them back together is what
 *  produces the colour fringing. */
const KEEP = {
  r: "1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0",
  g: "0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0",
  b: "0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0",
};

export function GlassPanel({
  glass,
  width,
  height,
  timeMs,
  id = "byok-glass",
  children,
}: {
  glass: GlassConfig;
  width: number;
  height: number;
  timeMs: number;
  /** Unique per pane — two filters sharing an id would silently share a shape. */
  id?: string;
  /** The layers to be seen THROUGH the glass. Rendered twice: once by the
   *  composition normally, once here bent. */
  children: ReactNode;
}) {
  const px = glass.x * width;
  const py = glass.y * height;
  const pw = glass.w * width;
  const ph = glass.h * height;
  const r = Math.min(pw, ph) * glass.radius;

  // Ripples drift with the clock rather than with a frame counter, so the
  // preview and the render agree at the same timestamp. A pure function of
  // time, like everything else that has to survive out-of-order rendering.
  const phase = (timeMs / 1000) * glass.driftHz;
  const freq = 1 / Math.max(1, glass.scale * width);

  const base = glass.displace * width;
  const spread = base * glass.chroma * 0.5;

  const filterId = `${id}-filter`;
  const clipId = `${id}-clip`;

  return (
    <>
      <svg width={0} height={0} style={{ position: "absolute" }}>
        <defs>
          <clipPath id={clipId}>
            <rect x={px} y={py} width={pw} height={ph} rx={r} ry={r} />
          </clipPath>

          {/* sRGB, not linearRGB. The default colour space would brighten
              every displaced pixel and the pane would glow rather than
              refract. */}
          <filter
            id={filterId}
            x="-25%"
            y="-25%"
            width="150%"
            height="150%"
            colorInterpolationFilters="sRGB"
          >
            {/* The bump map. fractalNoise rather than turbulence: turbulence
                takes the absolute value and creates hard creases, which read
                as damage rather than as glass.

                NOT blurred. Blurring noise pulls every value toward the 0.5
                that means "no displacement", so the first version of this
                smoothed the ripples away and produced a pane that tinted the
                picture without bending it at all. numOctaves does the
                smoothing instead: one octave is already soft. */}
            <feTurbulence
              type="fractalNoise"
              baseFrequency={`${freq} ${freq * 1.3}`}
              numOctaves={1}
              seed={7}
              result="noise"
            />
            {/* Drift by MOVING the noise, not by reseeding it — reseeding makes
                it boil rather than flow. SMIL <animate> is deliberately not
                used: Remotion captures discrete frames and never runs a
                document clock, so an animated attribute simply sits at its
                start value. Everything here is a function of timeMs instead. */}
            <feOffset dx={phase * 100} dy={phase * 60} in="noise" result="bump" />

            {/* Three displacements, one per channel, each by a slightly
                different amount. Red bends least and blue most, which is the
                order a real lens does it in. */}
            <feDisplacementMap
              in="SourceGraphic"
              in2="bump"
              scale={base - spread}
              xChannelSelector="R"
              yChannelSelector="G"
              result="dR"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="bump"
              scale={base}
              xChannelSelector="R"
              yChannelSelector="G"
              result="dG"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="bump"
              scale={base + spread}
              xChannelSelector="R"
              yChannelSelector="G"
              result="dB"
            />

            <feColorMatrix in="dR" type="matrix" values={KEEP.r} result="oR" />
            <feColorMatrix in="dG" type="matrix" values={KEEP.g} result="oG" />
            <feColorMatrix in="dB" type="matrix" values={KEEP.b} result="oB" />

            {/* Screen, not add: adding blows the highlights out to white
                wherever two channels already agree. */}
            <feBlend in="oR" in2="oG" mode="screen" result="rg" />
            <feBlend in="rg" in2="oB" mode="screen" result="rgb" />

            <feGaussianBlur in="rgb" stdDeviation={glass.blur * width} />
          </filter>
        </defs>
      </svg>

      {/* The second draw of what is behind, bent and cut to the pane. */}
      <AbsoluteFill style={{ clipPath: `url(#${clipId})` }}>
        <AbsoluteFill style={{ filter: `url(#${filterId})` }}>{children}</AbsoluteFill>
      </AbsoluteFill>

      {/* The pane itself: a wash of colour, a bright rim, and a diagonal
          sheen. None of it is the refraction — it is what tells the eye that
          the refraction is caused by an object. */}
      <div
        style={{
          position: "absolute",
          left: px,
          top: py,
          width: pw,
          height: ph,
          borderRadius: r,
          backgroundColor: withAlpha(glass.tint, glass.tintOpacity),
          backgroundImage: `linear-gradient(135deg, rgba(255,255,255,${
            0.14 * glass.edge
          }) 0%, rgba(255,255,255,0) 38%, rgba(255,255,255,0) 62%, rgba(255,255,255,${
            0.07 * glass.edge
          }) 100%)`,
          border: `${Math.max(1, width * 0.0012)}px solid rgba(255,255,255,${0.32 * glass.edge})`,
          boxShadow: `inset 0 ${width * 0.002}px ${width * 0.004}px rgba(255,255,255,${
            0.35 * glass.edge
          }), inset 0 -${width * 0.002}px ${width * 0.006}px rgba(0,0,0,${0.25 * glass.edge})`,
          pointerEvents: "none",
        }}
      />
    </>
  );
}

function withAlpha(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.max(0, Math.min(1, alpha))})`;
}
