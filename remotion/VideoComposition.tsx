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

import { useMemo } from "react";
import { AbsoluteFill, Audio, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { WaveformScene } from "../src/components/canvas/WaveformScene";
import { SubtitleScene } from "../src/components/canvas/SubtitleScene";
import { SpeakerAvatar } from "../src/components/canvas/SpeakerAvatar";
import { buildCues } from "../src/lib/subtitles/wordTiming";
import { buildSpeakerVisemeTracks } from "../src/lib/visemes/speakerTracks";
import { visemeAt } from "../src/lib/visemes/timeline";
import { VISEME } from "../src/lib/visemes/visemeMap";
import { useWaitForImages } from "./useWaitForImages";
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
  analysis,
  subtitles,
  narrationSegments,
}: RenderProps) {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();

  // Cue layout depends only on the script and the wrap width, so it's computed
  // once per worker rather than on every one of thousands of frames.
  const cues = useMemo(
    () => buildCues(narrationSegments, subtitles.maxChars),
    [narrationSegments, subtitles.maxChars]
  );

  // Also once per worker, not per frame — the tracks are thousands of keyframes.
  const visemeTracks = useMemo(
    () => buildSpeakerVisemeTracks(narrationSegments, fps),
    [narrationSegments, fps]
  );

  const sheetUrls = useMemo(
    () =>
      speakers
        .map((sp) => (sp.sheetFileName ? staticFile(sp.sheetFileName) : ""))
        .filter(Boolean),
    [speakers]
  );
  // Must run before any frame is captured — see the hook for why.
  useWaitForImages(sheetUrls);

  // The single line that makes the export deterministic: time comes from the
  // frame index, never from a wall clock. Frame 240 at 30fps is 8000ms on
  // every worker, in any order, on every machine.
  const timeMs = (frame / fps) * 1000;


  return (
    <AbsoluteFill style={{ backgroundColor: "#0b0b0d" }}>
      {audioFileName ? <Audio src={staticFile(audioFileName)} /> : null}

      <div style={{ position: "absolute", inset: 0 }}>
        <WaveformScene
          config={waveform}
          width={width}
          height={height}
          timeMs={timeMs}
          analysis={analysis}
        />
      </div>

      {speakers.map((sp) => {
        const track = visemeTracks[sp.id];
        const viseme = track ? visemeAt(track, timeMs / 1000) : VISEME.NEUTRAL;
        // size is a fraction of frame width, so this resolves identically in
        // the preview and here — no scaling factor to get wrong.
        const size = Math.max(8, sp.size * width);
        return (
          <div
            key={sp.id}
            style={{
              position: "absolute",
              left: `${sp.x * 100}%`,
              top: `${sp.y * 100}%`,
              transform: "translate(-50%, -50%)",
            }}
          >
            {/* The very same component the preview draws. Duplicating the disk
                markup here is what let the border width and glow drift apart
                once already — there is only one implementation now. */}
            <SpeakerAvatar
              sheetUrl={sp.sheetFileName ? staticFile(sp.sheetFileName) : ""}
              viseme={viseme}
              size={size}
              bgOpacity={sp.bgOpacity}
              borderOpacity={sp.borderOpacity}
              bgColor={sp.bgColor}
              borderColor={sp.borderColor}
            />
          </div>
        );
      })}

      {/* Last, so subtitles sit above the waveform and the avatars. */}
      <SubtitleScene
        cues={cues}
        config={subtitles}
        width={width}
        height={height}
        timeMs={timeMs}
      />
    </AbsoluteFill>
  );
}
