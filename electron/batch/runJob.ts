// ---------------------------------------------------------------------------
// One video, start to finish, with no window and nobody clicking.
//
// WHY THIS EXISTS. Everything the app can do was reachable only from the UI,
// which is fine for making one video and impossible for making forty. It also
// meant the first render longer than a minute could not be run unattended —
// and every timing number this project has was measured on clips of about
// sixty seconds.
//
// WHAT IT DELIBERATELY IS NOT. It is not a second pipeline. Every stage below
// calls the same function the app calls, in the same order, with the same
// arguments: buildNarration, planBackgrounds, pickBackgrounds, renderVideo. If
// a headless render and a clicked render ever disagree, that is a bug here and
// not a feature of either. The job file supplies what the project store would
// have supplied, and nothing else.
//
// THE LOOK COMES FROM A PRESET, which is already the app's own portable
// format — plain JSON, exportable from the Presets panel. So the way to set up
// a batch is to get one video looking right by hand, export the preset, and
// point every row at it.
// ---------------------------------------------------------------------------

import fsp from "node:fs/promises";
import path from "node:path";
import { parseScript } from "../../src/lib/narration/parseScript";
import { defaultProject } from "../../src/store/defaults";
import { defaultTrackWaveform } from "../../src/lib/waveform/buildTracks";
import { builtinPresets } from "../../src/store/builtinPresets";
import { buildNarration, type NarrationInput } from "../tts/buildNarration";
import { planBackgrounds, pickBackgrounds } from "../llm/backgroundPlanner";
import { downloadTo } from "../net/mediaSearch";
import { renderVideo, type RenderJob, type RenderContext } from "../render/renderVideo";
import type { ProjectPreset } from "../../src/store/templatesTypes";
import type { SpeakerConfig } from "../../src/store/types";

/** One member of the cast, as a job file describes them.
 *
 *  `label` is the contract with the script: it has to match the name before
 *  the colon, because that is how a line finds its voice. Everything else is
 *  the same data the Cast panel collects. */
export interface JobSpeaker {
  label: string;
  /** A flattened viseme sheet, or a layered puppet. The puppet wins if both
   *  are given — the same precedence the preview and the render already use. */
  sheetPath?: string;
  puppetPath?: string;
  engine: "piper" | "chatterbox";
  piperPythonPath?: string;
  piperOnnxPath?: string;
  chatterboxVoiceMode?: "predefined" | "clone";
  chatterboxVoiceRef?: string;
  /** Outline and waveform colour — they are the same value by construction. */
  borderColor?: string;
}

export interface BatchJob {
  /** A "Label: text" script. See docs/WRITING-SCRIPTS.md. */
  scriptPath: string;
  /** A preset exported from the Presets panel. Everything visible comes from
   *  here; anything it omits falls back to the app's defaults, exactly as it
   *  does when a preset is applied by hand. */
  presetPath?: string;
  /** Or the name of one of the nine built-ins — "Halo · duo", "Orbit · solo".
   *
   *  Here because the built-ins live in code and in the app's local storage,
   *  neither of which is a file a job can point at. Without this, using the
   *  house look from a batch would mean opening the app and exporting it by
   *  hand first, which is exactly the manual step a batch exists to remove.
   *  presetPath wins if both are given. */
  preset?: string;
  /** What the video is about, in a few words — "Swedish Vallhund, a Nordic
   *  herding dog breed".
   *
   *  Load-bearing, not decoration. The planner sees twenty scenes at a time
   *  and nothing else, so a line about a dog that herds cattle can be
   *  illustrated with cattle in a desert and be locally correct every step of
   *  the way. The topic is what stops that. */
  topic?: string;
  cast: JobSpeaker[];
  /** "auto" plans and downloads stock clips from the script. "none" renders
   *  over the flat background, which is faster and needs no API keys — the
   *  right choice when you are testing timing rather than looks. */
  backgrounds?: "auto" | "none";
  musicPath?: string;
  language?: string;
  /** Overrides the preset. Present because orientation is the one thing a
   *  batch is likely to vary per row — the same lesson, wide for the LMS and
   *  tall for social. */
  format?: "9:16" | "16:9";
}

export interface JobResult {
  outputPath: string;
  durationSec: number;
  frames: number;
  narrationPath: string;
  /** Script lines that matched no speaker. Never fatal — a typo in one line
   *  should not cost a ten-minute render — but always reported. */
  unmatchedLines: string[];
}

const FORMATS = {
  "9:16": { width: 1080, height: 1920 },
  "16:9": { width: 1920, height: 1080 },
} as const;

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await fsp.readFile(file, "utf8")) as T;
}

