// ---------------------------------------------------------------------------
// Draws a layered puppet: base body, then eyes, pupils, brows and a mouth,
// each an independent layer.
//
// The whole point is that these are independent. The mouth follows the viseme
// track, the eyes follow a blink track, the brows follow the mood — all at
// once, from the same art, without any of them being baked together. The
// flattened sprite sheet this replaces could only ever offer nine faces.
//
// Positioning is entirely in HEAD units (see puppetTypes.ts), converted to
// percentages of the container here. Nothing reads a pixel coordinate, so the
// same component is correct in a 200px preview and a 1080p render, and a
// future head tilt is one transform on the head group rather than a
// recalculation of every layer.
//
// Same purity contract as the rest of the canvas: no clock, no randomness.
// ---------------------------------------------------------------------------

import type { CSSProperties } from "react";
import type { Puppet, PuppetLayer } from "../../store/puppetTypes";
import type { OutlineShape } from "../../store/types";

interface Props {
  puppet: Puppet;
  /** file path -> loadable URL (blob: in the preview, staticFile() in a render). */
  urls: Record<string, string>;
  /** Viseme index 0–8. */
  viseme: number;
  /** Which entry of `puppet.eyes` to draw. Falls back to "open". */
  eyeState?: string;
  /** Which entry of `puppet.brows` to draw. */
  brow?: string;
  /** Disk diameter in px. */
  size: number;
  bgOpacity: number;
  borderOpacity: number;
  bgColor?: string;
  borderColor?: string;
  outlineShape?: OutlineShape;
}

const SHAPE_RADIUS: Record<OutlineShape, string> = {
  circle: "50%",
  rounded: "18%",
  square: "0%",
  none: "50%",
};

function filterFor(l: PuppetLayer): string | undefined {
  const parts: string[] = [];
  if (l.saturation !== undefined && l.saturation !== 1) parts.push(`saturate(${l.saturation})`);
  if (l.hue) parts.push(`hue-rotate(${l.hue}deg)`);
  if (l.lightness !== undefined && l.lightness !== 1) parts.push(`brightness(${l.lightness})`);
  return parts.length ? parts.join(" ") : undefined;
}

export function PuppetAvatar({
  puppet, urls, viseme, eyeState = "open", brow, size,
  bgOpacity, borderOpacity,
  bgColor = "#1a1a1a", borderColor = "#d98a3d",
  outlineShape = "circle",
}: Props) {
  const fill = outlineShape === "circle" || outlineShape === "none" ? 0.9 : 0.97;
  const head = size * fill;

  // The base image is square and drawn at the full disk size; the head is a
  // named box inside it. Everything else is measured against that box.
  const headPx = puppet.head.w * head;
  const headCx = puppet.head.cx * head;
  const headCy = puppet.head.cy * head;
  const pxPerSource = headPx / puppet.sourceHeadWidth;

  /** A layer, positioned by its anchor at (head centre + offset). */
  const layerStyle = (l: PuppetLayer): CSSProperties => {
    const w = l.w * pxPerSource * (l.scale ?? 1);
    const h = l.h * pxPerSource * (l.scale ?? 1);
    const cx = headCx + l.x * headPx;
    const cy = headCy + l.y * headPx;
    const anchor = l.anchor ?? "center";
    const top = anchor === "top-center" ? cy : anchor === "bottom-center" ? cy - h : cy - h / 2;
    return {
      position: "absolute",
      left: cx - w / 2,
      top,
      width: w,
      height: h,
      backgroundImage: `url(${urls[l.file] ?? ""})`,
      backgroundSize: "100% 100%",
      filter: filterFor(l),
    };
  };

  const draw = (l: PuppetLayer | undefined, key: string) =>
    l && urls[l.file] ? <div key={key} style={layerStyle(l)} /> : null;

  const brows = brow ? puppet.brows[brow] : undefined;
  const eyes = puppet.eyes[eyeState] ?? puppet.eyes.open;
  const mouth = puppet.mouths[String(viseme)] ?? puppet.mouths["0"];

  return (
    <div style={{
      width: size, height: size,
      borderRadius: SHAPE_RADIUS[outlineShape],
      display: "grid", placeItems: "center",
      background: hexA(bgColor, bgOpacity),
      border: outlineShape === "none" ? "none" : `${Math.max(1, size * 0.015)}px solid ${hexA(borderColor, borderOpacity)}`,
      boxShadow:
        outlineShape !== "none" && borderOpacity > 0
          ? `0 0 ${size * 0.06}px ${hexA(borderColor, borderOpacity * 0.6)}`
          : "none",
      overflow: "hidden",
    }}>
      {/* The head group. A tilt or shake belongs on THIS element — every
          feature is positioned inside it, so one transform moves the lot. */}
      <div style={{ position: "relative", width: head, height: head, borderRadius: SHAPE_RADIUS[outlineShape] }}>
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: `url(${urls[puppet.base] ?? ""})`,
          backgroundSize: "100% 100%",
        }} />
        {puppet.base_layers?.map((l, i) => draw(l, `bl${i}`))}
        {draw(eyes, "eyes")}
        {draw(puppet.pupils, "pupils")}
        {brows && draw(brows.left, "browL")}
        {brows && draw(brows.right, "browR")}
        {puppet.extras?.map((l, i) => draw(l, `ex${i}`))}
        {draw(mouth, "mouth")}
      </div>
    </div>
  );
}

function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
