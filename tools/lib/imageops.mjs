// Shared raster helpers for the puppet tooling.
import { PNG } from "pngjs";

/** Area-average downscale on premultiplied alpha.
 *
 *  Premultiplying is required at these reductions: averaging straight RGBA
 *  lets fully transparent pixels contribute their (usually black) colour to
 *  the average, which puts a dark fringe on every antialiased edge. */
export function resize(src, dw, dh) {
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

/** Source-over composite of src onto dst at (ox, oy). */
export function over(dst, src, ox, oy) {
  for (let y = 0; y < src.height; y++) {
    const dy = Math.round(oy) + y;
    if (dy < 0 || dy >= dst.height) continue;
    for (let x = 0; x < src.width; x++) {
      const dx = Math.round(ox) + x;
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

/** Replace every visible pixel's colour, keeping alpha — the offline twin of
 *  the component's mask + background-colour. Only right for solid silhouettes. */
export function tint(img, hex) {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const out = new PNG({ width: img.width, height: img.height });
  img.data.copy(out.data);
  for (let i = 0; i < out.data.length; i += 4) {
    if (out.data[i + 3] === 0) continue;
    out.data[i] = r;
    out.data[i + 1] = g;
    out.data[i + 2] = b;
  }
  return out;
}

/** HSL adjustment. Matches what CSS saturate()/hue-rotate()/brightness() do
 *  closely enough that the offline preview agrees with the live component. */
export function adjust(img, { saturation = 1, hue = 0, lightness = 1 } = {}) {
  if (saturation === 1 && hue === 0 && lightness === 1) return img;
  const out = new PNG({ width: img.width, height: img.height });
  img.data.copy(out.data);
  for (let i = 0; i < out.data.length; i += 4) {
    if (out.data[i + 3] === 0) continue;
    const r = out.data[i] / 255, g = out.data[i + 1] / 255, b = out.data[i + 2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    let h = 0;
    let s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    if (d !== 0) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h = (h * 60 + 360) % 360;
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
