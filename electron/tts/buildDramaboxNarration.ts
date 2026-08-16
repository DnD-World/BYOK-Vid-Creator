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
import { trimSilence, squeezeSilence, findGaps } from "../audio/trimSilence";
import { wavDurationMs } from "./wavUtils";
import type { BuiltNarration, NarrationPauses } from "./buildNarration";
import type { ScriptSegment } from "../../src/lib/narration/parseScript";

export interface DramaboxBlock {
  speakerId: string;
  segmentIndices: number[];
}

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
  outputDir: string
): Promise<BuiltNarration> {
  const buffers: Buffer[] = [];
  const perBlockMs: number[] = [];
  /** Where the speech actually breaks inside each block. */
  const blockGaps: { startMs: number; endMs: number }[][] = [];

  for (let i = 0; i < blocks.length; i++) {
    const file = path.join(wavDir, `${String(i).padStart(3, "0")}.wav`);
    const raw = await fsp.readFile(file);
    // Same treatment every other engine's output gets: dead air off the ends,
    // long holes inside shortened. See trimSilence.ts for what DramaBox leaves.
    const clean = squeezeSilence(trimSilence(raw).buffer).buffer;
    buffers.push(clean);
    perBlockMs.push(wavDurationMs(clean));
    blockGaps.push(findGaps(clean, { minMs: 120 }));
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

    // SPLIT WHERE THE VOICE ACTUALLY STOPS. A block of two lines is spoken with
    // a real pause between them, so the join is measurable rather than
    // estimated. Take the longest gaps, one fewer than there are lines, and cut
    // at the middle of each. Falling back to letter-count only when the audio
    // does not show enough gaps to go round — which happens when two lines run
    // together with no breath, and there is nothing to measure.
    const needed = lines.length - 1;
    const splits = blockGaps[i]
      .slice()
      .sort((a, b) => (b.endMs - b.startMs) - (a.endMs - a.startMs))
      .slice(0, needed)
      .map((g) => from + (g.startMs + g.endMs) / 2)
      .sort((a, b) => a - b);
    const measured = splits.length === needed;

    let cursor = from;
    lines.forEach((line, k) => {
      const share = Math.max(1, line.text.length) / total;
      // The last line takes whatever is left, so rounding cannot leave a gap
      // or overrun the block it belongs to.
      const end =
        k === lines.length - 1
          ? blockTiming[i].endMs
          : measured
            ? splits[k]
            : cursor + span * share;
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
  };
}
