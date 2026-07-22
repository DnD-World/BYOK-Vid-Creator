import { safeStorage, app, ipcMain, dialog, shell, BrowserWindow } from "electron";
import path$1 from "node:path";
import fsp from "node:fs/promises";
import { promises } from "fs";
import path from "path";
import { spawn } from "node:child_process";
import http from "node:http";
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
const servers = /* @__PURE__ */ new Map();
let nextPort = 5501;
function pingServer(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: "127.0.0.1", port, path: "/", timeout: 800 }, (res) => {
      res.resume();
      resolve(true);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}
async function waitUntilReady(port, timeoutMs = 2e4) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await pingServer(port)) return;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error("Piper server didn't come up in time — check the python path and model file.");
}
async function getOrStartServer(pythonPath, onnxPath) {
  const existing = servers.get(onnxPath);
  if (existing) return existing;
  const port = nextPort++;
  const proc = spawn(pythonPath, ["-m", "piper.http_server", "-m", onnxPath, "--port", String(port)], {
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stderr = "";
  proc.stderr?.on("data", (d) => {
    stderr += d.toString();
  });
  proc.on("exit", () => servers.delete(onnxPath));
  const handle = { proc, port, ready: waitUntilReady(port) };
  servers.set(onnxPath, handle);
  try {
    await handle.ready;
  } catch (e) {
    servers.delete(onnxPath);
    proc.kill();
    throw new Error(`${e.message}${stderr ? `
${stderr.trim()}` : ""}`);
  }
  return handle;
}
async function listPiperVoices(voicesDir) {
  const out = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path$1.join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.name.endsWith(".onnx")) {
        out.push({ id: full, name: e.name.replace(/\.onnx$/, ""), onnxPath: full });
      }
    }
  }
  await walk(voicesDir);
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
function wavDurationMs(buf) {
  const numChannels = buf.readUInt16LE(22);
  const sampleRate = buf.readUInt32LE(24);
  const bitsPerSample = buf.readUInt16LE(34);
  let offset = 12;
  let dataSize = Math.max(0, buf.length - 44);
  while (offset < buf.length - 8) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === "data") {
      dataSize = size;
      break;
    }
    offset += 8 + size + size % 2;
  }
  const bytesPerSecond = sampleRate * numChannels * (bitsPerSample / 8);
  if (!bytesPerSecond) return 0;
  return Math.round(dataSize / bytesPerSecond * 1e3);
}
async function synthesizeWithPiper(pythonPath, onnxPath, text) {
  const handle = await getOrStartServer(pythonPath, onnxPath);
  const buf = await new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port: handle.port,
        path: `/?text=${encodeURIComponent(text)}`,
        method: "GET",
        timeout: 3e4
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
        res.on("error", reject);
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Piper server timed out responding to a synthesis request."));
    });
    req.end();
  });
  return {
    audioBuffer: new Uint8Array(buf).buffer,
    durationMs: wavDurationMs(buf)
  };
}
function shutdownAllPiperServers() {
  for (const [, handle] of servers) handle.proc.kill();
  servers.clear();
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
ipcMain.handle("tts:listPiperVoices", async (_e, voicesDir) => {
  return listPiperVoices(voicesDir);
});
ipcMain.handle("tts:synthesizePiper", async (_e, pythonPath, onnxPath, text) => {
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
