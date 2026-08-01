// ---------------------------------------------------------------------------
// Slices ONE image containing a grid of mouth shapes into the individual named
// cells that build-viseme-sheet.mjs expects.
//
//   node tools/slice-grid.mjs <gridImage> <character> [options]
//
//   --cols N        columns in the grid           (default 5)
//   --rows N        rows in the grid              (default 1)
//   --order a,b,..  viseme index for each panel, reading left-to-right then
//                   top-to-bottom                 (default 0,1,2,3,4)
//   --out DIR       where to write the cells      (default ./viseme-v2)
//   --square        crop each panel to a centred square (default: on)
//   --no-square     keep panels as-is, even if not square
//
// Example — a 5-panel strip of NEUTRAL, AH, EE, OH, OO:
//   node tools/slice-grid.mjs kaiti-strip.png kaiti
//
// Why this exists: generating each mouth shape as a separate image means the
// model redraws the character from scratch every time, and the head drifts
// between cells — which the sheet docs call the single most common way these
// fail. Asking for all the shapes in ONE image makes the model compose them
// side by side against each other instead, which holds the head far steadier,
// and costs one generation instead of five.
// ---------------------------------------------------------------------------

import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";

const LABELS = ["NEUTRAL", "AH", "EE", "OH", "OO", "MBP", "FV", "L", "CH_SH"];

const argv = process.argv.slice(2);
const positional = argv.filter((a) => !a.startsWith("--"));
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};

const [gridPath, character] = positional;
if (!gridPath || !character) {
  console.error("usage: node tools/slice-grid.mjs <gridImage> <character> [--cols N] [--rows N] [--order 0,1,2,3,4] [--out DIR]");
  process.exit(1);
}

const cols = Number(flag("cols", 5));
const rows = Number(flag("rows", 1));
const outDir = flag("out", "./viseme-v2");
const square = !argv.includes("--no-square");
const order = flag("order", "0,1,2,3,4")
  .split(",")
  .map((n) => Number(n.trim()));

const src = PNG.sync.read(fs.readFileSync(gridPath));

// floor, not round: a 1024px image split three ways leaves a spare pixel, and
// silently reading one column past the edge is worse than losing it.
const panelW = Math.floor(src.width / cols);
const panelH = Math.floor(src.height / rows);
const size = square ? Math.min(panelW, panelH) : null;

console.log(
  `${path.basename(gridPath)}: ${src.width}x${src.height} -> ${cols}x${rows} panels ` +
    `of ${panelW}x${panelH}${square ? `, cropped square to ${size}px` : ""}`
);

if (order.length !== cols * rows) {
  console.warn(
    `note: ${cols * rows} panels but ${order.length} indices in --order; ` +
      `only the first ${Math.min(order.length, cols * rows)} will be written`
  );
}

fs.mkdirSync(outDir, { recursive: true });

const count = Math.min(order.length, cols * rows);
for (let p = 0; p < count; p++) {
  const index = order[p];
  if (!Number.isInteger(index) || index < 0 || index > 8) {
    console.error(`FAIL — "${order[p]}" is not a viseme index (0-8)`);
    process.exit(1);
  }
  const col = p % cols;
  const row = Math.floor(p / cols);

  const w = square ? size : panelW;
  const h = square ? size : panelH;
  // Centre the square crop inside the panel, so a wider-than-tall panel loses
  // its margins rather than one whole side of the face.
  const sx = col * panelW + Math.floor((panelW - w) / 2);
  const sy = row * panelH + Math.floor((panelH - h) / 2);

  const cell = new PNG({ width: w, height: h });
  PNG.bitblt(src, cell, sx, sy, w, h, 0, 0);

  const file = path.join(outDir, `${character}_${index}_${LABELS[index]}.png`);
  fs.writeFileSync(file, PNG.sync.write(cell));
  console.log(`  panel ${p} -> ${path.basename(file)} (${w}x${h})`);
}

console.log(`\nnext: node tools/build-viseme-sheet.mjs ${outDir} ./viseme-sheets-v2`);
