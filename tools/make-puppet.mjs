// ---------------------------------------------------------------------------
// Turns a compact author spec into a runtime puppet definition.
//
//   node tools/make-puppet.mjs puppet/kaiti.spec.json puppet/kaiti.puppet.json
//
// The only thing it adds is each layer's own pixel dimensions, read from the
// PNGs. Those live in the runtime file so the app never has to wait for an
// image to load before it knows how big to draw it — which matters most in a
// render worker, where a layout that settles one frame late is a frame that
// shipped wrong.
//
// It also validates: every referenced file must exist, and the numbers that
// have to be there must be there. A puppet that half-loads is much harder to
// diagnose than one that refuses to build.
// ---------------------------------------------------------------------------

import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";

const [specPath, outPath] = process.argv.slice(2);
if (!specPath || !outPath) {
  console.error("usage: node tools/make-puppet.mjs <spec.json> <out.puppet.json>");
  process.exit(1);
}

const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
const dir = spec.dir;
if (!dir) {
  console.error("FAIL — spec needs a `dir` (folder holding the base and layers)");
  process.exit(1);
}

const dims = new Map();
let missing = 0;
function stamp(layer, where) {
  if (!layer) return layer;
  if (!layer.file) {
    console.error(`FAIL — ${where}: layer has no "file"`);
    missing++;
    return layer;
  }
  const full = path.join(dir, layer.file);
  if (!dims.has(layer.file)) {
    if (!fs.existsSync(full)) {
      console.error(`FAIL — ${where}: ${layer.file} not found in ${dir}`);
      missing++;
      return layer;
    }
    const png = PNG.sync.read(fs.readFileSync(full));
    dims.set(layer.file, { w: png.width, h: png.height });
  }
  const d = dims.get(layer.file);
  if (typeof layer.x !== "number" || typeof layer.y !== "number") {
    console.error(`FAIL — ${where}: ${layer.file} needs x and y (head-width offsets)`);
    missing++;
  }
  return { ...layer, w: d.w, h: d.h };
}

// The spec's `dir` is relative to the repo root, because that is where the
// tools are run from. The RUNTIME file has no such luxury: the app loads it
// from an arbitrary path the user picked in a file dialog, with no notion of a
// repo root at all. So it carries `dir` relative to ITS OWN location, which
// makes the puppet folder movable as a unit and leaves only one thing for a
// loader to do — resolve against the file it just read.
const relDir = path
  .relative(path.dirname(path.resolve(outPath)), path.resolve(dir))
  .split(path.sep)
  .join("/");

const out = {
  name: spec.name,
  base: spec.base,
  dir: relDir || ".",
  head: spec.head,
  sourceHeadWidth: spec.sourceHeadWidth,
  base_layers: (spec.base_layers ?? []).map((l, i) => stamp(l, `base_layers[${i}]`)),
  eyes: {
    whites: stamp(spec.eyes?.whites, "eyes.whites"),
    pupilLeft: spec.eyes?.pupilLeft ? stamp(spec.eyes.pupilLeft, "eyes.pupilLeft") : undefined,
    pupilRight: spec.eyes?.pupilRight ? stamp(spec.eyes.pupilRight, "eyes.pupilRight") : undefined,
    lids: Object.fromEntries(
      Object.entries(spec.eyes?.lids ?? {}).map(([k, l]) => [k, stamp(l, `eyes.lids.${k}`)])
    ),
  },
  brows: Object.fromEntries(
    Object.entries(spec.brows ?? {}).map(([k, b]) => [
      k,
      { left: stamp(b.left, `brows.${k}.left`), right: stamp(b.right, `brows.${k}.right`) },
    ])
  ),
  extras: (spec.extras ?? []).map((l, i) => stamp(l, `extras[${i}]`)),
  // All nine mouths share a placement and differ only in which file they use,
  // so the spec states it once. Writing x/y/anchor/scale nine times is nine
  // chances for one of them to drift.
  mouths: Object.fromEntries(
    Object.entries(spec.mouths ?? {}).map(([k, l]) => [
      k,
      stamp({ ...(spec.mouthDefaults ?? {}), ...(typeof l === "string" ? { file: l } : l) }, `mouths.${k}`),
    ])
  ),
};

if (!fs.existsSync(path.join(dir, spec.base))) {
  console.error(`FAIL — base ${spec.base} not found in ${dir}`);
  missing++;
}
if (!out.head || typeof out.head.w !== "number") {
  console.error("FAIL — spec needs head: { cx, cy, w } as fractions of the base image");
  missing++;
}
if (!out.sourceHeadWidth) {
  console.error("FAIL — spec needs sourceHeadWidth (source px per head width)");
  missing++;
}
if (!out.eyes.whites) {
  console.error("FAIL — spec needs eyes.whites (the eye white, drawn under the lids)");
  missing++;
}
if (!out.eyes.lids?.open) {
  console.error("FAIL — spec needs eyes.lids.open");
  missing++;
}
for (let i = 0; i < 9; i++) {
  if (!out.mouths[String(i)]) {
    console.error(`FAIL — mouths is missing viseme ${i}`);
    missing++;
  }
}

if (missing > 0) {
  console.error(`\n${missing} problem(s); nothing written.`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));

const lids = Object.keys(out.eyes.lids).length;
const brows = Math.max(1, Object.keys(out.brows).length);
console.log(
  `${out.name}: ${dims.size} layers, head ${(out.head.w * 100).toFixed(0)}% of base width, ` +
    `${lids} lid state(s), ${brows} brow set(s)`
);
// Lids and brows are per-EYE and per-SIDE, so they square rather than multiply.
console.log(
  `  combinations: 9 mouths x ${lids}^2 lids x ${brows}^2 brows = ` +
    `${9 * lids * lids * brows * brows} faces`
);
console.log(`-> ${outPath}`);
