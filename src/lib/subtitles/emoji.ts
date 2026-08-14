// ---------------------------------------------------------------------------
// Swapping a word for an emoji, but only when the emoji is unmistakable.
//
// THE RULE THIS FILE EXISTS TO ENFORCE: a substitution has to be SELF-EVIDENT.
// A reader who missed the audio must be able to look at the picture and know
// which word was there. That makes the dictionary deliberately small and
// deliberately concrete — nouns you can photograph, and feelings with one
// obvious face. Anything abstract stays as text, because 🤔 could be "thinking",
// "maybe", "hmm" or "I wonder", and a caption that has to be guessed at is
// worse than one that is simply read.
//
// Greek first, since that is what the courses are in, with the English beside
// it. Matching ignores case and accents — ΣΚΥΛΟΣ, σκύλος and σκυλος are one
// word — and only ever matches a WHOLE word. A rule that fired inside another
// word would turn "κτηνιατρείο" into an emoji and a syllable.
// ---------------------------------------------------------------------------

/** Words, in both languages, that map to one unarguable picture. */
const WORDS: Record<string, string> = {
  // Animals — the subject of the course, so worth the most entries.
  σκυλος: "🐕", σκυλο: "🐕", σκυλου: "🐕", σκυλοι: "🐕", σκυλους: "🐕",
  dog: "🐕", dogs: "🐕",
  σκυλακι: "🐶", κουταβι: "🐶", puppy: "🐶",
  γατα: "🐈", γατας: "🐈", γατες: "🐈", cat: "🐈", cats: "🐈",
  προβατο: "🐑", προβατα: "🐑", sheep: "🐑",
  αγελαδα: "🐄", αγελαδες: "🐄", cow: "🐄", cows: "🐄",
  κουνελι: "🐇", rabbit: "🐇",
  πουλι: "🐦", πουλια: "🐦", bird: "🐦", birds: "🐦",

  // The vet — asked for by name.
  κτηνιατρος: "⚕️", κτηνιατρο: "⚕️", κτηνιατρου: "⚕️", κτηνιατρε: "⚕️",
  vet: "⚕️", veterinarian: "⚕️",

  // Feelings with exactly one face.
  χαμογελο: "😊", smile: "😊",
  αγαπη: "❤️", love: "❤️",
  φοβος: "😨", fear: "😨",
  θυμος: "😠", anger: "😠",

  // Things.
  σκατα: "💩", κακα: "💩", shit: "💩", poop: "💩",
  φαγητο: "🍖", food: "🍖",
  νερο: "💧", water: "💧",
  παιχνιδι: "🎾", toy: "🎾",
  σοκολατα: "🍫", chocolate: "🍫",
  λουρι: "🦮", leash: "🦮",
  σπιτι: "🏠", home: "🏠", house: "🏠",
  καρδια: "❤️", heart: "❤️",
  υπνος: "😴", sleep: "😴",

  // Places, as flags — the one case where a proper noun is unambiguous.
  ελλαδα: "🇬🇷", ελλαδας: "🇬🇷", greece: "🇬🇷",
  σουηδια: "🇸🇪", σουηδιας: "🇸🇪", sweden: "🇸🇪",
};

/** Runs of terminal punctuation. Longest first: "!?" must win over "!". */
const PUNCT: [string, string][] = [
  ["!?", "⁉️"],
  ["?!", "⁉️"],
  ["!!", "‼️"],
  ["!", "❗"],
  ["?", "❓"],
];

/** Lowercase and strip accents, so one entry covers every way a word is
 *  written. Greek's final sigma is folded too — λύκος and λύκoς differ only in
 *  where they sit in a sentence. */
function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ς/g, "σ");
}

export interface EmojiSwap {
  /** What to draw: the emoji, or the original word if nothing matched. */
  text: string;
  /** True when this was replaced — the caller draws it larger, since an emoji
   *  at text size next to capital letters reads as a smudge. */
  isEmoji: boolean;
}

/**
 * Swap one word, keeping any punctuation that trailed it.
 *
 * Punctuation is handled separately and kept: "Σοκολάτα!" becomes "🍫❗", not
 * "🍫". Losing the mark would change the reading of the line, and the mark is
 * the one thing here with no ambiguity at all.
 */
export function emojiFor(word: string): EmojiSwap {
  // Split the trailing punctuation off before looking anything up.
  const m = /^(.*?)([!?]{1,2})$/.exec(word.trim());
  const core = m ? m[1] : word.trim();
  const tail = m ? m[2] : "";

  const hit = WORDS[fold(core.replace(/[.,·;:"'()»«]/g, ""))];
  const tailEmoji = tail ? PUNCT.find(([p]) => p === tail)?.[1] ?? tail : "";

  if (!hit) return { text: word, isEmoji: false };
  return { text: hit + tailEmoji, isEmoji: true };
}
