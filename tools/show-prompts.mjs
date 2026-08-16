/**
 * Print the exact DramaBox prompts a script produces. Nothing else.
 *
 *   node --experimental-strip-types tools/show-prompts.mjs scripts/latin-test.txt
 *
 * WHY THIS EXISTS. The instruction file tells the Gem to write square brackets
 * that appear nowhere in DramaBox's own guide, on the promise that something
 * converts them. Asking anyone to take that on trust is how this project ended
 * up with an instruction file describing a step that had not been written.
 *
 * So: paste in a script, see the string the engine will receive. If it looks
 * wrong, it is wrong, and no explanation from me changes that.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const { parseScript } = await import(
  "file://" + path.join(ROOT, "src/lib/narration/parseScript.ts")
);
const { buildDramaboxPrompts } = await import(
  "file://" + path.join(ROOT, "electron/tts/dramaboxPrompt.ts")
);

const file = process.argv[2];
if (!file) {
  console.error("usage: show-prompts.mjs <script.txt>");
  process.exit(1);
}

// The three characters, as the ENGINE is told about them. Generic nouns with
// one adjective, never a role — see docs/DRAMABOX.md.
const SPEAKERS = [
  { id: "s1", label: "Καίτη", aliases: ["Kaiti"] },
  { id: "s2", label: "Σερίφης", aliases: ["Serifis"] },
  { id: "s3", label: "Τσίκα", aliases: ["Tsika"] },
];
const VOICES = {
  s1: { noun: "A bright young woman", pronoun: "she" },
  s2: { noun: "A grave man", pronoun: "he" },
  s3: { noun: "A tiny woman", pronoun: "she" },
};

const script = fs.readFileSync(file, "utf8");
const { segments, unmatchedLines, cues } = parseScript(script, SPEAKERS);
const prompts = buildDramaboxPrompts(segments, VOICES);

console.log(
  `${segments.length} spoken lines, ${cues.length} sound cue(s), ` +
    `${prompts.length} generation(s).\n`
);

prompts.forEach((p, i) => {
  const who = SPEAKERS.find((s) => s.id === p.speakerId)?.label ?? p.speakerId;
  console.log(`--- generation ${i + 1} — ${who}, lines ${p.segmentIndices.map((n) => n + 1).join(",")}`);
  console.log(p.prompt);
  console.log();
});

if (cues.length) {
  console.log("sound effects: " + cues.map((c) => c.name).join(", "));
}
if (unmatchedLines.length) {
  console.log("\nLINES THAT MATCHED NO SPEAKER (these would be dropped):");
  unmatchedLines.forEach((l) => console.log("  " + l));
}
