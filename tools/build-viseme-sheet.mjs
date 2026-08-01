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

const GRID = 3;
const VISEME_COUNT = 9;

// Cell size is whatever the input images are, not a fixed 1024. The app scales
// the whole sheet to three times the drawn head size and reads cells by
// fraction, so absolute resolution never reaches it — only the 3x3 layout and
// square, equal-sized cells matter. Hardcoding 1024 rejected perfectly good
// art for no reason, most obviously cells sliced out of a single grid image
// (see tools/slice-grid.mjs), where the size is whatever the grid divides into.

/** Index -> expected label, purely to sanity-check the input naming. */
const EXPECTED = ["NEUTRAL", "AH", "EE", "OH", "OO", "MBP", "FV", "L", "CH_SH"];

/**
 * Which cell to borrow when one wasn't drawn. Each maps to the shape it most
 * resembles at the size faces actually render (~170px in a 1080p frame):
 *
 *   OO    small round mouth          -> OH       (both rounded, OH is wider)
 *   MBP   lips pressed together      -> NEUTRAL  (both a closed mouth)
 *   FV    teeth on lip, barely open  -> EE       (both part-open, teeth showing)
 *   L     tongue up, part open       -> EE       (both a part-open wide mouth)
 *   CH_SH lips forward and rounded   -> OO       (chains on to OH if OO is absent)
 *
 * Which cells are worth drawing is a property of the LANGUAGE, not a constant
 * — run `node tools/viseme-coverage.mjs` against a real script to see. For
 * Greek the answer is not the obvious one: OO appears in ~1% of graphemes
 * while L appears in ~17%, so a five-cell set of NEUTRAL/AH/EE/OH/L retains
 * 94% of the mouth movement, where NEUTRAL/AH/EE/OH/OO retains only 83%.
 *
 * Substitutions are always reported, never silent: this is a deliberate
 * shortcut, not a free lunch.
 */
const FALLBACK = { 4: 3, 5: 0, 6: 2, 7: 2, 8: 4 };

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

  // Read every cell first so the sheet can be sized from the actual art, and
  // so a mismatch is caught before anything is written.
  const cells = [];
  for (let i = 0; i < VISEME_COUNT; i++) {
    cells.push(PNG.sync.read(fs.readFileSync(path.join(inputDir, slots.get(i).file))));
  }
  const CELL = cells[0].width;
  if (cells[0].height !== CELL) {
    console.error(`${name}: FAIL — cells must be square, ${slots.get(0).file} is ${cells[0].width}x${cells[0].height}`);
    hadError = true;
    continue;
  }
  const odd = cells.findIndex((c) => c.width !== CELL || c.height !== CELL);
  if (odd >= 0) {
    console.error(
      `${name}: FAIL — ${slots.get(odd).file} is ${cells[odd].width}x${cells[odd].height}, ` +
        `but the first cell is ${CELL}x${CELL}. All nine must match.`
    );
    hadError = true;
    continue;
  }

  const SHEET = CELL * GRID;
  const sheet = new PNG({ width: SHEET, height: SHEET });
  for (let i = 0; i < VISEME_COUNT; i++) {
    const col = i % GRID;
    const row = Math.floor(i / GRID);
    // bitblt copies the raw RGBA rect; no scaling, so cells stay pixel-exact.
    PNG.bitblt(cells[i], sheet, 0, 0, CELL, CELL, col * CELL, row * CELL);
  }

  const out = path.join(outputDir, `${name}.png`);
  fs.writeFileSync(out, PNG.sync.write(sheet));
  const kb = Math.round(fs.statSync(out).size / 1024);
  console.log(`${name}: OK -> ${out} (${SHEET}x${SHEET}, ${CELL}px cells, ${kb}KB)`);
}

process.exit(hadError ? 1 : 0);
