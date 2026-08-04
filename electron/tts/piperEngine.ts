import { spawn, ChildProcess } from "node:child_process";
import path from "node:path";
import fs from "node:fs/promises";
import http from "node:http";
import { wavDurationMs } from "./wavUtils";

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
export async function synthesizeWithPiper(
  pythonPath: string,
  onnxPath: string,
  text: string
): Promise<{ audioBuffer: ArrayBuffer; durationMs: number }> {
  const handle = await getOrStartServer(pythonPath, onnxPath);
  try {
    return await postSynthesize(handle.port, text);
  } catch (e) {
    // One retry, and only for a connection that died rather than answered.
    // See the agent:false note below for why this happens at all; the retry
    // covers the race that remains when the server closes a socket in the
    // window between us opening it and writing to it.
    const code = (e as NodeJS.ErrnoException).code;
    if (code !== "ECONNRESET" && code !== "EPIPE") throw e;
    return postSynthesize(handle.port, text);
  }
}

async function postSynthesize(
  port: number,
  text: string
): Promise<{ audioBuffer: ArrayBuffer; durationMs: number }> {
  // POST /synthesize with a JSON body. NOT `GET /?text=` — that was the old
  // rhasspy/piper http_server contract. In piper-tts 1.x `GET /` serves an HTML
  // demo page, so the old call silently returned a web page that then failed to
  // parse as a WAV. Verified against piper-tts 1.6.0.
  const payload = JSON.stringify({ text });
  const buf: Buffer = await new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path: "/synthesize",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
        // No connection pooling. Node's global agent has kept sockets alive by
        // default since v19, and Piper's server closes idle ones — so a script
        // that alternates between two voices leaves each connection idle for
        // however long the other voice takes, and the next request reuses a
        // socket the server has already dropped. That surfaced as
        // "read ECONNRESET" partway through generating a multi-speaker
        // narration, non-deterministically: whether it failed depended on how
        // long the other speaker's line took to synthesise, which is why the
        // same script succeeded one run and failed the next.
        agent: false,
        // Long lines on a CPU-only machine are genuinely slow; 30s was tight.
        timeout: 120000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const body = Buffer.concat(chunks);
          if ((res.statusCode ?? 500) >= 400) {
            reject(
              new Error(
                `Piper server returned ${res.statusCode}: ${body.toString("utf-8").slice(0, 300)}`
              )
            );
            return;
          }
          // Guard explicitly rather than handing a stray HTML page to the WAV
          // parser, which is exactly how the previous bug stayed invisible.
          if (body.subarray(0, 4).toString("ascii") !== "RIFF") {
            reject(
              new Error(
                "Piper server did not return WAV audio. This usually means an " +
                  "incompatible piper-tts version — expected POST /synthesize to return RIFF data."
              )
            );
            return;
          }
          resolve(body);
        });
        res.on("error", reject);
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Piper server timed out responding to a synthesis request."));
    });
    req.write(payload);
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
