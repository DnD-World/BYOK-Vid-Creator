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
  /** One entry per block, in order — the exact string to send for it. */
  blocks: { speakerId: string; prompt: string; segmentIndices: number[] }[];
}

const CUE_LINE = /^\[\s*(?:SFX|ΗΧΟΣ)\s*:\s*([^\]]+?)\s*\]$/iu;

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

  // Longest phrase first, so "A bright young woman" is preferred over
  // "A bright woman" if both were ever configured.
  const byPhrase = [...speakers].sort(
    (a, b) => b.openingPhrase.length - a.openingPhrase.length
  );

  const rawBlocks = script.split(/\n\s*\n/);

  for (const raw of rawBlocks) {
    const block = raw.trim();
    if (!block) continue;

    const cue = block.match(CUE_LINE);
    if (cue) {
      cues.push({ name: cue[1], beforeSegment: segments.length });
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
    });
  }

  return { segments, cues, unmatchedLines, blocks };
}
