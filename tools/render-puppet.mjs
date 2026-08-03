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
import { resize, over, adjust, tint } from "./lib/imageops.mjs";

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
function renderFace({ viseme = 0, eyes = {}, brow = null }) {
  const canvas = new PNG({ width: SIZE, height: SIZE });
  const base = load(p.base);
  over(canvas, resize(base, SIZE, SIZE), 0, 0);

  const headPx = p.head.w * SIZE;
  const headCx = p.head.cx * SIZE;
  const headCy = p.head.cy * SIZE;
  const pxPerSource = headPx / p.sourceHeadWidth;

  const put = (l) => {
    if (!l) return;
    const mul = pxPerSource * (l.scale ?? 1);
    const fullW = Math.max(2, Math.round(l.w * mul * (l.scaleX ?? 1)));
    const h = Math.max(1, Math.round(l.h * mul * (l.scaleY ?? 1)));
    let scaled = adjust(resize(load(l.file), fullW, h), l);
    if (l.tint) scaled = tint(scaled, l.tint);

    const cx = headCx + l.x * headPx;
    const cy = headCy + l.y * headPx;
    const anchor = l.anchor ?? "center";
    const top = anchor === "top-center" ? cy : anchor === "bottom-center" ? cy - h : cy - h / 2;

    if (!l.split) {
      over(canvas, scaled, cx - fullW / 2, top);
      return;
    }
    // Keep the half where it sat in the pair.
    const halfW = Math.floor(fullW / 2);
    const piece = new PNG({ width: halfW, height: h });
    PNG.bitblt(scaled, piece, l.split === "right" ? fullW - halfW : 0, 0, halfW, h, 0, 0);
    const pieceCx = cx + (l.split === "left" ? -fullW / 4 : fullW / 4);
    over(canvas, piece, pieceCx - halfW / 2, top);
  };

  (p.base_layers ?? []).forEach(put);
  put(p.eyes.whites);
  put(p.eyes.pupilLeft);
  put(p.eyes.pupilRight);
  const lids = p.eyes.lids;
  put({ ...(lids[eyes.left] ?? lids.open), split: "left" });
  put({ ...(lids[eyes.right] ?? lids.open), split: "right" });
  if (brow) {
    put(p.brows[brow.left ?? brow]?.left);
    put(p.brows[brow.right ?? brow]?.right);
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
  const lidNames = Object.keys(p.eyes.lids);
  const browNames = Object.keys(p.brows);
  const cells = [];
  for (let v = 0; v < 9; v++) cells.push({ label: LABELS[v], opts: { viseme: v, brow: "serious" } });
  for (const e of lidNames) {
    cells.push({ label: `lids:${e}`, opts: { viseme: 1, eyes: { left: e, right: e }, brow: "serious" } });
  }
  // The point of splitting the lid pair: each eye can differ.
  if (lidNames.includes("closed")) {
    cells.push({ label: "wink", opts: { viseme: 1, eyes: { left: "closed", right: "open" }, brow: "serious" } });
  }
  for (const b of browNames) cells.push({ label: `brow:${b}`, opts: { viseme: 1, brow: b } });
  // Same for brows: a different mood per side is the sceptical raised brow.
  if (browNames.includes("angry") && browNames.includes("serious")) {
    cells.push({ label: "brow:sceptical", opts: { viseme: 1, brow: { left: "angry", right: "serious" } } });
  }

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

// --one "viseme,lidL,lidR,browL,browR" — a single face, big, for close reading.
const one = flag("one", null);
if (one) {
  const [v, lL, lR, bL, bR] = one.split(",").map((s) => s.trim());
  const face = renderFace({
    viseme: Number(v) || 0,
    eyes: { left: lL || "open", right: lR || "open" },
    brow: { left: bL || "serious", right: bR || bL || "serious" },
  });
  const out = flag("out", "one.png");
  fs.writeFileSync(out, PNG.sync.write(face));
  console.log(`face [${one}] -> ${out} (${SIZE}px)`);
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
