import { safeStorage, app, ipcMain, dialog, shell, BrowserWindow } from "electron";
import path$1 from "node:path";
import fsp from "node:fs/promises";
import { promises } from "fs";
import path from "path";
import { spawn } from "node:child_process";
import http from "node:http";
import https from "node:https";
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
const servers = /* @__PURE__ */ new Map();
let nextPort = 5501;
function pingServer$1(port) {
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
async function waitUntilReady$1(port, timeoutMs = 2e4) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await pingServer$1(port)) return;
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
  const handle = { proc, port, ready: waitUntilReady$1(port) };
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
let serverProcess = null;
let serverPort = 8004;
let readyPromise = null;
async function findPythonExe(installPath) {
  const portable = path$1.join(installPath, "python_embedded", "python.exe");
  const venvWin = path$1.join(installPath, "venv", "Scripts", "python.exe");
  const venvUnix = path$1.join(installPath, "venv", "bin", "python");
  for (const candidate of [portable, venvWin, venvUnix]) {
    try {
      await fsp.access(candidate);
      return candidate;
    } catch {
    }
  }
  throw new Error(
    "Couldn't find a Python environment inside the Chatterbox install folder. Run start.bat / start.sh there once to complete first-time setup."
  );
}
function pingServer(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: "127.0.0.1", port, path: "/api/model-info", timeout: 2e3 }, (res) => {
      res.resume();
      resolve((res.statusCode ?? 500) < 500);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}
