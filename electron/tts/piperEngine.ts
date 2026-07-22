import { spawn, ChildProcess } from "node:child_process";
import path from "node:path";
import fs from "node:fs/promises";
import http from "node:http";

// ---------------------------------------------------------------------------
// Piper TTS engine — the `piper-tts` Python package's persistent HTTP
// server (`python -m piper.http_server -m <model.onnx>`), not the one-shot
// standalone binary. One server process per voice model (the http_server
// module only serves the single model it's given), spawned lazily on first
// use and kept warm for the life of the app. This is the same "persistent
// local sidecar" shape XTTS-v2 will use, so this is the real architecture
// proof, not just a placeholder.
// ---------------------------------------------------------------------------

export interface PiperVoice {
  id: string;   // stable id — the onnx file's absolute path
  name: string; // friendly display name derived from the filename
  onnxPath: string;
}

interface ServerHandle {
  proc: ChildProcess;
  port: number;
  ready: Promise<void>;
}

const servers = new Map<string, ServerHandle>(); // keyed by onnxPath
let nextPort = 5501;

function pingServer(port: number): Promise<boolean> {
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

async function waitUntilReady(port: number, timeoutMs = 20000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await pingServer(port)) return;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error("Piper server didn't come up in time — check the python path and model file.");
}

async function getOrStartServer(pythonPath: string, onnxPath: string): Promise<ServerHandle> {
  const existing = servers.get(onnxPath);
  if (existing) return existing;

  const port = nextPort++;
  const proc = spawn(pythonPath, ["-m", "piper.http_server", "-m", onnxPath, "--port", String(port)], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  proc.stderr?.on("data", (d) => {
    stderr += d.toString();
  });
  proc.on("exit", () => servers.delete(onnxPath));

  const handle: ServerHandle = { proc, port, ready: waitUntilReady(port) };
  servers.set(onnxPath, handle);

  try {
    await handle.ready;
  } catch (e) {
    servers.delete(onnxPath);
    proc.kill();
    throw new Error(`${(e as Error).message}${stderr ? `\n${stderr.trim()}` : ""}`);
  }

  return handle;
}

/** Recursively scans a folder for .onnx voice models. */
export async function listPiperVoices(voicesDir: string): Promise<PiperVoice[]> {
  const out: PiperVoice[] = [];
  async function walk(dir: string) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.name.endsWith(".onnx")) {
        out.push({ id: full, name: e.name.replace(/\.onnx$/, ""), onnxPath: full });
      }
    }
  }
  await walk(voicesDir);
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Minimal PCM WAV header parser — enough to get exact playback duration
 * without depending on ffprobe or any external binary. Walks RIFF chunks
 * rather than assuming a fixed 44-byte header.
 */
function wavDurationMs(buf: Buffer): number {
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
    offset += 8 + size + (size % 2);
  }

  const bytesPerSecond = sampleRate * numChannels * (bitsPerSample / 8);
  if (!bytesPerSecond) return 0;
  return Math.round((dataSize / bytesPerSecond) * 1000);
}

export async function synthesizeWithPiper(
  pythonPath: string,
  onnxPath: string,
  text: string
): Promise<{ audioBuffer: ArrayBuffer; durationMs: number }> {
  const handle = await getOrStartServer(pythonPath, onnxPath);

  const buf: Buffer = await new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port: handle.port,
        path: `/?text=${encodeURIComponent(text)}`,
        method: "GET",
        timeout: 30000,
      },
      (res) => {
        const chunks: Buffer[] = [];
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
    durationMs: wavDurationMs(buf),
  };
}

/** Called on app quit so we don't leave orphaned python processes running. */
export function shutdownAllPiperServers() {
  for (const [, handle] of servers) handle.proc.kill();
  servers.clear();
}
