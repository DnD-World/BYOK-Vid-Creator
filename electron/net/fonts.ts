// ---------------------------------------------------------------------------
// Subtitle fonts, fetched from Google Fonts once and then owned locally.
//
// Downloaded rather than linked, because the render bundle is served from a
// throwaway http:// origin inside a headless browser with no guarantee of a
// network, and a subtitle that silently falls back to Segoe UI halfway through
// a batch of renders is the kind of bug nobody notices until the client does.
// Same reason the viseme art and the narration WAV are copied rather than
// referenced.
//
// WHAT IS CHECKED, AND WHY IT IS CHECKED HERE: whether a family actually has
// Greek. It is not a detail — Montserrat, Oswald, Lato, Rubik and Nunito are
// among the most obvious choices for subtitles and NONE of them ship a Greek
// subset. Picking one and typing Greek gets you a silent fallback to another
// typeface mid-sentence. So the coverage is read out of the CSS Google returns
// (does any subset actually contain α, U+03B1) rather than trusted from a list
// someone typed.
//
// Runs in MAIN: it writes to disk and talks to the network.
// ---------------------------------------------------------------------------

import { request, requestBuffer } from "./http";
import fsp from "node:fs/promises";
import path from "node:path";

/** Google serves woff2 only to browsers it believes support it. */
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const GREEK_ALPHA = 0x3b1;
const LATIN_A = 0x41;

export interface FontFace {
  /** Absolute path to the downloaded woff2. */
  path: string;
  fileName: string;
  /** The CSS unicode-range this file covers. Empty means "everything". */
  unicodeRange: string;
}

export interface CachedFont {
  family: string;
  weight: number;
  faces: FontFace[];
  /** False means this family has no Greek subset — the app says so rather than
   *  letting the browser quietly substitute another typeface. */
  hasGreek: boolean;
}

/** Offered in the picker. `greek` here is only what to SHOW before anything is
 *  downloaded; the real answer comes back with the files. Every entry was
 *  checked against the live API rather than assumed. */
export const SUBTITLE_FONTS: { family: string; weights: number[]; greek: boolean }[] = [
  { family: "Roboto", weights: [500, 700, 900], greek: true },
  { family: "Roboto Condensed", weights: [500, 700, 900], greek: true },
  { family: "Open Sans", weights: [600, 700, 800], greek: true },
  { family: "Noto Sans", weights: [500, 700, 900], greek: true },
  { family: "Fira Sans", weights: [500, 700, 900], greek: true },
  { family: "Inter", weights: [600, 700, 900], greek: true },
  { family: "Source Sans 3", weights: [600, 700, 900], greek: true },
  { family: "Alegreya Sans", weights: [700, 800, 900], greek: true },
  { family: "Manrope", weights: [600, 700, 800], greek: true },
  { family: "Ubuntu", weights: [500, 700], greek: true },
  { family: "Play", weights: [400, 700], greek: true },
  { family: "Comfortaa", weights: [600, 700], greek: true },
  { family: "Arimo", weights: [600, 700], greek: true },
  // Latin only. Kept in the list on purpose, marked, because they are good
  // subtitle faces for an English video — hiding them would just look like
  // they were forgotten.
  { family: "Montserrat", weights: [700, 800, 900], greek: false },
  { family: "Oswald", weights: [500, 600, 700], greek: false },
  { family: "Rubik", weights: [600, 700, 800], greek: false },
  { family: "Lato", weights: [700, 900], greek: false },
];

// The User-Agent is not decoration. Google Fonts serves a DIFFERENT css2
// response depending on what asks: a modern browser string gets woff2, an
// unknown client gets older formats. Asking as a browser is how the Greek
// subset arrives at all.
function get(url: string) {
  return request(url, { headers: { "User-Agent": UA } });
}

async function getBinary(url: string): Promise<Buffer> {
  const res = await requestBuffer(url, { headers: { "User-Agent": UA }, timeoutMs: 30000 });
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  return res.body;
}

