import { safeStorage, app, ipcMain, dialog, shell, BrowserWindow } from "electron";
import path$1 from "node:path";
import fsp from "node:fs/promises";
import { promises } from "fs";
import path from "path";
import __cjs_mod__ from "node:module";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require2 = __cjs_mod__.createRequire(import.meta.url);
const vaultFile = () => path.join(app.getPath("userData"), "byok.secrets.enc");
async function readVault() {
  try {
    const buf = await promises.readFile(vaultFile());
    if (!safeStorage.isEncryptionAvailable()) {
      return JSON.parse(buf.toString("utf-8"));
    }
    try {
      return JSON.parse(safeStorage.decryptString(buf));
    } catch {
      return JSON.parse(buf.toString("utf-8"));
    }
  } catch {
    return {};
  }
}
async function writeVault(v) {
  await promises.mkdir(path.dirname(vaultFile()), { recursive: true });
  const json = JSON.stringify(v);
  if (safeStorage.isEncryptionAvailable()) {
    await promises.writeFile(vaultFile(), safeStorage.encryptString(json), { mode: 384 });
    return { ok: true, plaintextFallback: false };
  }
  await promises.writeFile(vaultFile(), Buffer.from(json, "utf-8"), { mode: 384 });
  return { ok: true, plaintextFallback: true };
}
async function listKeys() {
  return Object.keys(await readVault());
}
async function getKey(provider) {
  const v = await readVault();
  return v[provider] ?? null;
}
async function setKey(provider, value) {
  const v = await readVault();
  v[provider] = value;
  return writeVault(v);
}
async function deleteKey(provider) {
  const v = await readVault();
  delete v[provider];
  return writeVault(v);
}
function encryptionAvailable() {
  return safeStorage.isEncryptionAvailable();
}
const isDev = !app.isPackaged;
const userDir = () => app.getPath("userData");
const outputDir = () => path$1.join(userDir(), "renders");
let mainWindow = null;
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
      preload: path$1.join(__dirname, "../preload/preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
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
    mainWindow.loadFile(path$1.join(__dirname, "../renderer/index.html"));
  }
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}
ipcMain.handle("keys:list", async () => {
  return listKeys();
});
ipcMain.handle("keys:get", async (_e, provider) => {
  return getKey(provider);
});
ipcMain.handle("keys:set", async (_e, provider, value) => {
  const result = await setKey(provider, value);
  return result.ok;
});
ipcMain.handle("keys:delete", async (_e, provider) => {
  const result = await deleteKey(provider);
  return result.ok;
});
ipcMain.handle("keys:encryptionAvailable", async () => {
  return encryptionAvailable();
});
ipcMain.handle("dialog:openFile", async (_e, filters) => {
  const res = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters
  });
  return res.canceled ? null : res.filePaths[0];
});
ipcMain.handle("dialog:saveFile", async (_e, defaultName, filters) => {
  const res = await dialog.showSaveDialog(mainWindow, {
    defaultPath: path$1.join(app.getPath("downloads"), defaultName),
    filters
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
ipcMain.handle("storage:readFile", async (_e, filePath) => {
  const buf = await fsp.readFile(filePath);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
});
ipcMain.handle("storage:writeFile", async (_e, filePath, data) => {
  await fsp.writeFile(filePath, Buffer.from(data));
  return true;
});
ipcMain.handle("render:start", async (_e, _job) => {
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
