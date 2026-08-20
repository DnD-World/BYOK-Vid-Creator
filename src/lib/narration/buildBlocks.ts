// ---------------------------------------------------------------------------
// Script + cast -> the two files the GPU box reads.
//
// WHY THIS IS ITS OWN MODULE. The logic lived inside tools/make-blocks.mjs,
// which reads a job file. The app keeps the same settings on its own speakers,
// in its own shape, and had no way to reach that script — so every slider in
// the Cast panel was saved and then read by nothing. Two copies of this logic
// would have drifted the first time a knob was added.
//
// So it lives here, in plain TypeScript with no filesystem and no Electron, and
// both callers hand it the same thing:
//
//   tools/make-blocks.mjs   — from a job file, for the command line
//   electron/main.ts        — from the current project, for the button
//
// It returns everything a caller might want to SAY about what it did. Nothing
// here writes, logs or throws for a script problem: the caller decides whether
// a problem is a printed line or a dialog.
// ---------------------------------------------------------------------------

// Extensions are explicit because tools/make-blocks.mjs runs this file through
// Node directly, and Node's resolver does not guess them. `tsconfig.json` sets
// `allowImportingTsExtensions`, so the bundled build is unaffected.
import { parseDramaboxScript } from "./parseDramaboxScript.ts";
import { resolveParams, toEngineParams, type DramaboxParams } from "./dramaboxParams.ts";
import { applyExpression, type ExpressionOptions } from "./expression.ts";
import { displayLine, hasDisplaySwap } from "./displayText.ts";

export interface BlockSpeaker {
  id: string;
  label: string;
  /** "A grave man" — how a block finds its voice. */
  openingPhrase: string;
  /** File name of their reference clip, as it sits in the refs folder. */
  voiceRef?: string;
  dramabox?: Partial<DramaboxParams>;
  expression?: ExpressionOptions;
}

/** One entry of blocks.json, exactly as the Python reads it. */
export interface EngineBlock {
  id: string;
  prompt: string;
  voice_ref: string;
  params: Record<string, unknown>;
}

export interface BuildBlocksResult {
  blocks: EngineBlock[];
  /** align.json — the SPOKEN text, which is what the audio actually says. */
  align: { id: string; text: string }[];
  /** Anything that stops this being usable. Empty means go. */
  errors: string[];
  /** Blocks the app gave expression to. Never silent. */
  changes: { id: string; label: string; what: string; before: string; after: string }[];
  /** Words that will be said in English and shown in Greek. */
  swaps: { id: string; label: string; said: string; shown: string }[];
  /** How many blocks each voice got, for a one-line summary. */
  perVoice: Record<string, number>;
}

export function buildBlocks(
  scriptText: string,
  speakers: BlockSpeaker[]
): BuildBlocksResult {
  const out: BuildBlocksResult = {
    blocks: [],
    align: [],
    errors: [],
    changes: [],
    swaps: [],
    perVoice: {},
  };

  const parsed = parseDramaboxScript(scriptText, speakers);

  if (parsed.unmatchedLines.length) {
    out.errors.push(
      `${parsed.unmatchedLines.length} block(s) matched no character. ` +
        `Opening phrases: ${speakers.map((s) => s.openingPhrase).join(", ")}`
    );
    for (const l of parsed.unmatchedLines) out.errors.push(`  > ${l.slice(0, 100)}`);
  }
  if (parsed.badVoiceLines.length) {
    out.errors.push(
      `Unreadable setting(s) in a [VOICE: …] line: ${parsed.badVoiceLines.join(", ")}`
    );
  }
  if (out.errors.length) return out;

  parsed.blocks.forEach((b, i) => {
    const speaker = speakers.find((s) => s.id === b.speakerId);
    if (!speaker) {
      out.errors.push(`Block ${i} belongs to no known speaker.`);
      return;
    }
    if (!speaker.voiceRef) {
      out.errors.push(
        `${speaker.label} has no reference clip. Every character needs one — "tsika.wav".`
      );
      return;
    }

    const id = String(i).padStart(3, "0");

    // Three layers, most specific last: engine defaults, this character's
    // settings, then anything a [VOICE: …] line asked for above this block.
    const params = resolveParams(speaker.dramabox, b.params as Partial<DramaboxParams>);

    const { prompt, changes } = applyExpression(b.prompt, speaker.expression ?? {});
    for (const c of changes) {
      out.changes.push({ id, label: speaker.label, ...c });
    }

    out.blocks.push({
      id,
      prompt,
      voice_ref: speaker.voiceRef,
      params: toEngineParams(params),
    });
    out.perVoice[speaker.voiceRef] = (out.perVoice[speaker.voiceRef] ?? 0) + 1;

    // The aligner is told what the audio SAYS. "Ugh" is the only spelling that
    // makes the sound, so it is the word to go looking for; «Ουφ» is put back
    // afterwards, once the times are known.
    const spoken = [...prompt.matchAll(/"([^"]*)"/g)]
      .map((m) => m[1].trim())
      .join(" ");
    out.align.push({ id, text: spoken });

    if (hasDisplaySwap(spoken)) {
      const said = spoken.split(/\s+/).filter((w) => displayLine(w) !== w);
      out.swaps.push({
        id,
        label: speaker.label,
        said: said.join(" "),
        shown: said.map(displayLine).join(" "),
      });
    }
  });

  return out;
}

/** The same summary wherever it is shown — the terminal and the app say the
 *  same words about the same run. */
export function describeBuild(r: BuildBlocksResult): string[] {
  const lines: string[] = [];
  for (const [ref, n] of Object.entries(r.perVoice)) {
    lines.push(`${String(n).padStart(3)} × ${ref}`);
  }
  if (r.changes.length) {
    lines.push("", `${r.changes.length} block(s) were given expression by the app:`);
    for (const c of r.changes) {
      lines.push(`  ${c.id} (${c.label}): ${c.what}`);
      lines.push(`      was: ${c.before}`);
      lines.push(`      now: ${c.after}`);
    }
  }
  if (r.swaps.length) {
    lines.push("", `${r.swaps.length} block(s) say English and will show Greek:`);
    for (const s of r.swaps) {
      lines.push(`  ${s.id} (${s.label}): ${s.said} → ${s.shown}`);
    }
  }
  return lines;
}
