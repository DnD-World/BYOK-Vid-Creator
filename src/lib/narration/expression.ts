// ---------------------------------------------------------------------------
// The app putting expression into a prompt the writer did not.
//
// THE RULE THIS BENDS, AND WHY. The script IS the prompt, passed through
// untouched, so that what was proofread is what is spoken. That rule exists
// because a silent rewrite means the script stops describing the video.
//
// So nothing here happens invisibly. Every change is returned alongside the
// prompt as a sentence in plain English, printed when blocks are built and
// shown in the app before anything is generated. A rewrite you can read is a
// different thing from a rewrite you cannot.
//
// Each fix below exists because the engine's own guide names it as a way
// generations go flat:
//
//   - A bare "speaks," is a direction that directs nothing.
//   - A direction alone does not make a NOISE. "She laughs," with no "Hahaha"
//     inside the quotes produces a line delivered lightly and no laughter.
//   - One long span is one flat read; the guide's two-span beat — calm setup,
//     then the turn — fires emotion far more reliably.
// ---------------------------------------------------------------------------

export interface ExpressionOptions {
  /** Replace a bare "speaks" with this character's own default verb. */
  liftFlatLines?: boolean;
  /** The verb to lift a flat line to. Per character — Τσίκα is not Σερίφης. */
  defaultVerb?: string;
  /** Add the phonetic trigger a noise direction needs to actually make a
   *  noise: "She laughs," gains "Hahaha!" at the front of its speech. */
  spellNoises?: boolean;
}

export interface ExpressionChange {
  /** Said the way it would be said out loud, for a log or a panel. */
  what: string;
  before: string;
  after: string;
}

export interface ExpressionResult {
  prompt: string;
  changes: ExpressionChange[];
}

/** Directions that promise a noise, and the spelling that delivers one.
 *
 *  From the prompting guide's validated table. The key is matched inside the
 *  direction, so "bursts into uncontrollable laughter" and "laughs softly" both
 *  find `laugh`. Order matters: the most specific pattern is tested first. */
const NOISE_FOR: { name: string; pattern: RegExp; phonetic: string }[] = [
  { name: "giggle", pattern: /giggl/i, phonetic: "Hehehe," },
  // Fires on the direction alone — there is nothing to spell.
  { name: "chuckle", pattern: /chuckl/i, phonetic: "" },
  { name: "laugh", pattern: /laugh/i, phonetic: "Hahaha!" },
  { name: "hum", pattern: /hums?\b|humming/i, phonetic: "Mmmm-mmm," },
  { name: "cheer", pattern: /cheers?\b|cheering/i, phonetic: "Woooo!" },
  { name: "yawn", pattern: /yawn/i, phonetic: "Ugh," },
];

/** Anything already at the front of the speech that IS the noise. */
const ALREADY_SPELLED =
  /^\s*["«]?\s*(hahaha|haha|hehehe|hehe|mmmm?-?mmm?|woo+|ugh|ahh+|argh|hmm)/i;

const FLAT_VERB = /^(speaks|says)$/i;

/**
 * Walk a prompt span by span, fixing what the guide says goes flat.
 *
 * A prompt is `<subject> <verb>, "<speech>"` repeated. The direction is
 * everything between one closing quote and the next opening one, which is
 * exactly what the parser already relies on, so nothing new has to be
 * understood to read this.
 */
export function applyExpression(
  prompt: string,
  opts: ExpressionOptions
): ExpressionResult {
  const changes: ExpressionChange[] = [];
  const spans = [...prompt.matchAll(/"([^"]*)"/g)];
  if (spans.length === 0) return { prompt, changes };

  let out = "";
  let cursor = 0;

  for (const span of spans) {
    const at = span.index ?? 0;
    let direction = prompt.slice(cursor, at);
    let speech = span[1];
    cursor = at + span[0].length;

    // --- a direction that directs nothing ---------------------------------
    if (opts.liftFlatLines && opts.defaultVerb) {
      const m = direction.match(/(\b(?:speaks|says)\b)(\s*,\s*)$/i);
      if (m && FLAT_VERB.test(m[1])) {
        const before = direction.trim();
        direction = direction.slice(0, m.index) + opts.defaultVerb + m[2];
        changes.push({
          what: `A flat "${m[1]}" became "${opts.defaultVerb}"`,
          before,
          after: direction.trim(),
        });
      }
    }

    // --- a noise promised but never spelled --------------------------------
    if (opts.spellNoises) {
      for (const noise of NOISE_FOR) {
        if (!noise.pattern.test(direction)) continue;
        if (!noise.phonetic) break; // fires on the direction alone
        if (ALREADY_SPELLED.test(speech)) break;
        const before = speech;
        speech = `${noise.phonetic} ${speech.trimStart()}`;
        changes.push({
          what: `"${noise.phonetic}" added so the ${noise.name} is actually heard`,
          before,
          after: speech,
        });
        break;
      }
    }

    out += direction + `"${speech}"`;
  }

  // NOTHING AFTER THE LAST CLOSING QUOTE. Trailing text is read aloud, so the
  // tail of the original is deliberately dropped rather than carried over.
  return { prompt: out, changes };
}

/** Would this prompt be changed? Used to show a mark beside a line in the app
 *  without doing the work twice. */
export function wouldChange(prompt: string, opts: ExpressionOptions): boolean {
  return applyExpression(prompt, opts).changes.length > 0;
}
