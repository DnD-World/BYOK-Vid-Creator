// ---------------------------------------------------------------------------
// Proofreading a script before anything is spent on it.
//
// The script is now the engine's prompt word for word, which removes a whole
// class of conversion bug and creates a new duty: whatever is wrong in the
// script is wrong in the video, with nothing in between to catch it. Ak writes
// these with a language model, reads them, and cannot be expected to spot a
// stray quote mark in 750 words of Greek. So the app reads them too.
//
// Every rule here is from docs/dramabox-PROMPTING_GUIDE.md, and every one of
// them fails QUIETLY: a job word gets spoken aloud, an unclosed quote swallows
// the rest of a block, trailing text after the last quote is read out. None of
// it throws. All of it ships.
// ---------------------------------------------------------------------------

export interface ScriptProblem {
  /** 1-based line number, as an editor shows it. */
  line: number;
  text: string;
  problem: string;
  fix: string;
}

/** Job words. The guide is explicit that these are spoken rather than acted. */
const ROLE_WORDS = [
  "teacher", "trainer", "host", "narrator", "presenter", "announcer",
  "instructor", "coach", "vet", "veterinarian", "doctor", "nurse",
  "detective", "reporter", "expert",
];

/** Naming a noise instead of making it. Read out as words, in either language. */
const NAMED_NOISE_GREEK = ["γελάει", "αναστεναγμός", "αναστενάζει", "βήχας"];
const NAMED_NOISE_ENGLISH = ["sigh", "gasp", "cough", "chuckle"];
// Latin laugh spellings are REQUIRED inside Greek speech — Greek ones make no
// sound at all, proved on lesson 101.1 — so they must never be flagged.
const ALLOWED_PHONETIC = /^(hahaha|hehehe|haha|hehe|mmmm|ahhh|ugh|woooo)$/i;

const CUE_LINE = /^\[\s*(?:SFX|ΗΧΟΣ)\s*:\s*([^\]]+?)\s*\]$/iu;
const VOICE_LINE = /^\[\s*(?:VOICE|ΦΩΝΗ)\s*:\s*([^\]]+?)\s*\]$/iu;
/** A bracket line written directly above the speech with no blank line between
 *  — the natural way to write it, and how the first real script came back.
 *  Stripped before a block is judged, so the block underneath is still found. */
const LEADING_BRACKET = /^(?:\[\s*(?:SFX|ΗΧΟΣ|VOICE|ΦΩΝΗ)\s*:[^\]]*\]\s*)+/iu;

