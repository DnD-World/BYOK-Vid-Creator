// ---------------------------------------------------------------------------
// The video itself.
//
// Intentionally plain: background, waveform, speaker placeholders, audio.
// This exists to prove the pipeline end to end — script -> narration ->
// frames -> MP4 — not to look good yet. Visual work belongs on top of a
// pipeline that is already known to work.
//
// Note the styling here is all inline. The Remotion bundle is built by
// Remotion's own webpack config and does NOT run Tailwind, so any Tailwind
// class names in shared components are inert during a render. Anything
// layout-critical has to be an inline style.
// ---------------------------------------------------------------------------

import { AbsoluteFill, Audio, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { WaveformScene } from "../src/components/canvas/WaveformScene";
import type { RenderProps } from "./types";

/** Apply an alpha to a #rgb/#rrggbb color. Speakers carry their fill and
 *  border opacity separately, and the default speaker is a deliberately
 *  invisible disk (bgOpacity 0) with only its border showing — so these two
 *  cannot collapse into a single element-level `opacity`. */
function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  if (full.length !== 6 || Number.isNaN(n)) return hex;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

export function VideoComposition({
  waveform,
  speakers,
  audioFileName,
  authoredWidth,
}: RenderProps) {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();

  // The single line that makes the export deterministic: time comes from the
  // frame index, never from a wall clock. Frame 240 at 30fps is 8000ms on
  // every worker, in any order, on every machine.
  const timeMs = (frame / fps) * 1000;

  // Speaker sizes were authored against the small preview canvas; scale them
  // to the real output width so a 120px avatar isn't a speck on a 1080p frame.
  const speakerScale = authoredWidth > 0 ? width / authoredWidth : 1;

  return (
    <AbsoluteFill style={{ backgroundColor: "#0b0b0d" }}>
      {audioFileName ? <Audio src={staticFile(audioFileName)} /> : null}

      <div style={{ position: "absolute", inset: 0 }}>
        <WaveformScene config={waveform} width={width} height={height} timeMs={timeMs} />
      </div>

      {speakers.map((sp) => {
        const size = Math.max(8, sp.size * speakerScale);
        return (
          <div
            key={sp.id}
            style={{
              position: "absolute",
              left: `${sp.x * 100}%`,
              top: `${sp.y * 100}%`,
              transform: "translate(-50%, -50%)",
              width: size,
              height: size,
              borderRadius: "50%",
              backgroundColor: withAlpha(sp.bgColor, sp.bgOpacity),
              border: `${Math.max(1, size * 0.02)}px solid ${withAlpha(
                sp.borderColor,
                sp.borderOpacity
              )}`,
              boxSizing: "border-box",
            }}
          >
            {/* Placeholder for the viseme sprite sheet. Lip-sync needs the
                sheet PNG resolvable from inside the render bundle, which is
                its own piece of work — see the PR description. */}
          </div>
        );
      })}
    </AbsoluteFill>
  );
}
