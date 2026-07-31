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
// Two things come out of this file, and they answer different questions:
//
//   amp      — how loud, overall. Drives the active-speaker gate and is the
//              fallback when there is no spectrum.
//   spectrum — how loud in each of BAND_COUNT frequency bands. This is what
//              makes the bars move independently. Before it existed, every bar
//              read the same loudness number and got its spatial variation
//              from a sine shape function, so the whole waveform breathed in
//              unison — which is precisely why it looked generated rather than
//              designed. Bass and treble do not move together in real audio,
//              and a visualiser that pretends they do reads as fake.
// ---------------------------------------------------------------------------

import type { AudioAnalysis, AudioSpectrum } from "../../src/store/types";
import { Fft, bandBins } from "./fft";

/** Analysis resolution. 60Hz comfortably exceeds every supported render fps. */
export const ANALYSIS_HZ = 60;

/** 24 bands: enough that neighbouring bars differ visibly, few enough that
 *  each one still carries real energy rather than FFT noise. */
export const BAND_COUNT = 24;

/** 1024 samples is ~23ms at 44.1kHz / ~46ms at 22.05kHz — long enough to
 *  resolve a speaking voice's fundamental, short enough not to blur syllables. */
const FFT_SIZE = 1024;

/** Speech lives here. Below 60Hz is room rumble; above 8kHz a TTS voice has
 *  almost nothing, and bands up there would be permanently flat bars. */
const BAND_LO_HZ = 60;
const BAND_HI_HZ = 8000;

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

/**
 * Per-band level and its peak-hold cap, for every analysis frame.
 *
 * Both of these are baked here rather than computed at draw time, and that is
 * a hard constraint, not a preference: Remotion renders frames out of order
 * across parallel workers, so nothing downstream can carry state from the
 * previous frame. Anything with memory — attack/release, peak-hold — has to be
 * computed once, in order, over the whole file. Here.
 */
