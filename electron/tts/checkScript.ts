// ---------------------------------------------------------------------------
// Does this script produce a prompt the engine can actually use?
//
// WHY THE APP HAS TO DO THIS AND NOT A PERSON. Every rule below comes from
// docs/dramabox-PROMPTING_GUIDE.md, and every one of them fails QUIETLY: a job
// noun in a direction is read aloud in the finished video, a direction that
// names its own subject produces "He his voice sharpens", and a stray double
// quote closes the spoken span early so the rest of the line becomes stage
// direction and is never said. None of that throws. All of it ships.
//
// Checked before a single second of GPU time is spent, because the cheapest
// moment to find a broken line is before narration, not after a render.
// ---------------------------------------------------------------------------

export interface ScriptProblem {
  /** 1-based, so it matches what a text editor shows. */
  line: number;
  text: string;
  problem: string;
  fix: string;
}

/** Words that name a job or a role. The guide is explicit that the model speaks
 *  these rather than acting on them, and lists several by name. */
const ROLE_WORDS = [
  "teacher", "trainer", "host", "narrator", "presenter", "announcer",
  "instructor", "coach", "vet", "veterinarian", "doctor", "nurse",
  "detective", "spy", "sergeant", "reporter", "guide", "expert",
];

/** A direction that opens with one of these is describing a THING the speaker
 *  has rather than something the speaker does, so it cannot follow "She". */
const SUBJECT_START = /^(his|her|their|the)\s/i;

/** Greek words that NAME a noise. Written in the speech they are simply read
 *  out — the guide warns about the English equivalents, and there is no reason
 *  Greek would behave differently. */
const NAMED_NOISE = ["γελάει", "γέλιο", "αναστεναγμός", "αναστενάζει", "βήχας", "γαβγίζει"];

/**
 * Check a script against everything the engine's prompting guide requires.
 *
 * Works on the RAW TEXT rather than on parsed segments, so every problem can be
 * reported with the line number an editor would show. A person fixing a script
 * needs to find the line, not be told that one of a hundred and sixty is wrong.
 */
export function checkScript(script: string, knownNames: string[]): ScriptProblem[] {
  const problems: ScriptProblem[] = [];
  const names = new Set(knownNames.map((n) => n.trim().toLowerCase()));
  const lines = script.split("\n");

  let lastSpeechLine = 0;

  lines.forEach((raw, i) => {
    const line = raw.trim();
    const n = i + 1;
    if (!line) return;

    if (/^\[\s*(?:SFX|ΗΧΟΣ)\s*:/iu.test(line)) return; // cues checked elsewhere

    const colon = line.indexOf(":");
    if (colon === -1) {
      problems.push({
        line: n, text: line,
        problem: "No colon, so this is not a line of speech.",
        fix: "Write it as `Name: text`, or delete it.",
      });
      return;
    }

    const head = line.slice(0, colon).trim();
    const text = line.slice(colon + 1).trim();
    const bracket = head.match(/^(.*?)\s*\[([^\]]*)\]\s*$/);
    const name = (bracket ? bracket[1] : head).trim();
    const direction = bracket?.[2].trim() ?? "";

    if (!names.has(name.toLowerCase())) {
      problems.push({
        line: n, text: line,
        problem: `"${name}" is not one of the cast, so this line would be dropped in silence.`,
        fix: `Use one of: ${knownNames.join(", ")}`,
      });
      return;
    }

    if (!text) {
      problems.push({
        line: n, text: line,
        problem: "Nothing after the colon, so there is nothing to say.",
        fix: "Add the spoken Greek, or delete the line.",
      });
      return;
    }
    lastSpeechLine = n;

    // --- the direction ---------------------------------------------------
    if (direction) {
      if (SUBJECT_START.test(direction)) {
        problems.push({
          line: n, text: line,
          problem:
            `The direction "${direction}" names its own subject, so it comes out as ` +
            `"She ${direction}, …" which is not a sentence.`,
          fix: 'Start with a verb — "sharpens suddenly", not "his voice sharpens".',
        });
      }
      const role = ROLE_WORDS.find((w) => new RegExp(`\\b${w}\\b`, "i").test(direction));
      if (role) {
        problems.push({
          line: n, text: line,
          problem: `The direction mentions "${role}", and a job word is SPOKEN ALOUD in the video.`,
          fix: "Describe the action instead of the person.",
        });
      }
      if (/^\w+ly\b/.test(direction) && !/\s/.test(direction)) {
        problems.push({
          line: n, text: line,
          problem: `"${direction}" is an adverb, and it is joined to the speech as a sentence.`,
          fix: 'Use a verb — "drops to a whisper", not "quietly".',
        });
      }
      if (/^\w+ing\b/.test(direction)) {
        problems.push({
          line: n, text: line,
          problem: `"${direction}" starts with an -ing form, which does not follow "She".`,
          fix: 'Use the present tense — "laughs", not "laughing".',
        });
      }
    }

    // --- the speech ------------------------------------------------------
    if (text.includes('"')) {
      problems.push({
        line: n, text: line,
        problem:
          "A double quote in the speech closes the spoken part early — everything " +
          "after it is treated as direction and never said.",
        fix: "Use Greek quotation marks « » instead.",
      });
    }
    const noise = NAMED_NOISE.find((w) => new RegExp(w, "i").test(text));
    if (noise) {
      problems.push({
        line: n, text: line,
        problem: `"${noise}" NAMES a sound, so the word itself is read out.`,
        fix: "Spell the sound (Χαχαχα), or move it into the direction.",
      });
    }
  });

  // The guide is explicit: anything after the final closing quote is ignored or
  // read aloud. A script that ends on a sound cue ends on trailing text.
  const lastMeaningful = lines
    .map((l, i) => ({ l: l.trim(), n: i + 1 }))
    .filter((x) => x.l)
    .pop();
  if (lastMeaningful && lastMeaningful.n !== lastSpeechLine) {
    problems.push({
      line: lastMeaningful.n, text: lastMeaningful.l,
      problem: "The script does not end on a spoken line.",
      fix: "Move this above the last line of speech.",
    });
  }

  return problems;
}
