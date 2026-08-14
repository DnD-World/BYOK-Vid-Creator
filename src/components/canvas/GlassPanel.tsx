// ---------------------------------------------------------------------------
// A pane of glass, built the way react-bits' GlassSurface builds one.
//
// WHAT THE FIRST ATTEMPT GOT WRONG, because it is the whole idea. It displaced
// the picture with fractal noise, everywhere, evenly. That is frosted plastic:
// a surface with texture. Real glass has no texture — it is smooth, and it
// bends light ONLY WHERE IT IS CURVED, which on a pane means the rim. The
// middle of a window shows you the world unchanged.
//
// So the displacement map is not noise. It is a picture of the pane's own
// shape: black in the middle (meaning "move nothing"), with a red ramp running
// one way and a blue ramp the other, differenced so the two gradients meet in a
// neutral centre, and a blurred inset rectangle painted back over it to flatten
// everything except a soft band at the edge. Feed that to feDisplacementMap and
// the picture bends at the rim and is untouched in the middle — a bevel, which
// is what your eye actually reads as thickness.
//
// COLOUR FRINGING is three displacements of different strength — red least,
// blue most — each reduced to its own channel and screened back together. Same
// as before, and it was the one part worth keeping.
//
// WHAT IT AFFECTS. `backdrop-filter`, so it bends whatever has already been
// painted underneath it and nothing else. The background clips and the waveform
// are painted before; the avatars and subtitles after. No layer is rendered
// twice any more — the first version drew everything behind the glass a second
// time, which was both slower and unnecessary.
// ---------------------------------------------------------------------------

import type { CSSProperties, ReactNode } from "react";

export type GlassShape = "rect" | "circle";

export interface GlassConfig {
  shape: GlassShape;
  /** Corner radius as a fraction of the shorter side. Ignored for a circle,
   *  which is always half. */
  radius: number;
  /** How wide the bent band at the rim is, as a fraction of the shorter side.
   *
   *  THE most important control here. It is the thickness of the glass seen
   *  edge-on, and a thick rim with a clear middle is what makes a pane read as
   *  a solid object rather than as a filter laid over the picture. Narrow
   *  values scatter a little distortion across the whole pane and look like
   *  smeared plastic. */
  edgeWidth: number;
  /** How hard the rim bends what is behind it, in pixels ON A 200px PANE.
   *
   *  Scaled by the PANE's size, not the frame's. That distinction was worth a
   *  render: react-bits' -180 default is written for a button roughly 200px
   *  across, and applying it unchanged to a 367px avatar disc bent the rim so
   *  far that the fringing read as a rainbow artefact rather than as glass. A
   *  small pane and a large one should look like the same material.
   *
   *  NEGATIVE bends outward, the way a convex pane does. The sign is not a
   *  typo. */
  distortion: number;
  /** Per-channel extra displacement. The gap between red and blue IS the
   *  chromatic aberration. */
  redOffset: number;
  greenOffset: number;
  blueOffset: number;
  /** Softness of the rim band, in px at 1080 wide. Higher = a rounder, fatter
   *  looking edge. */
  edgeBlur: number;
  /** The flat inner region of the map: mid-grey means "displace nothing".
   *
   *  brightness must be 50 for true neutrality, and flatness is how completely
   *  that neutrality is stamped over the gradients. Below 1 the gradients show
   *  through the middle and the whole pane distorts slightly — which is exactly
   *  the muddy look that wants removing. 1 gives a clear centre and confines
   *  every bit of bending to the rim. */
  brightness: number;
  flatness: number;
  /** Blur of the final refracted image, in px at 1080 wide. Small. This is
   *  polish on the refraction, NOT a frosting of the whole pane. */
  softness: number;
  /** How much the pane magnifies what is behind it. 1 = none.
   *
   *  THE HONEST WAY TO DO THIS. Every SVG-filter attempt bent the picture in a
   *  direction that depended on where a pixel sat in the map, which is a bevel
   *  and never quite a lens. A lens magnifies: it makes what is behind it
   *  BIGGER, and breaks any line crossing its rim because the inside and the
   *  outside no longer line up. Re-drawing the scene at a larger scale about
   *  the pane's own centre and clipping it to the pane's shape IS that, exactly,
   *  with nothing to misconfigure. */
  magnify: number;
  /** Ordinary frost behind the pane, as a fraction of frame width. 0 for clear
   *  glass — which is what a lens looks like. */
  frost: number;
  saturation: number;
  tint: string;
  tintOpacity: number;
  /** SPECULAR: the polished catch of light along the bevel, 0–1.
   *
   *  The thing that was missing. Refraction alone gives you a bent picture,
   *  which the eye reads as a distortion rather than as an object. A hard
   *  bright line hugging the rim is what says "this is a solid, polished
   *  edge" — it is the same reason a chrome bezel reads as metal. */
  edge: number;
}

