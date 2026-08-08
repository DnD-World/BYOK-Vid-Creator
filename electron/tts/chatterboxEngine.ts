import { spawn, ChildProcess } from "node:child_process";
import { childEnv } from "../net/childEnv";
import path from "node:path";
import fs from "node:fs/promises";
import http from "node:http";
import { wavDurationMs } from "./wavUtils";

// ---------------------------------------------------------------------------
// Chatterbox Multilingual v3 (Resemble AI, MIT license) — the real quality
// TTS + voice-cloning engine, replacing the originally-planned XTTS-v2
// (dropped: no Greek support ever, and its CPML license blocks commercial
// use). Talks to a self-hosted devnen/Chatterbox-TTS-Server instance
// (https://github.com/devnen/Chatterbox-TTS-Server) — a mature, actively
// maintained FastAPI wrapper we did NOT need to build ourselves, unlike
// Piper's http_server which we're a thin client on top of either way.
//
// Ak chose to have Electron auto-start this (rather than run it as its own
// standalone background app), so this module owns that process's lifecycle
// — spawn, health-check, and clean shutdown (including releasing GPU memory
// via /api/unload before killing the process).
//
// One-time manual setup is still required on Ak's machine before this can
// work: clone devnen/Chatterbox-TTS-Server, run start.bat once (Portable
// Mode recommended, matching Piper's environment-isolation lesson), and
// select "Chatterbox Multilingual" once in its own Web UI so config.yaml
// saves that engine choice. After that, this module just launches
// server.py directly from the installed folder.
// ---------------------------------------------------------------------------

export interface ChatterboxConfig {
  installPath: string; // folder containing server.py (the Chatterbox-TTS-Server install)
  port: number;         // default 8004
}

export interface SynthesizeOptions {
  text: string;
  language: string; // e.g. "el", "en"
  voiceMode: "predefined" | "clone";
  predefinedVoiceId?: string;
  referenceAudioFilename?: string;
  seed?: number; // fixed seed helps voice consistency across chunks/sessions
  exaggeration?: number; // 0-2, voice expressiveness/character
  cfgWeight?: number;    // 0-1, how closely it follows the reference voice
}

export interface Voice {
  id: string;
  label: string;
}

export interface NarrationSegmentInput {
  speakerId: string;
  speakerLabel: string;
  text: string;
  language: string;
  voiceMode: "predefined" | "clone";
  predefinedVoiceId?: string;
  referenceAudioFilename?: string;
  exaggeration?: number;
  cfgWeight?: number;
}

let serverProcess: ChildProcess | null = null;
let serverPort = 8004;
let readyPromise: Promise<void> | null = null;

async function findPythonExe(installPath: string): Promise<string> {
  // Portable Mode (Windows) uses python_embedded/; standard installs use
  // venv/. Prefer portable since that's what we recommended to Ak
  // specifically to avoid the multi-environment confusion Piper hit.
  const portable = path.join(installPath, "python_embedded", "python.exe");
  const venvWin = path.join(installPath, "venv", "Scripts", "python.exe");
  const venvUnix = path.join(installPath, "venv", "bin", "python");
  for (const candidate of [portable, venvWin, venvUnix]) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      /* try next */
    }
  }
  throw new Error(
    "Couldn't find a Python environment inside the Chatterbox install folder. " +
      "Run start.bat / start.sh there once to complete first-time setup."
  );
}

function pingServer(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get({ host: "127.0.0.1", port, path: "/api/model-info", timeout: 2000 }, (res) => {
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

// Model load (first run: multi-GB download too) can genuinely take minutes,
// not seconds — Piper's tight timeout would be wrong here.
async function waitUntilReady(port: number, timeoutMs = 6 * 60 * 1000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await pingServer(port)) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(
    "Chatterbox server didn't become ready in time. First run downloads " +
      "several GB of model files — check your internet connection and the " +
      "server's own console window for progress."
  );
}

export async function ensureServerRunning(cfg: ChatterboxConfig): Promise<void> {
  if (serverProcess && readyPromise) {
    return readyPromise;
  }

  serverPort = cfg.port || 8004;
  const pythonExe = await findPythonExe(cfg.installPath);

  const proc = spawn(pythonExe, ["server.py"], {
    cwd: cfg.installPath,
    stdio: ["ignore", "pipe", "pipe"],
    // Without this the server starts, binds its port, passes the health check
    // and reports "running" — with no model, because downloading it from
    // Hugging Face failed on a certificate this machine trusts and Python
    // doesn't. See electron/net/childEnv.ts.
    env: childEnv(),
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
    throw new Error(`${(e as Error).message}${stderr ? `\n${stderr.trim().slice(-500)}` : ""}`);
  });

  return readyPromise;
}

/**
 * Whether the server is actually answering — asked, not assumed.
 *
 * This used to return `!!serverProcess`: whether THIS app was holding a child
 * process handle. That is a different question, and it was wrong in both
 * directions.
 *
 * Wrong when the server dies: the renderer set its own `serverRunning` flag
 * once, when Start Server succeeded, and never revisited it. So the panel went
 * on showing "running ✓" long after the process was gone, and every request
 * failed with "failed to fetch" against a green tick. In dev that happens
 * constantly — editing anything in the main process restarts Electron, which
 * kills the server it spawned — but a crash or an OOM does the same thing in a
 * packaged build.
 *
 * Wrong the other way too: a server started by hand, or left running by a
 * previous session, is perfectly usable and this reported it as absent.
 *
 * A ping answers the question the caller is really asking, which is "can I use
 * it", not "did I start it".
 */
export async function isServerRunning(): Promise<boolean> {
  return pingServer(serverPort);
}

export async function listPredefinedVoices(): Promise<Voice[]> {
  const body = await httpGet(`/get_predefined_voices`);
  const parsed = JSON.parse(body);
  // Server returns a list of {display_name, filename} or similar; normalize
  // defensively since this is a third-party API we don't control the shape of.
  const list = Array.isArray(parsed) ? parsed : parsed.voices ?? [];
  return list.map((v: any) => ({
    id: v.filename ?? v.id ?? v.name,
    label: v.display_name ?? v.label ?? v.filename ?? v.id,
  }));
}

export async function listReferenceAudio(): Promise<Voice[]> {
  const body = await httpGet(`/get_reference_files`);
  const parsed = JSON.parse(body);
  const list = Array.isArray(parsed) ? parsed : parsed.files ?? [];
  return list.map((f: any) => {
    const filename = typeof f === "string" ? f : f.filename ?? f.name;
    return { id: filename, label: filename };
  });
}

export async function synthesize(
  opts: SynthesizeOptions
): Promise<{ audioBuffer: ArrayBuffer; durationMs: number }> {
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
    split_text: true,
  });

  const buf = await new Promise<Buffer>((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port: serverPort,
        path: "/tts",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
        timeout: 120000, // synthesis itself can take a while, especially long text
      },
      (res) => {
        const chunks: Buffer[] = [];
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
    durationMs: wavDurationMs(buf),
  };
}

function httpGet(pathName: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: "127.0.0.1", port: serverPort, path: pathName, timeout: 10000 }, (res) => {
      const chunks: Buffer[] = [];
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

/** Called on app quit — releases GPU memory cleanly before killing the
 *  process, rather than just yanking it (which can leave VRAM allocated
 *  until the OS reclaims it). */
export async function shutdownServer(): Promise<void> {
  if (!serverProcess) return;
  try {
    await new Promise<void>((resolve) => {
      const req = http.request(
        { host: "127.0.0.1", port: serverPort, path: "/api/unload", method: "POST", timeout: 3000 },
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
