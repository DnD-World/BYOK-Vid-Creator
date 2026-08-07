// ---------------------------------------------------------------------------
// Loads just enough of each family to render its OWN NAME in the picker.
//
// A list of typeface names set in the UI font tells you nothing — the one
// question you are asking is "what does this look like", and the answer is the
// name itself. So every row is set in the family it names.
//
// Deliberately lazy: nothing is fetched until the list is opened. Families are
// cached on disk by the main process after the first fetch, so the cost is paid
// once and every later open is instant. They are also fetched a few at a time
// rather than all at once — twenty-odd parallel downloads on a first open
// stalls the very list they are meant to fill.
//
// A family that fails to load simply renders in the UI font. A picker that
// works and looks plain beats one that half-loads and shows gaps.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";

/** How many families to fetch at once. Small on purpose — see above. */
const BATCH = 4;

export function useFontPreviews(
  families: { family: string; weights: number[] }[],
  enabled: boolean
): Set<string> {
  const [ready, setReady] = useState<Set<string>>(new Set());
  // Tracks what has already been requested across re-renders, so reopening the
  // list doesn't re-request everything it already has.
  const askedRef = useRef<Set<string>>(new Set());
  const urlsRef = useRef<string[]>([]);

  useEffect(() => {
    if (!enabled || families.length === 0) return;
    let cancelled = false;

    (async () => {
      const todo = families.filter((f) => !askedRef.current.has(f.family));
      for (let i = 0; i < todo.length; i += BATCH) {
        if (cancelled) return;
        const slice = todo.slice(i, i + BATCH);
        await Promise.all(
          slice.map(async (f) => {
            askedRef.current.add(f.family);
            try {
              // The LIGHTEST offered weight: a name shown at 900 tells you less
              // about a typeface than the same name at its text weight, and it
              // is a smaller file.
              const weight = Math.min(...f.weights);
              const font = await window.byok?.fonts?.ensure(f.family, weight);
              if (!font || cancelled) return;
              for (const face of font.faces) {
                const buf = await window.byok.storage.readFile(face.path);
                if (cancelled) return;
                const url = URL.createObjectURL(new Blob([buf], { type: "font/woff2" }));
                urlsRef.current.push(url);
                // Registered under a preview-only alias so it can never be
                // confused with the family the subtitles actually render in,
                // which is loaded separately at the chosen weight.
                const ff = new FontFace(`dnprev-${f.family}`, `url(${url})`, {
                  weight: String(weight),
                  unicodeRange: face.unicodeRange,
                });
                await ff.load();
                if (cancelled) return;
                (document as unknown as { fonts: FontFaceSet }).fonts.add(ff);
              }
              if (!cancelled) setReady((s) => new Set(s).add(f.family));
            } catch {
              // Preview only. Falling back to the UI font is fine.
            }
          })
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, families]);

  // Blob URLs are revoked on unmount; the FontFaces stay registered for the
  // session, which is the point of caching them.
  useEffect(() => {
    return () => {
      for (const u of urlsRef.current) URL.revokeObjectURL(u);
      urlsRef.current = [];
    };
  }, []);

  return ready;
}
