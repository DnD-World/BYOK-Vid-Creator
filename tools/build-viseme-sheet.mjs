// ---------------------------------------------------------------------------
// Assembles per-viseme PNGs into the 3x3 sprite sheets the app renders from.
//
//   node tools/build-viseme-sheet.mjs [inputDir] [outputDir]
//   defaults: ./viseme  ->  ./viseme-sheets
//
// Input files must be named  <character>_<index>_<LABEL>.png  e.g.
// kaiti_0_NEUTRAL.png ... kaiti_8_CH_SH.png. The INDEX is what places the cell,
// not the label and not alphabetical order — `CH_SH` sorts before `NEUTRAL`
// alphabetically, so sorting by filename would silently scramble the sheet.
//
// Cell position is column = index % 3, row = floor(index / 3), which is exactly
// how SpeakerAvatar.tsx and the Remotion composition read it back.
//
// Re-runnable: regenerate one character's PNGs, run this again, done.
// ---------------------------------------------------------------------------

import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";

const CELL = 1024;
const GRID = 3;
const SHEET = CELL * GRID;
const VISEME_COUNT = 9;

/** Index -> expected label, purely to sanity-check the input naming. */
const EXPECTED = ["NEUTRAL", "AH", "EE", "OH", "OO", "MBP", "FV", "L", "CH_SH"];

/**
 * Which cell to borrow when one wasn't drawn.
 *
 * Measured against a real render: the mouth occupies ~5% of the face's pixels
 * at the size faces actually appear (~170px in a 1080p frame), so the shapes
 * that read are the ones with a distinct silhouette — open, wide, round. The
 * four below are near-duplicates of another cell at that size:
 *
 *   MBP   lips pressed together      -> NEUTRAL  (both are a closed mouth)
 *   FV    teeth on lip, barely open  -> NEUTRAL
 *   L     tongue up, part open       -> EE       (both are a part-open wide mouth)
 *   CH_SH lips forward and rounded   -> OO       (both are a small round mouth)
 *
 * So a five-cell set — NEUTRAL, AH, EE, OH, OO — gets most of the effect for
 * a bit over half the drawing. Substitutions are always reported, never
 * silent: this is a deliberate shortcut, not a free lunch, and the full nine
 * are still better if you want to draw them.
 */
const FALLBACK = { 5: 0, 6: 0, 7: 2, 8: 4 };

/** Walks the fallback chain to a cell that exists, or null. */
function resolveFallback(slots, index) {
  const seen = new Set();
  let i = index;
  while (FALLBACK[i] !== undefined && !seen.has(i)) {
    seen.add(i);
    i = FALLBACK[i];
    if (slots.has(i)) return i;
  }
  return slots.has(0) ? 0 : null;
}

const inputDir = process.argv[2] ?? "./viseme";
const outputDir = process.argv[3] ?? "./viseme-sheets";

const files = fs.readdirSync(inputDir).filter((f) => f.toLowerCase().endsWith(".png"));

// Group by character prefix.
const characters = new Map();
for (const file of files) {
  const m = /^(.+?)_(\d+)_(.+)\.png$/i.exec(file);
  if (!m) {
    console.warn(`skipping (unrecognised name): ${file}`);
    continue;
  }
  const [, name, idxRaw, label] = m;
  const idx = Number(idxRaw);
  if (!characters.has(name)) characters.set(name, new Map());
  const slots = characters.get(name);
  if (slots.has(idx)) {
    throw new Error(`${name}: two files claim viseme ${idx} (${slots.get(idx).file} and ${file})`);
  }
  slots.set(idx, { file, label });
}

if (characters.size === 0) {
  console.error(`No usable PNGs found in ${inputDir}`);
  process.exit(1);
}

fs.mkdirSync(outputDir, { recursive: true });

let hadError = false;

for (const [name, slots] of characters) {
  // Cell 0 is the one thing that cannot be substituted — everything else
  // borrows from it, directly or eventually.
  if (!slots.has(0)) {
    console.error(`${name}: FAIL — no NEUTRAL (index 0); every fallback leads there`);
    hadError = true;
    continue;
  }

  // Fill what wasn't drawn, and say so. A sheet quietly missing four mouth
  // shapes looks like a lip-sync bug later, not like a decision made now.
  const borrowed = [];
  for (let i = 0; i < VISEME_COUNT; i++) {
    if (slots.has(i)) continue;
    const from = resolveFallback(slots, i);
    if (from === null) {
      console.error(`${name}: FAIL — cannot fill viseme ${i}`);
      hadError = true;
      break;
    }
    slots.set(i, { ...slots.get(from), borrowedFrom: from });
    borrowed.push(`${EXPECTED[i]}<-${EXPECTED[from]}`);
  }
  if (hadError) continue;
  if (borrowed.length > 0) {
    console.warn(`${name}: ${borrowed.length} cell(s) borrowed — ${borrowed.join(", ")}`);
  }

  for (let i = 0; i < VISEME_COUNT; i++) {
    if (slots.get(i).borrowedFrom !== undefined) continue;
    const got = slots.get(i).label.toUpperCase();
    if (got !== EXPECTED[i]) {
      console.warn(`${name}: index ${i} is labelled ${got}, expected ${EXPECTED[i]} — using the INDEX for placement`);
    }
  }

  const sheet = new PNG({ width: SHEET, height: SHEET });

  for (let i = 0; i < VISEME_COUNT; i++) {
    const { file } = slots.get(i);
    const src = PNG.sync.read(fs.readFileSync(path.join(inputDir, file)));
    if (src.width !== CELL || src.height !== CELL) {
      console.error(`${name}: FAIL — ${file} is ${src.width}x${src.height}, expected ${CELL}x${CELL}`);
      hadError = true;
      break;
    }
    const col = i % GRID;
    const row = Math.floor(i / GRID);
    // bitblt copies the raw RGBA rect; no scaling, so cells stay pixel-exact.
    PNG.bitblt(src, sheet, 0, 0, CELL, CELL, col * CELL, row * CELL);
  }

  const out = path.join(outputDir, `${name}.png`);
  fs.writeFileSync(out, PNG.sync.write(sheet));
  const kb = Math.round(fs.statSync(out).size / 1024);
  console.log(`${name}: OK -> ${out} (${SHEET}x${SHEET}, ${kb}KB)`);
}

process.exit(hadError ? 1 : 0);