export const defaultGlass = (): GlassConfig => ({
  shape: "rect",
  magnify: 1.18,
  radius: 0.14,
  edgeWidth: 0.07,
  distortion: -180,
  redOffset: 0,
  greenOffset: 10,
  blueOffset: 20,
  edgeBlur: 11,
  brightness: 50,
  flatness: 0.93,
  // 0.5, from the demo's Displace slider. The component's own default is 0
  // and the static markup says 0.7; the sliders are what the page is actually
  // showing, so they win.
  softness: 0.5,
  // 0.1, the demo's Background Opacity. Not zero — a touch of milk behind the
  // pane is part of the look.
  frost: 0.1,
  saturation: 1,
  tint: "#ffffff",
  tintOpacity: 0.04,
  edge: 1,
});

/**
 * The pane's shape, drawn as a displacement map.
 *
 * Read it as a picture rather than as code: a black field; a red gradient
 * brightening to the left; a blue gradient brightening downward, differenced
 * against the red so their overlap cancels toward the middle; and finally an
 * inset shape in flat grey, blurred, stamped on top to erase all of it except a
 * soft band hugging the border.
 *
 * feDisplacementMap reads RED for horizontal movement and GREEN for vertical.
 * That is the whole reason this was wrong for so long: the second gradient was
 * BLUE, differenced against the red, so the green channel stayed at zero
 * everywhere. Zero green means a constant upward push — every pane refracted
 * straight up the screen instead of outward from its own centre, which is
 * exactly what it looked like.
 *
 * Red ramps left to right and green ramps top to bottom, screened together so
 * the two channels stay independent. Now a pixel's displacement is its offset
 * FROM THE CENTRE, in both axes at once — which is a lens, and bends a line
 * around the middle of the disc rather than shearing the whole thing sideways.
 */
