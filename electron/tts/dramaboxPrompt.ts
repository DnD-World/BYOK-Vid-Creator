// ---------------------------------------------------------------------------
// Our script format -> the prompt DramaBox actually reads.
//
// THIS IS THE STEP THAT WAS MISSING. docs/SCRIPT-GEM.md tells the Gem to write
//
//     Kaiti [laughs]: Χαχαχα! Ναι, το έκανε πάλι.
//
// and the square brackets are nowhere in DramaBox's own prompting guide,
// because they are not meant to be: the bracket is OUR carrier for a direction,
// and this file turns it into the guide's shape. Until this existed the
// instruction file was describing a translation nobody had written, and
// `direction` was parsed out of every line and then read by nothing.
//
// The shape, from docs/dramabox-PROMPTING_GUIDE.md:
//
//     A <speaker> <verb>, "<dialogue>" <pronoun> <verb>, "<dialogue>"
//
// Rules taken from that guide and enforced here rather than hoped for:
//
//   - The speaker is a GENERIC NOUN with at most one adjective. Roles and jobs
//     are spoken aloud, so "a teacher" is a bug, not a description.
//   - Quoted text is spoken literally. Everything outside quotes is direction.
//   - Continuation uses the speaker's pronoun, not the noun again.
//   - END AT THE LAST CLOSING QUOTE. Trailing text is ignored or read out, so
//     nothing may be appended after it — not punctuation, not a summary.
//   - One speaker per prompt. A turn change ends the prompt.
// ---------------------------------------------------------------------------

import type { ScriptSegment } from "../../src/lib/narration/parseScript";

/** How one character is introduced to the engine.
 *
 *  Deliberately not derived from the character briefs in
 *  docs/CHARACTER-VOICES.md: those are paragraphs, and a paragraph is the one
 *  thing the guide names as a mistake. The brief says who someone is for the
 *  WRITER; this says who they are for the ENGINE, and they are different jobs. */
export interface PromptVoice {
  /** "A young woman", "A weary man". One adjective at most, never a role. */
  noun: string;
  /** Used for every line after the first in a run. */
  pronoun: "he" | "she" | "they";
}

export interface DramaboxPrompt {
  speakerId: string;
  /** The exact string handed to the engine. */
  prompt: string;
  /** Which script lines went into it, for mapping audio back to lines later. */
  segmentIndices: number[];
}

/** Verbs that read correctly after "A young woman …" without further help. */
const DEFAULT_VERB = "speaks";

/**
 * Group a parsed script into one prompt per speaker run.
 *
 * A run ends when the speaker changes, because the model does one speaker at a
 * time. Within a run every line contributes `<pronoun> <verb>, "<text>"`, which
 * is exactly the multi-segment beat the guide says fires emotion more reliably
 * than a single expressive verb.
 */
export function buildDramaboxPrompts(
  segments: ScriptSegment[],
  voices: Record<string, PromptVoice>
): DramaboxPrompt[] {
  const out: DramaboxPrompt[] = [];
  let i = 0;

  while (i < segments.length) {
    const speakerId = segments[i].speakerId;
    const voice = voices[speakerId];
    if (!voice) {
      throw new Error(
        `No prompt voice for speaker "${segments[i].speakerLabel}". ` +
          `Every speaker needs a noun and a pronoun before DramaBox can be asked for a line.`
      );
    }

    const run: ScriptSegment[] = [];
    const indices: number[] = [];
    while (i < segments.length && segments[i].speakerId === speakerId) {
      run.push(segments[i]);
      indices.push(i);
      i++;
    }

    const parts: string[] = [];
    run.forEach((seg, n) => {
      const verb = (seg.direction ?? DEFAULT_VERB).trim();
      // The noun introduces the speaker once; after that the pronoun carries
      // them. Repeating the noun reads as a new character arriving.
      const subject = n === 0 ? voice.noun : capitalise(voice.pronoun);
      parts.push(`${subject} ${verb}, ${quote(seg.text)}`);
    });

    // Joined with a space and NOTHING after the final quote.
    out.push({ speakerId, prompt: parts.join(" "), segmentIndices: indices });
  }

  return out;
}

/** Straight double quotes, and none inside to close the span early.
 *
 *  A curly quote in the Greek would not close the span the model is reading, so
 *  any quote character in the text is turned into a guillemet — which is what
 *  Greek uses for quotation anyway. */
function quote(text: string): string {
  const clean = text.replace(/"/g, "»").trim();
  return `"${clean}"`;
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
