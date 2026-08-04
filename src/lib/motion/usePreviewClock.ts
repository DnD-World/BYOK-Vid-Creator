// ---------------------------------------------------------------------------
// The preview's clock — and the ONLY place in the app allowed to have one.
//
// Everything drawn on the canvas (waveform, subtitles, and lip-sync later) is
// a pure function of timeMs. This hook is what supplies that number on screen;
// Remotion's useCurrentFrame() supplies it during a render. Keeping the clock
// out of the drawing code is what makes the export deterministic: Remotion
// renders frames out of order across parallel headless Chromium workers, so a
// scene reading performance.now() directly would flicker frame to frame.
//
// It returns one shared value for all overlays on purpose. If each overlay ran
// its own requestAnimationFrame loop they would tick on slightly different
// frames and the subtitles could visibly lag the waveform in the preview.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";

/**
 * @param loopMs Wrap back to zero after this many ms — used so the preview
 *               cycles through real narration audio instead of running off
 *               into silence. 0 or undefined means run forever.
 */
export function usePreviewClock(loopMs?: number): number {
  const [timeMs, setTimeMs] = useState(0);
  const rafRef = useRef<number>();

  useEffect(() => {
    const start = performance.now();
    const loop = (now: number) => {
      setTimeMs(now - start);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return loopMs && loopMs > 0 ? timeMs % loopMs : timeMs;
}
