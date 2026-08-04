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
import { COMPOSITION_ID, type RenderProps, type RenderSpeaker } from "../../remotion/types";
import type { Puppet } from "../../src/store/puppetTypes";
import { puppetAssetPaths, validatePuppet } from "../../src/lib/puppets/puppetAssets";

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
  subtitles: RenderProps["subtitles"];
  visemeFadeMs?: number;
  idleMotion?: number;
  narrationSegments?: RenderProps["narrationSegments"];
}

export interface RenderContext {
  /** Repo root in dev — the folder containing remotion/ and package.json. */
  projectRoot: string;
  outputDir: string;
  onProgress: (pct: number, note: string) => void;
}

const AUDIO_PUBLIC_NAME = "narration.wav";
const SPECTRUM_PUBLIC_NAME = "spectrum.bin";

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
): Promise<{ outputPath: string; durationSec: number; frames: number }> {
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
        sheetFileName,
        puppet: prepared?.puppet ?? null,
        puppetFiles: prepared?.files ?? {},
      });
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
      subtitles: job.subtitles,
      visemeFadeMs: job.visemeFadeMs ?? 0,
      idleMotion: job.idleMotion ?? 0,
      narrationSegments: job.narrationSegments ?? [],
    };

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
      // The composition can't talk back except through the browser console, and
      // the one thing it needs to say — "I couldn't load the spectrum, this
      // video is silently worse than it should be" — is invisible otherwise.
      onBrowserLog: (log) => {
        if (log.text.includes("[byok]")) warnings.push(log.text);
      },
      onProgress: ({ progress }) => {
        onProgress(lerp(STAGE.render, progress), "Rendering frames…");
      },
    });

    onProgress(100, warnings.length ? warnings[0] : "Done");
    return {
      outputPath,
      durationSec: job.durationSec,
      frames: composition.durationInFrames,
    };
  } finally {
    // Best-effort: a leftover temp dir must never fail an otherwise good render.
    await fsp.rm(publicDir, { recursive: true, force: true }).catch(() => {});
  }
}
