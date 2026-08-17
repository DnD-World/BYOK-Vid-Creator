// ---------------------------------------------------------------------------
// One narration file from block WAVs generated on the GPU box.
//
// DramaBox generates PER BLOCK — one character's whole turn in one take, which
// is the only way it can act across a turn. Everything downstream still wants
// PER LINE: subtitles cue on a line, visemes drive a mouth from a line, and the
// waveform lights whoever is currently speaking.
//
// So a block's audio has to be divided back into its lines, and DramaBox
// returns no timestamps to divide it by.
//
// WHAT THIS DOES ABOUT THAT, STATED PLAINLY: it splits a block's duration
// between its lines in proportion to how many characters each line has. That is
// an approximation. It is right to within a syllable or two on lines of similar
// length and drifts on a block that pairs a two-word line with a long one.
//
// It is good enough for subtitles, which are already shown a line at a time,
// and good enough to decide whose mouth moves. It is NOT good enough to claim
// lip-sync accuracy, and the real fix is forced alignment against the script —
// whisperX was in the plan from the first handoff and is the thing that
// replaces this function's guesswork with measurement.
// ---------------------------------------------------------------------------

import fsp from "node:fs/promises";
import path from "node:path";
import { concatWavBuffers } from "../audio/concatWav";
import { analyzeNarration } from "../audio/analyzeNarration";
import { trimSilence, squeezeSilence, findGaps, remapTime } from "../audio/trimSilence";
import { wavDurationMs } from "./wavUtils";
import type { BuiltNarration, NarrationPauses } from "./buildNarration";
import type { ScriptSegment } from "../../src/lib/narration/parseScript";

export interface DramaboxBlock {
  speakerId: string;
  segmentIndices: number[];
}

/** Word times from tools/dramabox-align.py, keyed by block id ("000"), in
 *  seconds from the start of that block's own WAV. */
export type AlignedWords = Record<string, { w: string; start: number; end: number }[]>;

/**
 * Assemble block WAVs into one narration track with per-line timings.
 *
 * `wavDir` holds `000.wav`, `001.wav` … one per block, in script order.
 */
