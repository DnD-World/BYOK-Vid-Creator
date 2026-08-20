import { app, BrowserWindow, ipcMain, dialog, shell, Menu } from "electron";
import path from "node:path";
import fsp from "node:fs/promises";
import * as keyStore from "./keyStore";
import { listPiperVoices, synthesizeWithPiper, shutdownAllPiperServers } from "./tts/piperEngine";
import { analyzeNarration } from "./audio/analyzeNarration";
import { listMusic } from "./audio/musicLibrary";
import * as elevenlabs from "./tts/elevenlabsEngine";
import { listMedia } from "./net/mediaLibrary";
import { draftScript } from "./llm/glmScenePlanner";
import { testProvider } from "./net/testProvider";
import { searchVideos, downloadTo, type MediaProvider } from "./net/mediaSearch";
import { ensureFont, SUBTITLE_FONTS } from "./net/fonts";
import { searchSounds } from "./net/soundSearch";
import { planBackgrounds, pickBackgrounds } from "./llm/backgroundPlanner";
import { renderVideo, type RenderJob } from "./render/renderVideo";
import { installExitHandlers, reapOrphansFromLastSession } from "./process/childTree";
import { buildNarration, type NarrationInput } from "./tts/buildNarration";
import { runBatchJob, type BatchJob } from "./batch/runJob";
import {
  buildBlocks,
  describeBuild,
  type BlockSpeaker,
} from "../src/lib/narration/buildBlocks";

// Pin the identity before anything asks where it lives.
//
// app.getPath("userData") is derived from app.getName(), and getName only
// finds "byok-vid-creator" when Electron was pointed at a directory holding a
// package.json. Launched as `electron out/main/main.js` — which is exactly how
// a headless job run starts — it falls back to "Electron", and every path in
// the app silently moves to %APPDATA%/Electron.
//
// That is not a cosmetic difference. It cost the first long render: the key
// vault, the saved settings and the renders folder all live under the real
// name, so a headless run wrote its narration somewhere nobody would look and
// then failed with "No NVIDIA API key saved" while the key sat safely in the
// other folder. Setting the name here makes the identity independent of how
// the process was started.
app.setName("byok-vid-creator");

const isDev = !app.isPackaged;

