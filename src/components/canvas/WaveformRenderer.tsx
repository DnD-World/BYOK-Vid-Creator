// ---------------------------------------------------------------------------
// Live-preview wrapper around WaveformScene.
//
// This file owns the *preview* clock only — requestAnimationFrame, wall-clock
// time, whatever makes the on-screen canvas feel alive. None of that is
// allowed anywhere near the export path, so all the actual drawing lives in
// WaveformScene.tsx, which takes timeMs as a prop and has no clock at all.
//
// The final render drives that same scene from Remotion's frame counter
// instead (see remotion/WaveformTrack.tsx). Preview and export therefore
// share one drawing implementation and can't visually drift apart.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";
import type { WaveformConfig } from "../../store/types";
import { WaveformScene } from "./WaveformScene";

interface Props {
  config: WaveformConfig;
  width: number;
  height: number;
}

export function WaveformRenderer({ config, width, height }: Props) {
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

  return <WaveformScene config={config} width={width} height={height} timeMs={timeMs} />;
}
