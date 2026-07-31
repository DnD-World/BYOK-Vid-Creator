// ---------------------------------------------------------------------------
// Loads the packed per-band spectrum that the main process wrote into the
// render's public dir, and holds back frame capture until it's there.
//
// It's a file rather than a prop because of size — see spectrumFileName in
// types.ts. The file is bands followed by peaks, same length each, frame-major
// with `bandCount` bytes per frame.
//
// Cached at module scope: Remotion opens one page per render worker and asks
// for thousands of frames from it, so the fetch has to happen once per page,
// not once per frame. A failed load resolves to null and the waveform falls
// back to the loudness envelope — a render that looks slightly worse beats a
// render that hangs until the delayRender timeout.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { continueRender, delayRender } from "remotion";
import type { DecodedSpectrum } from "../src/lib/waveform/audioAnalysis";

const cache = new Map<string, Promise<DecodedSpectrum | null>>();

function load(url: string, bandCount: number): Promise<DecodedSpectrum | null> {
  const hit = cache.get(url);
  if (hit) return hit;

  const p = fetch(url)
    .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error(String(res.status)))))
    .then((buf) => {
      const all = new Uint8Array(buf);
      const half = Math.floor(all.length / 2);
      // Truncated or padded files would misalign every band; better to draw
      // the fallback than to draw the wrong spectrum confidently.
      if (half === 0 || half % bandCount !== 0) return null;
      return {
        bandCount,
        bands: all.subarray(0, half),
        peaks: all.subarray(half),
      } satisfies DecodedSpectrum;
    })
    .catch(() => null);

  cache.set(url, p);
  return p;
}

export function useSpectrumFile(
  url: string | null,
  bandCount: number
): DecodedSpectrum | null {
  const [spectrum, setSpectrum] = useState<DecodedSpectrum | null>(null);
  const [settled, setSettled] = useState(false);
  const [handle] = useState(() => (url ? delayRender("Loading waveform spectrum") : null));

  useEffect(() => {
    if (handle === null) return;
    let cancelled = false;
    load(url!, bandCount).then((s) => {
      if (cancelled) return;
      if (!s) {
        // Loud, because the failure mode is a video that renders perfectly
        // well and just quietly looks like the version before the spectrum
        // existed. renderVideo forwards anything tagged [byok] to the UI.
        console.error(`[byok] spectrum failed to load from ${url} — falling back to the loudness envelope`);
      }
      setSpectrum(s);
      setSettled(true);
    });
    return () => {
      cancelled = true;
    };
  }, [handle, url, bandCount]);

  // Released in a separate effect, so the frame is only allowed to be captured
  // after React has actually committed the spectrum. Calling continueRender in
  // the fetch callback releases it one commit too early.
  useEffect(() => {
    if (handle !== null && settled) continueRender(handle);
  }, [handle, settled]);

  return spectrum;
}
