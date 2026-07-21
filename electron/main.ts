import { app, BrowserWindow, ipcMain, dialog, safeStorage, shell } from "electron";
import path from "node:path";
import fs from "node:fs";
import fsp from "node:fs/promises";

const isDev = !app.isPackaged;

const userDir = () => app.getPath("userData");
const keysFile = () => path.join(userDir(), "byok.secrets.enc");
const outputDir = () => path.join(userDir(), "renders");

let mainWindow: BrowserWindow | null = null;

type KeyStore = Record<string, string>;

async function readKeyStore(): Promise<KeyStore> {
  try {
    if (!fs.existsSync(keysFile())) return {};
    const raw = await fsp.readFile(keysFile());
    if (!safeStorage.isEncryptionAvailable()) {
      return JSON.parse(raw.toString("utf-8"));
    }
    const decrypted = safeStorage.decryptString(raw);
    return JSON.parse(decrypted) as KeyStore;
  } catch {
    return {};
  }
}

async function writeKeyStore(store: KeyStore): Promise<void> {
  await fsp.mkdir(userDir(), { recursive: true });
  const json = JSON.stringify(store);
  if (safeStorage.isEncryptionAvailable()) {
    const enc = safeStorage.encryptString(json);
    await fsp.writeFile(keysFile(), enc);
  } else {
    await fsp.writeFile(keysFile(), Buffer.from(json, "utf-8"));
  }
}

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

ipcMain.handle("keys:list", async () => {
  const store = await readKeyStore();
  return Object.keys(store);
});

ipcMain.handle("keys:get", async (_e, provider: string) => {
  const store = await readKeyStore();
  return store[provider] ?? null;
});

ipcMain.handle("keys:set", async (_e, provider: string, value: string) => {
  const store = await readKeyStore();
  store[provider] = value;
  await writeKeyStore(store);
  return true;
});

ipcMain.handle("keys:delete", async (_e, provider: string) => {
  const store = await readKeyStore();
  delete store[provider];
  await writeKeyStore(store);
  return true;
});

ipcMain.handle("keys:encryptionAvailable", async () => {
  return safeStorage.isEncryptionAvailable();
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

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
