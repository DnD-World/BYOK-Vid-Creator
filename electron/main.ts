import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
import path from "node:path";
import fsp from "node:fs/promises";
import * as keyStore from "./keyStore";
import { listPiperVoices, synthesizeWithPiper, shutdownAllPiperServers } from "./tts/piperEngine";
import * as chatterbox from "./tts/chatterboxEngine";
import { concatWavBuffers } from "./audio/concatWav";
import { draftScript } from "./llm/glmScenePlanner";

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

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
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

ipcMain.handle("storage:readFile", async (_e, filePath: string) => {
  const buf = await fsp.readFile(filePath);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
});

ipcMain.handle("storage:writeFile", async (_e, filePath: string, data: ArrayBuffer) => {
  await fsp.writeFile(filePath, Buffer.from(data));
  return true;
});

ipcMain.handle("render:start", async (_e, _job: unknown) => {
  return { ok: true, jobId: Date.now().toString(36) };
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

ipcMain.handle("tts:generateNarration", async (_e, segments: chatterbox.NarrationSegmentInput[]) => {
  if (segments.length === 0) {
    throw new Error("No script segments to generate — check your script matches your speaker labels.");
  }

  const buffers: Buffer[] = [];
  for (const seg of segments) {
    const { audioBuffer } = await chatterbox.synthesize({
      text: seg.text,
      language: seg.language,
      voiceMode: seg.voiceMode,
      predefinedVoiceId: seg.predefinedVoiceId,
      referenceAudioFilename: seg.referenceAudioFilename,
    });
    buffers.push(Buffer.from(audioBuffer));
  }

  const { buffer, segments: timing } = concatWavBuffers(buffers);

  await fsp.mkdir(outputDir(), { recursive: true });
  const filePath = path.join(outputDir(), `narration-${Date.now()}.wav`);
  await fsp.writeFile(filePath, buffer);

  return {
    filePath,
    segments: segments.map((seg, i) => ({
      speakerId: seg.speakerId,
      speakerLabel: seg.speakerLabel,
      text: seg.text,
      startMs: timing[i].startMs,
      endMs: timing[i].endMs,
    })),
  };
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

app.on("will-quit", async (event) => {
  // Give Chatterbox a chance to release GPU memory cleanly before the app
  // actually exits — Electron's will-quit can be paused for this.
  if (chatterbox.isServerRunning()) {
    event.preventDefault();
    await chatterbox.shutdownServer();
    shutdownAllPiperServers();
    app.quit();
    return;
  }
  shutdownAllPiperServers();
});

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
