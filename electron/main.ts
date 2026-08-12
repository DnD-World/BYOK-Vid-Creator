import { app, BrowserWindow, ipcMain, dialog, shell, Menu } from "electron";
import path from "node:path";
import fsp from "node:fs/promises";
import * as keyStore from "./keyStore";
import { listPiperVoices, synthesizeWithPiper, shutdownAllPiperServers } from "./tts/piperEngine";
import * as chatterbox from "./tts/chatterboxEngine";
import { concatWavBuffers } from "./audio/concatWav";
import { analyzeNarration } from "./audio/analyzeNarration";
import { draftScript } from "./llm/glmScenePlanner";
import { testProvider } from "./net/testProvider";
import { searchVideos, downloadTo, type MediaProvider } from "./net/mediaSearch";
import { ensureFont, SUBTITLE_FONTS } from "./net/fonts";
import { searchSounds } from "./net/soundSearch";
import { planBackgrounds, pickBackgrounds } from "./llm/backgroundPlanner";
import { renderVideo, type RenderJob } from "./render/renderVideo";
import { installExitHandlers, reapOrphansFromLastSession } from "./process/childTree";

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
// warm. Matches the renderer-facing shape in preload.ts, so adding another
// engine is additive rather than a rewrite (see Chatterbox below).
// ---------------------------------------------------------------------------

ipcMain.handle("tts:listPiperVoices", async (_e, voicesDir: string) => {
  return listPiperVoices(voicesDir);
});

ipcMain.handle("tts:synthesizePiper", async (_e, pythonPath: string, onnxPath: string, text: string) => {
  return synthesizeWithPiper(pythonPath, onnxPath, text);
});

// ---------------------------------------------------------------------------
// TTS — Chatterbox Multilingual v3. Electron owns this server's lifecycle
// (Ak's choice — auto-start rather than a standalone background app), so it
// gets started on first use and shut down cleanly (releasing GPU memory) on
// app quit, same pattern as Piper's cleanup below.
// ---------------------------------------------------------------------------

ipcMain.handle("tts:chatterboxEnsureRunning", async (_e, cfg: chatterbox.ChatterboxConfig) => {
  await chatterbox.ensureServerRunning(cfg);
  return true;
});

ipcMain.handle("tts:chatterboxIsRunning", async () => {
  return chatterbox.isServerRunning();
});

ipcMain.handle("tts:chatterboxListPredefinedVoices", async () => {
  return chatterbox.listPredefinedVoices();
});

ipcMain.handle("tts:chatterboxListReferenceAudio", async () => {
  return chatterbox.listReferenceAudio();
});

ipcMain.handle("tts:chatterboxSynthesize", async (_e, opts: chatterbox.SynthesizeOptions) => {
  return chatterbox.synthesize(opts);
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
  // Piper and Chatterbox can be mixed within one script — the engine is a
  // per-speaker choice, so a fast Piper voice and a cloned Chatterbox voice
  // can appear in the same narration.
  segments: (chatterbox.NarrationSegmentInput & {
    engine?: "chatterbox" | "piper";
    piperPythonPath?: string;
    piperOnnxPath?: string;
  })[],
  // Speaker ids in the order the canvas draws them, so the analysis's
  // per-frame speaker index lines up with the waveform's tracks.
  speakerOrder: string[] = [],
  pauses: { sameMs: number; turnMs: number } = { sameMs: 0, turnMs: 0 }
) => {
  if (segments.length === 0) {
    throw new Error("No script segments to generate — check your script matches your speaker labels.");
  }

  const buffers: Buffer[] = [];
  for (const seg of segments) {
    if (seg.engine === "piper") {
      if (!seg.piperPythonPath || !seg.piperOnnxPath) {
        throw new Error(
          `Speaker "${seg.speakerLabel}" is set to Piper but has no voice selected — pick one in the left rail.`
        );
      }
      const { audioBuffer } = await synthesizeWithPiper(
        seg.piperPythonPath,
        seg.piperOnnxPath,
        seg.text
      );
      buffers.push(Buffer.from(audioBuffer));
      continue;
    }

    const { audioBuffer } = await chatterbox.synthesize({
      text: seg.text,
      language: seg.language,
      voiceMode: seg.voiceMode,
      predefinedVoiceId: seg.predefinedVoiceId,
      referenceAudioFilename: seg.referenceAudioFilename,
      exaggeration: seg.exaggeration,
      cfgWeight: seg.cfgWeight,
    });
    buffers.push(Buffer.from(audioBuffer));
  }

  // Nothing in front of the first line — leading silence only delays the video.
  // After that, a breath between a speaker's own lines and a longer beat when
  // the turn changes.
  const gaps = segments.map((seg, i) =>
    i === 0 ? 0 : seg.speakerId === segments[i - 1].speakerId ? pauses.sameMs : pauses.turnMs
  );
  const { buffer, segments: timing } = concatWavBuffers(buffers, gaps);

  await fsp.mkdir(outputDir(), { recursive: true });
  const filePath = path.join(outputDir(), `narration-${Date.now()}.wav`);
  await fsp.writeFile(filePath, buffer);

  const resolved = segments.map((seg, i) => ({
    speakerId: seg.speakerId,
    speakerLabel: seg.speakerLabel,
    text: seg.text,
    startMs: timing[i].startMs,
    endMs: timing[i].endMs,
  }));

  // Analysed once, here, while the audio is already in memory — rather than
  // re-read and re-analysed on every render.
  const analysis = analyzeNarration(buffer, resolved, speakerOrder);

  return { filePath, segments: resolved, analysis };
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
  if (await chatterbox.isServerRunning()) {
    await chatterbox.shutdownServer();
  }
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

  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