const userDir = () => app.getPath("userData");
const outputDir = () => path.join(userDir(), "renders");

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 950,
    minWidth: 1280,
    minHeight: 800,
    backgroundColor: "#0b0b0d",
    show: false,
    autoHideMenuBar: true,
    title: "BYOK-Vid-Creator",
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // Electron ships no right-click menu at all — without this, right-clicking a
  // key field does literally nothing, which makes pasting an API key feel
  // broken even though Ctrl+V works. Built from editFlags so the items are
  // greyed out honestly rather than always looking available.
  mainWindow.webContents.on("context-menu", (_event, params) => {
    const { editFlags, isEditable, selectionText } = params;
    const hasSelection = selectionText.trim().length > 0;
    if (!isEditable && !hasSelection) return;

    const template: Electron.MenuItemConstructorOptions[] = [];
    if (isEditable) {
      template.push({ role: "cut", enabled: editFlags.canCut });
    }
    template.push({ role: "copy", enabled: editFlags.canCopy });
    if (isEditable) {
      template.push(
        { role: "paste", enabled: editFlags.canPaste },
        { type: "separator" },
        { role: "selectAll", enabled: editFlags.canSelectAll }
      );
    }
    Menu.buildFromTemplate(template).popup({ window: mainWindow! });
  });

  if (isDev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ---------------------------------------------------------------------------
// Key vault IPC — all reads/writes go through electron/keyStore.ts, the
// single source of truth for encrypted key storage. Nothing in the renderer
// ever sees or persists a raw key outside this channel.
// ---------------------------------------------------------------------------

ipcMain.handle("keys:list", async () => {
  return keyStore.listKeys();
});

ipcMain.handle("keys:get", async (_e, provider: string) => {
  return keyStore.getKey(provider);
});

ipcMain.handle("keys:set", async (_e, provider: string, value: string) => {
  const result = await keyStore.setKey(provider, value);
  return result.ok;
});

ipcMain.handle("keys:delete", async (_e, provider: string) => {
  const result = await keyStore.deleteKey(provider);
  return result.ok;
});

ipcMain.handle("keys:encryptionAvailable", async () => {
  return keyStore.encryptionAvailable();
});

// Analyse an arbitrary audio file the user attached by hand. There are no
// speaker segments for it — nobody said who is talking — so every frame is
// marked "unknown speaker" and only the loudness envelope is real. That's
// enough to make the waveform react, which is what the user expects the moment
// they attach a file.
ipcMain.handle("audio:analyzeFile", async (_e, filePath: string) => {
  const buf = await fsp.readFile(filePath);
  return analyzeNarration(buf, [], []);
});

// Runs in main rather than the renderer on purpose: the key never has to be
// handed back across the bridge just to be tested.
ipcMain.handle(
  "keys:test",
  async (_e, provider: string, opts?: { azureRegion?: string }) => {
    return testProvider(provider, opts ?? {});
  }
);

ipcMain.handle("dialog:openFile", async (_e, filters?: Electron.FileFilter[]) => {
  const res = await dialog.showOpenDialog(mainWindow!, {
    properties: ["openFile"],
    filters,
  });
  return res.canceled ? null : res.filePaths[0];
});

ipcMain.handle("dialog:saveFile", async (_e, defaultName: string, filters?: Electron.FileFilter[]) => {
  const res = await dialog.showSaveDialog(mainWindow!, {
    defaultPath: path.join(app.getPath("downloads"), defaultName),
    filters,
  });
  return res.canceled ? null : res.filePath;
});

ipcMain.handle("storage:outputDir", async () => {
  await fsp.mkdir(outputDir(), { recursive: true });
  return outputDir();
});

ipcMain.handle("storage:openOutputDir", async () => {
  await fsp.mkdir(outputDir(), { recursive: true });
  await shell.openPath(outputDir());
  return true;
});

/** Plan and pick in one call. They are separate functions because they fail
 *  for different reasons — no API key vs nothing found — but the UI only ever
 *  wants both, and splitting the round trip would just make the renderer hold
 *  a plan it cannot use. */
ipcMain.handle(
  "media:autoBackgrounds",
  async (
    _e,
    opts: {
      segments: { text: string; startMs: number; endMs: number; speakerLabel: string }[];
      languageName: string;
      portrait: boolean;
      topic?: string;
      minSceneMs?: number;
    }
  ) => {
    const plan = await planBackgrounds(opts);
    const chosen = await pickBackgrounds(plan, { portrait: opts.portrait });
    return { look: plan.look, scenes: chosen };
  }
);

ipcMain.handle(
  "media:searchVideos",
  async (_e, query: string, providers?: MediaProvider[]) => searchVideos(query, { providers })
);

/** Sound effects. CC0 only — the filter lives in searchSounds and is not a
 *  parameter, deliberately. Downloads reuse media:download below, since a clip
 *  and a bark want exactly the same caching. */
ipcMain.handle("sound:search", async (_e, query: string) => searchSounds(query));

/** Fetch a clip into the app's media folder and hand back its path.
 *
 *  Named by provider and id rather than by the query that found it, so the
 *  same clip picked twice reuses one file instead of accumulating copies. */
ipcMain.handle("media:download", async (_e, id: string, url: string) => {
  const dir = path.join(app.getPath("userData"), "media");
  const ext = (url.split("?")[0].match(/\.(mp4|mov|webm|mp3|wav|ogg)$/i)?.[1] ?? "mp4").toLowerCase();
  const dest = path.join(dir, `${id}.${ext}`);
  try {
    await fsp.access(dest);
    return dest; // already have it
  } catch {
    /* not cached yet */
  }
  await downloadTo(url, dest);
  return dest;
});

/**
 * Where the bundled character puppets live.
 *
 * The renderer cannot work this out for itself: it has no filesystem and no
 * notion of where the app was installed. Returning the folder rather than the
 * individual files keeps the cast list in the renderer, where it belongs, and
 * leaves this handler as one line that never changes when a character is added.
 */
ipcMain.handle("storage:puppetDir", async () => {
  // app.getAppPath() is the repo root in dev and the asar root when packaged;
  // puppet/ sits beside package.json in both, provided it is listed in the
  // build's `files`. The ART it references lives outside git and is resolved
  // relative to each puppet.json, so it follows the same folder.
  return path.join(app.getAppPath(), "puppet");
});

// Subtitle fonts. The cache lives beside the media cache, under userData, so
// that clearing app data clears both and neither ends up in the install dir.
const fontsDir = () => path.join(app.getPath("userData"), "fonts");

ipcMain.handle("fonts:list", async () => SUBTITLE_FONTS);

ipcMain.handle("fonts:ensure", async (_e, family: string, weight: number) =>
  ensureFont(family, weight, fontsDir())
);

ipcMain.handle("storage:readFile", async (_e, filePath: string) => {
  const buf = await fsp.readFile(filePath);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
});

ipcMain.handle("storage:writeFile", async (_e, filePath: string, data: ArrayBuffer) => {
  await fsp.writeFile(filePath, Buffer.from(data));
  return true;
});

// ---------------------------------------------------------------------------
// DramaBox — the two files the GPU box reads.
//
// THIS IS THE STEP THAT WAS MISSING. Every voice knob in the Cast panel was
// saved onto the speaker and then read by nothing, because the only thing that
// built blocks.json was a command-line script reading a job file. The settings
// existed in the app and could not leave it.
//
// The work itself is in src/lib/narration/buildBlocks.ts, shared with that
// script, so the button and the command line cannot produce different files.
// ---------------------------------------------------------------------------

// The local media library: clips and sounds already on this machine. Both
// folders, because downloads land under userData and the sound effects that
// ship with the app live in the repo.
ipcMain.handle("media:library", async () => {
  return listMedia([
    path.join(app.getPath("userData"), "media"),
    path.join(app.getAppPath(), "sfx", "library"),
  ]);
});

// The voices on the ElevenLabs account, so the Cast panel can offer a list
// rather than asking someone to go and find an id and paste it.
ipcMain.handle("tts:listElevenVoices", async () => {
  return elevenlabs.listVoices();
});

// The music library — the loops that ship with the app, in music/.
ipcMain.handle("music:list", async () => {
  return listMusic(path.join(app.getAppPath(), "music"));
});

ipcMain.handle(
  "dramabox:writeBlocks",
  async (_e, scriptText: string, speakers: BlockSpeaker[], outDir: string) => {
    const result = buildBlocks(scriptText, speakers);
    if (result.errors.length) {
      return { ok: false as const, errors: result.errors, summary: [] as string[] };
    }
    await fsp.mkdir(outDir, { recursive: true });
    await fsp.writeFile(
      path.join(outDir, "blocks.json"),
      JSON.stringify(result.blocks, null, 1),
      "utf8"
    );
    await fsp.writeFile(
      path.join(outDir, "align.json"),
      JSON.stringify(result.align, null, 1),
      "utf8"
    );
    return {
      ok: true as const,
      errors: [],
      count: result.blocks.length,
      summary: describeBuild(result),
    };
  }
);

// ---------------------------------------------------------------------------
// Render — Remotion. Progress is pushed back to the renderer on the
// "render:progress" channel rather than returned, since a render is long
// running and the UI needs to move while it happens.
// ---------------------------------------------------------------------------

ipcMain.handle("render:start", async (_e, job: RenderJob) => {
  const jobId = Date.now().toString(36);
  const send = (pct: number, note: string) => {
    // The window can be closed mid-render; dropping the update is correct.
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("render:progress", { jobId, pct, note });
    }
  };

  try {
    const result = await renderVideo(job, {
      projectRoot: app.getAppPath(),
      outputDir: outputDir(),
      fontsDir: fontsDir(),
      onProgress: send,
    });
    return { ok: true as const, jobId, ...result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    send(0, `Render failed: ${message}`);
    return { ok: false as const, jobId, error: message };
  }
});

// ---------------------------------------------------------------------------
// TTS — Piper. Persistent per-voice HTTP servers, spawned lazily and kept
// warm. The only engine that synthesises inside this app: DramaBox runs on a
// rented GPU and Chatterbox was removed on 18 Aug 2026.
// ---------------------------------------------------------------------------

ipcMain.handle("tts:listPiperVoices", async (_e, voicesDir: string) => {
  return listPiperVoices(voicesDir);
});

ipcMain.handle("tts:synthesizePiper", async (_e, pythonPath: string, onnxPath: string, text: string) => {
  return synthesizeWithPiper(pythonPath, onnxPath, text);
});

// ---------------------------------------------------------------------------
// Narration generation — the actual Phase 2 goal: turn a resolved list of
// (speaker, text, voice) segments into ONE combined audio file, with each
// segment's timing preserved for later viseme/subtitle sync. Script parsing
// and speaker->voice resolution happen in the renderer (it's the one with
// the project state); this just executes synthesis + concatenation.
// ---------------------------------------------------------------------------

ipcMain.handle("tts:generateNarration", async (
  _e,
  segments: NarrationInput[],
  speakerOrder: string[] = [],
  pauses: { sameMs: number; turnMs: number } = { sameMs: 0, turnMs: 0 }
) => {
  return buildNarration(segments, speakerOrder, pauses, outputDir());
});


// ---------------------------------------------------------------------------
// GLM-5.2 script draft assistant (NVIDIA NIM). Reads the key from the same
// encrypted vault as everything else — never touches the renderer.
// ---------------------------------------------------------------------------

ipcMain.handle(
  "llm:draftScript",
  async (
    _e,
    opts: { topic: string; speakerLabels: string[]; languageName: string; tone?: string }
  ) => {
    return draftScript(opts);
  }
);

// Cleanup used to live in a single will-quit handler, which covers the one exit
// where nothing has gone wrong. Crashes, force-quits and dev restarts left the
// spawned Python servers running — holding several GB of an 8 GB card, with no
// window to explain themselves. installExitHandlers covers every exit path.
installExitHandlers(async () => {
  shutdownAllPiperServers();
});

app.whenReady().then(async () => {
  // Before anything is started, take down anything a previous session left
  // behind. Checked against the recorded command line first, so a recycled
  // process id never gets someone else's program killed.
  const reaped = await reapOrphansFromLastSession();
  if (reaped > 0) {
    console.log(`Cleaned up ${reaped} engine process(es) left by a previous session.`);
  }

  // `--job <file>` renders one video and exits, with no window ever created.
  // Electron rather than plain node because everything underneath assumes it:
  // app.getPath for the output folders, and Chromium's network stack for every
  // outbound call — which on this machine is the difference between working
  // and "unable to verify the first certificate" (see the antivirus note).
  const jobArg = process.argv.indexOf("--job");
  if (jobArg !== -1 && process.argv[jobArg + 1]) {
    await runHeadless(process.argv[jobArg + 1]);
    return;
  }

  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

async function runHeadless(jobPath: string): Promise<void> {
  const started = Date.now();
  let lastLine = "";
  try {
    const job = JSON.parse(await fsp.readFile(jobPath, "utf8")) as BatchJob;
    const result = await runBatchJob(job, {
      projectRoot: app.getAppPath(),
      outputDir: outputDir(),
      fontsDir: fontsDir(),
      mediaDir: path.join(app.getPath("userData"), "media"),
      // A progress bar nobody watches is noise in a log file. Only whole
      // percent changes are printed, and each carries the elapsed time —
      // which is the number this whole exercise exists to find out.
      onProgress: (pct, note) => {
        // Deduped on the whole line rather than the percentage: planning holds
        // at 14% for several minutes while its batches tick past, and dropping
        // those would leave the log looking hung during the slowest stage.
        const line = `[${String(pct).padStart(3)}%] ${note}`;
        if (line === lastLine) return;
        lastLine = line;
        const mins = ((Date.now() - started) / 60000).toFixed(1);
        console.log(`[${String(pct).padStart(3)}%] ${mins}m  ${note}`);
      },
    });

    if (result.unmatchedLines.length > 0) {
      console.warn(
        `\n${result.unmatchedLines.length} script line(s) matched no speaker and were skipped:`
      );
      for (const line of result.unmatchedLines.slice(0, 10)) console.warn(`  ${line}`);
    }

    console.log(`\nDone in ${((Date.now() - started) / 60000).toFixed(1)} minutes.`);
    console.log(`  video     ${result.outputPath}`);
    console.log(`  narration ${result.narrationPath}`);
    console.log(`  ${result.durationSec}s, ${result.frames} frames`);
    app.exit(0);
  } catch (err) {
    console.error(`\nJob failed after ${((Date.now() - started) / 60000).toFixed(1)} minutes:`);
    console.error(err instanceof Error ? err.stack ?? err.message : String(err));
    app.exit(1);
  }
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
