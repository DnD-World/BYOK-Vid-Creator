// ---------------------------------------------------------------------------
// Concatenates multiple WAV buffers (must share sample rate/channels/bit
// depth — true for consecutive calls to the same TTS engine/voice) into one
// combined WAV, and returns each segment's start/end time within it. That
// timing is essential later for viseme/subtitle sync against the combined
// narration track, so it's returned now rather than recomputed later.
// ---------------------------------------------------------------------------

export interface ConcatResult {
  buffer: Buffer;
  segments: { startMs: number; endMs: number }[];
}

interface WavInfo {
  numChannels: number;
  sampleRate: number;
  bitsPerSample: number;
  dataStart: number;
  dataSize: number;
}

function readWavInfo(buf: Buffer): WavInfo {
  const numChannels = buf.readUInt16LE(22);
  const sampleRate = buf.readUInt32LE(24);
  const bitsPerSample = buf.readUInt16LE(34);

  let offset = 12;
  let dataStart = 44;
  let dataSize = Math.max(0, buf.length - 44);
  while (offset < buf.length - 8) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === "data") {
      dataStart = offset + 8;
      dataSize = size;
      break;
    }
    offset += 8 + size + (size % 2);
  }

  return { numChannels, sampleRate, bitsPerSample, dataStart, dataSize };
}

function buildWavHeader(
  dataLength: number,
  numChannels: number,
  sampleRate: number,
  bitsPerSample: number
): Buffer {
  const blockAlign = numChannels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;
  const buf = Buffer.alloc(44);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + dataLength, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(numChannels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(byteRate, 28);
  buf.writeUInt16LE(blockAlign, 32);
  buf.writeUInt16LE(bitsPerSample, 34);
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(dataLength, 40);
  return buf;
}

/**
 * @param gapsMs Silence to insert BEFORE each segment, same length as
 *   `buffers`. The first entry is normally 0 — leading silence just delays the
 *   video. A returned segment's start time is after its own gap, so subtitles
 *   and visemes stay tied to the audio rather than to the pause in front of it.
 */
export function concatWavBuffers(buffers: Buffer[], gapsMs: number[] = []): ConcatResult {
  if (buffers.length === 0) {
    throw new Error("No audio segments to concatenate.");
  }

  const infos = buffers.map(readWavInfo);
  const { numChannels, sampleRate, bitsPerSample } = infos[0];
  for (const info of infos) {
    if (
      info.numChannels !== numChannels ||
      info.sampleRate !== sampleRate ||
      info.bitsPerSample !== bitsPerSample
    ) {
      throw new Error(
        "Audio segments have mismatched format (sample rate/channels/bit depth) — can't concatenate directly."
      );
    }
  }

  const bytesPerSecond = sampleRate * numChannels * (bitsPerSample / 8);
  const segments: { startMs: number; endMs: number }[] = [];
  const pcmChunks: Buffer[] = [];
  let cursorMs = 0;

  const blockAlign = numChannels * (bitsPerSample / 8);

  for (let i = 0; i < buffers.length; i++) {
    // Digital silence, block-aligned so a gap can never shift the following
    // samples off their frame boundary and turn the rest of the file to noise.
    const gapMs = Math.max(0, gapsMs[i] ?? 0);
    if (gapMs > 0) {
      const bytes = Math.round((gapMs / 1000) * bytesPerSecond / blockAlign) * blockAlign;
      if (bytes > 0) {
        pcmChunks.push(Buffer.alloc(bytes));
        cursorMs += (bytes / bytesPerSecond) * 1000;
      }
    }

    const { dataStart, dataSize } = infos[i];
    pcmChunks.push(buffers[i].subarray(dataStart, dataStart + dataSize));
    const durMs = (dataSize / bytesPerSecond) * 1000;
    segments.push({ startMs: cursorMs, endMs: cursorMs + durMs });
    cursorMs += durMs;
  }

  const pcmData = Buffer.concat(pcmChunks);
  const header = buildWavHeader(pcmData.length, numChannels, sampleRate, bitsPerSample);
  return { buffer: Buffer.concat([header, pcmData]), segments };
}
