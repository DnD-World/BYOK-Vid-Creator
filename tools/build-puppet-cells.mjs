// ---------------------------------------------------------------------------
// Composites a layered puppet (base body + eyes + brows + one mouth per
// viseme) into the nine flat cells build-viseme-sheet.mjs expects.
//
//   node tools/build-puppet-cells.mjs <config.json> [--preview out.png]
//
// The layer PNGs were exported from Photoshop with "Trim Layers" ON, which
// crops each one to its own bounding box and throws away where it sat. The
// PSD is gone, so those offsets are not recoverable — but they don't need to
// be. Every mouth was drawn in the same place on the same face, so ONE
// placement per category (mouth, eyes, brows) puts all of them right, as long
// as each is anchored by a landmark that is stable across the set.
//
// For mouths that landmark is the top-centre. The upper lip barely moves while
// the jaw drops, so bbox-top is stable where bbox-centre is not: anchoring an
// open mouth and a closed mouth by their centres would see the closed one
// float halfway up the face.
//
// Config shape — see docs/PUPPET-CELLS.md for a worked example.
// ---------------------------------------------------------------------------

import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";

const LABELS = ["NEUTRAL", "AH", "EE", "OH", "OO", "MBP", "FV", "L", "CH_SH"];

const configPath = process.argv[2];
if (!configPath) {
  console.error("usage: node tools/build-puppet-cells.mjs <config.json> [--preview out.png]");
  process.exit(1);
}
const previewIdx = process.argv.indexOf("--preview");
const previewPath = previewIdx >= 0 ? process.argv[previewIdx + 1] : null;

const cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));
const partsDir = cfg.parts ?? ".";
/** Layer files are named relative to `parts`; the base is a path in its own
 *  right. Resolving both against `parts` turns "viseme/kaiti.png" into
 *  "viseme/viseme/kaiti.png", which is only obvious once it fails. */
const readPart = (f) => PNG.sync.read(fs.readFileSync(path.isAbsolute(f) ? f : path.join(partsDir, f)));
const readFile = (f) => PNG.sync.read(fs.readFileSync(f));

// --- image ops --------------------------------------------------------------

/** Area-average downscale, done on premultiplied alpha.
 *
 *  Premultiplying is not optional at this reduction. Averaging straight RGBA
 *  lets fully transparent pixels — which still carry a colour, usually black —
 *  drag the average toward that colour, and every antialiased edge in the set
 *  picks up a dark fringe. At ~10x reduction that fringe is most of the edge. */
function resize(src, dw, dh) {
  const out = new PNG({ width: dw, height: dh });
  const xr = src.width / dw;
  const yr = src.height / dh;
  for (let y = 0; y < dh; y++) {
    const y0 = Math.floor(y * yr);
    const y1 = Math.min(src.height, Math.max(y0 + 1, Math.floor((y + 1) * yr)));
    for (let x = 0; x < dw; x++) {
      const x0 = Math.floor(x * xr);
      const x1 = Math.min(src.width, Math.max(x0 + 1, Math.floor((x + 1) * xr)));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const i = (sy * src.width + sx) * 4;
          const sa = src.data[i + 3] / 255;
          r += src.data[i] * sa;
          g += src.data[i + 1] * sa;
          b += src.data[i + 2] * sa;
          a += sa;
          n++;
        }
      }
      const o = (y * dw + x) * 4;
      if (a > 0) {
        out.data[o] = Math.round(r / a);
        out.data[o + 1] = Math.round(g / a);
        out.data[o + 2] = Math.round(b / a);
      }
      out.data[o + 3] = Math.round((a / n) * 255);
    }
  }
  return out;
}

