// ---------------------------------------------------------------------------
// What is SAID and what is SHOWN are not always the same word.
//
// DramaBox is English-trained, so a laugh only happens if it is spelled the way
// English spells it: "Hahaha", "Ugh", "Mmmm". Greek spellings were tried in a
// finished lesson and produced no laugh at all — the engine read them as
// letters. So the script has to carry the English spelling, and the script IS
// the prompt.
//
// But the audience reads the subtitle. A Greek lesson whose subtitle opens with
// the word "Ugh" looks like a mistake, because on the page it is one.
//
// So the two are separated at the last possible moment:
//
//   the ENGINE and the ALIGNER get the spoken form   — "Ugh,"
//   the SUBTITLE gets the display form               — "Ουφ,"
//
// Alignment is done against the spoken form deliberately: the audio says the
// English sound, and asking the aligner to find a Greek word that was never
// pronounced is how a timing goes quietly wrong. The swap happens after the
// times are known, and swaps one word for one word so nothing shifts.
//
// This map is display only. Nothing here changes what is generated.
// ---------------------------------------------------------------------------

/** Spoken spelling (lower case, no punctuation) → what the subtitle shows.
 *
 *  Keep every entry ONE WORD on both sides. A one-to-two mapping would break
 *  the word-for-word correspondence the timings depend on. */
const SHOWN_AS: Record<string, string> = {
  hahaha: "Χαχαχα",
  haha: "Χαχα",
  hehehe: "Χεχεχε",
  hehe: "Χεχε",
  "mmmm-mmm": "Μμμμ",
  mmmm: "Μμμμ",
  mmm: "Μμμ",
  hmm: "Χμμ",
  ahhh: "Ααα",
  ahh: "Αα",
  ugh: "Ουφ",
  argh: "Αργκ",
  woooo: "Ουουου",
  ooooh: "Ωωω",
  shhh: "Σσσ",
  psst: "Ψιτ",
};

/** Case and punctuation as written, only the letters swapped.
 *
 *  "Ugh," → "Ουφ,"   "HAHAHA!" → "ΧΑΧΑΧΑ!"   "hehehe" → "χεχεχε" */
export function displayWord(word: string): string {
  const m = word.match(/^([^\p{L}]*)(\p{L}[\p{L}-]*)([^\p{L}]*)$/u);
  if (!m) return word;
  const [, before, core, after] = m;
  const replacement = SHOWN_AS[core.toLowerCase()];
  if (!replacement) return word;

  if (core === core.toUpperCase() && core.length > 1) {
    return before + replacement.toUpperCase() + after;
  }
  if (core[0] === core[0].toLowerCase()) {
    return before + replacement.toLowerCase() + after;
  }
  return before + replacement + after;
}

/** Every word in a line, spacing untouched. */
export function displayLine(text: string): string {
  return text.replace(/\S+/g, (w) => displayWord(w));
}

/** True if anything in this text would be shown differently from how it is
 *  said. Used to report the swap rather than let it happen invisibly. */
export function hasDisplaySwap(text: string): boolean {
  return displayLine(text) !== text;
}
