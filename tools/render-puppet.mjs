// ---------------------------------------------------------------------------
// Renders a puppet definition offline, using the same head-relative maths as
// PuppetAvatar.tsx. Two jobs:
//
//   1. Tuning. `--contact` lays out a grid of combinations so placement can be
//      judged without launching the app.
//   2. Fallback. `--cells DIR` writes the nine viseme cells, so the sprite
//      path still works for anything that hasn't moved to live layers.
//
//   node tools/render-puppet.mjs puppet/kaiti.puppet.json --contact out.png
//   node tools/render-puppet.mjs puppet/kaiti.puppet.json --cells viseme-v2 --name kaiti
//
// If this and the component ever disagree, that IS the bug — the geometry is
// specified once, in the puppet JSON, and both sides only apply it.
// ---------------------------------------------------------------------------

import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { resize, over, adjust } from "./lib/imageops.mjs";

const LABELS = ["NEUTRAL", "AH", "EE", "OH", "OO", "MBP", "FV", "L", "CH_SH"];

const argv = process.argv.slice(2);
const puppetPath = argv[0];
const flag = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : d;
};
if (!puppetPath) {
  console.error("usage: node tools/render-puppet.mjs <puppet.json> [--contact out.png] [--cells DIR --name x] [--size N]");
  process.exit(1);
}

const p = JSON.parse(fs.readFileSync(puppetPath, "utf8"));
const SIZE = Number(flag("size", 512));

const cache = new Map();
const load = (f) => {
  if (!cache.has(f)) cache.set(f, PNG.sync.read(fs.readFileSync(path.join(p.dir, f))));
  return cache.get(f);
};

/** One assembled face at SIZE x SIZE. Mirrors PuppetAvatar's layout exactly. */
function renderFace({ viseme = 0, eyes = "open", brow = null }) {
  const canvas = new PNG({ width: SIZE, height: SIZE });
  const base = load(p.base);
  over(canvas, resize(base, SIZE, SIZE), 0, 0);

  const headPx = p.head.w * SIZE;
  const headCx = p.head.cx * SIZE;
  const headCy = p.head.cy * SIZE;
  const pxPerSource = headPx / p.sourceHeadWidth;

  const put = (l) => {
    if (!l) return;
    const w = Math.max(1, Math.round(l.w * pxPerSource * (l.scale ?? 1)));
    const h = Math.max(1, Math.round(l.h * pxPerSource * (l.scale ?? 1)));
    const cx = headCx + l.x * headPx;
    const cy = headCy + l.y * headPx;
    const anchor = l.anchor ?? "center";
    const top = anchor === "top-center" ? cy : anchor === "bottom-center" ? cy - h : cy - h / 2;
    over(canvas, adjust(resize(load(l.file), w, h), l), cx - w / 2, top);
  };

  (p.base_layers ?? []).forEach(put);
  put(p.eyes[eyes] ?? p.eyes.open);
  put(p.pupils);
  if (brow && p.brows[brow]) {
    put(p.brows[brow].left);
    put(p.brows[brow].right);
  }
  (p.extras ?? []).forEach(put);
  put(p.mouths[String(viseme)]);
  return canvas;
}

const contact = flag("contact", null);
if (contact) {
  // Row 1: every mouth. Row 2: eye states. Row 3: brow sets. One image shows
  // whether each axis is placed correctly and, crucially, that they are
  // genuinely independent of one another.
  const cells = [];
  for (let v = 0; v < 9; v++) cells.push({ label: LABELS[v], opts: { viseme: v, brow: "serious" } });
  for (const e of Object.keys(p.eyes)) cells.push({ label: `eyes:${e}`, opts: { viseme: 1, eyes: e, brow: "serious" } });
  for (const b of Object.keys(p.brows)) cells.push({ label: `brow:${b}`, opts: { viseme: 1, brow: b } });

  const COLS = 5;
  const T = 260;
  const rows = Math.ceil(cells.length / COLS);
  const sheet = new PNG({ width: COLS * T, height: rows * T });
  for (let i = 0; i < sheet.data.length; i += 4) {
    sheet.data[i] = sheet.data[i + 1] = sheet.data[i + 2] = 24;
    sheet.data[i + 3] = 255;
  }
  cells.forEach((c, n) => {
    const face = renderFace(c.opts);
    over(sheet, resize(face, T, T), (n % COLS) * T, Math.floor(n / COLS) * T);
  });
  fs.writeFileSync(contact, PNG.sync.write(sheet));
  console.log(`${cells.length} combinations -> ${contact}`);
  console.log("  " + cells.map((c) => c.label).join(", "));
}

const cellsDir = flag("cells", null);
if (cellsDir) {
  const name = flag("name", p.name.replace(/\W/g, "").toLowerCase());
  fs.mkdirSync(cellsDir, { recursive: true });
  for (let v = 0; v < 9; v++) {
    const face = renderFace({ viseme: v, brow: flag("brow", "serious") });
    const out = path.join(cellsDir, `${name}_${v}_${LABELS[v]}.png`);
    fs.writeFileSync(out, PNG.sync.write(face));
  }
  console.log(`9 cells -> ${cellsDir} (${SIZE}px)`);
}
