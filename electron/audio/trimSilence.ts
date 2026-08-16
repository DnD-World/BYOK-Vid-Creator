// ---------------------------------------------------------------------------
// Cutting the dead air off the ends of a synthesised line.
//
// WHY THIS MATTERS MORE THAN IT SOUNDS. Every engine leaves a little silence at
// the start and end of what it produces — a fifth of a second here, a third
// there, and it varies per line. The app then places its own pauses between
// segments deliberately: a breath within a speaker's turn, a longer beat when
// the turn changes. Untrimmed audio means those pauses are the engine's
// leftovers PLUS ours, so the rhythm is nobody's decision.
//
// The cost compounds. Subtitle cues and viseme tracks are both built from
// segment boundaries, so silence inside a segment shifts every word and every
// mouth shape inside it. Over one line nobody would notice. Over a hundred and
// sixty lines of a five minute lesson it is the difference between lip-sync
// that holds and lip-sync that slides.
//
// DELIBERATELY CONSERVATIVE. It trims only leading and trailing silence, never
// anything in the middle — a pause a speaker actually took is performance, and
// removing it would flatten exactly the expressiveness DramaBox is being chosen
// for. A little padding is left at each end so a consonant that starts quietly
// is never clipped.
// ---------------------------------------------------------------------------

/** Everything a WAV header tells us that matters here. */
interface WavInfo {
  numChannels: number;
  sampleRate: number;
  bitsPerSample: number;
  dataStart: number;
  dataSize: number;
}

/** Walk the RIFF chunks to find `data`. It is not always at a fixed offset:
 *  engines that write a LIST or fact chunk push it along, and assuming 44 bytes
 *  reads the tail of the header as audio. */
