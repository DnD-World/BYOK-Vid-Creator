// ---------------------------------------------------------------------------
// Composites a mouth variation back onto the NEUTRAL cell, so every cell in a
// sheet is byte-identical outside the mouth.
//
//   node tools/merge-mouth.mjs <neutral> <variant> <out> [options]
//
//   --box x,y,w,h   region to take from the variant (default: auto-detect)
//   --feather N     pixels of blend at the region's edge  (default 24)
//   --max-area P    refuse to auto-detect if the changed region covers more
//                   than P% of the image                  (default 25)
//
// Why this exists. The sheet docs say the head must not move between cells,
// and that this is the single most common way these fail. Every approach so
// far has made drift *less likely* — reuse a reference image, generate all the
// shapes in one strip. This makes it impossible: the output is the NEUTRAL
// cell's own pixels everywhere except inside the mouth region.
//
// It pairs with inpainting rather than regeneration — Midjourney's Vary
// (Region), Photoshop's Generative Fill, or any ComfyUI inpaint workflow. Mask
// the mouth, regenerate just that, and the rest of the frame already matches.
// This tool then guarantees the match rather than trusting it, because those
// tools can still shift a pixel or re-encode the whole canvas.
//
// Auto-detection compares the two images and takes the bounding box of what
// changed. If a variant came from an independent generation rather than an
// inpaint, the whole head will differ, the box will cover most of the frame,
// and the tool stops and tells you to pass --box by hand.
// ---------------------------------------------------------------------------

import fs from "node:fs";
import { PNG } from "pngjs";

const argv = process.argv.slice(2);

const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};

const files = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith("--")) {
    i++; // skip its value
    continue;
  }
  files.push(argv[i]);
}
const [basePath, variantPath, outPath] = files;

if (!basePath || !variantPath || !outPath) {
  console.error("usage: node tools/merge-mouth.mjs <neutral> <variant> <out> [--box x,y,w,h] [--feather N]");
  process.exit(1);
}

const feather = Number(flag("feather", 24));
const maxAreaPct = Number(flag("max-area", 25));
const boxArg = flag("box", null);

const base = PNG.sync.read(fs.readFileSync(basePath));
const variant = PNG.sync.read(fs.readFileSync(variantPath));

if (base.width !== variant.width || base.height !== variant.height) {
  console.error(
    `FAIL — sizes differ: ${basePath} is ${base.width}x${base.height}, ` +
      `${variantPath} is ${variant.width}x${variant.height}`
  );
  process.exit(1);
}

const W = base.width;
const H = base.height;

/** Bounding box of pixels that differ by more than a visible threshold. */
function detectBox() {
  let minX = W, minY = H, maxX = -1, maxY = -1, changed = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const d =
        Math.abs(base.data[i] - variant.data[i]) +
        Math.abs(base.data[i + 1] - variant.data[i + 1]) +
        Math.abs(base.data[i + 2] - variant.data[i + 2]);
      // 24/765 is roughly where a difference stops being encoder noise.
      if (d > 24) {
        changed++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { empty: true, changed };
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  return {
    x: minX, y: minY, w, h, changed,
    // The BOX is what gets composited, so the box is what the guard has to
    // measure. Counting changed pixels instead reads far too low when an
    // independent generation drifts along every outline in the frame: barely
    // 8% of pixels differ, yet their bounding box is the whole head.
    pct: ((w * h) / (W * H)) * 100,
    changedPct: (changed / (W * H)) * 100,
  };
}

let box;
if (boxArg) {
  const [x, y, w, h] = boxArg.split(",").map((n) => Number(n.trim()));
  box = { x, y, w, h, manual: true };
} else {
  const d = detectBox();
  if (d.empty) {
    console.error("FAIL — the two images are identical; nothing to merge");
    process.exit(1);
  }
  if (d.pct > maxAreaPct) {
    console.error(
      `FAIL — the changed region spans ${d.w}x${d.h}, ${d.pct.toFixed(1)}% of the frame ` +
        `(only ${d.changedPct.toFixed(1)}% of pixels differ, but they are spread across it).\n` +
        `       That is more than --max-area ${maxAreaPct}%.\n` +
        `       The whole head moved, not just the mouth, so this variant did not come from an\n` +
        `       inpaint. Either redo it as an inpaint, or pass the mouth region by\n` +
        `       hand, e.g. --box ${Math.round(W * 0.3)},${Math.round(H * 0.55)},${Math.round(W * 0.4)},${Math.round(H * 0.25)}`
    );
    process.exit(1);
  }
  box = d;
}

// Clamp into the image so a hand-passed box can't read out of bounds.
box.x = Math.max(0, Math.min(W - 1, box.x));
box.y = Math.max(0, Math.min(H - 1, box.y));
box.w = Math.max(1, Math.min(W - box.x, box.w));
box.h = Math.max(1, Math.min(H - box.y, box.h));

// Start from the base, then blend the variant in over the box. Feathering is a
// linear ramp measured from whichever edge is nearest, so a hard rectangle
// never shows up as a seam in flat-coloured art.
const out = new PNG({ width: W, height: H });
base.data.copy(out.data);

for (let y = box.y; y < box.y + box.h; y++) {
  for (let x = box.x; x < box.x + box.w; x++) {
    const edge = Math.min(x - box.x, box.x + box.w - 1 - x, y - box.y, box.y + box.h - 1 - y);
    const a = feather > 0 ? Math.min(1, edge / feather) : 1;
    if (a <= 0) continue;
    const i = (y * W + x) * 4;
    for (let c = 0; c < 4; c++) {
      out.data[i + c] = Math.round(base.data[i + c] * (1 - a) + variant.data[i + c] * a);
    }
  }
}

fs.writeFileSync(outPath, PNG.sync.write(out));
console.log(
  `${outPath}: took ${box.w}x${box.h} at (${box.x},${box.y})` +
    `${box.manual ? " [manual]" : ` [auto, ${box.pct.toFixed(1)}% of frame changed]`}` +
    `, feather ${feather}px — everything outside is ${basePath.split(/[\\/]/).pop()} unchanged`
);