export async function buildDramaboxNarration(
  blocks: DramaboxBlock[],
  segments: ScriptSegment[],
  wavDir: string,
  speakerOrder: string[],
  pauses: NarrationPauses,
  outputDir: string,
  aligned?: AlignedWords
): Promise<BuiltNarration> {
  const buffers: Buffer[] = [];
  const perBlockMs: number[] = [];
  /** Where the speech actually breaks inside each block. */
  const blockGaps: { startMs: number; endMs: number }[][] = [];
  /** What the cleaning removed from each block, so times measured against the
   *  ORIGINAL take can be moved onto the audio the video actually plays. */
  const blockEdits: { leadMs: number; edits: { atMs: number; removedMs: number }[] }[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const file = path.join(wavDir, `${String(i).padStart(3, "0")}.wav`);
    const raw = await fsp.readFile(file);
    // Same treatment every other engine's output gets: dead air off the ends,
    // long holes inside shortened. See trimSilence.ts for what DramaBox leaves.
    const trimmed = trimSilence(raw);
    const squeezed = squeezeSilence(trimmed.buffer);
    const clean = squeezed.buffer;
    buffers.push(clean);
    perBlockMs.push(wavDurationMs(clean));
    blockGaps.push(findGaps(clean, { minMs: 120 }));
    blockEdits.push({ leadMs: trimmed.leadMsRemoved, edits: squeezed.edits });
  }

  // A gap between blocks is always a turn change, because a block IS a turn.
  const gaps = blocks.map((_, i) => (i === 0 ? 0 : pauses.turnMs));
  const { buffer, segments: blockTiming } = concatWavBuffers(buffers, gaps);

  // Divide each block's span between its lines, by share of text length.
  const resolved: BuiltNarration["segments"] = [];
  blocks.forEach((block, i) => {
    const from = blockTiming[i].startMs;
    const span = blockTiming[i].endMs - from;
    const lines = block.segmentIndices.map((n) => segments[n]);
    const total = lines.reduce((s, l) => s + Math.max(1, l.text.length), 0);

    // MEASURED WORDS FIRST. When forced alignment has run, every line's start
    // and end is the first and last word actually spoken in it — no estimate,
    // no drift, nothing to tune. Everything below this is the fallback for
    // narration that never went through the aligner.
    const alignedWords = aligned?.[String(i).padStart(3, "0")];
    if (alignedWords && alignedWords.length > 0) {
      // The aligner was given the block's lines joined in order, so its words
      // come back in that order and can be handed back out line by line.
      let w = 0;
      let ok = true;
      const perLine: { text: string; startMs: number; endMs: number }[][] = [];
      for (const line of lines) {
        const count = line.text.trim().split(/\s+/).filter(Boolean).length;
        if (w + count > alignedWords.length) { ok = false; break; }
        perLine.push(
          alignedWords.slice(w, w + count).map((x) => ({
            text: x.w,
            // ALIGNMENT MEASURED THE RAW TAKE; THE VIDEO PLAYS THE TRIMMED
            // ONE. Up to 3.7 seconds comes off the front of a block and more
            // out of its middle, so a raw timestamp is between one and two
            // seconds late by the time it reaches the screen. remapTime moves
            // it through exactly the cuts that were made.
            //
            // A comment here once claimed both referred to the same audio.
            // They never did, and everything downstream inherited the error.
            startMs: Math.round(
              from + remapTime(x.start * 1000, blockEdits[i].leadMs, blockEdits[i].edits)
            ),
            endMs: Math.round(
              from + remapTime(x.end * 1000, blockEdits[i].leadMs, blockEdits[i].edits)
            ),
          }))
        );
        w += count;
      }
      // A WORD CANNOT LAST NO TIME. Remapping collapses anything that sat
      // inside a removed gap onto a single instant, and sixteen words in this
      // lesson landed there — enough to crash the render outright, because a
      // cue whose span is zero has nothing to interpolate its entrance over.
      // Each is given a millisecond and pushed clear of its neighbour, which is
      // inaudible and keeps the sequence strictly increasing.
      for (const ws of perLine) {
        for (let n = 0; n < ws.length; n++) {
          if (n > 0 && ws[n].startMs < ws[n - 1].endMs) ws[n].startMs = ws[n - 1].endMs;
          if (ws[n].endMs <= ws[n].startMs) ws[n].endMs = ws[n].startMs + 1;
        }
      }
      if (ok && perLine.length === lines.length) {
        lines.forEach((line, k) => {
          const ws = perLine[k];
          resolved.push({
            speakerId: line.speakerId,
            speakerLabel: line.speakerLabel,
            text: line.text,
            startMs: ws[0].startMs,
            endMs: ws[ws.length - 1].endMs,
            words: ws,
          });
        });
        return;
      }
    }

    // NO ALIGNMENT: estimate where the line ends from letter count, then snap
    // to the nearest measured gap if one is close enough to plausibly be that
    // boundary. Taking the LONGEST gap instead once gave a whole sentence 190
    // milliseconds, because a block opening "Ugh," pauses harder after the
    // interjection than it does between its two lines.
    const needed = lines.length - 1;
    const gapMids = blockGaps[i].map((g) => from + (g.startMs + g.endMs) / 2);
    const tolerance = Math.max(700, span * 0.22);
    const splits: number[] = [];
    let running = 0;
    for (let k = 0; k < needed; k++) {
      running += Math.max(1, lines[k].text.length);
      const estimate = from + span * (running / total);
      let best = estimate;
      let bestDist = tolerance;
      for (const g of gapMids) {
        if (g <= (splits[k - 1] ?? from)) continue;
        const d = Math.abs(g - estimate);
        if (d < bestDist) { bestDist = d; best = g; }
      }
      splits.push(best);
    }

    let cursor = from;
    lines.forEach((line, k) => {
      // The last line takes whatever is left, so rounding cannot leave a gap
      // or overrun the block it belongs to.
      const end = k === lines.length - 1 ? blockTiming[i].endMs : splits[k];
      resolved.push({
        speakerId: line.speakerId,
        speakerLabel: line.speakerLabel,
        text: line.text,
        startMs: Math.round(cursor),
        endMs: Math.round(end),
      });
      cursor = end;
    });
  });

  const outPath = path.join(outputDir, `narration-${Date.now()}.wav`);
  await fsp.mkdir(outputDir, { recursive: true });
  await fsp.writeFile(outPath, buffer);

  return {
    filePath: outPath,
    segments: resolved,
    analysis: analyzeNarration(buffer, resolved, speakerOrder),
    // Measured on the FINISHED track, so the positions are the ones the video
    // will actually play. Subtitles and mouths are anchored to these.
    pauses: findGaps(buffer, { minMs: 180 }).map((g) => (g.startMs + g.endMs) / 2),
  };
}
