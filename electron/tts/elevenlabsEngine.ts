// ---------------------------------------------------------------------------
// ElevenLabs — a third voice, and the first one that costs money per word.
//
// WHY IT IS HERE AT ALL, having been on the cut list. DramaBox acts and costs
// about five dollars of rented card for the whole course, but it lives on a
// machine that has to be started, fed, waited for and switched off. ElevenLabs
// is an HTTP call. Ak is paying for the difference deliberately.
//
// WHAT IT COSTS, measured rather than guessed: lesson 101.1 is 4,640 characters
// of Greek, and a credit is a character. Seventy-two lessons is 334,080 — one
// month of Pro, or three of Creator with no room for second thoughts. Every
// re-render spends it again, which the GPU never does.
//
// RAW PCM, NOT MP3. The app's analysis reads 16-bit PCM: it is what makes a
// waveform move, what lets a music bed loop, and what the aligner needs. An MP3
// would play and analyse as nothing. So the API is asked for pcm_44100 and the
// WAV header is written here — the response is bare samples with no container.
// ---------------------------------------------------------------------------

import * as keyStore from "../keyStore";

const BASE = "https://api.elevenlabs.io/v1";
/** The multilingual model. Greek is not on any published list for it, exactly
 *  as Greek was not on DramaBox's — and DramaBox speaks it well. Whether this
 *  one does is a question for ears, not documentation. */
const DEFAULT_MODEL = "eleven_multilingual_v2";
const SAMPLE_RATE = 44100;

export interface ElevenVoiceSettings {
  /** 0–1. Low wanders and is more expressive; high is steady and flatter. */
  stability?: number;
  /** 0–1. How closely it holds to the original voice. */
  similarityBoost?: number;
  /** 0–1. Exaggeration. Costs latency and can wander. */
  style?: number;
  /** 0.7–1.2. The nearest thing to DramaBox's pace. */
  speed?: number;
  useSpeakerBoost?: boolean;
}

export interface ElevenSynthesizeOptions {
  text: string;
  /** From the voice library or a clone. Not a name — the id. */
  voiceId: string;
  modelId?: string;
  settings?: ElevenVoiceSettings;
}

/** Bare samples in, a playable file out.
 *
 *  Written by hand rather than pulled from a library because it is forty bytes
 *  of header and one more dependency is not worth it. Mono, 16-bit, little
 *  endian — what the API returns for pcm_*. */
function wrapPcmAsWav(pcm: Buffer, sampleRate = SAMPLE_RATE, channels = 1): Buffer {
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * channels * 2;

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);           // fmt chunk size
  header.writeUInt16LE(1, 20);            // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(channels * 2, 32); // block align
  header.writeUInt16LE(16, 34);           // bits per sample
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]);
}

/** How many credits a piece of text will cost. A character is a credit. */
export function creditsFor(text: string): number {
  return text.length;
}

export async function synthesize(
  opts: ElevenSynthesizeOptions
): Promise<{ audioBuffer: ArrayBuffer; durationMs: number; credits: number }> {
  const apiKey = await keyStore.getKey("elevenlabs");
  if (!apiKey) {
    throw new Error(
      "No ElevenLabs API key saved — add one in Backend Settings first."
    );
  }
  if (!opts.voiceId) {
    throw new Error(
      "This speaker has no ElevenLabs voice id. Pick one in the Cast panel — " +
        "it is the id from your voice library, not the voice's name."
    );
  }

  const s = opts.settings ?? {};
  const res = await fetch(
    `${BASE}/text-to-speech/${encodeURIComponent(opts.voiceId)}` +
      `?output_format=pcm_${SAMPLE_RATE}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/pcm",
      },
      body: JSON.stringify({
        text: opts.text,
        model_id: opts.modelId ?? DEFAULT_MODEL,
        voice_settings: {
          stability: s.stability ?? 0.5,
          similarity_boost: s.similarityBoost ?? 0.75,
          style: s.style ?? 0,
          speed: s.speed ?? 1,
          use_speaker_boost: s.useSpeakerBoost ?? true,
        },
      }),
    }
  );

  if (!res.ok) {
    // Translated where it is worth translating. A quota message that reads
    // "unusual activity" has cost people hours of looking in the wrong place.
    const text = await res.text();
    if (res.status === 401) {
      throw new Error("ElevenLabs refused the key. Check it in Backend Settings.");
    }
    if (res.status === 422) {
      throw new Error(
        `ElevenLabs could not use that request — usually a voice id that does not ` +
          `exist on this account. ${text.slice(0, 200)}`
      );
    }
    if (res.status === 429) {
      throw new Error(
        `ElevenLabs says: too many requests, or the monthly credits are gone. ` +
          `${text.slice(0, 200)}`
      );
    }
    throw new Error(`ElevenLabs ${res.status} ${res.statusText} — ${text.slice(0, 300)}`);
  }

  const pcm = Buffer.from(await res.arrayBuffer());
  const wav = wrapPcmAsWav(pcm);
  const durationMs = (pcm.length / 2 / SAMPLE_RATE) * 1000;

  return {
    audioBuffer: wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength) as ArrayBuffer,
    durationMs,
    credits: creditsFor(opts.text),
  };
}

/** The voices on this account, so the Cast panel can offer a list rather than
 *  asking someone to paste an id they have to go and find. */
export async function listVoices(): Promise<{ id: string; name: string; labels?: string }[]> {
  const apiKey = await keyStore.getKey("elevenlabs");
  if (!apiKey) return [];
  const res = await fetch(`${BASE}/voices`, { headers: { "xi-api-key": apiKey } });
  if (!res.ok) return [];
  const body = (await res.json()) as {
    voices?: { voice_id: string; name: string; labels?: Record<string, string> }[];
  };
  return (body.voices ?? []).map((v) => ({
    id: v.voice_id,
    name: v.name,
    labels: v.labels ? Object.values(v.labels).join(", ") : undefined,
  }));
}
