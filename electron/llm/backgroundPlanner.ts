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

async function postJson(apiKey: string, payload: string): Promise<string> {
  const res = await request("https://integrate.api.nvidia.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: payload,
    timeoutMs: 120000,
  });
  if (res.status !== 200) {
    throw new Error(`NVIDIA returned HTTP ${res.status}: ${res.body.slice(0, 200)}`);
  }
  return res.body;
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

  const systemPrompt = [
    "You choose stock-video search queries for a narrated short video.",
    "Return ONLY a JSON object of the form:",
    `{"look":"...","scenes":[{"index":0,"query":"...","reason":"..."}]}`,
    "",
    "`look` is ONE short phrase describing a consistent visual treatment for the",
    "whole video — lighting, palette, setting. Every scene will inherit it, so it",
    "must suit all of them.",
    "",
    "`query` MUST be in ENGLISH regardless of the script's language, 2-5 words,",
    "and must describe something a stock footage library plausibly contains.",
    "Prefer concrete filmable subjects over abstractions: 'dog eating from bowl'",
    "not 'canine nutrition awareness'. Never name a brand or a person.",
    "",
    "`reason` is one short sentence, in English, saying why it fits that scene.",
    "Return exactly one entry per scene index given, in order.",
  ].join("\n");

  const userPrompt = [
    opts.topic ? `Overall topic: ${opts.topic}` : null,
    `Script language: ${opts.languageName}`,
    `Scenes:`,
    ...scenesForModel.map((s) => `${s.index}: ${s.text}`),
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
  const obj = extractJson(content) as { look?: string; scenes?: { index: number; query: string; reason?: string }[] };

  const look = (obj.look ?? "").trim();
  const byIndex = new Map((obj.scenes ?? []).map((s) => [s.index, s]));

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
