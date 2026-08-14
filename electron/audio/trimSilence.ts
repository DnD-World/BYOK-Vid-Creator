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
