// ---------------------------------------------------------------------------
// Registers the downloaded subtitle typeface and HOLDS THE RENDER until it has
// actually loaded.
//
// The waiting is the whole point. A @font-face is fetched lazily, so without a
// delayRender the first frames of a render — and, because Remotion renders out
// of order across workers, an arbitrary scatter of frames after that — get
// captured in the fallback typeface. That is far worse than a wrong font: it is
// a video whose subtitles change typeface at random.
//
// Same shape as useWaitForImages, for the same reason.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { continueRender, delayRender, staticFile } from "remotion";
import type { RenderProps } from "./types";

type Font = NonNullable<RenderProps["subtitleFont"]>;

export function SubtitleFont({ font }: { font: RenderProps["subtitleFont"] }) {
  const [handle] = useState(() => (font ? delayRender("Loading subtitle font") : null));
  const [done, setDone] = useState(false);

  const css = font
    ? font.faces
        .map(
          (f) =>
            `@font-face{font-family:"${font.family}";font-style:normal;` +
            `font-weight:${font.weight};font-display:block;` +
            `src:url(${staticFile(f.fileName)}) format("woff2");` +
            (f.unicodeRange ? `unicode-range:${f.unicodeRange};` : "") +
            `}`
        )
        .join("\n")
    : "";

  useEffect(() => {
    if (handle === null || !font) return;
    let cancelled = false;
    // Ask for both alphabets: the subsets are separate files, and loading only
    // the Latin one would leave Greek subtitles in the fallback face.
    const wanted = [`${font.weight} 100px "${font.family}"`];
    Promise.all(
      wanted.flatMap((spec) => [
        document.fonts.load(spec, "Hello"),
        document.fonts.load(spec, "Γειά"),
      ])
    )
      .catch((e) => {
        // eslint-disable-next-line no-console
        console.log(`[byok] Subtitle font ${font.family} failed to load: ${e}`);
      })
      .then(() => {
        if (!cancelled) setDone(true);
      });
    return () => {
      cancelled = true;
    };
  }, [handle, font]);

  // Released a commit later, so the style has been applied before any frame is
  // taken — same ordering rule as the spectrum hook.
  useEffect(() => {
    if (handle !== null && done) continueRender(handle);
  }, [handle, done]);

  if (!font) return null;
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}

export type { Font as SubtitleFontDef };
