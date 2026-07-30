import { CSSProperties } from "react";
// Relative, NOT the "@/" alias: this component is now rendered by the Remotion
// bundle too, which is built by Remotion's own webpack and does not know the
// app's tsconfig path aliases. An alias here fails the render but not the
// preview — the worst kind of asymmetry.
import type { VisemeId } from "../../lib/visemes/visemeMap";
import type { OutlineShape } from "../../store/types";

interface Props {
  sheetUrl: string;          // 3072x3072 (3x3 of 1024)
  viseme: VisemeId;          // 0-8
  size: number;              // disk diameter in px
  bgOpacity: number;         // 0-1
  borderOpacity: number;     // 0-1
  bgColor?: string;
  borderColor?: string;
  outlineShape?: OutlineShape;
}

/** Corner rounding per shape, as a CSS border-radius. "none" still rounds the
 *  face itself — only the frame around it changes. */
const SHAPE_RADIUS: Record<OutlineShape, string> = {
  circle: "50%",
  rounded: "18%",
  square: "0%",
  none: "50%",
};

export function SpeakerAvatar({
  sheetUrl, viseme, size,
  bgOpacity, borderOpacity,
  bgColor = "#1a1a1a", borderColor = "#d98a3d",
  outlineShape = "circle",
}: Props) {
  const col = viseme % 3;
  const row = Math.floor(viseme / 3);

  // The face is clipped to the SAME shape as the frame around it. Leaving this
  // at a hard 50% meant a square frame still circle-cropped the artwork, which
  // looked like the shape control was broken.
  const faceRadius = SHAPE_RADIUS[outlineShape];

  // A circle wastes its corners, so the face is inset to 90% and the ring sits
  // clear of it. A square frame has no such waste and can run nearly edge to
  // edge — insetting it there just prints a grey border around the artwork.
  const fill = outlineShape === "circle" || outlineShape === "none" ? 0.9 : 0.97;
  const head = size * fill;

  // No sheet assigned yet is a normal state, not an error — the frame still
  // draws, just without a face, so the layout is identical once one is picked.
  const face: CSSProperties = sheetUrl
    ? {
        width: head, height: head,
        backgroundImage: `url(${sheetUrl})`,
        backgroundSize: `${head * 3}px ${head * 3}px`,
        backgroundPosition: `-${col * head}px -${row * head}px`,
        borderRadius: faceRadius,
      }
    : { width: head, height: head };

  return (
    <div style={{
      width: size, height: size,
      borderRadius: SHAPE_RADIUS[outlineShape],
      display: "grid", placeItems: "center",
      background: hexA(bgColor, bgOpacity),
      // "none" keeps the face and any background but drops the frame entirely,
      // which is the look you want when the avatar sits on a busy background.
      border:
        outlineShape === "none"
          ? "none"
          : `${Math.max(1, size * 0.015)}px solid ${hexA(borderColor, borderOpacity)}`,
      boxShadow:
        outlineShape !== "none" && borderOpacity > 0
          ? `0 0 ${size * 0.06}px ${hexA(borderColor, borderOpacity * 0.6)}`
          : "none",
    }}>
      <div style={face} />
    </div>
  );
}

function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
