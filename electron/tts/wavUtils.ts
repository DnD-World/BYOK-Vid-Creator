/**
 * Minimal PCM WAV header parser — enough to get exact playback duration
 * without depending on ffprobe or any external binary. Walks RIFF chunks
 * rather than assuming a fixed 44-byte header, since not every encoder
 * places "data" immediately after "fmt ". Shared by every source of audio —
 * Piper here, DramaBox's WAVs coming back from the GPU box — so there is one
 * implementation to maintain.
 */
export function wavDurationMs(buf: Buffer): number {
  const numChannels = buf.readUInt16LE(22);
  const sampleRate = buf.readUInt32LE(24);
  const bitsPerSample = buf.readUInt16LE(34);

  let offset = 12;
  let dataSize = Math.max(0, buf.length - 44);
  while (offset < buf.length - 8) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === "data") {
      dataSize = size;
      break;
    }
    offset += 8 + size + (size % 2); // chunks are word-aligned
  }

  const bytesPerSecond = sampleRate * numChannels * (bitsPerSample / 8);
  if (!bytesPerSecond) return 0;
  return Math.round((dataSize / bytesPerSecond) * 1000);
}
