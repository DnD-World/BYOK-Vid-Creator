// ---------------------------------------------------------------------------
// Turns a rendered narration WAV into the two things the waveform actually
// needs: how loud it is at any moment, and who is talking.
//
// Deliberately sampled at a fixed rate (ANALYSIS_HZ) rather than at the
// project's frame rate. That makes one analysis valid for the live preview,
// a 24fps render and a 30fps render alike — nothing has to be recomputed when
// the user changes fps, and preview and export read the identical data, which
// is what keeps them from drifting apart.
//
// Amplitude is a plain RMS envelope, not an FFT. That means every bar in the
// waveform shares one loudness value and gets its spatial variation from the
// existing shape function. Per-band spectrum data would look better still, but
// it is ~50x the payload and this is the step that gets real speech driving
// the animation at all.
// ---------------------------------------------------------------------------

import type { AudioAnalysis } from "../../src/store/types";

/** Analysis resolution. 60Hz comfortably exceeds every supported render fps. */
export const ANALYSIS_HZ = 60;

interface PcmData {
  samples: Int16Array;
  sampleRate: number;
  channels: number;
}

/** Walks RIFF chunks rather than assuming a 44-byte header — same reasoning as
 *  wavUtils.wavDurationMs, since not every encoder puts "data" straight after
 *  "fmt ". Returns null for anything that isn't 16-bit PCM. */
function readPcm(buf: Buffer): PcmData | null {
  if (buf.length < 44 || buf.toString("ascii", 0, 4) !== "RIFF") return null;

  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let dataOffset = -1;
  let dataSize = 0;

  let offset = 12;
  while (offset + 8 <= buf.length) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === "fmt ") {
      channels = buf.readUInt16LE(offset + 10);
      sampleRate = buf.readUInt32LE(offset + 12);
      bitsPerSample = buf.readUInt16LE(offset + 22);
    } else if (id === "data") {
      dataOffset = offset + 8;
      dataSize = Math.min(size, buf.length - dataOffset);
      break;
    }
    offset += 8 + size + (size % 2); // chunks are word-aligned
  }

  if (dataOffset < 0 || bitsPerSample !== 16 || !sampleRate || !channels) return null;

  const count = Math.floor(dataSize / 2);
  const samples = new Int16Array(count);
  for (let i = 0; i < count; i++) {
    samples[i] = buf.readInt16LE(dataOffset + i * 2);
  }
  return { samples, sampleRate, channels };
}

export interface AnalysisSegment {
  speakerId: string;
  startMs: number;
  endMs: number;
}

export function analyzeNarration(
  buf: Buffer,
  segments: AnalysisSegment[],
  /** Speaker ids in the same order the renderer will draw them, so the
   *  per-frame speaker index means the same thing on both sides. */
  speakerOrder: string[]
): AudioAnalysis | null {
  const pcm = readPcm(buf);
  if (!pcm) return null;

  const framesTotal = Math.floor(pcm.samples.length / pcm.channels);
  const durationMs = Math.round((framesTotal / pcm.sampleRate) * 1000);
  const windowSamples = Math.max(1, Math.round(pcm.sampleRate / ANALYSIS_HZ));
  const frameCount = Math.max(1, Math.ceil(framesTotal / windowSamples));

  const raw = new Float64Array(frameCount);
  let peak = 0;

  for (let f = 0; f < frameCount; f++) {
    const start = f * windowSamples;
    const end = Math.min(framesTotal, start + windowSamples);
    let sumSquares = 0;
    let n = 0;
    // Average the channels down to mono before measuring — a stereo file
    // where one side is silent should not read as half as loud.
    for (let s = start; s < end; s++) {
      let acc = 0;
      for (let c = 0; c < pcm.channels; c++) {
        acc += pcm.samples[s * pcm.channels + c];
      }
      const mono = acc / pcm.channels / 32768;
      sumSquares += mono * mono;
      n++;
    }
    const rms = n > 0 ? Math.sqrt(sumSquares / n) : 0;
    raw[f] = rms;
    if (rms > peak) peak = rms;
  }

  // Smooth first, normalize second — in that order, deliberately.
  //
  // Speech RMS is jumpy at 60Hz and unsmoothed bars flicker, so a fast attack
  // keeps consonants punchy while a slower release stops the waveform snapping
  // to zero between syllables. But a one-pole attack only *approaches* its
  // target, and a real speech peak lasts a single frame — so normalizing before
  // smoothing left real narration topping out around 0.79 and the waveform
  // never used its top fifth of range. Measured on real Piper Greek output;
  // synthetic test tones hid it completely because their peaks are sustained.
  const ATTACK = 0.6;
  const RELEASE = 0.12;
  const smoothed = new Float64Array(frameCount);
  let level = 0;
  let smoothPeak = 0;
  for (let f = 0; f < frameCount; f++) {
    const target = peak > 0 ? raw[f] / peak : 0;
    level += (target - level) * (target > level ? ATTACK : RELEASE);
    smoothed[f] = level;
    if (level > smoothPeak) smoothPeak = level;
  }

  const gain = smoothPeak > 0 ? 1 / smoothPeak : 0;
  const amp: number[] = new Array(frameCount);
  for (let f = 0; f < frameCount; f++) {
    // Two decimals is visually indistinguishable and keeps the payload small.
    amp[f] = Math.round(Math.min(1, Math.max(0, smoothed[f] * gain)) * 100) / 100;
  }

  // Which speaker owns each analysis frame.
  const speaker: number[] = new Array(frameCount).fill(-1);
  for (const seg of segments) {
    const idx = speakerOrder.indexOf(seg.speakerId);
    if (idx < 0) continue;
    const from = Math.max(0, Math.floor((seg.startMs / 1000) * ANALYSIS_HZ));
    const to = Math.min(frameCount, Math.ceil((seg.endMs / 1000) * ANALYSIS_HZ));
    for (let f = from; f < to; f++) speaker[f] = idx;
  }

  // Forward-fill the gaps between lines. Without this, every pause reverts to
  // -1 and the colour-shift waveform flashes back to speaker A between every
  // sentence. Muting during pauses is handled by `amp`, which is already ~0
  // there, so holding the speaker here doesn't make silence animate.
  let lastSpeaker = -1;
  for (let f = 0; f < frameCount; f++) {
    if (speaker[f] === -1) speaker[f] = lastSpeaker;
    else lastSpeaker = speaker[f];
  }

  return { hz: ANALYSIS_HZ, durationMs, amp, speaker };
}
