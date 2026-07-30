import { CSSProperties } from "react";
// Relative, NOT the "@/" alias: this component is now rendered by the Remotion
// bundle too, which is built by Remotion's own webpack and does not know the
// app's tsconfig path aliases. An alias here fails the render but not the
// preview — the worst kind of asymmetry.
import type { VisemeId } from "../../lib/visemes/visemeMap";

interface Props {
  sheetUrl: string;          // 3072x3072 (3x3 of 1024)
  viseme: VisemeId;          // 0-8
  size: number;              // disk diameter in px
  bgOpacity: number;         // 0-1
  borderOpacity: number;     // 0-1
  bgColor?: string;
  borderColor?: string;
}

export function SpeakerAvatar({
  sheetUrl, viseme, size,
  bgOpacity, borderOpacity,
  bgColor = "#1a1a1a", borderColor = "#d98a3d",
}: Props) {
  const col = viseme % 3;
  const row = Math.floor(viseme / 3);
  const head = size * 0.9; // 90% fill rule

  // No sheet assigned yet is a normal state, not an error — the disk still
  // draws, just without a face, so the layout is identical once one is picked.
  const face: CSSProperties = sheetUrl
    ? {
        width: head, height: head,
        backgroundImage: `url(${sheetUrl})`,
        backgroundSize: `${head * 3}px ${head * 3}px`,
        backgroundPosition: `-${col * head}px -${row * head}px`,
        borderRadius: "50%",
      }
    : { width: head, height: head };

  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      display: "grid", placeItems: "center",
      background: hexA(bgColor, bgOpacity),
      border: `${Math.max(1, size * 0.015)}px solid ${hexA(borderColor, borderOpacity)}`,
      boxShadow: borderOpacity > 0
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
