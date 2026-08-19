// ---------------------------------------------------------------------------
// An intro and an outro, joined onto a finished render.
//
// WHY THIS IS NOT PART OF THE COMPOSITION, which is where it would obviously
// go. A card placed INSIDE the video moves everything after it: the narration,
// every subtitle cue, every viseme and every waveform frame would need shifting
// by the card's exact length. Get that offset wrong by two frames and the
// lip-sync is out for the entire lesson — and it is wrong in a way that looks
// like a rendering bug rather than an arithmetic one. `PLAN.md` parked video
// stings for exactly this reason.
//
// Joining finished files afterwards has none of that. The lesson is rendered
// exactly as it is today, timed against its own audio, and the cards are welded
// on at the ends. Nothing inside the lesson moves by a single frame.
//
// THE PRICE, stated plainly: the cards are re-encoded to match the lesson, so
// they go through x264 a second time. At two or three seconds that is invisible
// and takes about a second. It would not be an acceptable trade for anything
// long.
// ---------------------------------------------------------------------------

import { spawn } from "node:child_process";
import fsp from "node:fs/promises";
import path from "node:path";

export interface JoinCardsOptions {
  /** The rendered lesson. Not modified — the joined file is written beside it. */
  mainPath: string;
  introPath?: string | null;
  outroPath?: string | null;
  width: number;
  height: number;
  fps: number;
  crf: number;
  /** Somewhere to put the normalised parts. Deleted afterwards. */
  tempDir: string;
}

export interface JoinCardsResult {
  /** The joined file, or `mainPath` unchanged when there was nothing to join. */
  outputPath: string;
  /** Said out loud rather than left to be noticed — a card that was asked for
   *  and could not be used must never pass silently. */
  warnings: string[];
  introSec: number;
  outroSec: number;
}

function run(args: string[]): Promise<{ code: number; err: string }> {
  return new Promise((resolve) => {
    const p = spawn("ffmpeg", args, { windowsHide: true });
    let err = "";
    p.stderr.on("data", (d) => { err += String(d); });
    p.on("error", () => resolve({ code: -1, err: "ffmpeg not found on PATH" }));
    p.on("close", (code) => resolve({ code: code ?? -1, err }));
  });
}

/** Does this file carry sound at all? */
async function hasAudio(file: string): Promise<boolean> {
  return new Promise((resolve) => {
    const p = spawn("ffprobe", [
      "-v", "error", "-select_streams", "a",
      "-show_entries", "stream=index", "-of", "csv=p=0", file,
    ], { windowsHide: true });
    let out = "";
    p.stdout.on("data", (d) => { out += String(d); });
    p.on("error", () => resolve(false));
    p.on("close", () => resolve(out.trim().length > 0));
  });
}

async function durationOf(file: string): Promise<number> {
  return new Promise((resolve) => {
    const p = spawn("ffprobe", [
      "-v", "error", "-show_entries", "format=duration",
      "-of", "default=nw=1:nk=1", file,
    ], { windowsHide: true });
    let out = "";
    p.stdout.on("data", (d) => { out += String(d); });
    p.on("error", () => resolve(0));
    p.on("close", () => resolve(parseFloat(out.trim()) || 0));
  });
}

/**
 * Re-encode one card so it is byte-compatible with the lesson.
 *
 * Every one of these flags is here because concatenation fails without it:
 * different dimensions, a different frame rate, a different pixel aspect, or —
 * most often — no audio track at all, since a card is usually silent. A silent
 * card with no stream cannot be concatenated with a lesson that has one, so one
 * is generated.
 */