export function checkScript(script: string, openingPhrases: string[]): ScriptProblem[] {
  const problems: ScriptProblem[] = [];
  const phrases = openingPhrases.map((p) => p.trim().toLowerCase());

  // Line numbers are what a person needs, so blocks are found by walking lines
  // rather than by splitting the whole text and losing where everything was.
  const lines = script.split("\n");
  const blocks: { startLine: number; text: string }[] = [];
  type Open = { startLine: number; parts: string[] };
  let current: Open | null = null;
  const close = () => {
    if (current) blocks.push({ startLine: current.startLine, text: current.parts.join(" ") });
    current = null;
  };
  lines.forEach((raw, i) => {
    if (raw.trim() === "") { close(); return; }
    const open: Open = current ?? { startLine: i + 1, parts: [] };
    open.parts.push(raw.trim());
    current = open;
  });
  close();

  let lastSpeechBlock = 0;

  for (const block of blocks) {
    const n = block.startLine;
    const whole = block.text.replace(/\s+/g, " ").trim();
    if (CUE_LINE.test(whole) || VOICE_LINE.test(whole)) continue;

    // Peel any cue or settings lines off the front, then judge what is left.
    const text = whole.replace(LEADING_BRACKET, "").trim();
    if (!text) continue;
    const short = text.length > 90 ? text.slice(0, 90) + "…" : text;

    const lower = text.toLowerCase();
    if (!phrases.some((p) => lower.startsWith(p))) {
      problems.push({
        line: n, text: short,
        problem: "This block does not start with one of the character phrases, so nobody would say it.",
        fix: `Start it with one of: ${openingPhrases.join(", ")}`,
      });
      continue;
    }

    const quoteCount = (text.match(/"/g) ?? []).length;
    if (quoteCount === 0) {
      problems.push({
        line: n, text: short,
        problem: "No speech in this block — there is nothing inside quotes.",
        fix: 'Put the Greek inside "…".',
      });
      continue;
    }
    if (quoteCount % 2 !== 0) {
      problems.push({
        line: n, text: short,
        problem: "An odd number of quote marks, so one span never closes and the rest is silently lost.",
        fix: "Check every opening quote has a closing one. Use « » inside the Greek.",
      });
      continue;
    }
    lastSpeechBlock = n;

    const spans = [...text.matchAll(/"([^"]*)"/g)];
    const spoken = spans.map((s) => s[1]).join(" ");
    const outside = text.replace(/"[^"]*"/g, " ").replace(/\s+/g, " ").trim();

    // --- after the last closing quote -----------------------------------
    const tail = text.slice(text.lastIndexOf('"') + 1).trim();
    if (tail) {
      problems.push({
        line: n, text: short,
        problem: `"${tail}" comes after the last closing quote — it is either read out loud or thrown away.`,
        fix: "End the block at the closing quote.",
      });
    }

    // --- the acting instructions ----------------------------------------
    const role = ROLE_WORDS.find((w) => new RegExp(`\\b${w}\\b`, "i").test(outside));
    if (role) {
      problems.push({
        line: n, text: short,
        problem: `The instruction says "${role}", and a job word is SPOKEN ALOUD in the video.`,
        fix: "Describe the action instead of the person.",
      });
    }
    if (spans.length > 1) {
      // Everything after the first span should continue with a pronoun.
      const continuation = text.slice(spans[0].index! + spans[0][0].length).trim();
      const firstWord = continuation.split(/\s+/)[0]?.replace(/[^A-Za-z]/g, "");
      // POSSESSIVES COUNT. "His voice rises with fury" is the prompting guide's
      // own pattern for anger and is what docs/SCRIPT-GEM.md tells the writer to
      // use — flagging it sent a correct script back for a fix it did not need.
      if (firstWord && !/^(she|he|they|his|her|their|its|and|then)$/i.test(firstWord)) {
        problems.push({
          line: n, text: short,
          problem: `After the first piece of speech the block continues with "${firstWord}" instead of She or He.`,
          fix: "Repeating the opening phrase sounds like a new person arriving. Use She or He.",
        });
      }
    }

    // --- the speech ------------------------------------------------------
    // Greek noise spellings make NO SOUND — measured on lesson 101.1, where
    // Χαχαχα and Χεχε produced nothing. They are worse than naming a noise:
    // at least a named noise is audible, wrongly.
    const deadPhonetic = /Χαχα|Χεχε|Μμμμ|Ααααα|Ουφ/u.exec(spoken);
    if (deadPhonetic) {
      problems.push({
        line: n, text: short,
        problem: `"${deadPhonetic[0]}" is a Greek spelling of a noise, and those make no sound at all.`,
        fix: "Use the Latin spelling — Hahaha, Hehehe, Mmmm, Ahhh, Ugh.",
      });
    }

    const gnoise = NAMED_NOISE_GREEK.find((w) => new RegExp(w, "i").test(spoken));
    if (gnoise) {
      problems.push({
        line: n, text: short,
        problem: `"${gnoise}" NAMES a sound inside the speech, so the word itself is read out.`,
        fix: "Spell the sound (Χαχαχα), or move it outside the quotes.",
      });
    }
    const enoise = NAMED_NOISE_ENGLISH.find((w) => new RegExp(`\\b${w}\\b`, "i").test(spoken));
    if (enoise) {
      problems.push({
        line: n, text: short,
        problem: `The English word "${enoise}" is inside the speech and would be read out in Greek narration.`,
        fix: "Spell the sound phonetically, or move it outside the quotes.",
      });
    }
  }

  const lastBlock = blocks[blocks.length - 1];
  if (lastBlock && lastBlock.startLine !== lastSpeechBlock) {
    problems.push({
      line: lastBlock.startLine, text: lastBlock.text.slice(0, 90),
      problem: "The script does not end on speech.",
      fix: "Move this above the last block of dialogue.",
    });
  }

  return problems;
}