function readWav(buf: Buffer): WavInfo | null {
  if (buf.length < 44 || buf.toString("ascii", 0, 4) !== "RIFF") return null;
  const numChannels = buf.readUInt16LE(22);
  const sampleRate = buf.readUInt32LE(24);
  const bitsPerSample = buf.readUInt16LE(34);

  let pos = 12;
  while (pos + 8 <= buf.length) {
    const id = buf.toString("ascii", pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    if (id === "data") {
      return {
        numChannels,
        sampleRate,
        bitsPerSample,
        dataStart: pos + 8,
        dataSize: Math.min(size, buf.length - pos - 8),
      };
    }
    pos += 8 + size + (size % 2);
  }
  return null;
}

export interface TrimOptions {
  /** Anything quieter than this counts as silence, in dBFS. -45 is below room
   *  tone and well below a breath, so speech is never mistaken for silence. */
  thresholdDb?: number;
  /** Kept at each end, in ms. A plosive or a soft "s" ramps up from nothing,
   *  and cutting to the exact first loud sample shaves its attack off.
   *
   *  120, not 30. At 30 the line starts the instant the file does, and Ak
   *  heard it as clipped — a voice needs a moment of air in front of it before
   *  it sounds like a person rather than a button being pressed. */
  padMs?: number;
}

export interface TrimResult {
  buffer: Buffer;
  /** How much came off each end, for logging. Silence nobody asked for is
   *  worth being able to see the size of. */
  leadMsRemoved: number;
  tailMsRemoved: number;
}

export interface SqueezeOptions extends TrimOptions {
  /** A gap has to be at least this long before it is touched, in ms. Below it,
   *  a pause is punctuation and belongs to the performance.
   *
   *  Raised from 350 after the first pass came out too tight. */
  minPauseMs?: number;
  /** What a long gap is shortened TO, in ms. Not to zero — running two
   *  sentences together is worse than the gap was.
   *
   *  Raised from 180 for the same reason. The first version left the speech
   *  correct and the rhythm hurried. */
  keepMs?: number;
}

export interface SqueezeResult {
  buffer: Buffer;
  /** How many gaps were shortened, and by how much in total. */
  gapsShortened: number;
  msRemoved: number;
}

/**
 * Shorten the long gaps INSIDE a synthesised line.
 *
 * WHY THIS EXISTS, AGAINST THE ADVICE DIRECTLY ABOVE. Trimming was written to
 * touch only the ends, on the grounds that a pause a speaker took is
 * performance. That holds when the pause was a choice. It is not what DramaBox
 * produces: generation is given a duration ESTIMATED from the text and then
 * multiplied by 1.1 for headroom, and the surplus has to go somewhere. Measured
 * on the first audition: a 9.6s file whose speech does not begin until 3.2s,
 * and an 8.0s file carrying 2.45s of dead air in three stretches — thirty per
 * cent of it. Ak heard exactly that and called it unnatural, which it is.
 *
 * So this shortens rather than removes: gaps under `minPauseMs` are left
 * completely alone, and anything longer is cut back to `keepMs` rather than to
 * nothing. A real beat survives; a hole does not.
 *
 * The cure for the cause is `duration_multiplier`, which lives on the other
 * side of a GPU. This is the local half, and it works whatever the engine does.
 */
export function squeezeSilence(buf: Buffer, opts: SqueezeOptions = {}): SqueezeResult {
  const untouched = { buffer: buf, gapsShortened: 0, msRemoved: 0 };
  const info = readWav(buf);
  if (!info || info.bitsPerSample !== 16) return untouched;

  const { numChannels, sampleRate, dataStart, dataSize } = info;
  const bytesPerFrame = numChannels * 2;
  const frames = Math.floor(dataSize / bytesPerFrame);
  if (frames === 0) return untouched;

  const threshold = 32768 * Math.pow(10, (opts.thresholdDb ?? -45) / 20);
  const minPause = Math.round(((opts.minPauseMs ?? 450) / 1000) * sampleRate);
  const keep = Math.round(((opts.keepMs ?? 280) / 1000) * sampleRate);
  if (keep >= minPause) return untouched;

  const peakAt = (frame: number): number => {
    let peak = 0;
    const base = dataStart + frame * bytesPerFrame;
    for (let c = 0; c < numChannels; c++) {
      const v = Math.abs(buf.readInt16LE(base + c * 2));
      if (v > peak) peak = v;
    }
    return peak;
  };

  // Collect the quiet runs first, then rebuild once. Splicing as we go would
  // invalidate every index we had not looked at yet.
  const gaps: { from: number; to: number }[] = [];
  let run = -1;
  for (let f = 0; f < frames; f++) {
    if (peakAt(f) < threshold) {
      if (run < 0) run = f;
    } else if (run >= 0) {
      if (f - run >= minPause) gaps.push({ from: run, to: f - 1 });
      run = -1;
    }
  }
  // A trailing run is left to trimSilence — the ends are its job, and halving
  // the tail here would leave 180ms of hiss that trimming would then remove
  // anyway, twice as slowly.
  if (gaps.length === 0) return untouched;

  const pieces: Buffer[] = [];
  let cursor = 0;
  let removed = 0;
  for (const gap of gaps) {
    // Everything up to the gap, then the shortened gap itself. Keeping a slice
    // OF THE GAP rather than inserting zeros preserves the room tone, so the
    // join does not read as a digital dropout.
    pieces.push(buf.subarray(
      dataStart + cursor * bytesPerFrame,
      dataStart + (gap.from + keep) * bytesPerFrame
    ));
    removed += gap.to - gap.from + 1 - keep;
    cursor = gap.to + 1;
  }
  pieces.push(buf.subarray(dataStart + cursor * bytesPerFrame, dataStart + frames * bytesPerFrame));

  const audio = Buffer.concat(pieces);
  const header = Buffer.from(buf.subarray(0, dataStart));
  header.writeUInt32LE(audio.length, dataStart - 4);
  header.writeUInt32LE(header.length + audio.length - 8, 4);

  return {
    buffer: Buffer.concat([header, audio]),
    gapsShortened: gaps.length,
    msRemoved: Math.round((removed * 1000) / sampleRate),
  };
}

/**
 * Trim leading and trailing silence from one 16-bit PCM WAV.
 *
 * Returns the input untouched if it cannot be parsed, is not 16-bit, or turns
 * out to be silent end to end. A line that is genuinely silent is a synthesis
 * failure worth seeing in the render rather than a zero-length segment that
 * quietly desynchronises everything after it.
 */
export function trimSilence(buf: Buffer, opts: TrimOptions = {}): TrimResult {
  const untouched = { buffer: buf, leadMsRemoved: 0, tailMsRemoved: 0 };
  const info = readWav(buf);
  if (!info || info.bitsPerSample !== 16) return untouched;

  const { numChannels, sampleRate, dataStart, dataSize } = info;
  const bytesPerFrame = numChannels * 2;
  const frames = Math.floor(dataSize / bytesPerFrame);
  if (frames === 0) return untouched;

  const threshold = 32768 * Math.pow(10, (opts.thresholdDb ?? -45) / 20);

  /** Loudest sample in a frame, across channels — a stereo line with one silent
   *  channel is not silence. */
  const peakAt = (frame: number): number => {
    let peak = 0;
    const base = dataStart + frame * bytesPerFrame;
    for (let c = 0; c < numChannels; c++) {
      const v = Math.abs(buf.readInt16LE(base + c * 2));
      if (v > peak) peak = v;
    }
    return peak;
  };

  // TWO THRESHOLDS, AND THIS IS THE WHOLE POINT.
  //
  // Cutting at the first sample louder than one threshold ate the first word.
  // A word does not start at its loudest — it ramps up, and a soft opening
  // consonant can sit under any threshold set high enough to ignore room tone.
  // On a real generation that cost 590ms: the voice began at 3.20s, the level
  // only crossed the threshold at 3.79s, and the cut landed in the middle of
  // the word.
  //
  // So: find where the voice is UNAMBIGUOUSLY speaking, then walk backwards to
  // where it came up out of the noise, and cut there. The loud threshold only
  // decides where to start looking; the quiet one decides where to cut.
  // 25dB below, not 18. Measured on a real line: room tone sits at -76dB and
  // the first word ramps up through -68 and -49 before reaching full level. A
  // floor of -63 started the cut halfway up that ramp; -70 catches the whole
  // of it and still sits comfortably above the room tone.
  const floor = 32768 * Math.pow(10, ((opts.thresholdDb ?? -45) - 25) / 20);

  // MEASURED IN WINDOWS, NOT SAMPLES, and that distinction is the bug this
  // had. Speech crosses zero constantly, so individual samples sit at silence
  // all the way through a loud vowel. Walking back sample by sample therefore
  // stopped at the first zero crossing — about a millisecond — and the backtrack
  // did nothing at all. Over a 10ms window a vowel is never quiet.
  const win = Math.max(1, Math.round(0.01 * sampleRate));
  const windows = Math.ceil(frames / win);
  const winPeak = (w: number): number => {
    let p = 0;
    const from = w * win;
    const to = Math.min(frames, from + win);
    for (let f = from; f < to; f++) {
      const v = peakAt(f);
      if (v > p) p = v;
    }
    return p;
  };

  let loudWin = 0;
  while (loudWin < windows && winPeak(loudWin) < threshold) loudWin++;
  if (loudWin === windows) return untouched; // silent throughout

  // Back to where the voice came up out of the noise. The loud threshold only
  // says where to start looking; this decides where to cut, and it is why the
  // first word survives.
  let firstWin = loudWin;
  while (firstWin > 0 && winPeak(firstWin - 1) >= floor) firstWin--;

  let lastLoudWin = windows - 1;
  while (lastLoudWin > loudWin && winPeak(lastLoudWin) < threshold) lastLoudWin--;
  let lastWin = lastLoudWin;
  while (lastWin < windows - 1 && winPeak(lastWin + 1) >= floor) lastWin++;

  const first = firstWin * win;
  const last = Math.min(frames - 1, (lastWin + 1) * win - 1);

  const pad = Math.round(((opts.padMs ?? 200) / 1000) * sampleRate);
  const start = Math.max(0, first - pad);
  const end = Math.min(frames - 1, last + pad);
  const keptFrames = end - start + 1;
  if (keptFrames >= frames) return untouched;

  const header = Buffer.from(buf.subarray(0, dataStart));
  const audio = Buffer.from(
    buf.subarray(dataStart + start * bytesPerFrame, dataStart + (end + 1) * bytesPerFrame)
  );

  // Both sizes in the header have to move: the data chunk's own, and RIFF's
  // total. A player that trusts the RIFF size and finds less audio than it
  // promises will pad the difference with whatever was in memory.
  header.writeUInt32LE(audio.length, dataStart - 4);
  header.writeUInt32LE(header.length + audio.length - 8, 4);

  const msPerFrame = 1000 / sampleRate;
  return {
    buffer: Buffer.concat([header, audio]),
    leadMsRemoved: Math.round(start * msPerFrame),
    tailMsRemoved: Math.round((frames - 1 - end) * msPerFrame),
  };
}

/** Where the quiet stretches are, in ms from the start of the buffer.
 *
 *  Used to find the joins between two pieces of speech inside one generation.
 *  DramaBox is given a block as `<verb>, "line one" She <verb>, "line two"` and
 *  it puts a real pause at that comma — so the pause is where the line actually
 *  changes, and it is measurable. The alternative, dividing the block by how
 *  many letters each line has, assumes everyone speaks at exactly the same rate
 *  and was visibly wrong in the first lesson's subtitles. */
export function findGaps(
  buf: Buffer,
  opts: { minMs?: number; thresholdDb?: number } = {}
): { startMs: number; endMs: number }[] {
  const info = readWav(buf);
  if (!info || info.bitsPerSample !== 16) return [];
  const { numChannels, sampleRate, dataStart, dataSize } = info;
  const bytesPerFrame = numChannels * 2;
  const frames = Math.floor(dataSize / bytesPerFrame);
  const threshold = 32768 * Math.pow(10, (opts.thresholdDb ?? -42) / 20);
  const minFrames = Math.round(((opts.minMs ?? 120) / 1000) * sampleRate);

  // Windowed, for the same reason the trim is: speech crosses zero constantly,
  // so a per-sample test finds a "gap" in the middle of every vowel.
  const win = Math.max(1, Math.round(0.01 * sampleRate));
  const quiet: boolean[] = [];
  for (let w = 0; w * win < frames; w++) {
    let peak = 0;
    for (let f = w * win; f < Math.min(frames, (w + 1) * win); f++) {
      for (let c = 0; c < numChannels; c++) {
        const v = Math.abs(buf.readInt16LE(dataStart + f * bytesPerFrame + c * 2));
        if (v > peak) peak = v;
      }
    }
    quiet.push(peak < threshold);
  }

  const out: { startMs: number; endMs: number }[] = [];
  const msPerWin = (win / sampleRate) * 1000;
  let run = -1;
  quiet.forEach((q, i) => {
    if (q) { if (run < 0) run = i; return; }
    if (run >= 0) {
      if ((i - run) * win >= minFrames) {
        out.push({ startMs: run * msPerWin, endMs: i * msPerWin });
      }
      run = -1;
    }
  });
  return out;
}