async function normalise(
  src: string,
  dest: string,
  o: JoinCardsOptions
): Promise<string | null> {
  // A CARD KEEPS ITS OWN SOUND. The first version always mapped the generated
  // silence and threw the card's audio away, whatever it had — a sting with a
  // whoosh on it would have arrived silent, and the setting said so in words
  // that made it sound deliberate.
  //
  // Silence is only manufactured when there is none to keep, and it is
  // manufactured rather than left out because every part of a concatenation
  // needs the same streams: a card with no audio track at all cannot be joined
  // to a lesson that has one.
  const keepsOwnAudio = await hasAudio(src);
  const { code, err } = await run([
    "-y",
    "-i", src,
    "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
    "-shortest",
    "-map", "0:v:0",
    "-map", keepsOwnAudio ? "0:a:0" : "1:a:0",
    "-vf",
    `scale=${o.width}:${o.height}:force_original_aspect_ratio=decrease,` +
      `pad=${o.width}:${o.height}:(ow-iw)/2:(oh-ih)/2:color=black,` +
      `setsar=1,fps=${o.fps}`,
    "-c:v", "libx264", "-preset", "medium", "-crf", String(o.crf),
    "-pix_fmt", "yuv420p",
    // MATCH THE LESSON'S TIMESCALE, or the joined file lies about its length.
    // The concat demuxer takes its timebase from the FIRST part, and a card
    // encoded at the default 12288 against a render at 90000 produced a 34
    // second video whose container claimed 230 seconds — every frame present
    // and correct, every player showing the wrong duration and a scrub bar
    // that went nowhere. Remotion writes 90000; so do we.
    "-video_track_timescale", "90000",
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
    dest,
  ]);
  if (code !== 0) return err.split("\n").slice(-4).join(" ").trim() || "ffmpeg failed";
  return null;
}

export async function joinCards(o: JoinCardsOptions): Promise<JoinCardsResult> {
  const warnings: string[] = [];
  const parts: string[] = [];
  let introSec = 0;
  let outroSec = 0;

  const wanted: { role: "intro" | "outro"; src: string }[] = [];
  if (o.introPath) wanted.push({ role: "intro", src: o.introPath });
  if (o.outroPath) wanted.push({ role: "outro", src: o.outroPath });
  if (wanted.length === 0) {
    return { outputPath: o.mainPath, warnings, introSec, outroSec };
  }

  await fsp.mkdir(o.tempDir, { recursive: true });
  const normalised: Record<string, string> = {};

  for (const { role, src } of wanted) {
    try {
      await fsp.access(src);
    } catch {
      warnings.push(`[byok] the ${role} file is not there and was left out: ${src}`);
      continue;
    }
    const dest = path.join(o.tempDir, `${role}.mp4`);
    const problem = await normalise(src, dest, o);
    if (problem) {
      warnings.push(`[byok] the ${role} could not be prepared and was left out — ${problem}`);
      continue;
    }
    normalised[role] = dest;
    const sec = await durationOf(dest);
    if (role === "intro") introSec = sec; else outroSec = sec;
  }

  if (normalised.intro) parts.push(normalised.intro);
  parts.push(o.mainPath);
  if (normalised.outro) parts.push(normalised.outro);
  if (parts.length === 1) {
    return { outputPath: o.mainPath, warnings, introSec, outroSec };
  }

  // The concat demuxer, not the filter: every part now has identical streams,
  // so the video can be copied rather than encoded a third time. Paths are
  // single-quoted and escaped the way the demuxer expects.
  const listPath = path.join(o.tempDir, "parts.txt");
  await fsp.writeFile(
    listPath,
    parts.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"),
    "utf8"
  );

  const joined = o.mainPath.replace(/\.mp4$/i, "-with-cards.mp4");
  const { code, err } = await run([
    "-y", "-f", "concat", "-safe", "0", "-i", listPath,
    "-c", "copy", joined,
  ]);
  if (code !== 0) {
    warnings.push(
      `[byok] the cards could not be joined and the lesson was left on its own — ` +
        (err.split("\n").slice(-3).join(" ").trim() || "ffmpeg failed")
    );
    return { outputPath: o.mainPath, warnings, introSec, outroSec };
  }

  await fsp.rm(o.tempDir, { recursive: true, force: true }).catch(() => {});
  return { outputPath: joined, warnings, introSec, outroSec };
}
