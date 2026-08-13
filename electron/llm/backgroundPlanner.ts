// ---------------------------------------------------------------------------
// Choosing background clips automatically, from the script.
//
// Two stages, and keeping them apart is the whole design:
//
//   1. PLAN — the LLM reads the narration and returns a search query per
//      scene, plus one shared look that all of them must obey.
//   2. PICK — ordinary code searches the providers and chooses a clip per
//      query. No model is asked to choose between actual clips.
//
// The model never sees the search results, and that is deliberate. It cannot
// watch video, so asking it to pick between thumbnails would be asking it to
// guess; what it is genuinely good at is reading a sentence in Greek about
// what dogs shouldn't eat and producing the English phrase "dog looking at
// chocolate on table" that a stock library will actually match. Selection
// among the returned clips is a mechanical problem — duration, orientation,
// don't repeat yourself — and mechanical problems belong in code, where they
// are testable and free.
//
// COORDINATION between scenes comes from the shared look, which is appended to
// every query rather than left to the model to remember. Clips that were
// individually sensible but jointly incoherent — a sunny park next to a neon
// night kitchen — is the failure mode this exists to prevent.
// ---------------------------------------------------------------------------

import { request } from "../net/http";
import * as keyStore from "../keyStore";
import { searchVideos, type MediaHit } from "../net/mediaSearch";

const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const NVIDIA_MODEL = "z-ai/glm-5.2";

export interface PlannedScene {
  startMs: number;
  endMs: number;
  /** English search phrase, whatever the script's language. Stock libraries
   *  are indexed in English and a Greek query returns almost nothing. */
  query: string;
  /** Why this clip, in the model's words — shown in the UI so a bad pick is
   *  diagnosable rather than mysterious. */
  reason: string;
}

export interface BackgroundPlan {
  /** The shared visual directive every query inherits. */
  look: string;
  scenes: PlannedScene[];
}

export interface ChosenBackground extends PlannedScene {
  hit: MediaHit | null;
  /** Set when nothing usable came back for this query. */
  note?: string;
}

interface Segment {
  text: string;
  startMs: number;
  endMs: number;
  speakerLabel: string;
}

/** Post one request, waiting out a rate limit rather than failing on it.
 *
 *  Splitting a long script into batches made this necessary: one request per
 *  video never hit a limit, and four back to back did. A nine-minute lesson
 *  sends four, a batch of forty lessons sends a hundred and sixty, so this is
 *  the difference between unattended batch runs working and not.
 *
 *  Only 429 is retried. Every other failure — a bad key, a malformed body — is
 *  permanent, and retrying it just delays the message that says so. */
async function postJson(apiKey: string, payload: string): Promise<string> {
  const MAX_ATTEMPTS = 5;
  let waitMs = 8000;

  for (let attempt = 1; ; attempt++) {
    const res = await request("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: payload,
      // GLM-5.2 was measured at 274s on a real key for a single script draft.
      // Two minutes was never enough headroom for a reasoning model; batching
      // keeps each call small, and this stops a slow-but-working call from
      // reading as a network failure.
      timeoutMs: 300000,
    });

    if (res.status === 200) return res.body;

    if (res.status === 429 && attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, waitMs));
      waitMs *= 2;
      continue;
    }

    throw new Error(
      res.status === 429
        ? `NVIDIA rate limit held for ${MAX_ATTEMPTS} attempts. Try again in a few minutes.`
        : `NVIDIA returned HTTP ${res.status}: ${res.body.slice(0, 200)}`
    );
  }
}

/** Pull the first JSON object out of a reply.
 *
 *  GLM-5.2 is a reasoning model: it frequently wraps its answer in prose, a
 *  ```json fence, or both, and asking it not to does not reliably stop it.
 *  Scanning for the outermost braces is far more robust than trusting the
 *  model to obey a formatting instruction. */
function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("The model didn't return JSON.");
  return JSON.parse(candidate.slice(start, end + 1));
}

/**
 * Stage 1 — ask the model for a query per scene, plus one shared look.
 *
 * Scenes are derived from the narration's own timing rather than invented, so
 * a cut always lands on a line boundary and never mid-sentence.
 */
