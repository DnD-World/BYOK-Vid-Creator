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

import { request } from "./http";
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

  // A connection that never completes must read the same way a missing key
  // does — as a note on the panel — rather than escaping as an unhandled
  // rejection. Left to propagate it reached the user as "Error invoking remote
  // method 'sound:search'", which names an internal channel and says nothing
  // about what to do next.
  let res;
  try {
    res = await request(url);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { hits: [], notes: [`freesound: couldn't reach them — ${msg}`] };
  }

  if (res.status !== 200) {
    // A bare status number is useless to the person who has to fix it, and the
    // overwhelmingly likely cause here is a specific, easy mistake: Freesound's
    // API credentials page issues BOTH a "Client id" and a "Client secret/Api
    // key", and only the second one works as a token. They sit next to each
    // other, the shorter one is listed first, and pasting it produces a 401
    // that says nothing about which of the two strings was wrong.
    //
    // The OAuth2 flow (the "permission granted" page on freesound.org) is a
    // different mechanism again, needed only to download ORIGINAL files. This
    // app downloads previews, which token auth covers — so being sent to an
    // OAuth page is itself a sign of having gone down the wrong path.
    const note =
      res.status === 401 || res.status === 403
        ? 'freesound: the key was rejected. Freesound gives you two strings — use the ' +
          '"Client secret/Api key", not the "Client id". No OAuth login is needed for search.'
        : res.status === 429
          ? "freesound: too many requests just now — wait a minute and try again."
          : `freesound: HTTP ${res.status}`;
    return { hits: [], notes: [note] };
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
