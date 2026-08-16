// ---------------------------------------------------------------------------
// Script segments in, one narration file out.
//
// This was the body of the "tts:generateNarration" IPC handler, and it stayed
// there for as long as the only caller was a person clicking Generate. Batch
// production has a second caller with no window and nobody clicking, so the
// work moved here and the handler became a two-line wrapper.
//
// Nothing about it changed in the move. Deliberately: the headless path has to
// produce byte-identical narration to the one the app produces, or a batch is
// not a faster version of what you already checked — it is a different
// pipeline that happens to look similar.
// ---------------------------------------------------------------------------

import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { synthesizeWithPiper } from "./piperEngine";
import * as chatterbox from "./chatterboxEngine";
import { concatWavBuffers } from "../audio/concatWav";
import { analyzeNarration } from "../audio/analyzeNarration";
import { trimSilence, squeezeSilence } from "../audio/trimSilence";

/** One line of script, with its speaker's voice already resolved.
 *
 *  Piper and Chatterbox can be mixed within one script — the engine is a
 *  per-speaker choice, so a fast Piper voice and a cloned Chatterbox voice can
 *  appear in the same narration. */
export type NarrationInput = chatterbox.NarrationSegmentInput & {
  engine?: "chatterbox" | "piper";
  piperPythonPath?: string;
  piperOnnxPath?: string;
};

export interface NarrationPauses {
  /** Between two lines by the same speaker — a breath. */
  sameMs: number;
  /** When the turn changes — a beat. */
  turnMs: number;
}

export interface BuiltNarration {
  filePath: string;
  segments: {
    speakerId: string;
    speakerLabel: string;
    text: string;
    startMs: number;
    endMs: number;
  }[];
  analysis: ReturnType<typeof analyzeNarration>;
}

/** What the audio depends on, and nothing else.
 *
 *  Everything that changes a sample goes in: the words, who says them, which
 *  engine, which voice, and the gaps between lines. Nothing that does not —
 *  colours, layout, backgrounds — so re-rendering a lesson with a different
 *  look reuses narration that took minutes to make.
 *
 *  Deliberately NOT a timestamp or a job name. A cache keyed on anything but
 *  the content is a cache that misses when it should hit. */
function narrationKey(segments: NarrationInput[], pauses: NarrationPauses): string {
  const material = JSON.stringify([
    // Bumped whenever the AUDIO PIPELINE changes, not just its inputs. Silence
    // trimming altered every byte a given script produces while leaving the
    // script identical, so without this every cached narration would keep
    // serving untrimmed audio and the fix would look like it did nothing.
    // v3: gaps INSIDE a line are now shortened too, not just the ends. Every
    // byte of a given script's audio changes; the script does not. Forgetting
    // this bump is how a fix looks like it did nothing — which it just did,
    // once, on the smoke job.
    "v4-gentler",
    segments.map((s) => [
      s.speakerId,
      s.text,
      s.engine,
      s.piperOnnxPath,
      s.language,
      s.voiceMode,
      s.predefinedVoiceId,
      s.referenceAudioFilename,
      s.exaggeration,
      s.cfgWeight,
    ]),
    pauses.sameMs,
    pauses.turnMs,
  ]);
  return crypto.createHash("sha256").update(material).digest("hex").slice(0, 16);
}