export async function planBackgrounds(opts: {
  segments: Segment[];
  languageName: string;
  /** Roughly how long one background should stay on screen. Lines are grouped
   *  up to this, so a fast exchange doesn't cut the picture every 1.5s. */
  minSceneMs?: number;
  topic?: string;
  /** Called once per batch. A nine-minute script takes several minutes to
   *  plan, and a caller with no way to say so looks hung. */
  onBatch?: (done: number, total: number) => void;
}): Promise<BackgroundPlan> {
  const apiKey = await keyStore.getKey("nvidia");
  if (!apiKey) throw new Error("No NVIDIA API key saved — add one in Backend Settings first.");
  if (opts.segments.length === 0) throw new Error("Generate narration first — there is no script to read.");

  // Group consecutive lines into scenes of at least minSceneMs. A cut per line
  // is exhausting to watch and burns through the search quota for no gain.
  const minMs = opts.minSceneMs ?? 6000;
  const groups: Segment[][] = [];
  let current: Segment[] = [];
  for (const seg of opts.segments) {
    current.push(seg);
    const span = current[current.length - 1].endMs - current[0].startMs;
    if (span >= minMs) {
      groups.push(current);
      current = [];
    }
  }
  if (current.length > 0) {
    // A short tail is merged backwards rather than left as its own flash of a
    // scene.
    if (groups.length > 0 && current[current.length - 1].endMs - current[0].startMs < minMs / 2) {
      groups[groups.length - 1].push(...current);
    } else {
      groups.push(current);
    }
  }

  const scenesForModel = groups.map((g, i) => ({
    index: i,
    text: g.map((s) => `${s.speakerLabel}: ${s.text}`).join(" "),
  }));

  // PLANNED IN BATCHES, and the reason is a measurement rather than caution.
  //
  // This was one request for the whole script, which is fine at sixty seconds
  // and breaks at nine minutes. An 8m47s lesson groups into roughly ninety
  // scenes; that request timed out, and had it returned it would have been
  // truncated anyway, since ninety query-plus-reason objects do not fit in the
  // 8192 tokens asked for. Both failures are silent in different ways — one
  // looks like a network problem, the other like a model that ignored half its
  // input.
  //
  // The batch size is small enough that any one call is comfortably inside both
  // limits, and the LOOK IS DECIDED ONCE, by the first batch, then handed to
  // every later one. That is what keeps ninety scenes coherent without asking a
  // model to hold ninety scenes in mind at once.
  const BATCH = 20;
  const batches: typeof scenesForModel[] = [];
  for (let i = 0; i < scenesForModel.length; i += BATCH) {
    batches.push(scenesForModel.slice(i, i + BATCH));
  }

  let look = "";
  const byIndex = new Map<number, { index: number; query: string; reason?: string }>();

  for (const [n, batch] of batches.entries()) {
    const first = n === 0;

    // Wait between batches rather than only reacting to a 429. Backing off
    // after being refused still costs the refused call's round trip, and the
    // free NVIDIA tier refuses quickly enough that four batches in a row hit
    // it every time. Three seconds is far cheaper than the retry it avoids.
    if (!first) await new Promise((r) => setTimeout(r, 3000));
    const systemPrompt = [
      "You choose stock-video search queries for a narrated video.",
      "Return ONLY a JSON object of the form:",
      first
        ? `{"look":"...","scenes":[{"index":0,"query":"...","reason":"..."}]}`
        : `{"scenes":[{"index":0,"query":"...","reason":"..."}]}`,
      "",
      first
        ? [
            "`look` is ONE short phrase describing a consistent visual treatment for",
            "the whole video — lighting, palette, setting. Every scene in the video",
            "will inherit it, including scenes you are not being shown, so keep it",
            "general enough to suit a whole lesson on this subject.",
          ].join("\n")
        : `The look has already been chosen for this video: "${look}". Every query you return must suit it. Do not return a look field.`,
      "",
      "`query` MUST be in ENGLISH regardless of the script's language, 2-5 words,",
      "and must describe something a stock footage library plausibly contains.",
      "Prefer concrete filmable subjects over abstractions: 'dog eating from bowl'",
      "not 'canine nutrition awareness'. Never name a brand or a person.",
      "",
      "`reason` is one short sentence, in English, saying why it fits that scene.",
      "Return exactly one entry per scene index given, in order, and use the",
      "index numbers exactly as given — they are not consecutive from zero.",
    ].join("\n");

    const userPrompt = [
      opts.topic ? `Overall topic: ${opts.topic}` : null,
      `Script language: ${opts.languageName}`,
      batches.length > 1 ? `This is part ${n + 1} of ${batches.length} of one video.` : null,
      `Scenes:`,
      ...batch.map((s) => `${s.index}: ${s.text}`),
    ].filter(Boolean).join("\n");

    const body = await postJson(
      apiKey,
      JSON.stringify({
        model: NVIDIA_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.4, // lower than the script writer: this is classification, not creativity
        max_tokens: 8192,
      })
    );

    const parsed = JSON.parse(body) as { choices?: { message?: { content?: string } }[] };
    const content = parsed.choices?.[0]?.message?.content ?? "";
    const obj = extractJson(content) as {
      look?: string;
      scenes?: { index: number; query: string; reason?: string }[];
    };

    if (first) look = (obj.look ?? "").trim();

    // TRUST THE ORDER, VERIFY THE NUMBER.
    //
    // Batch two is sent scenes 20-39 and asked to reuse those numbers. Models
    // renumber lists from zero anyway — it is one of the most reliable things
    // they do — and `byIndex.set(s.index, ...)` would then quietly overwrite
    // every query batch one produced, leaving scenes 20-39 to fall back to
    // their own Greek text, which stock libraries cannot match. The first third
    // of the video would get the wrong footage and the rest near-random, with
    // no error anywhere.
    //
    // So an index is used only if it belongs to this batch. Anything else is
    // taken as a renumbering and mapped back by position, which is the one
    // thing the model does reliably: it returns them in the order given.
    const lo = batch[0].index;
    const hi = batch[batch.length - 1].index;
    const returned = obj.scenes ?? [];
    returned.forEach((s, i) => {
      const inRange = typeof s.index === "number" && s.index >= lo && s.index <= hi;
      const target = inRange ? s.index : batch[i]?.index;
      if (target !== undefined) byIndex.set(target, { ...s, index: target });
    });

    opts.onBatch?.(n + 1, batches.length);
  }

  return {
    look,
    scenes: groups.map((g, i) => {
      const s = byIndex.get(i);
      return {
        startMs: g[0].startMs,
        endMs: g[g.length - 1].endMs,
        // A scene the model skipped still gets a background rather than a
        // hole: falling back to its own words is worse than a chosen query
        // but much better than nothing.
        query: (s?.query ?? g.map((x) => x.text).join(" ").slice(0, 40)).trim(),
        reason: s?.reason ?? "Fallback: the model returned no query for this scene.",
      };
    }),
  };
}

