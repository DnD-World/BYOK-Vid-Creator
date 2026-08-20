// ---------------------------------------------------------------------------
// Reading a script that IS the engine's prompt.
//
// The script used to be `Name: text` and the app turned it into DramaBox's
// format. That step is gone, deliberately: if a script is proofread in one
// format and spoken in another, the proofreading did not cover what was
// spoken — and every conversion is somewhere a silent mistake can live.
//
// So a script now looks exactly like what DramaBox receives:
//
//     A bright woman sighs heavily, "Ουφ, δεν την καταλαβαίνω." She speaks
//     with frustration, "Γυρίζω σπίτι και βρίσκω το παπούτσι μασημένο."
//
//     [SFX: shoe-dropping]
//
//     A grave man speaks evenly, "Λάθος. Αυτή είναι η πρώτη παγίδα."
//
// A block is one character's turn and one generation. WHO is speaking comes
// from the opening phrase — "A grave man" is Σερίφης — because that phrase is
// already in the text for the engine's benefit, so using it for ours costs
// nothing and adds no syntax a person has to remember.
//
// WHAT THE REST OF THE APP NEEDS OUT OF THIS is unchanged: one segment per
// piece of speech, so subtitles, visemes and the active-speaker gate keep
// working exactly as they did. A block with three quoted spans is three
// segments that happen to share a generation.
// ---------------------------------------------------------------------------

import type { ScriptSegment, SoundCue } from "./parseScript";

export interface DramaboxSpeaker {
  id: string;
  label: string;
  /** "A grave man". Matched case-insensitively at the start of a block. */
  openingPhrase: string;
}

export interface ParsedDramaboxScript {
  segments: ScriptSegment[];
  cues: SoundCue[];
  /** Blocks that matched no character. Never silently dropped. */
  unmatchedLines: string[];
  /** One entry per block, in order — the exact string to send for it, and any
   *  engine settings a `[VOICE: …]` line asked for just above it. */
  blocks: {
    speakerId: string;
    prompt: string;
    segmentIndices: number[];
    params?: Record<string, number | boolean>;
  }[];
  /** `[VOICE: …]` settings that were not understood. Never applied silently. */
  badVoiceLines: string[];
}

const CUE_LINE = /^\[\s*(?:SFX|ΗΧΟΣ)\s*:\s*([^\]]+?)\s*\]$/iu;

/** A settings line for the NEXT block only:
 *
 *      [VOICE: acting=2.2 pace=0.9]
 *
 *  Same bracket family as [SFX:] on purpose — one thing to remember, and it
 *  already reads as "not speech". The short names are the ones a person would
 *  use out loud; the full engine names work too. */
const VOICE_LINE = /^\[\s*(?:VOICE|ΦΩΝΗ)\s*:\s*([^\]]+?)\s*\]$/iu;

const VOICE_ALIASES: Record<string, string> = {
  acting: "stgScale",
  stg: "stgScale",
  pace: "durationMultiplier",
  speed: "durationMultiplier",
  obedience: "cfgScale",
  cfg: "cfgScale",
  seed: "seed",
  steps: "steps",
  length: "genDuration",
  // The rest of the engine's settings. Rarely worth changing for one block,
  // but leaving them out meant a block could not be given what a character
  // could, which is an arbitrary line to draw.
  sample: "refDuration",
  denoise: "denoiseRef",
  watermark: "watermark",
  rescale: "rescaleScale",
  chunk: "targetChunkDuration",
  chunkmax: "maxChunkDuration",
  crossfade: "crossfadeMs",
};

/** Settings written as words rather than numbers — `denoise=off`. */
const VOICE_BOOLEANS: Record<string, boolean> = {
  on: true, off: false, yes: true, no: false, true: true, false: false,
};

/**
 * Parse a DramaBox-format script.
 *
 * Blocks are separated by blank lines. Everything inside double quotes is
 * speech; everything outside is direction and is never spoken.
 */
