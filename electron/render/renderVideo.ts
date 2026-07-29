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
import type { WaveformConfig } from "../../src/store/types";

export interface RenderJob {
  waveform: WaveformConfig;
  speakers: RenderSpeaker[];
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  /** Absolute path to a narration WAV, or null/undefined for a silent render. */
  audioFilePath?: string | null;
  /** Preview canvas width the speaker sizes were authored against. */
  authoredWidth: number;
}

export interface RenderContext {
  /** Repo root in dev — the folder containing remotion/ and package.json. */
  projectRoot: string;
  outputDir: string;
  onProgress: (pct: number, note: string) => void;
}

const AUDIO_PUBLIC_NAME = "narration.wav";

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

  try {
    if (job.audioFilePath) {
      await fsp.copyFile(job.audioFilePath, path.join(publicDir, AUDIO_PUBLIC_NAME));
      audioFileName = AUDIO_PUBLIC_NAME;
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
      waveform: job.waveform,
      speakers: job.speakers,
      width: job.width,
      height: job.height,
      fps: job.fps,
      durationSec: job.durationSec,
      audioFileName,
      authoredWidth: job.authoredWidth,
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
      onProgress: ({ progress }) => {
        onProgress(lerp(STAGE.render, progress), "Rendering frames…");
      },
    });

    onProgress(100, "Done");
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