/**
 * Stage 2 — search for each planned scene and choose a clip.
 *
 * Entirely mechanical. Preference order:
 *   1. long enough to cover the scene without looping
 *   2. matching the output's orientation
 *   3. not already used elsewhere in this video
 */
export async function pickBackgrounds(
  plan: BackgroundPlan,
  opts: { portrait: boolean }
): Promise<ChosenBackground[]> {
  const used = new Set<string>();
  const out: ChosenBackground[] = [];

  for (const scene of plan.scenes) {
    // The shared look is appended here rather than baked into the query by the
    // model, so it is applied uniformly and can be changed without another
    // round trip.
    const query = plan.look ? `${scene.query} ${plan.look}` : scene.query;
    const { hits, notes } = await searchVideos(query, { perProvider: 12 });

    const needMs = scene.endMs - scene.startMs;
    const scored = hits
      .filter((h) => !used.has(h.id))
      .map((h) => {
        let score = 0;
        if (h.durationSec * 1000 >= needMs) score += 100;
        const isPortrait = h.height > h.width;
        if (isPortrait === opts.portrait) score += 50;
        // Mild preference for longer clips among those that already fit, so a
        // scene that grows slightly doesn't immediately need re-picking.
        score += Math.min(20, h.durationSec);
        return { h, score };
      })
      .sort((a, b) => b.score - a.score);

    const best = scored[0]?.h ?? null;
    if (best) used.add(best.id);
    out.push({
      ...scene,
      hit: best,
      note: best ? undefined : notes[0] ?? `Nothing found for "${query}".`,
    });
  }

  return out;
}