/** Does a CSS unicode-range cover this code point? */
export function rangeCovers(range: string, cp: number): boolean {
  if (!range.trim()) return true; // no range = the whole font
  return range.split(",").some((part) => {
    const m = part.trim().match(/^U\+([0-9A-Fa-f]+)(?:-([0-9A-Fa-f]+))?$/);
    if (!m) return false;
    const from = parseInt(m[1], 16);
    const to = m[2] ? parseInt(m[2], 16) : from;
    return cp >= from && cp <= to;
  });
}

function slug(family: string, weight: number): string {
  return `${family.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${weight}`;
}

/**
 * Fetch a family+weight into `fontsDir`, or return what is already there.
 *
 * Only the Latin and Greek subsets are kept. Google splits a family into eight
 * or nine files — Cyrillic, Vietnamese, and so on — and downloading the lot
 * would triple the wait for coverage this app will never draw.
 */
export async function ensureFont(
  family: string,
  weight: number,
  fontsDir: string
): Promise<CachedFont> {
  // The family name goes into a URL and a path. Anything outside this is not a
  // Google font name and has no business being either.
  if (!/^[A-Za-z0-9 +\-']{1,48}$/.test(family)) {
    throw new Error(`"${family}" is not a usable font family name.`);
  }
  const dir = path.join(fontsDir, slug(family, weight));
  const manifestPath = path.join(dir, "manifest.json");

  try {
    const cached = JSON.parse(await fsp.readFile(manifestPath, "utf8")) as CachedFont;
    // Trust the manifest only as far as the files it names still exist.
    await Promise.all(cached.faces.map((f) => fsp.access(path.join(dir, f.fileName))));
    return {
      ...cached,
      faces: cached.faces.map((f) => ({ ...f, path: path.join(dir, f.fileName) })),
    };
  } catch {
    /* not cached, or cached badly — refetch */
  }

  const cssUrl =
    `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}` +
    `:wght@${weight}&display=swap`;
  const res = await get(cssUrl);
  if (res.status !== 200) {
    throw new Error(
      res.status === 400
        ? `Google Fonts has no "${family}" at weight ${weight}.`
        : `Google Fonts answered ${res.status}.`
    );
  }

  const wanted: { url: string; unicodeRange: string }[] = [];
  for (const block of res.body.match(/@font-face\s*\{[^}]*\}/g) ?? []) {
    const url = block.match(/url\((https:\/\/[^)]+\.woff2)\)/)?.[1];
    if (!url) continue;
    const unicodeRange = block.match(/unicode-range:\s*([^;]+);/)?.[1]?.trim() ?? "";
    if (rangeCovers(unicodeRange, LATIN_A) || rangeCovers(unicodeRange, GREEK_ALPHA)) {
      wanted.push({ url, unicodeRange });
    }
  }
  if (wanted.length === 0) throw new Error(`No usable subset came back for "${family}".`);

  await fsp.mkdir(dir, { recursive: true });
  const faces: FontFace[] = [];
  for (let i = 0; i < wanted.length; i++) {
    const fileName = `s${i}.woff2`;
    const buf = await getBinary(wanted[i].url);
    await fsp.writeFile(path.join(dir, fileName), buf);
    faces.push({ fileName, path: path.join(dir, fileName), unicodeRange: wanted[i].unicodeRange });
  }

  const font: CachedFont = {
    family,
    weight,
    faces,
    hasGreek: faces.some((f) => rangeCovers(f.unicodeRange, GREEK_ALPHA)),
  };

  // Paths are absolute and machine-specific, so the manifest stores names only.
  await fsp.writeFile(
    manifestPath,
    JSON.stringify(
      { ...font, faces: font.faces.map(({ fileName, unicodeRange }) => ({ fileName, unicodeRange })) },
      null,
      2
    )
  );
  return font;
}
