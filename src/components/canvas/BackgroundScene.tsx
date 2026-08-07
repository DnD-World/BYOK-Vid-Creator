// ---------------------------------------------------------------------------
// Background clips, in the preview.
//
// The render draws these with @remotion/transitions; this draws them with plain
// <video> elements and an opacity ramp. Different mechanisms on purpose — a
// preview has a real clock and can let a video play itself, a render cannot —
// but both ask backgroundTiming.ts the same question and get the same frames
// back. Nothing here decides *when* anything happens.
//
// Only the clips actually on screen are mounted: one, or two mid-crossfade.
// Mounting all of them would have eight videos decoding behind a UI that is
// already drawing a 24-band FFT at 60Hz.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useRef } from "react";
import {
  backgroundLayersAt,
  backgroundTiming,
  type BackgroundClip,
} from "../../lib/background/backgroundTiming";

/** How far a <video> may drift from the preview clock before it is seeked. A
 *  seek is visible — the picture stutters — so this is deliberately loose:
 *  the clock and the video both run in real time, and they only really part
 *  company when the tab is throttled or a clip loops. */
const DRIFT_TOLERANCE_SEC = 0.35;

function ClipVideo({
  src,
  sourceSec,
  opacity,
}: {
  src: string;
  sourceSec: number;
  opacity: number;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (Math.abs(el.currentTime - sourceSec) > DRIFT_TOLERANCE_SEC) {
      el.currentTime = sourceSec;
    }
    // Only when it has actually stopped. This runs on every preview frame, and
    // calling play() sixty times a second on a playing element is sixty
    // promises a second for nothing. Autoplay can still be refused; a rejection
    // here is not worth surfacing.
    if (el.paused) void el.play().catch(() => {});
  }, [sourceSec]);

  return (
    <video
      ref={ref}
      src={src}
      muted
      loop
      playsInline
      className="absolute inset-0 w-full h-full object-cover"
      style={{ opacity }}
    />
  );
}

export function BackgroundScene({
  clips,
  urls,
  timeMs,
  fps,
  crossfadeMs,
  dim,
}: {
  clips: (BackgroundClip & { filePath?: string })[];
  /** filePath -> blob URL. A clip whose file hasn't loaded yet is skipped
   *  rather than drawn black: the frame behind it is the real background. */
  urls: Record<string, string>;
  timeMs: number;
  fps: number;
  crossfadeMs: number;
  dim: number;
}) {
  const timing = useMemo(
    () => backgroundTiming(clips, crossfadeMs, fps),
    [clips, crossfadeMs, fps]
  );

  const frame = Math.round((timeMs / 1000) * fps);
  const layers = backgroundLayersAt(timing, frame);
  const visible = layers.filter((l) => {
    const p = clips[l.index]?.filePath;
    return p && urls[p];
  });

  if (visible.length === 0) return null;

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {visible.map((l) => (
        <ClipVideo
          key={l.index}
          src={urls[clips[l.index].filePath!]}
          sourceSec={l.sourceSec}
          opacity={l.opacity}
        />
      ))}
      {dim > 0 && (
        <div
          className="absolute inset-0"
          style={{ backgroundColor: `rgba(0, 0, 0, ${Math.min(1, dim)})` }}
        />
      )}
    </div>
  );
}
