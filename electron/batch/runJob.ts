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
import crypto from "node:crypto";
import { parseDramaboxScript } from "../../src/lib/narration/parseDramaboxScript";
import type { DramaboxParams } from "../../src/lib/narration/dramaboxParams";
import type { ExpressionOptions } from "../../src/lib/narration/expression";
import { checkScript } from "../tts/checkScript";
import { analyzeNarration } from "../audio/analyzeNarration";
import { listMusic, pickMusic, BACKGROUND_VOLUME } from "../audio/musicLibrary";
import { defaultProject } from "../../src/store/defaults";
import { defaultTrackWaveform } from "../../src/lib/waveform/buildTracks";
import { builtinPresets } from "../../src/store/builtinPresets";
import { buildNarration, type NarrationInput } from "../tts/buildNarration";
import { buildDramaboxNarration } from "../tts/buildDramaboxNarration";
import { planBackgrounds, pickBackgrounds } from "../llm/backgroundPlanner";
import { downloadTo } from "../net/mediaSearch";
import { renderVideo, type RenderJob, type RenderContext } from "../render/renderVideo";
import type { ProjectPreset } from "../../src/store/templatesTypes";
import {
  WAVEFORM_STYLES,
  type OutlineShape,
  type SpeakerConfig,
  type SubtitleConfig,
  type LogoConfig,
  defaultLogo,
  type TrackWaveform,
} from "../../src/store/types";

/** One member of the cast, as a job file describes them.
 *
 *  `label` is the contract with the script: it has to match the name before
 *  the colon, because that is how a line finds its voice. Everything else is
 *  the same data the Cast panel collects. */