async function waitUntilReady(port, timeoutMs = 6 * 60 * 1e3) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await pingServer(port)) return;
    await new Promise((r) => setTimeout(r, 1e3));
  }
  throw new Error(
    "Chatterbox server didn't become ready in time. First run downloads several GB of model files — check your internet connection and the server's own console window for progress."
  );
}
async function ensureServerRunning(cfg) {
  if (serverProcess && readyPromise) {
    return readyPromise;
  }
  serverPort = cfg.port || 8004;
  const pythonExe = await findPythonExe(cfg.installPath);
  const proc = spawn(pythonExe, ["server.py"], {
    cwd: cfg.installPath,
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stderr = "";
  proc.stderr?.on("data", (d) => {
    stderr += d.toString();
  });
  proc.on("exit", () => {
    serverProcess = null;
    readyPromise = null;
  });
  serverProcess = proc;
  readyPromise = waitUntilReady(serverPort).catch((e) => {
    serverProcess = null;
    readyPromise = null;
    throw new Error(`${e.message}${stderr ? `
${stderr.trim().slice(-500)}` : ""}`);
  });
  return readyPromise;
}
function isServerRunning() {
  return !!serverProcess;
}
async function listPredefinedVoices() {
  const body = await httpGet(`/get_predefined_voices`);
  const parsed = JSON.parse(body);
  const list = Array.isArray(parsed) ? parsed : parsed.voices ?? [];
  return list.map((v) => ({
    id: v.filename ?? v.id ?? v.name,
    label: v.display_name ?? v.label ?? v.filename ?? v.id
  }));
}
async function listReferenceAudio() {
  const body = await httpGet(`/get_reference_files`);
  const parsed = JSON.parse(body);
  const list = Array.isArray(parsed) ? parsed : parsed.files ?? [];
  return list.map((f) => {
    const filename = typeof f === "string" ? f : f.filename ?? f.name;
    return { id: filename, label: filename };
  });
}
async function synthesize(opts) {
  const payload = JSON.stringify({
    text: opts.text,
    language: opts.language,
    voice_mode: opts.voiceMode,
    predefined_voice_id: opts.predefinedVoiceId,
    reference_audio_filename: opts.referenceAudioFilename,
    seed: opts.seed,
    exaggeration: opts.exaggeration,
    cfg_weight: opts.cfgWeight,
    output_format: "wav",
    split_text: true
  });
  const buf = await new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port: serverPort,
        path: "/tts",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload)
        },
        timeout: 12e4
        // synthesis itself can take a while, especially long text
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          if ((res.statusCode ?? 500) >= 400) {
            reject(new Error(`Chatterbox server returned ${res.statusCode}: ${Buffer.concat(chunks).toString()}`));
          } else {
            resolve(Buffer.concat(chunks));
          }
        });
        res.on("error", reject);
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Chatterbox server timed out responding to a synthesis request."));
    });
    req.write(payload);
    req.end();
  });
  return {
    audioBuffer: new Uint8Array(buf).buffer,
    durationMs: wavDurationMs(buf)
  };
}
function httpGet(pathName) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: "127.0.0.1", port: serverPort, path: pathName, timeout: 1e4 }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request to Chatterbox server timed out."));
    });
  });
}
async function shutdownServer() {
  if (!serverProcess) return;
  try {
    await new Promise((resolve) => {
      const req = http.request(
        { host: "127.0.0.1", port: serverPort, path: "/api/unload", method: "POST", timeout: 3e3 },
        () => resolve()
      );
      req.on("error", () => resolve());
      req.on("timeout", () => {
        req.destroy();
        resolve();
      });
      req.end();
    });
  } finally {
    serverProcess.kill();
    serverProcess = null;
    readyPromise = null;
  }
}
function readWavInfo(buf) {
  const numChannels = buf.readUInt16LE(22);
  const sampleRate = buf.readUInt32LE(24);
  const bitsPerSample = buf.readUInt16LE(34);
  let offset = 12;
  let dataStart = 44;
  let dataSize = Math.max(0, buf.length - 44);
  while (offset < buf.length - 8) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === "data") {
      dataStart = offset + 8;
      dataSize = size;
      break;
    }
    offset += 8 + size + size % 2;
  }
  return { numChannels, sampleRate, bitsPerSample, dataStart, dataSize };
}
function buildWavHeader(dataLength, numChannels, sampleRate, bitsPerSample) {
  const blockAlign = numChannels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;
  const buf = Buffer.alloc(44);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + dataLength, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(numChannels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(byteRate, 28);
  buf.writeUInt16LE(blockAlign, 32);
  buf.writeUInt16LE(bitsPerSample, 34);
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(dataLength, 40);
  return buf;
}
function concatWavBuffers(buffers) {
  if (buffers.length === 0) {
    throw new Error("No audio segments to concatenate.");
  }
  const infos = buffers.map(readWavInfo);
  const { numChannels, sampleRate, bitsPerSample } = infos[0];
  for (const info of infos) {
    if (info.numChannels !== numChannels || info.sampleRate !== sampleRate || info.bitsPerSample !== bitsPerSample) {
      throw new Error(
        "Audio segments have mismatched format (sample rate/channels/bit depth) — can't concatenate directly."
      );
    }
  }
  const bytesPerSecond = sampleRate * numChannels * (bitsPerSample / 8);
  const segments = [];
  const pcmChunks = [];
  let cursorMs = 0;
  for (let i = 0; i < buffers.length; i++) {
    const { dataStart, dataSize } = infos[i];
    pcmChunks.push(buffers[i].subarray(dataStart, dataStart + dataSize));
    const durMs = dataSize / bytesPerSecond * 1e3;
    segments.push({ startMs: cursorMs, endMs: cursorMs + durMs });
    cursorMs += durMs;
  }
  const pcmData = Buffer.concat(pcmChunks);
  const header = buildWavHeader(pcmData.length, numChannels, sampleRate, bitsPerSample);
  return { buffer: Buffer.concat([header, pcmData]), segments };
}
const NVIDIA_MODEL = "z-ai/glm-5.2";
const NVIDIA_HOST = "integrate.api.nvidia.com";
function stripCodeFences(text) {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```[a-z]*\n([\s\S]*?)\n```$/i);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}
async function draftScript(opts) {
  const apiKey = await getKey("nvidia");
  if (!apiKey) {
    throw new Error("No NVIDIA API key saved — add one in Backend Settings first.");
  }
  if (opts.speakerLabels.length === 0) {
    throw new Error("Add at least one speaker before generating a script draft.");
  }
  const systemPrompt = [
    `You write short narration/dialogue scripts in ${opts.languageName}.`,
    `Output ONLY the script itself, one line per line of speech, formatted exactly as:`,
    `Label: text`,
    `Use ONLY these exact speaker labels, spelled exactly as given: ${opts.speakerLabels.join(", ")}.`,
    `Do not add a title, headers, scene directions, markdown formatting, or any commentary — just the`,
    `"Label: text" lines themselves, nothing before or after them.`
  ].join(" ");
  const userPrompt = [
    `Topic: ${opts.topic}`,
    opts.tone ? `Tone: ${opts.tone}` : null
  ].filter(Boolean).join("\n");
  const payload = JSON.stringify({
    model: NVIDIA_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    temperature: 0.7,
    max_tokens: 2048
  });
  const body = await new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: NVIDIA_HOST,
        path: "/v1/chat/completions",
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload)
        },
        timeout: 6e4
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf-8");
          if ((res.statusCode ?? 500) >= 400) {
            reject(new Error(`NVIDIA API returned ${res.statusCode}: ${text}`));
          } else {
            resolve(text);
          }
        });
        res.on("error", reject);
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("NVIDIA API request timed out."));
    });
    req.write(payload);
    req.end();
  });
  const parsed = JSON.parse(body);
  const content = parsed?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("NVIDIA API response didn't include any content — check the raw response if this persists.");
  }
  return stripCodeFences(content);
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
ipcMain.handle("tts:chatterboxEnsureRunning", async (_e, cfg) => {
  await ensureServerRunning(cfg);
  return true;
});
ipcMain.handle("tts:chatterboxIsRunning", async () => {
  return isServerRunning();
});
ipcMain.handle("tts:chatterboxListPredefinedVoices", async () => {
  return listPredefinedVoices();
});
ipcMain.handle("tts:chatterboxListReferenceAudio", async () => {
  return listReferenceAudio();
});
ipcMain.handle("tts:chatterboxSynthesize", async (_e, opts) => {
  return synthesize(opts);
});
ipcMain.handle("tts:generateNarration", async (_e, segments) => {
  if (segments.length === 0) {
    throw new Error("No script segments to generate — check your script matches your speaker labels.");
  }
  const buffers = [];
  for (const seg of segments) {
    const { audioBuffer } = await synthesize({
      text: seg.text,
      language: seg.language,
      voiceMode: seg.voiceMode,
      predefinedVoiceId: seg.predefinedVoiceId,
      referenceAudioFilename: seg.referenceAudioFilename,
      exaggeration: seg.exaggeration,
      cfgWeight: seg.cfgWeight
    });
    buffers.push(Buffer.from(audioBuffer));
  }
  const { buffer, segments: timing } = concatWavBuffers(buffers);
  await fsp.mkdir(outputDir(), { recursive: true });
  const filePath = path$1.join(outputDir(), `narration-${Date.now()}.wav`);
  await fsp.writeFile(filePath, buffer);
  return {
    filePath,
    segments: segments.map((seg, i) => ({
      speakerId: seg.speakerId,
      speakerLabel: seg.speakerLabel,
      text: seg.text,
      startMs: timing[i].startMs,
      endMs: timing[i].endMs
    }))
  };
});
ipcMain.handle(
  "llm:draftScript",
  async (_e, opts) => {
    return draftScript(opts);
  }
);
app.on("will-quit", async (event) => {
  if (isServerRunning()) {
    event.preventDefault();
    await shutdownServer();
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