function displacementMap(
  w: number,
  h: number,
  radius: number,
  edgeWidth: number,
  edgeBlur: number,
  brightness: number,
  flatness: number
): string {
  const edge = Math.min(w, h) * (edgeWidth * 0.5);
  const svg = `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="r" x1="100%" y1="0%" x2="0%" y2="0%"><stop offset="0%" stop-color="#0000"/><stop offset="100%" stop-color="red"/></linearGradient>
<linearGradient id="b" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#0000"/><stop offset="100%" stop-color="blue"/></linearGradient>
</defs>
<rect width="${w}" height="${h}" fill="black"/>
<rect width="${w}" height="${h}" rx="${radius}" fill="url(#r)"/>
<rect width="${w}" height="${h}" rx="${radius}" fill="url(#b)" style="mix-blend-mode:difference"/>
<rect x="${edge}" y="${edge}" width="${w - edge * 2}" height="${h - edge * 2}" rx="${radius}" fill="hsl(0 0% ${brightness}% / ${flatness})" style="filter:blur(${edgeBlur}px)"/>
</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const KEEP = {
  r: "1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0",
  g: "0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0",
  b: "0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0",
};

/** The filter itself, as a bare <defs>, plus the style that uses it.
 *
 *  Split out from GlassPanel because the subtitle caption is sized by its own
 *  text and has no rectangle to be told. backdrop-filter needs no dimensions —
 *  only the displacement map does, and `preserveAspectRatio="none"` stretches
 *  it to whatever the element turns out to be. So a caption gets its bevel
 *  without anyone having to measure the words first.
 */
export function GlassFilterDefs({
  id,
  glass,
  w,
  h,
  frameWidth,
}: {
  id: string;
  glass: GlassConfig;
  /** Nominal map size. Exact numbers do not matter — the map is stretched to
   *  the element — but the ASPECT does, or the bevel is thicker on one pair of
   *  sides than the other. */
  w: number;
  h: number;
  frameWidth: number;
}) {
  const k = frameWidth / 1080;
  const radiusPx =
    glass.shape === "circle" ? Math.min(w, h) / 2 : Math.min(w, h) * glass.radius;
  const map = displacementMap(
    w,
    h,
    radiusPx,
    glass.edgeWidth,
    glass.edgeBlur * k,
    glass.brightness,
    glass.flatness
  );
  const scaled = (v: number) => (glass.distortion + v) * k;

  return (
    <svg width={0} height={0} style={{ position: "absolute" }}>
      <defs>
        {/* sRGB: the default linearRGB would brighten every displaced pixel
            and the pane would glow instead of refract. */}
        <filter
          id={`glass-${id}`}
          colorInterpolationFilters="sRGB"
          x="0%"
          y="0%"
          width="100%"
          height="100%"
        >
          <feImage href={map} x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="map" />

          <feDisplacementMap in="SourceGraphic" in2="map" scale={scaled(glass.redOffset)} xChannelSelector="R" yChannelSelector="G" result="dR" />
          <feColorMatrix in="dR" type="matrix" values={KEEP.r} result="oR" />

          <feDisplacementMap in="SourceGraphic" in2="map" scale={scaled(glass.greenOffset)} xChannelSelector="R" yChannelSelector="G" result="dG" />
          <feColorMatrix in="dG" type="matrix" values={KEEP.g} result="oG" />

          <feDisplacementMap in="SourceGraphic" in2="map" scale={scaled(glass.blueOffset)} xChannelSelector="R" yChannelSelector="G" result="dB" />
          <feColorMatrix in="dB" type="matrix" values={KEEP.b} result="oB" />

          {/* Screen, not add: adding blows out every pixel where two channels
              already agree. */}
          <feBlend in="oR" in2="oG" mode="screen" result="rg" />
          <feBlend in="rg" in2="oB" mode="screen" result="rgb" />
          <feGaussianBlur in="rgb" stdDeviation={glass.softness * k} />
        </filter>
      </defs>
    </svg>
  );
}

/** What makes an element BE the glass: it bends whatever was painted under it,
 *  and nothing drawn inside or after. */
export function glassBackdropStyle(
  id: string,
  glass: GlassConfig,
  frameWidth: number
): CSSProperties {
  const k = frameWidth / 1080;
  const f = `url(#glass-${id}) blur(${glass.frost * frameWidth}px) saturate(${glass.saturation})`;
  return {
    backdropFilter: f,
    WebkitBackdropFilter: f,
    backgroundColor: withAlpha(glass.tint, glass.tintOpacity),
    // GlassSurface.css, verbatim in shape: two faint inset highlights and three
    // soft drop shadows. NO BORDER — it has none, and every version of this
    // file that drew one was painting a bezel over the refraction rather than
    // letting the filter make the edge.
    boxShadow: [
      `inset 0 0 ${2 * k}px ${1 * k}px rgba(255,255,255,${0.35 * glass.edge})`,
      `inset 0 0 ${10 * k}px ${4 * k}px rgba(255,255,255,${0.15 * glass.edge})`,
      `0 ${4 * k}px ${16 * k}px rgba(17,17,26,0.05)`,
      `0 ${8 * k}px ${24 * k}px rgba(17,17,26,0.05)`,
      `0 ${16 * k}px ${56 * k}px rgba(17,17,26,0.05)`,
      `inset 0 ${4 * k}px ${16 * k}px rgba(17,17,26,0.05)`,
      `inset 0 ${8 * k}px ${24 * k}px rgba(17,17,26,0.05)`,
      `inset 0 ${16 * k}px ${56 * k}px rgba(17,17,26,0.05)`,
    ].join(", "),
  };
}

export interface GlassRect {
  /** Pixels, in frame space. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export function GlassPanel({
  glass,
  rect,
  frameWidth,
  frameHeight,
  id,
  scene,
  children,
  style,
}: {
  glass: GlassConfig;
  rect: GlassRect;
  /** Everything in GlassConfig that is "in px" is in px AT 1080 WIDE, and is
   *  scaled by this. Same convention as every other size in the app: authored
   *  once, correct at any resolution. */
  frameWidth: number;
  frameHeight: number;
  /** Unique per pane. Two panes sharing a filter id would silently share one
   *  shape, and a disk would be displaced by a rectangle's map. */
  id: string;
  /** The layers to be seen THROUGH the pane, re-drawn magnified and clipped to
   *  its shape. Omit for a pane that only tints. */
  scene?: ReactNode;
  /** Drawn inside the pane, in front of the glass — a caption, a face. Never
   *  refracted. */
  children?: ReactNode;
  style?: CSSProperties;
}) {
  const kFrame = frameWidth / 1080;
  // The pane's own scale. Everything describing the GLASS — how far the rim
  // bends, how soft that rim is — belongs to this. Everything describing the
  // PICTURE through it stays on the frame's scale.
  const kPane = Math.min(rect.w, rect.h) / 200;
  const isCircle = glass.shape === "circle";
  const radiusPx = isCircle
    ? Math.min(rect.w, rect.h) / 2
    : Math.min(rect.w, rect.h) * glass.radius;

  const filterId = `glass-${id}`;
  const map = displacementMap(
    rect.w,
    rect.h,
    radiusPx,
    glass.edgeWidth,
    glass.edgeBlur * kPane,
    glass.brightness,
    glass.flatness
  );

  // ABSOLUTE pixels, scaled only by the frame's resolution — never by the
  // pane's size. GlassSurface works this way and it is not an oversight: a
  // fixed bend in pixels means a small pane is bent nearly edge to edge while
  // a large one keeps a clear middle, which is exactly how real glass of a
  // given thickness behaves. Scaling it by the pane instead made every disc
  // bend as hard as a button does, and the whole face filled with rainbow.
  const scaled = (v: number) => (glass.distortion + v) * kFrame;

  return (
    <div
      style={{
        position: "absolute",
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
        borderRadius: radiusPx,
        overflow: "hidden",
        ...style,
      }}
    >
      {/* The filter lives inside the pane so its coordinate space is the
          pane's own — the map is generated at exactly this size. */}
      <svg width={0} height={0} style={{ position: "absolute" }}>
        <defs>
          {/* sRGB: the default linearRGB would brighten every displaced pixel
              and the pane would glow instead of refract. */}
          <filter
            id={filterId}
            colorInterpolationFilters="sRGB"
            x="0%"
            y="0%"
            width="100%"
            height="100%"
          >
            <feImage href={map} x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="map" />

            <feDisplacementMap in="SourceGraphic" in2="map" scale={scaled(glass.redOffset)} xChannelSelector="R" yChannelSelector="G" result="dR" />
            <feColorMatrix in="dR" type="matrix" values={KEEP.r} result="oR" />

            <feDisplacementMap in="SourceGraphic" in2="map" scale={scaled(glass.greenOffset)} xChannelSelector="R" yChannelSelector="G" result="dG" />
            <feColorMatrix in="dG" type="matrix" values={KEEP.g} result="oG" />

            <feDisplacementMap in="SourceGraphic" in2="map" scale={scaled(glass.blueOffset)} xChannelSelector="R" yChannelSelector="G" result="dB" />
            <feColorMatrix in="dB" type="matrix" values={KEEP.b} result="oB" />

            {/* Screen, not add: adding blows out every pixel where two
                channels already agree. */}
            <feBlend in="oR" in2="oG" mode="screen" result="rg" />
            <feBlend in="rg" in2="oB" mode="screen" result="rgb" />
            <feGaussianBlur in="rgb" stdDeviation={glass.softness * kFrame} />
          </filter>
        </defs>
      </svg>

      {/* THE LENS. The scene again, larger, about this pane's own centre, cut to
          its shape. Everything outside the pane is the original scale, so any
          line crossing the rim steps — which is the whole tell. */}
      {scene && glass.magnify !== 1 && (
        <div style={{ position: "absolute", inset: 0, borderRadius: radiusPx, overflow: "hidden" }}>
          <div
            style={{
              position: "absolute",
              left: -rect.x,
              top: -rect.y,
              width: frameWidth,
              height: frameHeight,
              transform: `scale(${glass.magnify})`,
              transformOrigin: `${rect.x + rect.w / 2}px ${rect.y + rect.h / 2}px`,
            }}
          >
            {scene}
          </div>
        </div>
      )}

      {/* The glass itself. backdrop-filter, so it acts on what is already
          painted beneath and on nothing drawn after. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: radiusPx,
          backdropFilter: `url(#${filterId}) blur(${glass.frost * frameWidth}px) saturate(${glass.saturation})`,
          WebkitBackdropFilter: `url(#${filterId}) blur(${glass.frost * frameWidth}px) saturate(${glass.saturation})`,
          backgroundColor: withAlpha(glass.tint, glass.tintOpacity),
          // NO BORDER, and the shadows are almost invisible on purpose.
          //
          // This is the correction that mattered most. A previous version drew
          // a hard white line around the rim to make it "read as glass", and
          // that is a different effect entirely — a bezel painted on top of the
          // picture. In GlassSurface the rim is produced ENTIRELY by the
          // displacement map: borderWidth, edgeBlur, flatness and distortion
          // shape it, and the CSS only adds a breath of depth behind it.
          // Painting a rim over the top hides the very thing being tuned.
          boxShadow: [
            `inset 0 0 ${2 * kPane}px ${1 * kPane}px rgba(255,255,255,${0.35 * glass.edge})`,
            `inset 0 0 ${10 * kPane}px ${4 * kPane}px rgba(255,255,255,${0.15 * glass.edge})`,
            `0 ${4 * kPane}px ${16 * kPane}px rgba(17,17,26,0.05)`,
            `0 ${8 * kPane}px ${24 * kPane}px rgba(17,17,26,0.05)`,
          ].join(", "),
          pointerEvents: "none",
        }}
      />

      {children}
    </div>
  );
}

function withAlpha(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.max(0, Math.min(1, alpha))})`;
}
