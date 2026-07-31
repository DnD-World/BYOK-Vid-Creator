// ---------------------------------------------------------------------------
// A radix-2 FFT and a log-spaced band mapping, which is all the spectrum
// analysis this app needs.
//
// No dependency on purpose: this runs in the Electron main process where the
// narration WAV already lives in memory, and the whole job is ~30 lines of
// butterflies. Pulling in an audio library to get them would be a much larger
// surface for a much smaller benefit.
//
// Bands are log-spaced because pitch is: the ear hears 100->200Hz as the same
// distance as 1000->2000Hz. Linear bands would spend most of the ring on the
// top two octaves, where speech has almost no energy, and the result would
// look like the bars near one end never move.
// ---------------------------------------------------------------------------

/** Bit-reversal permutation table for a given size. Computed once per size. */
function reverseBits(n: number): Uint32Array {
  const bits = Math.log2(n);
  const rev = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    let r = 0;
    for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
    rev[i] = r;
  }
  return rev;
}

export class Fft {
  readonly size: number;
  private readonly rev: Uint32Array;
  private readonly cos: Float64Array;
  private readonly sin: Float64Array;
  private readonly re: Float64Array;
  private readonly im: Float64Array;
  /** Hann window — without it every window boundary is a discontinuity, which
   *  smears energy across every band and flattens the spectrum into mush. */
  private readonly window: Float64Array;

  constructor(size: number) {
    if ((size & (size - 1)) !== 0) throw new Error("FFT size must be a power of two");
    this.size = size;
    this.rev = reverseBits(size);
    this.cos = new Float64Array(size / 2);
    this.sin = new Float64Array(size / 2);
    for (let i = 0; i < size / 2; i++) {
      this.cos[i] = Math.cos((-2 * Math.PI * i) / size);
      this.sin[i] = Math.sin((-2 * Math.PI * i) / size);
    }
    this.re = new Float64Array(size);
    this.im = new Float64Array(size);
    this.window = new Float64Array(size);
    for (let i = 0; i < size; i++) {
      this.window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
    }
  }

  /**
   * Magnitude spectrum of `size` samples starting at `from` in `mono`, written
   * into `out` (length size/2). Reads outside the signal count as silence, so
   * the first and last frames need no special case.
   */
  magnitudes(mono: Float32Array, from: number, out: Float64Array): void {
    const { size, re, im, rev, window, cos, sin } = this;

    for (let i = 0; i < size; i++) {
      const s = from + i;
      const v = s >= 0 && s < mono.length ? mono[s] * window[i] : 0;
      re[rev[i]] = v;
      im[rev[i]] = 0;
    }

    for (let len = 2; len <= size; len <<= 1) {
      const half = len >> 1;
      const step = size / len;
      for (let i = 0; i < size; i += len) {
        for (let j = 0; j < half; j++) {
          const k = j * step;
          const wr = cos[k];
          const wi = sin[k];
          const a = i + j;
          const b = a + half;
          const tr = re[b] * wr - im[b] * wi;
          const ti = re[b] * wi + im[b] * wr;
          re[b] = re[a] - tr;
          im[b] = im[a] - ti;
          re[a] += tr;
          im[a] += ti;
        }
      }
    }

    for (let i = 0; i < size / 2; i++) {
      out[i] = Math.hypot(re[i], im[i]);
    }
  }
}

/**
 * Log-spaced bin ranges, one per band, covering `loHz`..`hiHz`. Every band gets
 * at least one bin: at the bottom of the range the log spacing is finer than
 * the FFT's own resolution, and a band with no bins would be a bar that is
 * permanently dead.
 */
export function bandBins(
  bandCount: number,
  fftSize: number,
  sampleRate: number,
  loHz: number,
  hiHz: number
): { from: number; to: number }[] {
  const binHz = sampleRate / fftSize;
  const maxBin = fftSize / 2 - 1;
  const hi = Math.min(hiHz, sampleRate * 0.45);
  const ranges: { from: number; to: number }[] = [];
  let prevTop = Math.max(1, Math.floor(loHz / binHz));

  for (let b = 0; b < bandCount; b++) {
    const upperHz = loHz * Math.pow(hi / loHz, (b + 1) / bandCount);
    let top = Math.min(maxBin, Math.round(upperHz / binHz));
    if (top < prevTop) top = prevTop;
    ranges.push({ from: prevTop, to: Math.max(prevTop, top) });
    prevTop = Math.min(maxBin, top + 1);
  }
  return ranges;
}