export async function buildNarration(
  segments: NarrationInput[],
  /** Speaker ids in the order the canvas draws them, so the analysis's
   *  per-frame speaker index lines up with the waveform's tracks. */
  speakerOrder: string[],
  pauses: NarrationPauses,
  outputDir: string
): Promise<BuiltNarration> {
  if (segments.length === 0) {
    throw new Error(
      "No script segments to generate — check your script matches your speaker labels."
    );
  }

  // A hit here is worth minutes. Synthesising a nine-minute lesson costs about
  // four and a half from cold, and a failed render — a rate limit, a bad path,
  // a look you want to change — used to pay that again on every retry. For a
  // batch of forty it is the difference between re-running one row and
  // re-running an afternoon.
  //
  // The WAV is cached; the analysis is recomputed from it, because the
  // spectrum is far larger than the audio and reading it back would cost more
  // than the FFT it saves.
  const key = narrationKey(segments, pauses);
  const cacheDir = path.join(outputDir, "narration-cache");
  const cachedWav = path.join(cacheDir, `${key}.wav`);
  const cachedMeta = path.join(cacheDir, `${key}.json`);
  try {
    const [buffer, metaRaw] = await Promise.all([
      fsp.readFile(cachedWav),
      fsp.readFile(cachedMeta, "utf8"),
    ]);
    const resolved = JSON.parse(metaRaw) as BuiltNarration["segments"];
    return {
      filePath: cachedWav,
      segments: resolved,
      analysis: analyzeNarration(buffer, resolved, speakerOrder),
    };
  } catch {
    // No cache, or an unreadable one. Making it again is always correct.
  }

  // Every engine leaves its own dead air at both ends, and it varies per line.
  // Left in, the gap between two lines is the engine's leftovers plus the pause
  // this app placed on purpose — so the rhythm belongs to nobody. Worse, the
  // silence sits INSIDE the segment, and subtitle cues and viseme tracks are
  // both derived from segment boundaries: every word and every mouth shape in
  // that line shifts. One line is nothing; a hundred and sixty of them is the
  // difference between lip-sync that holds and lip-sync that slides.
  // AND THE GAPS INSIDE THE LINE, not only the ends.
  //
  // Trimming was written to leave the middle alone, because a pause a speaker
  // took is performance. That reasoning holds for a pause that was CHOSEN, and
  // DramaBox does not choose them: it is handed a duration estimated from the
  // text and multiplied by 1.1 for headroom, and the surplus lands as dead air.
  // Measured on the first audition — a 9.6s file that does not start speaking
  // until 3.2s, and an 8.0s file with 2.45s of holes in three places. Ak heard
  // it as unnatural and as breaking the flow of the lesson, which is worse than
  // unnatural: it is the thing the video exists to do, failing.
  //
  // Long gaps are shortened rather than removed, so a real beat survives. The
  // measured result on five generations is that every file roughly halves and
  // 100% of the acoustic energy is kept — silence went, speech did not.
  const trimmed = (b: Buffer): Buffer => squeezeSilence(trimSilence(b).buffer).buffer;

  const buffers: Buffer[] = [];
  for (const seg of segments) {
    if (seg.engine === "piper") {
      if (!seg.piperPythonPath || !seg.piperOnnxPath) {
        throw new Error(
          `Speaker "${seg.speakerLabel}" is set to Piper but has no voice selected — pick one in the left rail.`
        );
      }
      const { audioBuffer } = await synthesizeWithPiper(
        seg.piperPythonPath,
        seg.piperOnnxPath,
        seg.text
      );
      buffers.push(trimmed(Buffer.from(audioBuffer)));
      continue;
    }

    const { audioBuffer } = await chatterbox.synthesize({
      text: seg.text,
      language: seg.language,
      voiceMode: seg.voiceMode,
      predefinedVoiceId: seg.predefinedVoiceId,
      referenceAudioFilename: seg.referenceAudioFilename,
      exaggeration: seg.exaggeration,
      cfgWeight: seg.cfgWeight,
    });
    buffers.push(trimmed(Buffer.from(audioBuffer)));
  }

  // Nothing in front of the first line — leading silence only delays the video.
  // After that, a breath between a speaker's own lines and a longer beat when
  // the turn changes.
  const gaps = segments.map((seg, i) =>
    i === 0 ? 0 : seg.speakerId === segments[i - 1].speakerId ? pauses.sameMs : pauses.turnMs
  );
  const { buffer, segments: timing } = concatWavBuffers(buffers, gaps);

  await fsp.mkdir(outputDir, { recursive: true });
  const filePath = path.join(outputDir, `narration-${Date.now()}.wav`);
  await fsp.writeFile(filePath, buffer);

  const resolved = segments.map((seg, i) => ({
    speakerId: seg.speakerId,
    speakerLabel: seg.speakerLabel,
    text: seg.text,
    startMs: timing[i].startMs,
    endMs: timing[i].endMs,
  }));

  // Written after the real file, and failures are swallowed: a cache that
  // cannot be written is a slower next run, not a broken this one.
  try {
    await fsp.mkdir(cacheDir, { recursive: true });
    await fsp.writeFile(cachedWav, buffer);
    await fsp.writeFile(cachedMeta, JSON.stringify(resolved));
  } catch {
    /* nothing worth interrupting a finished narration for */
  }

  // Analysed once, here, while the audio is already in memory — rather than
  // re-read and re-analysed on every render.
  const analysis = analyzeNarration(buffer, resolved, speakerOrder);

  return { filePath, segments: resolved, analysis };
}
