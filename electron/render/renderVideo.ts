// ---------------------------------------------------------------------------
// Remotion render pipeline.
//
// Three stages, each of which can be slow the first time and is therefore
// reported separately to the UI:
//
//   1. ensureBrowser  — downloads a headless Chromium shell (~150MB) once,
//                       into Remotion's own cache. Instant on later renders.
//   2. bundle         — webpack-builds remotion/index.ts into a servable
//                       bundle. Tens of seconds cold.
//   3. renderMedia    — renders every frame and muxes to MP4 via FFmpeg
//                       (bundled with @remotion/renderer, not the system one).
//
// This runs in the Electron MAIN process, never the renderer: it spawns child
// processes and needs real filesystem access.
// ---------------------------------------------------------------------------

import path from "node:path";
import fsp from "node:fs/promises";
import os from "node:os";
import { bundle } from "@remotion/bundler";
import { selectComposition, renderMedia, ensureBrowser } from "@remotion/renderer";
import {
  COMPOSITION_ID,
  type RenderBackground,
  type RenderProps,
  type RenderSpeaker,
} from "../../remotion/types";
import type { Puppet } from "../../src/store/puppetTypes";
import { puppetAssetPaths, validatePuppet } from "../../src/lib/puppets/puppetAssets";
import { ensureFont } from "../net/fonts";

export interface RenderJob {
  musicWaveform: RenderProps["musicWaveform"];
  musicColor: string;
  /** Faces arrive as disk paths — a sheet image, or a puppet JSON with its art
   *  beside it — and are converted to public-dir filenames here, so the
   *  renderer never has to know about the filesystem. */
  speakers: (Omit<RenderSpeaker, "sheetFileName" | "puppet" | "puppetFiles"> & {
    sheetPath?: string;
    puppetPath?: string;
  })[];
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  /** Absolute path to a narration WAV, or null/undefined for a silent render. */
  audioFilePath?: string | null;
  /** Precomputed by the narration step; null for hand-attached audio. */
  analysis?: RenderProps["analysis"];
  /** A music bed, mixed under the narration rather than replacing it. Its
   *  analysis drives the music waveform; the NARRATION's analysis is what
   *  decides when it ducks. */
  musicFilePath?: string | null;
  musicAnalysis?: RenderProps["analysis"];
  musicVolume?: number;
  musicDuck?: number;
  /** Sound effects: a file and the moment it fires. */
  sfx?: { filePath: string; atMs: number; volume: number; label?: string }[];
  /** Background clips as the project holds them: a path on disk, plus the
   *  provider's reported length so the composition can loop a clip that is
   *  shorter than the scene it has to cover. A scene with no file is dropped
   *  here rather than in the composition, which has no way to check. */
  backgrounds?: {
    startMs: number;
    endMs: number;
    filePath?: string | null;
    sourceSec?: number;
    /** Only for the warning text when a file can't be read. */
    query?: string;
  }[];
  backgroundDim?: number;
  backgroundBlur?: number;
  glass?: RenderProps["glass"];
  backgroundCrossfadeMs?: number;
  subtitles: RenderProps["subtitles"];
  visemeFadeMs?: number;
  idleMotion?: number;
  narrationSegments?: RenderProps["narrationSegments"];
  narrationPauses?: number[];
  /** x264 quality, 0–51: lower is better and bigger. Absent means 23, which is
   *  x264's own default and the usual "visually transparent" mark. Exposed so
   *  a batch can trade size against quality per row — a social cut and an LMS
   *  master do not want the same file. */
  crf?: number;
}

export interface RenderContext {
  /** Repo root in dev — the folder containing remotion/ and package.json. */
  projectRoot: string;
  outputDir: string;
  /** Where downloaded subtitle fonts are cached. Passed in rather than derived
   *  here because only main knows where userData is. */
  fontsDir: string;
  onProgress: (pct: number, note: string) => void;
}

const AUDIO_PUBLIC_NAME = "narration.wav";
const SPECTRUM_PUBLIC_NAME = "spectrum.bin";
const MUSIC_SPECTRUM_PUBLIC_NAME = "music-spectrum.bin";

/** Weights for turning three sequential stages into one 0-100 bar. Renders
 *  dominate on repeat runs, which is the case the user sees most often. */
const STAGE = {
  browser: { from: 0, to: 10 },
  bundle: { from: 10, to: 30 },
  render: { from: 30, to: 100 },
};

function lerp(stage: { from: number; to: number }, t: number): number {
  return Math.round(stage.from + (stage.to - stage.from) * Math.max(0, Math.min(1, t)));
}

