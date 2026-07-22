import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
import path from "node:path";
import fsp from "node:fs/promises";
import * as keyStore from "./keyStore";
import { listPiperVoices, synthesizeWithPiper, shutdownAllPiperServers } from "./tts/piperEngine";

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
// TTS — Piper (Phase 2, step 1). One engine per handler, matching the
// renderer-facing shape in preload.ts, so adding XTTS-v2 later is additive
// rather than a rewrite.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// TTS — Piper (Phase 2, step 1). Persistent per-voice HTTP servers, spawned
// lazily and kept warm. Matches the renderer-facing shape in preload.ts, so
// adding XTTS-v2 later is additive rather than a rewrite.
// ---------------------------------------------------------------------------

ipcMain.handle("tts:listPiperVoices", async (_e, voicesDir: string) => {
  return listPiperVoices(voicesDir);
});

ipcMain.handle("tts:synthesizePiper", async (_e, pythonPath: string, onnxPath: string, text: string) => {
  return synthesizeWithPiper(pythonPath, onnxPath, text);
});

app.on("will-quit", () => {
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
