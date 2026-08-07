// ---------------------------------------------------------------------------
// Background video search, across Pixabay and Pexels.
//
// Two providers rather than one because they have genuinely different
// libraries: searching "dog park" on both returns almost no overlap, and being
// stuck with one library's stock look is the thing that makes generated video
// recognisable as generated video.
//
// Both are queried with the SAME shape in and the same shape out, so the UI
// never learns which provider a clip came from except to credit it. Adding a
// third is one entry in PROVIDERS.
//
// LICENCE POSITION, stated here because it is the reason these two were picked
// over larger libraries: both are first-party licences covering commercial use
// with no attribution required and, critically, NO PER-PROJECT REGISTRATION.
// That last point is what rules out subscription stock for this app's purpose —
// hundreds of videos would mean hundreds of licence registrations to track.
//
// Runs in MAIN. It holds the API keys, and they must never reach the renderer.
// ---------------------------------------------------------------------------

import { request, downloadToFile } from "./http";
import * as keyStore from "../keyStore";

export type MediaProvider = "pixabay" | "pexels";

/** One result, normalised across providers. */
export interface MediaHit {
  /** Unique within a provider, not globally — prefixed on the way out. */
  id: string;
  provider: MediaProvider;
  /** Direct URL to a downloadable video file. */
  url: string;
  /** Still frame, for the picker grid. */
  thumbUrl: string;
  width: number;
  height: number;
  durationSec: number;
  /** Who made it, and where it lives. Kept even though neither provider
   *  requires attribution: crediting is cheap and being unable to credit
   *  later is not. */
  author: string;
  pageUrl: string;
}

export interface MediaSearchResult {
  hits: MediaHit[];
  /** Populated when a provider was skipped or failed. The search still
   *  succeeds on whatever else answered — one missing key must not produce an
   *  empty screen with no explanation. */
  notes: string[];
}

interface PixabayFile {
  url: string;
  width: number;
  height: number;
  thumbnail?: string;
}

/** Pixabay returns several renditions per clip; pick the largest that is still
 *  at or under 1080p. Their 4K files are large and this app renders at 1080 at
 *  most, so fetching 4K costs download time for pixels that get thrown away. */
function pickPixabayFile(videos: Record<string, PixabayFile>) {
  const order = ["large", "medium", "small", "tiny"];
  const under = order
    .map((k) => videos[k])
    .filter((v) => v && v.url && v.height <= 1080);
  return under[0] ?? videos.medium ?? videos.small ?? videos.tiny;
}

async function searchPixabay(query: string, perPage: number): Promise<MediaHit[]> {
  const key = await keyStore.getKey("pixabay");
  if (!key) throw new Error("no key");
  const url =
    `https://pixabay.com/api/videos/?key=${encodeURIComponent(key)}` +
    `&q=${encodeURIComponent(query)}&per_page=${perPage}&safesearch=true`;
  const res = await request(url);
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  const data = JSON.parse(res.body) as {
    hits: {
      id: number;
      duration: number;
      pageURL: string;
      user: string;
      picture_id?: string;
      videos: Record<string, PixabayFile>;
    }[];
  };
  return data.hits.flatMap((h) => {
    const file = pickPixabayFile(h.videos);
    if (!file?.url) return [];
    // Preference order, most to least trustworthy: the thumbnail the API
    // actually returned, then the CDN path derived from picture_id, then
    // nothing. Hard-coding a CDN URL pattern as the FIRST choice would be
    // guessing at someone else's infrastructure; using it only as a fallback
    // means a change there costs a missing thumbnail, not a broken picker.
    const thumb =
      file.thumbnail ??
      Object.values(h.videos).find((v) => v?.thumbnail)?.thumbnail ??
      (h.picture_id ? `https://i.vimeocdn.com/video/${h.picture_id}_295x166.jpg` : "");
    return [{
      id: `pixabay-${h.id}`,
      provider: "pixabay" as const,
      url: file.url,
      thumbUrl: thumb,
      width: file.width,
      height: file.height,
      durationSec: h.duration,
      author: h.user,
      pageUrl: h.pageURL,
    }];
  });
}

async function searchPexels(query: string, perPage: number): Promise<MediaHit[]> {
  const key = await keyStore.getKey("pexels");
  if (!key) throw new Error("no key");
  const url =
    `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}` +
    `&per_page=${perPage}`;
  const res = await request(url, { headers: { Authorization: key } });
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  const data = JSON.parse(res.body) as {
    videos: {
      id: number;
      duration: number;
      url: string;
      image: string;
      user: { name: string };
      video_files: { link: string; width: number | null; height: number | null; quality: string }[];
    }[];
  };
  return data.videos.flatMap((v) => {
    // Same reasoning as Pixabay: largest rendition at or below 1080p.
    const usable = v.video_files
      .filter((f) => f.link && (f.height ?? 0) <= 1080)
      .sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
    const file = usable[0] ?? v.video_files[0];
    if (!file?.link) return [];
    return [{
      id: `pexels-${v.id}`,
      provider: "pexels" as const,
      url: file.link,
      thumbUrl: v.image,
      width: file.width ?? 0,
      height: file.height ?? 0,
      durationSec: v.duration,
      author: v.user?.name ?? "Unknown",
      pageUrl: v.url,
    }];
  });
}

const PROVIDERS: Record<MediaProvider, (q: string, n: number) => Promise<MediaHit[]>> = {
  pixabay: searchPixabay,
  pexels: searchPexels,
};

/**
 * Search every provider that has a key, in parallel, and interleave the
 * results.
 *
 * Interleaved rather than concatenated on purpose: appending one provider
 * after the other means the first screen of results is entirely one library,
 * which defeats the point of having two.
 */
export async function searchVideos(
  query: string,
  opts: { perProvider?: number; providers?: MediaProvider[] } = {}
): Promise<MediaSearchResult> {
  const wanted = opts.providers ?? (Object.keys(PROVIDERS) as MediaProvider[]);
  const perPage = opts.perProvider ?? 20;
  const notes: string[] = [];

  const settled = await Promise.all(
    wanted.map(async (p) => {
      try {
        return { p, hits: await PROVIDERS[p](query, perPage) };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        notes.push(
          msg === "no key"
            ? `${p}: no API key saved — add one in Backend Settings.`
            : `${p}: ${msg}`
        );
        return { p, hits: [] as MediaHit[] };
      }
    })
  );

  const lists = settled.map((s) => s.hits);
  const hits: MediaHit[] = [];
  for (let i = 0; i < Math.max(...lists.map((l) => l.length), 0); i++) {
    for (const l of lists) if (l[i]) hits.push(l[i]);
  }

  return { hits, notes };
}

/**
 * Fetch a clip to disk and return where it landed.
 *
 * Downloads happen in MAIN, not the renderer: the file has to end up on the
 * filesystem for the render to copy it into the bundle, and the renderer has
 * no filesystem. Redirects are followed by hand because both providers serve
 * their media from a CDN behind one.
 */
export async function downloadTo(url: string, destPath: string): Promise<void> {
  // Redirect hopping used to be hand-rolled here because both providers serve
  // media from a CDN behind one. Chromium follows redirects itself, so that
  // whole loop — and its 5-hop limit — is now the network stack's problem.
  await downloadToFile(url, destPath, { timeoutMs: 120000 });
}
