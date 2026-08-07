// ---------------------------------------------------------------------------
// Sound effects from Freesound, filtered to CC0 and nothing else.
//
// THE FILTER IS THE FEATURE. Freesound is a mix of CC0, CC-BY and CC-BY-NC.
// CC-BY needs per-sound attribution the app has nowhere to put; CC-BY-NC is
// unusable for client work outright. So the query hard-codes
// `license:"Creative Commons 0"` and there is no way to switch it off — the
// same reasoning that picked Pixabay and Pexels over the larger video
// libraries. A dropdown here would be an invitation to ship a licence problem.
//
// WHAT IS DOWNLOADED is the preview mp3, not the original. Freesound's original
// files need an OAuth2 round trip with a user login, while previews need only
// the API token — and a CC0 work's preview is CC0 too. For barks and whistles
// under narration, a 128kbps preview is not the limiting factor.
//
// Runs in MAIN: it holds the key.
// ---------------------------------------------------------------------------

import https from "node:https";
import * as keyStore from "../keyStore";

export interface SoundHit {
  id: string;
  name: string;
  /** Direct URL to a downloadable mp3 preview. */
  url: string;
  durationSec: number;
  author: string;
  pageUrl: string;
  license: string;
}

export interface SoundSearchResult {
  hits: SoundHit[];
  /** A missing key is a note, not a failure — same rule as the video search. */
  notes: string[];
}

function request(url: string): Promise<{ status: number; body: string }> {
  const u = new URL(url);
  return new Promise((resolve, reject) => {
    const req = https.request(
      { host: u.host, path: `${u.pathname}${u.search}`, method: "GET", timeout: 20000 },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf-8") })
        );
      }
    );
    req.on("timeout", () => req.destroy(new Error("Timed out")));
    req.on("error", reject);
    req.end();
  });
}

interface FreesoundResult {
  id: number;
  name: string;
  duration: number;
  username: string;
  url: string;
  license: string;
  previews?: Record<string, string>;
}

export async function searchSounds(query: string): Promise<SoundSearchResult> {
  const key = await keyStore.getKey("freesound");
  if (!key) {
    return {
      hits: [],
      notes: ["freesound: no API key saved — add one in Backend Settings."],
    };
  }

  const url =
    `https://freesound.org/apiv2/search/text/?query=${encodeURIComponent(query)}` +
    `&filter=${encodeURIComponent('license:"Creative Commons 0"')}` +
    `&fields=${encodeURIComponent("id,name,duration,username,url,license,previews")}` +
    `&page_size=30&token=${encodeURIComponent(key)}`;

  const res = await request(url);
  if (res.status !== 200) {
    return { hits: [], notes: [`freesound: HTTP ${res.status}`] };
  }

  const data = JSON.parse(res.body) as { results?: FreesoundResult[] };
  const hits: SoundHit[] = [];
  for (const r of data.results ?? []) {
    const preview =
      r.previews?.["preview-hq-mp3"] ?? r.previews?.["preview-lq-mp3"] ?? null;
    if (!preview) continue;
    // Belt and braces: the filter above is server-side, and this is the check
    // that a change in their query syntax turns into "no results" rather than
    // into a CC-BY sound quietly appearing in a client's video.
    if (!/creative commons 0|publicdomain\/zero/i.test(r.license)) continue;
    hits.push({
      id: `freesound-${r.id}`,
      name: r.name,
      url: preview,
      durationSec: Math.round(r.duration * 10) / 10,
      author: r.username,
      pageUrl: r.url,
      license: r.license,
    });
  }

  return {
    hits,
    notes: hits.length === 0 ? ["freesound: nothing CC0 came back for that."] : [],
  };
}
