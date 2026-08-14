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

import type { Surface, SubtitleConfig, SubtitleTransition } from "../../store/types";
import { cueAt, type SubtitleCue } from "../../lib/subtitles/wordTiming";
import { emojiFor } from "../../lib/subtitles/emoji";
import { GlassFilterDefs, glassBackdropStyle, defaultGlass, type GlassConfig } from "./GlassPanel";

/** A backdrop, as inline CSS. Shared shape for the panel behind text and the
 *  disc behind an avatar, so both are described by one set of controls.
 *
 *  `blur` is a fraction of frame width for the same reason every other size
 *  here is: the preview and the 1080p render each multiply by their own width
 *  and cannot drift apart. */
export function surfaceStyle(surface: Surface | undefined, width: number): React.CSSProperties {
  if (!surface || surface.style === "none") return {};
  const blurPx = surface.blur * width;
  const tinted = surface.style === "solid" || surface.style === "glass";
  const blurred = surface.style === "blur" || surface.style === "glass";
  return {
    backgroundColor: tinted ? withAlpha(surface.color, surface.opacity) : undefined,
    // backdrop-filter, not filter: the blur has to apply to what is BEHIND the
    // panel, not to the text drawn on it.
    backdropFilter: blurred ? `blur(${blurPx}px)` : undefined,
    WebkitBackdropFilter: blurred ? `blur(${blurPx}px)` : undefined,
    border:
      surface.style === "glass" && surface.borderOpacity > 0
        ? `1px solid ${withAlpha("#ffffff", surface.borderOpacity)}`
        : undefined,
  };
}

/** #rrggbb + 0–1 alpha → rgba(). Colours are stored as hex because that is what
 *  every colour input speaks; opacity is separate so the two can be changed
 *  without re-encoding each other. */
function withAlpha(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.max(0, Math.min(1, alpha))})`;
}

/** Where a sentence is in its entrance, as scale / blur / opacity.
 *
 *  A PURE function of the clock, like everything else in this file. Remotion
 *  renders frames out of order and in parallel, so anything that remembered
 *  "the previous frame" would produce a different video every time. */
function entrance(
  t: SubtitleTransition | undefined,
  cueStartMs: number,
  timeMs: number,
  fontSize: number
): { scale: number; blurPx: number; opacity: number } {
  const none = { scale: 1, blurPx: 0, opacity: 1 };
  if (!t || t.style === "none" || t.durationMs <= 0) return none;

  const p = (timeMs - cueStartMs) / t.durationMs;
  if (p >= 1 || p < 0) return none;

  if (t.style === "crossBlur") {
    // Blur and fade in together. Scaled to the type size so it reads the same
    // at any resolution.
    return { scale: 1, blurPx: (1 - p) * fontSize * 0.22 * t.blur, opacity: p };
  }

  // pop: 90% → overshoot → 100%. Two straight segments rather than a spring,
  // because a spring needs state and this cannot have any. The overshoot peaks
  // at 60% through, which is where a bounce feels like a bounce rather than a
  // wobble.
  const peak = 0.6;
  const scale =
    p < peak
      ? 0.9 + (t.overshoot - 0.9) * (p / peak)
      : t.overshoot + (1 - t.overshoot) * ((p - peak) / (1 - peak));
  // Motion blur strongest where the movement is fastest — the first half.
  const speed = p < peak ? 1 - p / peak : 0;
  return { scale, blurPx: speed * fontSize * 0.12 * t.blur, opacity: Math.min(1, p * 3) };
}

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
  /** Glass physics, when the caption's surface asks for glass. Shared with
   *  the speakers rather than configured twice. */
  glass?: GlassConfig | null;
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

/** Uppercase, correctly for Greek.
 *
 *  Greek drops accents in all-caps — ΚΑΛΗΜΕΡΑ, never ΚΑΛΗΜΈΡΑ — and neither
 *  CSS `text-transform` nor plain toUpperCase() knows that: both preserve the
 *  tonos, leaving a mark over a capital that no Greek reader would write. The
 *  dialytika is a different matter and is kept, because it changes how the word
 *  is read rather than only where the stress falls.
 *
 *  Decompose, drop the combining acute, recompose. Done on the text rather than
 *  in CSS so the same string is what gets measured, wrapped and drawn. */
function toUpperGreek(s: string): string {
  return s
    .toUpperCase()
    .normalize("NFD")
    .replace(/́/g, "")
    .normalize("NFC");
}

export function SubtitleScene({
  cues, config, width, height, timeMs, speakerColors, glass,
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
  const anim = entrance(config.transition, cue.startMs, timeMs, fontSize);
  const hasSurface = !!config.surface && config.surface.style !== "none";
  // "glass" is no longer a heavier blur — it is a real bevelled pane, so it
  // takes a different road from solid and blur.
  const isGlass = config.surface?.style === "glass";
  const g = { ...defaultGlass(), ...(glass ?? {}), shape: "rect" as const };

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
      {isGlass && (
        <GlassFilterDefs id="subs" glass={g} w={1000} h={220} frameWidth={width} />
      )}
      <div
        style={{
          maxWidth: width * 0.86,
          textAlign: "center",
          // The entrance rides on the panel, not the words: scaling each span
          // separately would reflow the line mid-animation and make it jitter.
          transform: `scale(${anim.scale})`,
          filter: anim.blurPx > 0 ? `blur(${anim.blurPx}px)` : undefined,
          opacity: anim.opacity,
          // Padding only when there is a surface to pad. Without a panel the
          // text should sit exactly where it always has, or every existing
          // project shifts.
          ...(hasSurface
            ? {
                padding: `${fontSize * 0.42}px ${fontSize * 0.9}px`,
                // A PILL when it is glass. GlassSurface's demo runs at
                // borderRadius 50 on an 80px-tall bar — the radius is half the
                // height, so the ends are semicircles. 9999 gets that at any
                // height, which matters here because the caption's height
                // changes with the number of lines.
                borderRadius: isGlass
                  ? 9999
                  : fontSize * 1.25 * (config.surface?.radius ?? 0.25),
              }
            : {}),
          ...(isGlass ? glassBackdropStyle("subs", g, width) : surfaceStyle(config.surface, width)),
          fontFamily: config.fontFamily
            ? `"${config.fontFamily}", ${FONT_STACK}`
            : FONT_STACK,
          fontWeight: config.fontWeight ?? 800,
          fontSize,
          lineHeight: 1.25,
          letterSpacing: "0.01em",
          // NOT text-transform. CSS uppercases Greek by the Unicode default,
          // which keeps the tonos: ΚΥΡΙΟΛΕΚΤΙΚΆ, and a stray mark where the
          // accent used to be. Greek orthography drops accents in all-caps.
          // Done per word below instead, so the rule is applied to the text
          // rather than to its presentation.
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
              {(() => {
                const swap = config.emoji ? emojiFor(w.text) : { text: w.text, isEmoji: false };
                if (!swap.isEmoji) {
                  return config.uppercase ? toUpperGreek(w.text) : w.text;
                }
                // Drawn larger, and without the stroke. An emoji set at the
                // text's own size reads as a smudge beside capital letters, and
                // a text-stroke traces every internal edge of a colour glyph
                // until it looks like a sticker someone has outlined by hand.
                return (
                  <span
                    style={{
                      fontSize: "1.5em",
                      lineHeight: 1,
                      WebkitTextStrokeWidth: 0,
                      verticalAlign: "-0.18em",
                    }}
                  >
                    {swap.text}
                  </span>
                );
              })()}
              {i < cue.words.length - 1 ? " " : ""}
            </span>
          );
        })}
      </div>
    </div>
  );
}
