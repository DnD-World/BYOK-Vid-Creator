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
   *  and cutting to the exact first loud sample shaves its attack off. */
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
   *  a pause is punctuation and belongs to the performance. */
  minPauseMs?: number;
  /** What a long gap is shortened TO, in ms. Not to zero — running two
   *  sentences together is worse than the gap was. */
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
  const minPause = Math.round(((opts.minPauseMs ?? 350) / 1000) * sampleRate);
  const keep = Math.round(((opts.keepMs ?? 180) / 1000) * sampleRate);
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

  let first = 0;
  while (first < frames && peakAt(first) < threshold) first++;
  if (first === frames) return untouched; // silent throughout

  let last = frames - 1;
  while (last > first && peakAt(last) < threshold) last--;

  const pad = Math.round(((opts.padMs ?? 30) / 1000) * sampleRate);
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
