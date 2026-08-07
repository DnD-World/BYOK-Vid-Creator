// ---------------------------------------------------------------------------
// Subtitles, as a PURE function of (cues, config, size, timeMs).
//
// Same contract as WaveformScene: no clock of its own, no randomness, so the
// live preview and the Remotion render can drive it from different time
// sources and cannot disagree.
//
// All styling is INLINE on purpose. The Remotion bundle is built by Remotion's
// own webpack and does not run Tailwind, so class names would be silently
// inert during a render — text would appear in the preview and vanish (or
// render unstyled) in the export.
//
// Font choice is deliberately a system stack rather than the app's Rajdhani.
// Rajdhani is loaded by a <link> in index.html, which exists in the Electron
// window but NOT inside the render bundle — using it here would mean the
// preview and the exported video used different typefaces. Segoe UI resolves
// identically in both, since both are Chromium on Windows.
// ---------------------------------------------------------------------------

import type { SubtitleConfig } from "../../store/types";
import { cueAt, type SubtitleCue } from "../../lib/subtitles/wordTiming";

export interface SubtitleSceneProps {
  cues: SubtitleCue[];
  config: SubtitleConfig;
  width: number;
  height: number;
  timeMs: number;
  /** speakerId -> that speaker's outline colour. Lets the highlighted word
   *  carry whoever is talking, which is the same rule the waveform follows —
   *  one colour per speaker, derived rather than configured twice. */
  speakerColors?: Record<string, string>;
}

// The fallback, and what is used when no font has been chosen. Segoe UI
// resolves identically in the preview and in the render — both are Chromium on
// Windows — which is why the app's own Rajdhani is NOT used here: it is loaded
// by a <link> in index.html that does not exist inside the render bundle.
//
// A chosen font is downloaded and registered on both sides under the same
// family name, so it resolves identically for the same reason. It always keeps
// this stack behind it: a Greek line in a Latin-only family falls back per
// glyph, and falling back to Segoe UI is better than to whatever the browser
// picks unaided.
const FONT_STACK = '"Segoe UI", system-ui, -apple-system, Roboto, sans-serif';

export function SubtitleScene({
  cues, config, width, height, timeMs, speakerColors,
}: SubtitleSceneProps) {
  if (!config.enabled || width <= 0 || height <= 0) return null;

  const cue = cueAt(cues, timeMs);
  if (!cue) return null;

  const activeColor =
    (config.activeFromSpeaker ? speakerColors?.[cue.speakerId] : null) ?? config.activeColor;

  // Sizes derive from frame width so subtitles occupy the same proportion of
  // the frame in the preview and at 1080p.
  const fontSize = Math.max(8, width * config.fontSize);
  const strokePx = fontSize * config.strokeWidth;
  const glowPx = fontSize * 0.5 * config.activeGlow;

  const vertical: React.CSSProperties =
    config.position === "top"
      ? { top: height * 0.08, alignItems: "flex-start" }
      : config.position === "center"
        ? { top: 0, height, alignItems: "center" }
        : { bottom: height * 0.1, alignItems: "flex-end" };

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
        ...vertical,
      }}
    >
      <div
        style={{
          maxWidth: width * 0.86,
          textAlign: "center",
          fontFamily: config.fontFamily
            ? `"${config.fontFamily}", ${FONT_STACK}`
            : FONT_STACK,
          fontWeight: config.fontWeight ?? 800,
          fontSize,
          lineHeight: 1.25,
          letterSpacing: "0.01em",
          textTransform: config.uppercase ? "uppercase" : "none",
          // paintOrder keeps the stroke behind the glyph fill; without it a
          // thick stroke eats into the letterforms and thin text turns to mush.
          paintOrder: "stroke fill",
          WebkitTextStrokeWidth: `${strokePx}px`,
          WebkitTextStrokeColor: config.strokeColor,
        }}
      >
        {cue.words.map((w, i) => {
          const isActive = timeMs >= w.startMs && timeMs < w.endMs;
          return (
            <span
              key={i}
              style={{
                color: isActive ? activeColor : config.color,
                textShadow:
                  isActive && glowPx > 0
                    ? `0 0 ${glowPx}px ${activeColor}`
                    : "none",
                // A trailing space inside the span, rather than a gap between
                // flex items, so the line wraps like ordinary text does.
                whiteSpace: "pre-wrap",
              }}
            >
              {w.text}
              {i < cue.words.length - 1 ? " " : ""}
            </span>
          );
        })}
      </div>
    </div>
  );
}
