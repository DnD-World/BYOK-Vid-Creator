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

export async function runBatchJob(
  job: BatchJob,
  ctx: RenderContext & { mediaDir: string }
): Promise<JobResult> {
  const { onProgress } = ctx;
  const preset: ProjectPreset = job.presetPath ? await readJson(job.presetPath) : ({} as ProjectPreset);

  // ---- cast -------------------------------------------------------------
  // Ids are generated rather than taken from the job file. Nothing outside one
  // run refers to them, and asking a person filling a spreadsheet to invent
  // unique ids is asking for a collision that shows up as a silent mouth.
  const speakers: SpeakerConfig[] = job.cast.map((c, i) => {
    const fromPreset = preset.speakers?.[i];
    return {
      ...(fromPreset ?? {}),
      id: `s${i + 1}`,
      label: c.label,
      sheetPath: c.sheetPath ?? fromPreset?.sheetPath,
      puppetPath: c.puppetPath ?? fromPreset?.puppetPath,
      borderColor: c.borderColor ?? fromPreset?.borderColor ?? "#ff9a3c",
      bgColor: fromPreset?.bgColor ?? "#000000",
      bgOpacity: fromPreset?.bgOpacity ?? 0,
      borderOpacity: fromPreset?.borderOpacity ?? 1,
      outlineShape: fromPreset?.outlineShape ?? "circle",
      waveform: fromPreset?.waveform ?? defaultTrackWaveform(i),
      // Spread across the frame when the preset says nothing. Not a layout
      // system — the preset is where layout belongs — just somewhere visible
      // rather than stacked at the origin.
      x: fromPreset?.x ?? (job.cast.length === 1 ? 0.5 : 0.28 + i * 0.44),
      y: fromPreset?.y ?? 0.42,
      size: fromPreset?.size ?? 0.34,
      ttsEngine: c.engine,
      voiceId: c.piperOnnxPath,
      chatterboxVoiceMode: c.chatterboxVoiceMode,
      chatterboxVoiceRef: c.chatterboxVoiceRef,
    } as SpeakerConfig;
  });

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
