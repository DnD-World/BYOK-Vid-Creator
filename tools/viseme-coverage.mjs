// ---------------------------------------------------------------------------
// Which mouth shapes are worth drawing, for the script you actually have?
//
//   node --experimental-strip-types tools/viseme-coverage.mjs [scriptFile]
//
// With no argument it uses a built-in Greek sample. Point it at a plain text
// file (a "Label: line" script is fine — labels are just more text) to get the
// answer for your own material.
//
// Why this isn't a constant: which cells matter is a property of the LANGUAGE.
// For Greek, OO turns up in about 1% of graphemes while L turns up in 17%, so
// the obvious five (NEUTRAL, AH, EE, OH, OO) is a materially worse choice than
// swapping OO for L — same drawing effort, eleven points more movement.
//
// The measure is mouth CHANGES, not frames. buildVisemeTrack drops a keyframe
// that repeats the previous viseme, so substituting one shape for another
// doesn't merely make them look alike — it deletes the transition between them
// and the mouth simply holds. That is why fewer cells costs more than it looks.
// ---------------------------------------------------------------------------

import fs from "node:fs";
import { graphemeToViseme } from "../src/lib/visemes/visemeMap.ts";

const LABELS = ["NEUTRAL", "AH", "EE", "OH", "OO", "MBP", "FV", "L", "CH_SH"];

/** Must stay in step with FALLBACK in build-viseme-sheet.mjs. */
const FALLBACK = { 4: 3, 5: 0, 6: 2, 7: 2, 8: 4 };

const SAMPLE = [
  "Σερίφη, γιατί γαβγίζεις σε κάθε ταχυδρόμο;",
  "Γιατί κάποιος πρέπει να προσέχει αυτό το σπίτι.",
  "Από τα γράμματα; Ειδικά από τα γράμματα.",
  "Σερίφη, γιατί οι σκύλοι γαβγίζουν πάντα στους ταχυδρόμους;",
  "Είναι απλό, Καίτη. Ο ταχυδρόμος έρχεται κάθε μέρα, πλησιάζει το σπίτι και μετά φεύγει.",
  "Ναι, και τι σημαίνει αυτό;",
  "Ο σκύλος νομίζει ότι το γαύγισμά του είναι αυτό που τον διώχνει.",
  "Δηλαδή πιστεύει ότι τον νίκησε;",
  "Ακριβώς! Κάθε μέρα γαβγίζει, ο ταχυδρόμος φεύγει, ο σκύλος νιώθει νικητής.",
].join(" ");

const file = process.argv[2];
const text = file ? fs.readFileSync(file, "utf8") : SAMPLE;
console.log(file ? `script: ${file}` : "script: built-in Greek sample (pass a file to use your own)");

const seq = graphemeToViseme(text);

/** Resolve a fallback chain to a cell that is actually being drawn. */
function resolve(index, drawn) {
  const seen = new Set();
  let i = index;
  while (!drawn.has(i) && FALLBACK[i] !== undefined && !seen.has(i)) {
    seen.add(i);
    i = FALLBACK[i];
  }
  return drawn.has(i) ? i : 0;
}

/** Keyframes left after the "same as last, skip it" dedupe. */
function changes(drawn) {
  let n = 0;
  let last = null;
  for (const v of seq) {
    const m = resolve(v, drawn);
    if (m !== last) {
      n++;
      last = m;
    }
  }
  return n;
}

const counts = new Array(9).fill(0);
for (const v of seq) counts[v]++;

console.log(`\n${seq.length} graphemes. How often each shape is called for:`);
counts
  .map((c, i) => [i, c])
  .sort((a, b) => b[1] - a[1])
  .forEach(([i, c]) =>
    console.log(`  ${LABELS[i].padEnd(8)} ${String(c).padStart(5)}  ${((c / seq.length) * 100).toFixed(1)}%`)
  );

const all = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8]);
const full = changes(all);

// Greedy: start from NEUTRAL and repeatedly add whichever remaining cell buys
// the most movement. That ordering IS the answer to "what should I draw next".
console.log(`\nBest cell to add at each step (${full} mouth changes with all nine):`);
const drawn = new Set([0]);
let step = 1;
while (drawn.size < 9) {
  let best = null;
  let bestN = -1;
  for (const i of all) {
    if (drawn.has(i)) continue;
    const n = changes(new Set([...drawn, i]));
    if (n > bestN) {
      bestN = n;
      best = i;
    }
  }
  drawn.add(best);
  const pct = ((bestN / full) * 100).toFixed(0);
  const bar = "#".repeat(Math.round((bestN / full) * 40));
  console.log(
    `  draw ${String(drawn.size).padStart(2)}  +${LABELS[best].padEnd(8)} ${bar.padEnd(40)} ${pct}%`
  );
  step++;
}