function computeSpectrum(
  mono: Float32Array,
  sampleRate: number,
  frameCount: number,
  windowSamples: number
): AudioSpectrum {
  const fft = new Fft(FFT_SIZE);
  const bins = bandBins(BAND_COUNT, FFT_SIZE, sampleRate, BAND_LO_HZ, BAND_HI_HZ);
  const mags = new Float64Array(FFT_SIZE / 2);
  const raw = new Float64Array(frameCount * BAND_COUNT);

  for (let f = 0; f < frameCount; f++) {
    // Centre the window on the frame so a band's energy lines up with the
    // moment you hear it, rather than lagging half a window behind.
    const centre = f * windowSamples + windowSamples / 2;
    fft.magnitudes(mono, Math.round(centre - FFT_SIZE / 2), mags);
    for (let b = 0; b < BAND_COUNT; b++) {
      const { from, to } = bins[b];
      let sum = 0;
      for (let k = from; k <= to; k++) sum += mags[k] * mags[k];
      raw[f * BAND_COUNT + b] = Math.sqrt(sum / (to - from + 1));
    }
  }

  // Rise/fall asymmetry, per band. A transient should snap up and ease down —
  // the same envelope a real analyser hardware meter has, and the reason a
  // consonant reads as a hit rather than a smear. Faster than the overall
  // envelope's attack because per-band transients are the whole point.
  const ATTACK = 0.75;
  const RELEASE = 0.14;
  const smoothed = new Float64Array(frameCount * BAND_COUNT);
  const level = new Float64Array(BAND_COUNT);
  for (let f = 0; f < frameCount; f++) {
    for (let b = 0; b < BAND_COUNT; b++) {
      const target = raw[f * BAND_COUNT + b];
      level[b] += (target - level[b]) * (target > level[b] ? ATTACK : RELEASE);
      smoothed[f * BAND_COUNT + b] = level[b];
    }
  }

  // Normalise each band against its own peak, so quiet high bands still use
  // their full range — otherwise the top third of the ring never moves, since
  // speech energy falls away steeply with frequency. Smoothed values are
  // normalised, not raw ones, for the reason spelled out in the amp envelope
  // below: a one-pole attack only approaches its target, so normalising first
  // leaves the result permanently short of 1.
  //
  // The floor is what keeps silence silent. A band that never rises above 12%
  // of the loudest band is noise, and dividing it by its own tiny peak would
  // turn the noise floor into a full-height bar.
  const bandPeak = new Float64Array(BAND_COUNT);
  for (let f = 0; f < frameCount; f++) {
    for (let b = 0; b < BAND_COUNT; b++) {
      const v = smoothed[f * BAND_COUNT + b];
      if (v > bandPeak[b]) bandPeak[b] = v;
    }
  }
  let globalPeak = 0;
  for (let b = 0; b < BAND_COUNT; b++) if (bandPeak[b] > globalPeak) globalPeak = bandPeak[b];
  const norm = new Float64Array(BAND_COUNT);
  for (let b = 0; b < BAND_COUNT; b++) {
    norm[b] = Math.max(bandPeak[b], globalPeak * 0.12) || 1;
  }

  // Peak-hold caps: jump straight to a new maximum, sit there briefly, then
  // sink. Cheap, and it gives the eye something that persists longer than a
  // single frame to read the shape of the sound from.
  const HOLD_FRAMES = 6;      // ~100ms
  const DECAY_PER_FRAME = 0.018; // ~1.1 per second
  const bands = new Uint8Array(frameCount * BAND_COUNT);
  const peaks = new Uint8Array(frameCount * BAND_COUNT);
  const peak = new Float64Array(BAND_COUNT);
  const held = new Int32Array(BAND_COUNT);

  // Compression. Linear magnitude is far too peaky to look at: measured on
  // real Greek Piper output, a typical frame's bands sit at 5-30% of their own
  // peak, so a linear mapping leaves the ring nearly flat except on the loudest
  // vowels. ^0.6 lifts the middle of the range without lifting the bottom —
  // going further (a dB scale, which is the textbook answer) puts a quiet
  // between-words breath at over half height and throws away the stillness in
  // pauses that makes the motion read as driven by the voice.
  const CURVE = 0.6;

  for (let f = 0; f < frameCount; f++) {
    for (let b = 0; b < BAND_COUNT; b++) {
      const v = Math.pow(Math.min(1, smoothed[f * BAND_COUNT + b] / norm[b]), CURVE);
      if (v >= peak[b]) {
        peak[b] = v;
        held[b] = HOLD_FRAMES;
      } else if (held[b] > 0) {
        held[b]--;
      } else {
        peak[b] = Math.max(v, peak[b] - DECAY_PER_FRAME);
      }
      const i = f * BAND_COUNT + b;
      bands[i] = Math.round(v * 255);
      peaks[i] = Math.round(peak[b] * 255);
    }
  }

  return {
    bandCount: BAND_COUNT,
    bands: Buffer.from(bands).toString("base64"),
    peaks: Buffer.from(peaks).toString("base64"),
  };
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

  // Mixed down to mono once, up front — a stereo file where one side is silent
  // should not read as half as loud, and both the envelope and the FFT want
  // the same single signal.
  const mono = new Float32Array(framesTotal);
  for (let s = 0; s < framesTotal; s++) {
    let acc = 0;
    for (let c = 0; c < pcm.channels; c++) acc += pcm.samples[s * pcm.channels + c];
    mono[s] = acc / pcm.channels / 32768;
  }

  const raw = new Float64Array(frameCount);
  let peak = 0;

  for (let f = 0; f < frameCount; f++) {
    const start = f * windowSamples;
    const end = Math.min(framesTotal, start + windowSamples);
    let sumSquares = 0;
    let n = 0;
    for (let s = start; s < end; s++) {
      sumSquares += mono[s] * mono[s];
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

  return {
    hz: ANALYSIS_HZ,
    durationMs,
    amp,
    speaker,
    spectrum: computeSpectrum(mono, pcm.sampleRate, frameCount, windowSamples),
  };
}
