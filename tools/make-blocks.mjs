/**
 * Build the two files the GPU box reads, from a job file and its script.
 *
 *   node --experimental-strip-types tools/make-blocks.mjs jobs/101.1-final.json
 *
 * Writes blocks.json (what to generate) and align.json (what the audio says,
 * for the aligner) next to each other.
 *
 * THE WORK IS NOT HERE. It is in src/lib/narration/buildBlocks.ts, because the
 * app builds the same two files from the same settings and two copies would
 * have drifted the first time a knob was added. This file only reads a job,
 * calls that, and prints.
 *
 * A character's settings live beside their voice in the job file:
 *
 *     {
 *       "label": "Τσίκα",
 *       "openingPhrase": "A tiny woman",
 *       "voiceRef": "tsika.wav",
 *       "dramabox": { "stgScale": 1.8, "durationMultiplier": 0.95 },
 *       "expression": { "spellNoises": true }
 *     }
 *
 * THERE IS NO LENGTH LIMIT, AND THERE SHOULD NOT BE ONE. This file twice grew a
 * word cap the documentation does not support. The engine chunks long prompts
 * itself: it "splits at sentence / quote-group boundaries, preserves the
 * speaker-description prefix on every chunk", reuses the voice reference so
 * "speaker stays coherent", and joins with "a 50 ms equal-power crossfade so
 * joins are inaudible". Its own README offers "2 minutes worth of dialogue is
 * fine" as a worked example. If a length ever turns out to matter, it will be
 * because a generation sounded wrong and we listened to it.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const { buildBlocks, describeBuild } = await import(
  "file://" + path.join(ROOT, "src/lib/narration/buildBlocks.ts")
);

const jobPath = process.argv[2];
const outPath = process.argv[3];
if (!jobPath) {
  console.error("usage: make-blocks.mjs <job.json> [out/blocks.json]");
  process.exit(1);
}

const job = JSON.parse(fs.readFileSync(jobPath, "utf8"));
const scriptText = fs.readFileSync(job.scriptPath, "utf8");

const speakers = job.cast.map((c, i) => ({
  id: `s${i + 1}`,
  label: c.label,
  openingPhrase: c.openingPhrase ?? `Speaker ${i + 1}`,
  voiceRef: c.voiceRef,
  dramabox: c.dramabox,
  expression: c.expression,
}));

const result = buildBlocks(scriptText, speakers);

if (result.errors.length) {
  console.error(result.errors.join("\n"));
  process.exit(1);
}

const target = outPath ?? path.join(ROOT, "voice-refs", "work", "blocks.json");
const alignTarget = path.join(path.dirname(target), "align.json");
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, JSON.stringify(result.blocks, null, 1), "utf8");
fs.writeFileSync(alignTarget, JSON.stringify(result.align, null, 1), "utf8");

console.log(`${result.blocks.length} blocks → ${target}`);
console.log(`${result.align.length} aligner lines → ${alignTarget}`);
console.log(describeBuild(result).join("\n"));
