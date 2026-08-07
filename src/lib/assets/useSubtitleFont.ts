// ---------------------------------------------------------------------------
// Registers the chosen subtitle font in the PREVIEW.
//
// The render does the same job in remotion/SubtitleFont.tsx, and the two are
// deliberately built from the same manifest: same family name, same weight,
// same per-subset unicode-ranges. That is what makes "what you see" and "what
// renders" the same typeface rather than two that merely look alike.
//
// The difference is only in how the bytes arrive — blob URLs over IPC here, a
// file in the public dir there — because the preview has no filesystem and the
// render has no window.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";

interface Face {
  path: string;
  fileName: string;
  unicodeRange: string;
}

export interface LoadedFont {
  family: string;
  weight: number;
  hasGreek: boolean;
  faces: Face[];
}

export interface SubtitleFontState {
  loading: boolean;
  /** Set when the family could not be fetched — shown next to the picker
   *  rather than swallowed, since the symptom otherwise is "my font didn't
   *  change" with no reason given. */
  error: string | null;
  font: LoadedFont | null;
}

export function useSubtitleFont(
  family: string | null | undefined,
  weight: number
): SubtitleFontState {
  const [state, setState] = useState<SubtitleFontState>({
    loading: false,
    error: null,
    font: null,
  });

  useEffect(() => {
    if (!family) {
      setState({ loading: false, error: null, font: null });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    (async () => {
      const urls: string[] = [];
      try {
        const font = (await window.byok.fonts.ensure(family, weight)) as LoadedFont;
        // Each subset becomes its own FontFace with its own range, exactly as
        // the CSS Google serves would: registering one file for the whole
        // family would leave Greek drawing from the Latin subset, which has no
        // Greek glyphs in it.
        for (const face of font.faces) {
          const buf = await window.byok.storage.readFile(face.path);
          if (cancelled) break;
          const url = URL.createObjectURL(new Blob([buf], { type: "font/woff2" }));
          urls.push(url);
          const ff = new FontFace(font.family, `url(${url})`, {
            weight: String(font.weight),
            ...(face.unicodeRange ? { unicodeRange: face.unicodeRange } : {}),
          });
          await ff.load();
          if (cancelled) break;
          document.fonts.add(ff);
        }
        if (!cancelled) setState({ loading: false, error: null, font });
      } catch (e) {
        if (!cancelled) {
          setState({
            loading: false,
            error: e instanceof Error ? e.message : String(e),
            font: null,
          });
        }
      } finally {
        // The blob only has to outlive the FontFace's own load; the browser
        // keeps the decoded font once it is in document.fonts.
        setTimeout(() => urls.forEach((u) => URL.revokeObjectURL(u)), 5000);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [family, weight]);

  return state;
}