export interface JobSpeaker {
  label: string;
  /** Other names a script may call this speaker — `["Kaiti"]` for `Καίτη`.
   *
   *  Scripts are written with everything a machine reads in Latin: the name
   *  before the colon, the stage directions, the sound cues. Only the spoken
   *  text is Greek. The label is never drawn on screen, so this is free. */
  aliases?: string[];
  /** The exact phrase this character's blocks open with — "A grave man".
   *
   *  This is how a block finds its voice now that the script IS the engine's
   *  prompt: the phrase is already in the text for DramaBox's benefit, so
   *  using it for ours adds no syntax anyone has to remember. */
  openingPhrase?: string;
  /** A flattened viseme sheet, or a layered puppet. The puppet wins if both
   *  are given — the same precedence the preview and the render already use. */
  sheetPath?: string;
  puppetPath?: string;
  engine: "piper" | "dramabox";
  piperPythonPath?: string;
  piperOnnxPath?: string;
  /** File name of this character's DramaBox reference clip — "tsika.wav".
   *  Read by tools/make-blocks.mjs; the clip itself lives in voice-refs/. */
  voiceRef?: string;
  /** Engine settings for THIS character. Everything omitted falls back to
   *  DRAMABOX_DEFAULTS. A `[VOICE: …]` line in the script overrides these for
   *  one block.
   *
   *  These exist because a cast is not one voice: Τσίκα wants more
   *  expressiveness and less time per word than Σερίφης, and until this field
   *  existed there was nowhere to say so. */
  dramabox?: Partial<DramaboxParams>;
  /** Whether the app may add expression this character's lines were written
   *  without. Off unless asked for, and every change it makes is reported. */
  expression?: ExpressionOptions;
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
  /** A music bed. A path to one file, or "auto" to take one from the library
   *  in `music/` — which is what a batch wants, since it gives every lesson a
   *  bed without naming one 72 times. "none" or absent is silence. */
  musicPath?: string;
  music?: "auto" | "none";
  /** 0–1. Absent means the background level, which is deliberately low. */
  musicVolume?: number;
  language?: string;
  /** Overrides the preset. Present because orientation is the one thing a
   *  batch is likely to vary per row — the same lesson, wide for the LMS and
   *  tall for social. */
  format?: "9:16" | "16:9";
  /** x264 quality, 0–51: lower is better and bigger. Defaults to 23. Raise it
   *  for social cuts, where the platform re-encodes everything anyway and the
   *  only thing a large file buys is upload time. */
  crf?: number;
  /** Override the preset's scrim and blur over the footage.
   *
   *  Here because judging any new effect needs the picture behind it left
   *  alone: a glass test run under a preset that blurs the whole background
   *  shows a blurred video either way, and says nothing about the glass. */
  backgroundDim?: number;
  backgroundBlur?: number;
  /** Background clips per minute of finished video. 3.5 by default, clamped
   *  2-6. The first long render cut every 8 seconds, which is a music video,
   *  not a lesson. */
  backgroundsPerMinute?: number;
  /** A pane of glass over the background and waveform. Refracts those two
   *  only — the avatars and subtitles draw in front of it and stay sharp. */
  glass?: RenderJob["glass"];
  /** Force every speaker's waveform to one style, whatever the preset says.
   *
   *  Here because comparing styles used to mean editing a preset in source
   *  between renders. A replacement that quietly matched nothing produced four
   *  "different" renders that were all the same style, and they looked
   *  identical because they WERE identical. A job field cannot fail that way:
   *  a bad value is rejected by name below. */
  waveformStyle?: TrackWaveform["style"];
  /** Force every speaker's frame shape. The ring styles take their shape from
   *  it, so this is the only way to see a square waveform: no built-in preset
   *  uses a square frame, and "it uses the same call the boil does" is an
   *  argument, not a check. */
  outlineShape?: OutlineShape;
  /** A folder of block WAVs already generated on the GPU box — 000.wav, 001.wav
   *  and so on, one per block in script order.
   *
   *  Present because DramaBox does not run on this machine: it needs 24GB and
   *  the laptop has 8. Narration is made on a rented L4 by
   *  tools/dramabox-render-blocks.py and the audio comes back as files. */
  dramaboxWavDir?: string;
  /** words.json from tools/dramabox-align.py — when each word was actually
   *  said. Without it every word time is estimated from letter counts. */
  dramaboxWordsPath?: string;
  /** Subtitle typeface, by Google Fonts name — "Comfortaa".
   *
   *  A job used to inherit the app's default of `null`, which falls back to the
   *  system stack, so a headless render silently used a different typeface from
   *  the one chosen in the app. Nothing reported it because nothing was wrong
   *  as far as the code was concerned. */
  /** Debug: write narration segments and measured pauses here, so subtitle
   *  drift can be measured against the real audio instead of argued about. */
  dumpNarrationMeta?: string;
  subtitleFont?: string;
  subtitleFontWeight?: number;
  /** How the spoken word is marked — see SubtitleConfig.activeEmphasis.
   *  Here for the same reason waveformStyle is: comparing two looks must not
   *  mean editing a preset in source between renders. */
  subtitleEmphasis?: SubtitleConfig["activeEmphasis"];
  /** Two- or three-second cards welded on after the render. Any video ffmpeg
   *  can read; scaled to fit the frame. A card with no sound is fine. */
  introPath?: string;
  outroPath?: string;
  /** A logo over every frame. Just a path uses the defaults — bottom right,
   *  12% of the frame's width. */
  logoPath?: string;
  logoPosition?: LogoConfig["position"];
  logoSize?: number;
  logoOpacity?: number;
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
      surface: s?.surface ?? fromPreset?.surface,
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
    } as SpeakerConfig;
  });

  // ONE STYLE FOR EVERY SPEAKER, when the job asks for it. Comparing looks is
  // the reason this exists, and comparing looks means changing one thing.
  //
  // A bad name THROWS rather than being ignored. Silently keeping the preset's
  // style would reproduce the original fault exactly: a render that succeeds,
  // reports nothing, and shows the style you were trying to replace.
  if (job.waveformStyle) {
    if (!(WAVEFORM_STYLES as readonly string[]).includes(job.waveformStyle)) {
      throw new Error(
        `No waveform style "${job.waveformStyle}". Styles are: ${WAVEFORM_STYLES.join(", ")}`
      );
    }
    for (const sp of speakers) {
      sp.waveform = { ...sp.waveform, style: job.waveformStyle };
    }
    onProgress(2, `Waveform style forced to "${job.waveformStyle}" for all speakers`);
  }

  if (job.outlineShape) {
    const shapes: readonly OutlineShape[] = ["circle", "rounded", "square", "none"];
    if (!shapes.includes(job.outlineShape)) {
      throw new Error(
        `No outline shape "${job.outlineShape}". Shapes are: ${shapes.join(", ")}`
      );
    }
    for (const sp of speakers) sp.outlineShape = job.outlineShape;
    onProgress(2, `Frame shape forced to "${job.outlineShape}" for all speakers`);
  }

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
  const castPhrases = job.cast.map(
    (c, i) => c.openingPhrase ?? `Speaker ${i + 1}`
  );
  const { segments, unmatchedLines, cues, blocks } = parseDramaboxScript(
    scriptText,
    speakers.map((s, i) => ({
      id: s.id,
      label: s.label,
      openingPhrase: castPhrases[i],
    }))
  );
  if (segments.length === 0) {
    throw new Error(
      `No line in ${path.basename(job.scriptPath)} matched a cast member. ` +
        `Cast labels: ${speakers.map((s) => s.label).join(", ")}`
    );
  }
  // CHECKED BEFORE ANYTHING IS SPENT. Every rule in checkScript fails quietly:
  // a job word in a direction is spoken aloud in the finished video, a stray
  // double quote silently swallows the rest of a line, a direction naming its
  // own subject produces a broken sentence. None of it throws on its own, and
  // all of it survives into a render that reports success.
  const problems = checkScript(scriptText, castPhrases);
  if (problems.length) {
    const detail = problems
      .map((p) => `  line ${p.line}: ${p.problem}\n            ${p.fix}\n            > ${p.text}`)
      .join("\n");
    throw new Error(
      `${problems.length} problem(s) in ${path.basename(job.scriptPath)}:\n${detail}`
    );
  }

  onProgress(2, `${segments.length} lines, ${speakers.length} speakers, script checks out`);

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
      engine: "piper" as const,
      piperPythonPath: c.piperPythonPath,
      piperOnnxPath: c.piperOnnxPath,
    } as NarrationInput;
  });

  // ---- music bed -------------------------------------------------------
  // Chosen from the lesson's own script path, so re-rendering it tomorrow
  // gives it the same loop and the course does not drift halfway through.
  let musicFile: string | null = job.musicPath ?? null;
  let musicAnalysis: RenderJob["musicAnalysis"] = null;
  if (!musicFile && job.music === "auto") {
    const tracks = await listMusic(path.join(ctx.projectRoot, "music"));
    const chosen = pickMusic(tracks, job.scriptPath);
    if (chosen) {
      musicFile = chosen.filePath;
      onProgress(3, `Music: ${chosen.name}`);
    } else {
      onProgress(3, "Music: asked for auto, and music/ has no .wav files — silent");
    }
  }
  if (musicFile) {
    try {
      musicAnalysis = analyzeNarration(await fsp.readFile(musicFile), [], []);
    } catch (e) {
      // Said out loud: an unanalysed bed plays once and then stops, which is
      // four silent minutes nobody notices until the end of the lesson.
      onProgress(3, `Music could not be analysed and will not repeat: ${String(e)}`);
    }
  }

  onProgress(4, `Synthesising ${segments.length} lines…`);
  const narration = job.dramaboxWavDir
    ? await buildDramaboxNarration(
        blocks,
        segments,
        job.dramaboxWavDir,
        speakers.map((s) => s.id),
        { sameMs: defaultProject.pauseSameMs, turnMs: defaultProject.pauseTurnMs },
        ctx.outputDir,
        job.dramaboxWordsPath
          ? JSON.parse(await fsp.readFile(job.dramaboxWordsPath, "utf8"))
          : undefined
      )
    : await buildNarration(
    narrationInput,
    speakers.map((s) => s.id),
    { sameMs: defaultProject.pauseSameMs, turnMs: defaultProject.pauseTurnMs },
    ctx.outputDir
  );

  if (job.dumpNarrationMeta) {
    await fsp.writeFile(
      path.join(job.dumpNarrationMeta, "segments.json"),
      JSON.stringify(narration.segments)
    );
    await fsp.writeFile(
      path.join(job.dumpNarrationMeta, "pauses.json"),
      JSON.stringify(narration.pauses ?? [])
    );
  }

  const endMs = Math.max(...narration.segments.map((s) => s.endMs));
  const durationSec = Math.max(1, Math.ceil(endMs / 1000));
  onProgress(12, `Narration ${Math.floor(durationSec / 60)}m${durationSec % 60}s`);

  // ---- sound effects ----------------------------------------------------
  // Cues carry a segment index, not a time, because when a script is written
  // nobody knows how long a line will take to say. Narration has just told us,
  // so this is the first moment they can be placed.
  //
  // A SOUND THAT DOES NOT EXIST YET IS A REQUEST, NOT AN ERROR IN THE SCRIPT.
  //
  // The library is small and the writing should not be limited to it — asking
  // for a doorbell in lesson 4 is a reasonable thing for a script to do. So an
  // unknown name is written into sfx/wanted.csv, which is already the queue
  // that tools/make-sfx.py generates from.
  //
  // It still STOPS THE RENDER rather than carrying on without the sound. A cue
  // is three words in a script, and a render that skipped it quietly would mean
  // finding the missing doorbell by watching ten minutes of video. Generating
  // the sound is a GPU run and deliberately not started from here.
  const sfxDir = path.join(path.dirname(job.scriptPath), "..", "sfx", "library");
  const wantedPath = path.join(path.dirname(job.scriptPath), "..", "sfx", "wanted.csv");
  const sfxClips: NonNullable<RenderJob["sfx"]> = [];
  const missing: string[] = [];
  for (const cue of cues) {
    const filePath = path.join(sfxDir, `${cue.name}.wav`);
    try {
      await fsp.access(filePath);
    } catch {
      if (!missing.includes(cue.name)) missing.push(cue.name);
      continue;
    }
    // At the start of the line it precedes, or at the very end when it is the
    // last thing in the script.
    const at =
      cue.beforeSegment < narration.segments.length
        ? narration.segments[cue.beforeSegment].startMs
        : endMs;
    sfxClips.push({ filePath, atMs: at, volume: 0.8, label: cue.name });
  }
  if (missing.length) {
    const existing = await fsp.readFile(wantedPath, "utf8").catch(() => "name,prompt,seconds,notes\n");
    const already = new Set(existing.split("\n").map((l) => l.split(",")[0].trim()));
    const rows = missing
      .filter((n) => !already.has(n))
      // The prompt column is left for a person: a good one is the difference
      // between a doorbell and a doorbell that sounds like a microwave, and
      // guessing it from a file stem would fill the queue with bad prompts.
      .map((n) => `${n},"TODO: describe this sound",3,Requested by a script\n`)
      .join("");
    if (rows) await fsp.appendFile(wantedPath, rows);
    throw new Error(
      `Sound effect(s) not in sfx/library: ${missing.join(", ")}. ` +
        `Added to sfx/wanted.csv — write the prompt column, then generate them.`
    );
  }
  if (sfxClips.length) onProgress(12, `${sfxClips.length} sound effect(s) placed`);

  // ---- backgrounds ------------------------------------------------------
  const format = job.format ?? preset.render?.format ?? defaultProject.render.format;
  const { width, height } = FORMATS[format];
  const portrait = height > width;

  let backgrounds: RenderJob["backgrounds"] = [];
  if ((job.backgrounds ?? "auto") === "auto") {
    onProgress(14, "Planning backgrounds…");

    // CACHED FOR THE SAME REASON THE NARRATION IS, and it turned out to matter
    // more. A nine-minute script costs four LLM calls, and re-running a job —
    // to fix a look, to retry a failed render — spent them again every time.
    // NVIDIA's free tier stopped answering after a day of that, which killed a
    // run whose narration was already cached and free. A batch of forty
    // lessons is a hundred and sixty calls; re-running one row should not cost
    // any of them.
    //
    // Keyed on what the plan is actually derived from: the words, when they
    // are said, the topic, the language and the orientation. Not the look or
    // the cast.
    const planKey = crypto
      .createHash("sha256")
      .update(
        JSON.stringify([
          narration.segments.map((s) => [s.text, s.startMs, s.endMs]),
          job.topic ?? "",
          language,
          portrait,
        ])
      )
      .digest("hex")
      .slice(0, 16);
    const planCacheDir = path.join(ctx.outputDir, "plan-cache");
    const planFile = path.join(planCacheDir, `${planKey}.json`);

    let plan: Awaited<ReturnType<typeof planBackgrounds>>;
    try {
      plan = JSON.parse(await fsp.readFile(planFile, "utf8"));
      onProgress(24, `Reusing a cached plan of ${plan.scenes.length} scenes`);
    } catch {
      plan = await planBackgrounds({
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
      try {
        await fsp.mkdir(planCacheDir, { recursive: true });
        await fsp.writeFile(planFile, JSON.stringify(plan));
      } catch {
        /* a plan we cannot cache is a slower next run, not a broken this one */
      }
    }
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
      // Without this the glass never reaches the composition. The list above
      // is hand-written rather than a spread, which is deliberate — the render
      // should get only what it draws with — and the cost is that a new field
      // has to be added here as well as to the type. It was not, and a preset
      // asking for glass produced a video with none.
      surface: sp.surface,
      sheetPath: sp.sheetPath,
      puppetPath: sp.puppetPath,
    })),
    musicColor: preset.musicColor ?? defaultProject.musicColor,
    width,
    height,
    fps: preset.fps ?? defaultProject.fps,
    durationSec,
    audioFilePath: narration.filePath,
    analysis: narration.analysis,
    musicFilePath: musicFile,
    // ANALYSED, OR IT PLAYS ONCE AND STOPS. The composition repeats a bed by
    // counting frames against the track's own length, and without an analysis
    // it has no length to count against — so it plays the file from the top
    // and leaves silence for the rest of the lesson. These loops are twelve to
    // eighty-five seconds against lessons of five minutes, so that is not an
    // edge case, it is every single row.
    musicAnalysis: musicAnalysis,
    musicVolume: job.musicVolume ?? BACKGROUND_VOLUME,
    musicDuck: defaultProject.musicDuck,
    sfx: sfxClips,
    backgrounds,
    backgroundDim: job.backgroundDim ?? preset.backgroundDim ?? defaultProject.backgroundDim,
    backgroundBlur: job.backgroundBlur ?? preset.backgroundBlur ?? defaultProject.backgroundBlur,
    backgroundCrossfadeMs: preset.backgroundCrossfadeMs ?? defaultProject.backgroundCrossfadeMs,
    // MERGED, not chosen between. A preset is partial by contract — its own
    // doc comment says every field is optional on read so that older, hand-
    // written and AI-generated presets still load. `?? defaults` only fires
    // when the whole object is missing, so a preset that set six subtitle
    // fields was silently handing the renderer `enabled: undefined` and no
    // colours at all. The nine built-ins all do exactly that.
    subtitles: {
      ...defaultProject.subtitles,
      ...preset.subtitles,
      ...(job.subtitleFont ? { fontFamily: job.subtitleFont } : {}),
      ...(job.subtitleFontWeight ? { fontWeight: job.subtitleFontWeight } : {}),
      ...(job.subtitleEmphasis ? { activeEmphasis: job.subtitleEmphasis } : {}),
    },
    musicWaveform: { ...defaultProject.musicWaveform, ...preset.musicWaveform },
    visemeFadeMs: defaultProject.visemeFadeMs,
    idleMotion: defaultProject.idleMotion,
    narrationSegments: narration.segments,
    narrationPauses: narration.pauses ?? [],
    crf: job.crf,
    introPath: job.introPath,
    outroPath: job.outroPath,
    logo: job.logoPath
      ? {
          ...defaultLogo(),
          filePath: job.logoPath,
          ...(job.logoPosition ? { position: job.logoPosition } : {}),
          ...(job.logoSize !== undefined ? { size: job.logoSize } : {}),
          ...(job.logoOpacity !== undefined ? { opacity: job.logoOpacity } : {}),
        }
      : null,
    glass: job.glass ?? null,
  } as RenderJob;

  const result = await renderVideo(renderJob, ctx);
  return { ...result, narrationPath: narration.filePath, unmatchedLines };
}