/** A file if one is given, else a built-in by name, else nothing.
 *
 *  An unknown name throws rather than falling back silently. A batch that
 *  renders forty lessons in the wrong look because a name was misspelt is a
 *  far worse outcome than one that refuses to start. */
async function resolvePreset(job: BatchJob): Promise<ProjectPreset> {
  if (job.presetPath) return readJson<ProjectPreset>(job.presetPath);
  if (!job.preset) return {} as ProjectPreset;

  const found = builtinPresets().find((p) => p.name === job.preset);
  if (!found) {
    throw new Error(
      `No preset named "${job.preset}". Built-ins are: ` +
        builtinPresets().map((p) => `"${p.name}"`).join(", ")
    );
  }
  const { name: _name, ...preset } = found;
  return preset;
}

export async function runBatchJob(
  job: BatchJob,
  ctx: RenderContext & { mediaDir: string }
): Promise<JobResult> {
  const { onProgress } = ctx;
  const preset: ProjectPreset = await resolvePreset(job);
  const slot = (i: number) => preset.slots?.[i];

  // ---- cast -------------------------------------------------------------
  // Ids are generated rather than taken from the job file. Nothing outside one
  // run refers to them, and asking a person filling a spreadsheet to invent
  // unique ids is asking for a collision that shows up as a silent mouth.
  //
  // SLOTS FIRST, then the older `speakers` field, then defaults. A slot is the
  // preset saying where this speaker stands and how they are dressed, and it
  // is the only one of the three that knows how many speakers there are.
  //
  // The first long render was made with none of them, which is why it came out
  // with a waveform ringing the middle of the frame and nothing ringing the
  // faces: defaultTrackWaveform's position is "circular", and "speaker" — the
  // halo — is a choice no default makes for you.
  const speakers: SpeakerConfig[] = job.cast.map((c, i) => {
    const s = slot(i);
    const fromPreset = preset.speakers?.[i];
    return {
      ...(fromPreset ?? {}),
      id: `s${i + 1}`,
      label: c.label,
      sheetPath: c.sheetPath ?? fromPreset?.sheetPath,
      puppetPath: c.puppetPath ?? fromPreset?.puppetPath,
      borderColor: c.borderColor ?? fromPreset?.borderColor ?? "#ff9a3c",
      surface: s?.surface,
      bgColor: fromPreset?.bgColor ?? "#000000",
      bgOpacity: fromPreset?.bgOpacity ?? 0,
      borderOpacity: fromPreset?.borderOpacity ?? 1,
      outlineShape: s?.outlineShape ?? fromPreset?.outlineShape ?? "circle",
      waveform: s?.waveform ?? fromPreset?.waveform ?? defaultTrackWaveform(i),
      // Spread across the frame when nothing says otherwise. Not a layout
      // system — slots are where layout belongs — just somewhere visible
      // rather than stacked at the origin.
      x: s?.x ?? fromPreset?.x ?? (job.cast.length === 1 ? 0.5 : 0.28 + i * 0.44),
      y: s?.y ?? fromPreset?.y ?? 0.42,
      size: s?.size ?? fromPreset?.size ?? 0.34,
      ttsEngine: c.engine,
      voiceId: c.piperOnnxPath,
      chatterboxVoiceMode: c.chatterboxVoiceMode,
      chatterboxVoiceRef: c.chatterboxVoiceRef,
    } as SpeakerConfig;
  });

  // A preset built for a different-sized cast is the exact mistake that put
  // one speaker at a three-speaker position. Say so rather than quietly using
  // whichever slots happen to line up.
  if (preset.speakerCount && preset.speakerCount !== job.cast.length) {
    onProgress(
      2,
      `Warning: preset is for ${preset.speakerCount} speaker(s), cast has ${job.cast.length}`
    );
  }

  // ---- script -----------------------------------------------------------
  const scriptText = await fsp.readFile(job.scriptPath, "utf8");
  const { segments, unmatchedLines } = parseScript(scriptText, speakers);
  if (segments.length === 0) {
    throw new Error(
      `No line in ${path.basename(job.scriptPath)} matched a cast member. ` +
        `Cast labels: ${speakers.map((s) => s.label).join(", ")}`
    );
  }
  onProgress(2, `${segments.length} lines, ${speakers.length} speakers`);

  // ---- narration --------------------------------------------------------
  const language = job.language ?? defaultProject.language;
  const narrationInput: NarrationInput[] = segments.map((seg) => {
    const sp = speakers.find((s) => s.id === seg.speakerId)!;
    const c = job.cast[speakers.indexOf(sp)];
    return {
      speakerId: seg.speakerId,
      speakerLabel: seg.speakerLabel,
      text: seg.text,
      language,
      engine: c.engine,
      piperPythonPath: c.piperPythonPath,
      piperOnnxPath: c.piperOnnxPath,
      voiceMode: c.chatterboxVoiceMode,
      predefinedVoiceId:
        c.chatterboxVoiceMode === "predefined" ? c.chatterboxVoiceRef : undefined,
      referenceAudioFilename:
        c.chatterboxVoiceMode === "clone" ? c.chatterboxVoiceRef : undefined,
    } as NarrationInput;
  });

  onProgress(4, `Synthesising ${segments.length} lines…`);
  const narration = await buildNarration(
    narrationInput,
    speakers.map((s) => s.id),
    { sameMs: defaultProject.pauseSameMs, turnMs: defaultProject.pauseTurnMs },
    ctx.outputDir
  );

  const endMs = Math.max(...narration.segments.map((s) => s.endMs));
  const durationSec = Math.max(1, Math.ceil(endMs / 1000));
  onProgress(12, `Narration ${Math.floor(durationSec / 60)}m${durationSec % 60}s`);

  // ---- backgrounds ------------------------------------------------------
  const format = job.format ?? preset.render?.format ?? defaultProject.render.format;
  const { width, height } = FORMATS[format];
  const portrait = height > width;

  let backgrounds: RenderJob["backgrounds"] = [];
  if ((job.backgrounds ?? "auto") === "auto") {
    onProgress(14, "Planning backgrounds…");
    const plan = await planBackgrounds({
      segments: narration.segments.map((s) => ({
        text: s.text,
        startMs: s.startMs,
        endMs: s.endMs,
        speakerLabel: s.speakerLabel,
      })),
      languageName: language,
      topic: job.topic,
      onBatch: (done, total) => onProgress(14, `Planning backgrounds ${done}/${total}…`),
    });
    const chosen = await pickBackgrounds(plan, { portrait });

    await fsp.mkdir(ctx.mediaDir, { recursive: true });
    const picked: NonNullable<RenderJob["backgrounds"]> = [];
    for (const [i, scene] of chosen.entries()) {
      if (!scene.hit) continue;
      const ext = (scene.hit.url.split("?")[0].match(/\.(mp4|mov|webm)$/i)?.[1] ?? "mp4").toLowerCase();
      const dest = path.join(ctx.mediaDir, `${scene.hit.provider}-${scene.hit.id}.${ext}`);
      try {
        await fsp.access(dest);
      } catch {
        await downloadTo(scene.hit.url, dest);
      }
      picked.push({
        startMs: scene.startMs,
        endMs: scene.endMs,
        filePath: dest,
        sourceSec: scene.hit.durationSec,
        query: scene.query,
      });
      onProgress(14 + Math.round((i / chosen.length) * 10), `Background ${i + 1}/${chosen.length}`);
    }
    backgrounds = picked;
  }

  // ---- render -----------------------------------------------------------
  // Assembled to match RenderBar's payload field for field. When that changes,
  // this changes with it — the two are one contract with two callers.
  const renderJob: RenderJob = {
    speakers: speakers.map((sp) => ({
      id: sp.id,
      label: sp.label,
      x: sp.x,
      y: sp.y,
      size: sp.size,
      bgColor: sp.bgColor,
      borderColor: sp.borderColor,
      bgOpacity: sp.bgOpacity,
      borderOpacity: sp.borderOpacity,
      outlineShape: sp.outlineShape,
      waveform: sp.waveform,
      sheetPath: sp.sheetPath,
      puppetPath: sp.puppetPath,
    })),
    musicWaveform: preset.musicWaveform ?? defaultProject.musicWaveform,
    musicColor: preset.musicColor ?? defaultProject.musicColor,
    width,
    height,
    fps: preset.fps ?? defaultProject.fps,
    durationSec,
    audioFilePath: narration.filePath,
    analysis: narration.analysis,
    musicFilePath: job.musicPath ?? null,
    musicAnalysis: null,
    musicVolume: defaultProject.musicVolume,
    musicDuck: defaultProject.musicDuck,
    sfx: [],
    backgrounds,
    backgroundDim: preset.backgroundDim ?? defaultProject.backgroundDim,
    backgroundCrossfadeMs: preset.backgroundCrossfadeMs ?? defaultProject.backgroundCrossfadeMs,
    subtitles: preset.subtitles ?? defaultProject.subtitles,
    visemeFadeMs: defaultProject.visemeFadeMs,
    idleMotion: defaultProject.idleMotion,
    narrationSegments: narration.segments,
  } as RenderJob;

  const result = await renderVideo(renderJob, ctx);
  return { ...result, narrationPath: narration.filePath, unmatchedLines };
}