/** Bounding box of pixels with meaningful alpha. */
function bbox(img) {
  let minX = img.width, minY = img.height, maxX = -1, maxY = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (img.data[(y * img.width + x) * 4 + 3] > 16) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** Saturation / hue / lightness adjustment, luminance-aware.
 *
 *  Desaturation is how the pink human mouths become dog mouths: the teeth and
 *  gums are already near-neutral, so pulling saturation down lands almost
 *  entirely on the lips and tongue, which is exactly the intent. */
function adjust(img, { saturation = 1, hue = 0, lightness = 1 } = {}) {
  if (saturation === 1 && hue === 0 && lightness === 1) return img;
  const out = new PNG({ width: img.width, height: img.height });
  img.data.copy(out.data);
  for (let i = 0; i < out.data.length; i += 4) {
    if (out.data[i + 3] === 0) continue;
    let r = out.data[i] / 255, g = out.data[i + 1] / 255, b = out.data[i + 2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0;
    const l = (max + min) / 2;
    const d = max - min;
    let s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    if (d !== 0) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    h = (h + hue + 360) % 360;
    s = Math.max(0, Math.min(1, s * saturation));
    const L = Math.max(0, Math.min(1, l * lightness));
    const c = (1 - Math.abs(2 * L - 1)) * s;
    const xx = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = L - c / 2;
    let rr, gg, bb;
    if (h < 60) [rr, gg, bb] = [c, xx, 0];
    else if (h < 120) [rr, gg, bb] = [xx, c, 0];
    else if (h < 180) [rr, gg, bb] = [0, c, xx];
    else if (h < 240) [rr, gg, bb] = [0, xx, c];
    else if (h < 300) [rr, gg, bb] = [xx, 0, c];
    else [rr, gg, bb] = [c, 0, xx];
    out.data[i] = Math.round((rr + m) * 255);
    out.data[i + 1] = Math.round((gg + m) * 255);
    out.data[i + 2] = Math.round((bb + m) * 255);
  }
  return out;
}

/** Standard source-over composite. */
function over(dst, src, ox, oy) {
  for (let y = 0; y < src.height; y++) {
    const dy = oy + y;
    if (dy < 0 || dy >= dst.height) continue;
    for (let x = 0; x < src.width; x++) {
      const dx = ox + x;
      if (dx < 0 || dx >= dst.width) continue;
      const si = (y * src.width + x) * 4;
      const sa = src.data[si + 3] / 255;
      if (sa === 0) continue;
      const di = (dy * dst.width + dx) * 4;
      const da = dst.data[di + 3] / 255;
      const oa = sa + da * (1 - sa);
      for (let c = 0; c < 3; c++) {
        dst.data[di + c] = Math.round(
          (src.data[si + c] * sa + dst.data[di + c] * da * (1 - sa)) / (oa || 1)
        );
      }
      dst.data[di + 3] = Math.round(oa * 255);
    }
  }
}

/** Place a layer: scale it, then position it by its own bounding box so the
 *  named landmark lands on (x, y). */
function place(dst, spec, reportName) {
  const src = readPart(spec.file);
  const scale = spec.scale ?? 1;
  const scaled = scale === 1 ? src : resize(src, Math.max(1, Math.round(src.width * scale)), Math.max(1, Math.round(src.height * scale)));
  const tinted = adjust(scaled, spec);
  const b = bbox(tinted);
  if (!b) {
    console.warn(`  ${reportName}: layer is empty, skipped`);
    return null;
  }
  const anchor = spec.anchor ?? "center";
  let ax = b.x + b.w / 2;
  let ay = b.y + b.h / 2;
  if (anchor.includes("top")) ay = b.y;
  if (anchor.includes("bottom")) ay = b.y + b.h;
  if (anchor.includes("left")) ax = b.x;
  if (anchor.includes("right")) ax = b.x + b.w;
  const ox = Math.round(spec.x - ax);
  const oy = Math.round(spec.y - ay);
  over(dst, tinted, ox, oy);
  return { name: reportName, w: b.w, h: b.h, ox: ox + b.x, oy: oy + b.y };
}

// --- build ------------------------------------------------------------------

const base = readFile(cfg.base);
console.log(`base ${cfg.base} ${base.width}x${base.height}`);

fs.mkdirSync(cfg.out, { recursive: true });
const cells = [];

for (let i = 0; i < 9; i++) {
  const mouthFile = cfg.visemes?.[String(i)] ?? cfg.visemes?.[LABELS[i]];
  if (!mouthFile) continue;

  const cell = new PNG({ width: base.width, height: base.height });
  base.data.copy(cell.data);

  const placed = [];
  for (const layer of cfg.layers ?? []) {
    const r = place(cell, layer, layer.file);
    if (r) placed.push(r);
  }
  const r = place(cell, { ...cfg.mouth, file: mouthFile }, mouthFile);
  if (r) placed.push(r);

  const outFile = path.join(cfg.out, `${cfg.character}_${i}_${LABELS[i]}.png`);
  fs.writeFileSync(outFile, PNG.sync.write(cell));
  cells.push({ file: outFile, cell, label: LABELS[i], mouth: mouthFile, box: r });
  console.log(
    `${LABELS[i].padEnd(8)} <- ${path.basename(mouthFile).padEnd(24)} ` +
      `mouth drawn ${r ? `${r.w}x${r.h} at (${r.ox},${r.oy})` : "MISSING"}`
  );
}

if (previewPath && cells.length) {
  const COLS = 3;
  const T = 300;
  const rows = Math.ceil(cells.length / COLS);
  const sheet = new PNG({ width: COLS * T, height: rows * T });
  for (let i = 0; i < sheet.data.length; i += 4) {
    sheet.data[i] = sheet.data[i + 1] = sheet.data[i + 2] = 26;
    sheet.data[i + 3] = 255;
  }
  cells.forEach((c, n) => {
    const small = resize(c.cell, T, T);
    over(sheet, small, (n % COLS) * T, Math.floor(n / COLS) * T);
  });
  fs.writeFileSync(previewPath, PNG.sync.write(sheet));
  console.log(`\npreview -> ${previewPath}`);
}

console.log(`\n${cells.length} cells -> ${cfg.out}`);
console.log(`next: node tools/build-viseme-sheet.mjs ${cfg.out} ./viseme-sheets-v2`);