export function parseDramaboxScript(
  script: string,
  speakers: DramaboxSpeaker[]
): ParsedDramaboxScript {
  const segments: ScriptSegment[] = [];
  const cues: SoundCue[] = [];
  const unmatchedLines: string[] = [];
  const blocks: ParsedDramaboxScript["blocks"] = [];
  const badVoiceLines: string[] = [];
  /** Set by a `[VOICE: …]` line, spent by the next block. */
  let pendingParams: Record<string, number | boolean> = {};

  // Longest phrase first, so "A bright young woman" is preferred over
  // "A bright woman" if both were ever configured.
  const byPhrase = [...speakers].sort(
    (a, b) => b.openingPhrase.length - a.openingPhrase.length
  );

  /** `acting=2.2 pace=0.9`, or with colons, or comma separated — all the ways
   *  someone might reasonably type it. Anything unreadable is reported rather
   *  than dropped, because a setting that silently does nothing is worse than
   *  one that never existed. */
  function readVoiceLine(body: string): void {
    for (const pair of body.split(/[\s,]+/).filter(Boolean)) {
      const m = pair.match(/^([\p{L}]+)\s*[=:]\s*(-?\d+(?:\.\d+)?|[\p{L}]+)$/u);
      const key = m && VOICE_ALIASES[m[1].toLowerCase()];
      if (!key) {
        badVoiceLines.push(pair);
        continue;
      }
      const raw = m![2];
      const asBool = VOICE_BOOLEANS[raw.toLowerCase()];
      if (asBool !== undefined) pendingParams[key] = asBool;
      else if (/^-?\d/.test(raw)) pendingParams[key] = Number(raw);
      else badVoiceLines.push(pair);
    }
  }

  const rawBlocks = script.split(/\n\s*\n/);

  for (const raw of rawBlocks) {
    let block = raw.trim();
    if (!block) continue;

    // A BRACKET LINE STUCK TO THE TOP OF A BLOCK IS STILL A BRACKET LINE.
    // Writers put `[VOICE: …]` or `[SFX: …]` directly above the speech with no
    // blank line between, which is the natural way to write it and how the
    // first real script came back. Requiring the blank line meant the whole
    // block matched no character and was thrown away — a lesson silently short
    // one turn. So leading bracket lines are peeled off here instead.
    const lines = block.split("\n");
    let peeled = 0;
    while (peeled < lines.length) {
      const line = lines[peeled].trim();
      const c = line.match(CUE_LINE);
      const v = line.match(VOICE_LINE);
      if (c) cues.push({ name: c[1], beforeSegment: segments.length });
      else if (v) readVoiceLine(v[1]);
      else break;
      peeled++;
    }
    if (peeled > 0) {
      block = lines.slice(peeled).join("\n").trim();
      // Bracket lines and nothing else — a cue or a setting standing alone.
      if (!block) continue;
    }

    const cue = block.match(CUE_LINE);
    if (cue) {
      cues.push({ name: cue[1], beforeSegment: segments.length });
      continue;
    }

    const voice = block.match(VOICE_LINE);
    if (voice) {
      readVoiceLine(voice[1]);
      continue;
    }

    const flat = block.replace(/\s+/g, " ").trim();
    const speaker = byPhrase.find((s) =>
      flat.toLowerCase().startsWith(s.openingPhrase.trim().toLowerCase())
    );
    if (!speaker) {
      unmatchedLines.push(block);
      continue;
    }

    // Every quoted span, in order. The text between them is direction and is
    // kept on the segment for the engine, never spoken.
    const spans = [...flat.matchAll(/"([^"]*)"/g)];
    if (spans.length === 0) {
      unmatchedLines.push(block);
      continue;
    }

    const indices: number[] = [];
    let cursor = 0;
    for (const span of spans) {
      const at = span.index ?? 0;
      const direction = flat.slice(cursor, at).replace(/,\s*$/, "").trim();
      const text = span[1].trim();
      cursor = at + span[0].length;
      if (!text) continue;
      indices.push(segments.length);
      segments.push({
        speakerId: speaker.id,
        speakerLabel: speaker.label,
        text,
        direction: direction || undefined,
      });
    }

    if (indices.length === 0) {
      unmatchedLines.push(block);
      continue;
    }

    // The block as written IS the prompt — no rebuilding, so what was
    // proofread is what gets sent. Trailing text after the final closing quote
    // is dropped here rather than read aloud, and reported by checkScript so it
    // is fixed in the script rather than papered over.
    const lastQuoteEnd = flat.lastIndexOf('"') + 1;
    blocks.push({
      speakerId: speaker.id,
      prompt: flat.slice(0, lastQuoteEnd),
      segmentIndices: indices,
      params: Object.keys(pendingParams).length ? pendingParams : undefined,
    });
    pendingParams = {};
  }

  return { segments, cues, unmatchedLines, blocks, badVoiceLines };
}
