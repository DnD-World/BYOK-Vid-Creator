// Does the mouth sit on ONE flat region of the base, or does it cross an
// outline / a tonal boundary? That is the concrete version of "must stay on
// the white part of the beard and off the mustache".
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire("C:/Users/strav/Documents/CLAUDE SPACE/BYOK-Vid-Creator/package.json");
const { PNG } = require("pngjs");

const [basePath, x, y, w, h] = process.argv.slice(2);
const base = PNG.sync.read(fs.readFileSync(basePath));
const X = +x, Y = +y, W = +w, H = +h;

const hist = new Map();
let dark = 0, n = 0;
for (let py = Y; py < Y + H; py++) {
  for (let px = X; px < X + W; px++) {
    if (px < 0 || py < 0 || px >= base.width || py >= base.height) continue;
    const i = (py * base.width + px) * 4;
    if (base.data[i + 3] < 128) continue;
    const r = base.data[i], g = base.data[i + 1], b = base.data[i + 2];
    n++;
    // The outline brown in this art is very dark; anything near it is a stroke.
    if (r + g + b < 260) dark++;
    const key = `${r >> 4},${g >> 4},${b >> 4}`;
    hist.set(key, (hist.get(key) || 0) + 1);
  }
}
const top = [...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
console.log(`region ${W}x${H} at (${X},${Y}) over ${basePath.split(/[\\/]/).pop()}`);
console.log(`  outline pixels underneath: ${((dark / n) * 100).toFixed(1)}%  ${dark / n > 0.02 ? "<-- CROSSES A STROKE" : "(clear)"}`);
top.forEach(([k, c]) => {
  const [r, g, b] = k.split(",").map((v) => (+v << 4) + 8);
  console.log(`  ${((c / n) * 100).toFixed(1).padStart(5)}%  rgb(${r},${g},${b})`);
});