export async function renderVideo(
  job: RenderJob,
  ctx: RenderContext
): Promise<{
  outputPath: string;
  durationSec: number;
  frames: number;
  /** Everything the render could NOT apply. Returned rather than only logged,
   *  so a batch can decide what to do about a row that came out wrong. */
  warnings: string[];
}> {
  const { projectRoot, outputDir, onProgress } = ctx;

  const entryPoint = path.join(projectRoot, "remotion", "index.ts");
  try {
    await fsp.access(entryPoint);
  } catch {
    throw new Error(
      `Remotion entry point not found at ${entryPoint}. In a packaged build the remotion/ ` +
        `sources must be shipped alongside the app (see asarUnpack / extraResources).`
    );
  }

  // A per-render public dir. Remotion serves this over http:// inside the
  // headless browser, which is why the audio has to be copied in rather than
  // referenced by absolute path — a file:// src would be blocked as a
  // cross-origin request from the bundle's http:// origin.
  const publicDir = await fsp.mkdtemp(path.join(os.tmpdir(), "byok-render-"));
  let audioFileName: string | null = null;
  const warnings: string[] = [];

  try {
    if (job.audioFilePath) {
      await fsp.copyFile(job.audioFilePath, path.join(publicDir, AUDIO_PUBLIC_NAME));
      audioFileName = AUDIO_PUBLIC_NAME;
    }

    // The spectrum is the one part of the analysis big enough to matter — a
    // ten-minute narration is 1.7MB of bytes — so it goes to disk and the
    // composition fetches it, while the rest of the analysis (a few thousand
    // small numbers) still rides along in inputProps. Written as one buffer of
    // bands followed by peaks; the composition splits it in half.
    //
    // Everything that belongs in the public dir has to be written BEFORE
    // bundle() runs: the bundler copies the directory into the served output,
    // so a file written after it is never served. Writing this one late made
    // the fetch 404, the composition fall back to the loudness envelope, and
    // the render come out looking exactly like the version this change was
    // supposed to replace — with no error anywhere.
    const spectrum = job.analysis?.spectrum ?? null;
    let spectrumFileName: string | null = null;
    let spectrumBandCount = 0;
    if (spectrum && spectrum.bandCount > 0) {
      await fsp.writeFile(
        path.join(publicDir, SPECTRUM_PUBLIC_NAME),
        Buffer.concat([
          Buffer.from(spectrum.bands, "base64"),
          Buffer.from(spectrum.peaks, "base64"),
        ])
      );
      spectrumFileName = SPECTRUM_PUBLIC_NAME;
      spectrumBandCount = spectrum.bandCount;
    }

    // The music bed, and its own spectrum by the same route. Its extension is
    // kept: unlike the narration, which this app always produces as a WAV, this
    // is whatever file the user picked, and an mp3 renamed .wav is a file no
    // decoder will touch.
    let musicFileName: string | null = null;
    if (job.musicFilePath) {
      const name = `music${path.extname(job.musicFilePath) || ".mp3"}`;
      try {
        await fsp.copyFile(job.musicFilePath, path.join(publicDir, name));
        musicFileName = name;
      } catch {
        // Silent video with music missing is wrong; a video with no music is
        // merely plainer. Carry on and say so.
        warnings.push("[byok] The music file couldn't be read; rendering without it.");
      }
    }

    const musicSpectrum = musicFileName ? job.musicAnalysis?.spectrum ?? null : null;
    let musicSpectrumFileName: string | null = null;
    let musicSpectrumBandCount = 0;
    if (musicSpectrum && musicSpectrum.bandCount > 0) {
      await fsp.writeFile(
        path.join(publicDir, MUSIC_SPECTRUM_PUBLIC_NAME),
        Buffer.concat([
          Buffer.from(musicSpectrum.bands, "base64"),
          Buffer.from(musicSpectrum.peaks, "base64"),
        ])
      );
      musicSpectrumFileName = MUSIC_SPECTRUM_PUBLIC_NAME;
      musicSpectrumBandCount = musicSpectrum.bandCount;
    }

    // Viseme sheets travel the same road as the audio, for the same reason: the
    // bundle is served over http:// inside the headless browser, so a file://
    // reference to somewhere on disk is blocked as cross-origin. Deduplicated by
    // source path so two speakers sharing a sheet copy it once.
    const sheetNameByPath = new Map<string, string>();

    // Puppet layers travel the same road, and are deduplicated the same way —
    // which matters far more here than it does for sheets. Three speakers on
    // one puppet is 60 copyFile calls of the same twenty PNGs otherwise, and
    // the whole cast typically shares one `viseme/` folder.
    const layerNameByPath = new Map<string, string>();
    const puppetCache = new Map<string, { puppet: Puppet; files: Record<string, string> } | null>();

    /** Load a puppet and copy its art in, returning what the composition needs
     *  to draw it — or null, which renders that speaker faceless rather than
     *  aborting a render that is otherwise entirely valid. */
    const preparePuppet = async (puppetPath: string, label: string) => {
      if (puppetCache.has(puppetPath)) return puppetCache.get(puppetPath)!;
      let prepared: { puppet: Puppet; files: Record<string, string> } | null = null;
      try {
        const raw = JSON.parse(await fsp.readFile(puppetPath, "utf8"));
        const res = validatePuppet(raw);
        if (!res.ok) throw new Error(res.error);
        const files: Record<string, string> = {};
        for (const [file, abs] of Object.entries(puppetAssetPaths(res.puppet, puppetPath))) {
          let name = layerNameByPath.get(abs);
          if (!name) {
            name = `puppet-${layerNameByPath.size}${path.extname(abs) || ".png"}`;
            // One missing layer is a missing brow, not a missing character, so
            // it is skipped rather than failing the whole puppet.
            try {
              await fsp.copyFile(abs, path.join(publicDir, name));
              layerNameByPath.set(abs, name);
            } catch {
              warnings.push(`[byok] ${label}: layer ${file} could not be read.`);
              continue;
            }
          }
          files[file] = name;
        }
        prepared = { puppet: res.puppet, files };
      } catch (e) {
        onProgress(
          STAGE.browser.from,
          `Couldn't load the puppet for ${label} (${e instanceof Error ? e.message : String(e)}), rendering without a face.`
        );
      }
      puppetCache.set(puppetPath, prepared);
      return prepared;
    };

    const speakers: RenderSpeaker[] = [];
    for (const sp of job.speakers) {
      // The puppet wins when both are set — same precedence as the preview.
      const prepared = sp.puppetPath ? await preparePuppet(sp.puppetPath, sp.label) : null;
      let sheetFileName: string | null = null;
      // A speaker with a working puppet never draws their sheet, so there is no
      // reason to copy 15MB of it into the bundle.
      if (sp.sheetPath && !prepared) {
        let name = sheetNameByPath.get(sp.sheetPath);
        if (!name) {
          name = `viseme-${sheetNameByPath.size}${path.extname(sp.sheetPath) || ".png"}`;
          try {
            await fsp.copyFile(sp.sheetPath, path.join(publicDir, name));
            sheetNameByPath.set(sp.sheetPath, name);
          } catch (e) {
            // A missing sheet must not abort an otherwise valid render — the
            // speaker just renders faceless, exactly as before one was picked.
            onProgress(STAGE.browser.from, `Couldn't read viseme sheet for ${sp.label}, rendering without a face.`);
            name = undefined;
          }
        }
        sheetFileName = name ?? null;
      }
      speakers.push({
        id: sp.id, label: sp.label, x: sp.x, y: sp.y, size: sp.size,
        bgColor: sp.bgColor, borderColor: sp.borderColor,
        bgOpacity: sp.bgOpacity, borderOpacity: sp.borderOpacity,
        outlineShape: sp.outlineShape, waveform: sp.waveform,
        surface: sp.surface,
        sheetFileName,
        puppet: prepared?.puppet ?? null,
        puppetFiles: prepared?.files ?? {},
      });
    }

    // Sound effects. Deduplicated by path, because the same bark placed four
    // times is one file and four moments.
    const sfxNameByPath = new Map<string, string>();
    const sfx: RenderProps["sfx"] = [];
    for (const clip of job.sfx ?? []) {
      if (!clip.filePath) continue;
      let name = sfxNameByPath.get(clip.filePath);
      if (!name) {
        name = `sfx-${sfxNameByPath.size}${path.extname(clip.filePath) || ".wav"}`;
        try {
          await fsp.copyFile(clip.filePath, path.join(publicDir, name));
          sfxNameByPath.set(clip.filePath, name);
        } catch {
          warnings.push(
            `[byok] The sound effect "${clip.label ?? clip.filePath}" couldn't be read; skipped.`
          );
          continue;
        }
      }
      sfx.push({ fileName: name, atMs: clip.atMs, volume: clip.volume });
    }

    // Background clips take exactly the same road as the audio and the art, and
    // for the same reason — and, like everything else here, they must be in the
    // public dir BEFORE bundle() runs or they are simply not served.
    //
    // Deduplicated by source path: the same clip covering two scenes is one
    // copy, and these are megabytes each rather than kilobytes.
    const bgNameByPath = new Map<string, string>();
    const backgrounds: RenderBackground[] = [];
    for (const bg of job.backgrounds ?? []) {
      if (!bg.filePath) continue;
      let name = bgNameByPath.get(bg.filePath);
      if (!name) {
        name = `bg-${bgNameByPath.size}${path.extname(bg.filePath) || ".mp4"}`;
        try {
          await fsp.copyFile(bg.filePath, path.join(publicDir, name));
          bgNameByPath.set(bg.filePath, name);
        } catch {
          // One unreadable clip is one plain stretch of video, not a failed
          // render — same rule as a missing viseme sheet.
          warnings.push(
            `[byok] Background clip for "${bg.query ?? "a scene"}" couldn't be read; ` +
              `that stretch renders without one.`
          );
          continue;
        }
      }
      backgrounds.push({
        startMs: bg.startMs,
        endMs: bg.endMs,
        fileName: name,
        sourceSec: bg.sourceSec ?? 0,
      });
    }

    // The subtitle typeface. Downloaded on first use and cached, so this is
    // usually a directory read; the network is only touched for a font that has
    // never been used on this machine. A failure here costs the chosen font,
    // not the render — the composition falls back to the system stack.
    let subtitleFont: RenderProps["subtitleFont"] = null;
    if (job.subtitles.fontFamily) {
      try {
        const font = await ensureFont(
          job.subtitles.fontFamily,
          job.subtitles.fontWeight ?? 800,
          ctx.fontsDir
        );
        const faces: { fileName: string; unicodeRange: string }[] = [];
        for (let i = 0; i < font.faces.length; i++) {
          const name = `font-${i}.woff2`;
          await fsp.copyFile(font.faces[i].path, path.join(publicDir, name));
          faces.push({ fileName: name, unicodeRange: font.faces[i].unicodeRange });
        }
        subtitleFont = { family: font.family, weight: font.weight, faces };
      } catch (e) {
        warnings.push(
          `[byok] Couldn't prepare the subtitle font "${job.subtitles.fontFamily}" ` +
            `(${e instanceof Error ? e.message : String(e)}); using the default typeface.`
        );
      }
    }

    onProgress(STAGE.browser.from, "Checking render browser…");
    await ensureBrowser({
      onBrowserDownload: () => ({
        version: null,
        onProgress: ({ percent }) => {
          onProgress(
            lerp(STAGE.browser, percent),
            "Downloading render browser (one time, ~150MB)…"
          );
        },
      }),
    });

    onProgress(STAGE.bundle.from, "Building render bundle…");
    const serveUrl = await bundle({
      entryPoint,
      publicDir,
      onProgress: (percent) => {
        onProgress(lerp(STAGE.bundle, percent / 100), "Building render bundle…");
      },
    });

    const inputProps: RenderProps = {
      musicWaveform: job.musicWaveform,
      musicColor: job.musicColor,
      speakers,
      width: job.width,
      height: job.height,
      fps: job.fps,
      durationSec: job.durationSec,
      audioFileName,
      // Stripped, not omitted: leaving it in would put the whole spectrum in
      // inputProps as well as in the file, which is the cost this avoids.
      analysis: job.analysis ? { ...job.analysis, spectrum: null } : null,
      spectrumFileName,
      spectrumBandCount,
      musicFileName,
      // Stripped for the same reason the narration's is: it is in the file.
      musicAnalysis: job.musicAnalysis ? { ...job.musicAnalysis, spectrum: null } : null,
      musicSpectrumFileName,
      musicSpectrumBandCount,
      musicVolume: job.musicVolume ?? 0,
      musicDuck: job.musicDuck ?? 0,
      sfx,
      backgrounds,
      backgroundDim: job.backgroundDim ?? 0,
      backgroundBlur: job.backgroundBlur ?? 0,
      glass: job.glass ?? null,
      backgroundCrossfadeMs: job.backgroundCrossfadeMs ?? 0,
      subtitles: job.subtitles,
      subtitleFont,
      visemeFadeMs: job.visemeFadeMs ?? 0,
      idleMotion: job.idleMotion ?? 0,
      narrationSegments: job.narrationSegments ?? [],
      narrationPauses: job.narrationPauses ?? [],
    };

    // ASKED FOR, AND NEVER FORWARDED.
    //
    // This project's failure is not the crash. It is the render that reports
    // success while quietly leaving something out, and it has happened four
    // times: the spectrum 404, `backgroundBlur`, subtitle surfaces, and
    // transitions. Every one was the same shape — a setting arrived on the job,
    // nothing carried it into `inputProps`, and the composition drew a video
    // that was subtly not the one that was asked for.
    //
    // A console message inside the composition cannot catch that class, because
    // the composition never hears about the setting at all. So the check is
    // here, where both sides are in scope: anything set on the job that is not
    // in `inputProps` and is not consumed by this file is named out loud.
    //
    // Keeping this list current is the price. A new job field either reaches
    // the composition or it is listed below as deliberately handled here —
    // there is no third option that passes quietly.
    const HANDLED_HERE = new Set([
      "audioFilePath",      // copied in, forwarded as audioFileName
      "musicFilePath",      // same
      "speakers",           // sheets and puppets are copied in and rewritten
      "sfx",                // copied in, rewritten to file names
      "backgrounds",        // clips copied in, rewritten to file names
      "subtitleFont",       // fetched and forwarded as files
      "crf",                // encoder setting, never reaches the composition
      "projectRoot",
      "outputDir",
      "outputName",
      "jobId",
    ]);
    for (const [key, value] of Object.entries(job)) {
      if (value === undefined || value === null) continue;
      if (key in inputProps) continue;
      if (HANDLED_HERE.has(key)) continue;
      warnings.push(
        `[byok] the render was given "${key}" and nothing carried it into the ` +
          `composition — it had NO EFFECT on this video.`
      );
    }

    const composition = await selectComposition({
      serveUrl,
      id: COMPOSITION_ID,
      inputProps,
    });

    await fsp.mkdir(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `render-${Date.now()}.mp4`);

    onProgress(STAGE.render.from, "Rendering frames…");
    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      outputLocation: outputPath,
      inputProps,
      // MEASURED: the first nine-minute render came out at 668 MB — about
      // 10 Mbit/s — because nothing here set a quality and Remotion's default
      // is deliberately generous. That is not a decision anyone made, and no
      // LMS wants a 668 MB lesson.
      //
      // CRF is a quality target, not a bitrate: the encoder spends bits where
      // the picture needs them and saves them where it doesn't, which suits
      // this material well since long stretches are a near-static frame with a
      // moving mouth and a waveform. 23 is x264's own default and the usual
      // "visually transparent" mark for delivery.
      //
      // `medium` rather than `veryfast` because rendering frames already
      // dominates the clock at two thirds of the total — spending a little
      // more time in the encoder to make the file substantially smaller is the
      // right side of that trade.
      crf: job.crf ?? 23,
      x264Preset: "medium",
      // Audio at a real bitrate rather than whatever falls out. Narration is
      // the one thing a lesson cannot afford to sound cheap.
      audioCodec: "aac",
      audioBitrate: "192k",
      // The composition can't talk back except through the browser console, and
      // the one thing it needs to say — "I couldn't load the spectrum, this
      // video is silently worse than it should be" — is invisible otherwise.
      onBrowserLog: (log) => {
        // Deduped, because these come from inside the composition and the
        // composition runs once per frame across several workers. Without this
        // one missing eyebrow is six hundred identical lines.
        if (log.text.includes("[byok]") && !warnings.includes(log.text)) {
          warnings.push(log.text);
        }
      },
      onProgress: ({ progress }) => {
        onProgress(lerp(STAGE.render, progress), "Rendering frames…");
      },
    });

    // EVERY warning, not just the first.
    //
    // This line used to read `warnings[0]`, so a render that dropped four
    // different things reported one of them and called the rest done. That is
    // this project's actual failure mode — not crashing, but succeeding while
    // quietly leaving something out — and it has happened with the spectrum,
    // backgroundBlur, subtitle surfaces and transitions. A wrong video that
    // reports success is the one thing that can reach a student.
    for (const w of warnings) onProgress(99, w);
    onProgress(
      100,
      warnings.length ? `Done, with ${warnings.length} thing(s) left out — see above` : "Done"
    );
    return {
      outputPath,
      durationSec: job.durationSec,
      frames: composition.durationInFrames,
      warnings,
    };
  } finally {
    // Best-effort: a leftover temp dir must never fail an otherwise good render.
    await fsp.rm(publicDir, { recursive: true, force: true }).catch(() => {});
  }
}
