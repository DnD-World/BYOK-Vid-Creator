// ---------------------------------------------------------------------------
// Uploading a finished lesson to YouTube, and scheduling when it goes public.
//
// NO SDK. The official client library pulls in a very large dependency tree for
// what is, in the end, three HTTP calls: refresh a token, open a resumable
// upload, send the bytes. Doing it by hand keeps the dependency list short and
// means the failure messages come from YouTube rather than from a wrapper.
//
// SCHEDULING IS NOT A PREMIERE, and the difference matters. Setting a video
// private with a `publishAt` time makes it appear at that moment — no
// countdown, no waiting room, no live chat. A real Premiere needs a live
// broadcast created alongside the video and is a different, more fragile piece
// of work. Decided 20 Aug 2026: scheduled publish is what this does.
//
// CREDENTIALS live outside the repository and are gitignored. The client secret
// is Ak's; the refresh token is his account. Neither is ever logged, and the
// only thing written to disk is the token file the auth tool creates.
// ---------------------------------------------------------------------------

import fsp from "node:fs/promises";
import fs from "node:fs";
import path from "node:path";
import { Transform } from "node:stream";

/** What Google hands back when a Desktop client is created. Web clients have
 *  the same shape under a different key, which is why both are accepted. */
interface ClientSecret {
  client_id: string;
  client_secret: string;
  redirect_uris?: string[];
}

export interface YoutubeToken {
  refresh_token: string;
  /** Set on the client this token was made for, so a mismatched pair is caught
   *  before it fails halfway through a hundred uploads. */
  client_id: string;
  obtained: string;
}

export interface UploadOptions {
  videoPath: string;
  title: string;
  description: string;
  tags?: string[];
  /** ISO time. Absent means publish immediately as `privacy`. */
  publishAt?: string;
  /** Where it starts. A scheduled video MUST start private, or YouTube ignores
   *  the schedule and publishes it the moment the upload finishes. */
  privacy?: "private" | "unlisted" | "public";
  /** 22 = People & Blogs, 27 = Education. Education is the honest one here. */
  categoryId?: string;
  /** Marks the video as not made for kids. YouTube requires an answer; there is
   *  no "unset", and getting it wrong disables comments and other features. */
  madeForKids?: boolean;
  onProgress?: (sentBytes: number, totalBytes: number) => void;
}

export interface UploadResult {
  videoId: string;
  url: string;
  /** What the video's status actually is once YouTube has it — read back
   *  rather than assumed, because a schedule silently not taking is the exact
   *  failure this project keeps having in other forms. */
  privacyStatus: string;
  publishAt?: string;
}

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const UPLOAD_URL =
  "https://www.googleapis.com/upload/youtube/v3/videos" +
  "?uploadType=resumable&part=snippet,status";

/** Read the client secret file, whichever kind it is. */
export async function readClientSecret(file: string): Promise<ClientSecret> {
  const raw = JSON.parse(await fsp.readFile(file, "utf8"));
  const kind = raw.installed ? "installed" : raw.web ? "web" : null;
  if (!kind) {
    throw new Error(
      `${path.basename(file)} is not a Google OAuth client file — it has neither ` +
        `an "installed" nor a "web" section.`
    );
  }
  return raw[kind];
}

/** Where credentials live: beside the project, never inside it.
 *
 *  A secret in a working tree is one `git add -A` away from being published,
 *  and an ignore rule only holds for as long as nobody edits the ignore file.
 *  Override with BYOK_SECRETS_DIR. */
export function secretsDir(projectRoot: string): string {
  return process.env.BYOK_SECRETS_DIR ?? path.resolve(projectRoot, "..", "SECRETS");
}

/** Find the client secret, if there is one. */
export async function findClientSecret(dir: string): Promise<string | null> {
  try {
    const names = await fsp.readdir(dir);
    const hit = names.find((n) => n.startsWith("client_secret") && n.endsWith(".json"));
    return hit ? path.join(dir, hit) : null;
  } catch {
    return null;
  }
}

/**
 * An access token, from the long-lived refresh token.
 *
 * Access tokens last an hour. A run of a hundred uploads outlives that, so this
 * is called per upload rather than once — it is one cheap request and it
 * removes a whole class of "it worked for the first forty" failure.
 */
export async function accessToken(
  client: ClientSecret,
  token: YoutubeToken
): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: client.client_id,
      client_secret: client.client_secret,
      refresh_token: token.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const body = (await res.json()) as { access_token?: string; error_description?: string; error?: string };
  if (!res.ok || !body.access_token) {
    throw new Error(
      `Could not refresh the YouTube token: ${body.error_description ?? body.error ?? res.statusText}. ` +
        `If this says the token was revoked, run tools/youtube-auth.mjs again.`
    );
  }
  return body.access_token;
}

/**
 * Upload one video, resumably.
 *
 * Resumable rather than a single POST because these files are hundreds of
 * megabytes over a home connection: a simple upload that fails at 90% has to
 * start again, and doing that on row 340 of 400 is how an afternoon is lost.
 */
export async function uploadVideo(
  client: ClientSecret,
  token: YoutubeToken,
  opts: UploadOptions
): Promise<UploadResult> {
  const bearer = await accessToken(client, token);
  const stat = await fsp.stat(opts.videoPath);

  // A schedule only works from private. Saying so out loud rather than fixing
  // it silently, because "I asked for Tuesday and it went out on Sunday" is a
  // failure the user would discover from a subscriber.
  if (opts.publishAt && (opts.privacy ?? "private") !== "private") {
    throw new Error(
      `A video with a publish time must start private — "${opts.privacy}" would ` +
        `publish it immediately and ignore the schedule.`
    );
  }

  const metadata = {
    snippet: {
      title: opts.title.slice(0, 100),          // YouTube's own limit
      description: opts.description.slice(0, 5000),
      tags: opts.tags?.slice(0, 60),
      categoryId: opts.categoryId ?? "27",      // Education
    },
    status: {
      privacyStatus: opts.publishAt ? "private" : (opts.privacy ?? "private"),
      ...(opts.publishAt ? { publishAt: opts.publishAt } : {}),
      selfDeclaredMadeForKids: opts.madeForKids ?? false,
    },
  };

  // Step one: ask for somewhere to put it.
  const start = await fetch(UPLOAD_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${bearer}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Length": String(stat.size),
      "X-Upload-Content-Type": "video/mp4",
    },
    body: JSON.stringify(metadata),
  });
  if (!start.ok) {
    // TRANSLATED, because the raw answer is a wall of JSON with the one useful
    // word buried in it. Each of these is a real condition with a real fix, and
    // none of them is a bug in this code.
    const text = await start.text();
    const reason = text.match(/"reason":\s*"([^"]+)"/)?.[1] ?? "";
    const plain: Record<string, string> = {
      youtubeSignupRequired:
        `The Google account you signed in with has no YouTube channel.
` +
        `Either create one on that account, or sign in again with the account that
` +
        `owns the channel:  node tools/youtube-auth.mjs --link`,
      quotaExceeded:
        `The daily upload allowance is used up. It is 100 uploads a day and it
` +
        `resets at midnight Pacific time.`,
      forbidden:
        `The account is not allowed to upload — usually an unverified channel.
` +
        `Verify it at youtube.com/verify and try again.`,
      uploadLimitExceeded:
        `This channel has hit its upload limit for now. Try again later.`,
      authError:
        `The sign-in is no longer good. Run: node tools/youtube-auth.mjs --link`,
    };
    throw new Error(
      plain[reason] ??
        `YouTube refused the upload: ${start.status} ${start.statusText} — ${text}`
    );
  }
  const location = start.headers.get("location");
  if (!location) throw new Error("YouTube accepted the request but gave no upload address.");

  // Step two: send the bytes. Streamed from disk rather than read into memory —
  // a 700MB lesson read whole would be 700MB of process.
  //
  // COUNTED THROUGH A TRANSFORM, NOT A LISTENER. Attaching `on("data")` to the
  // file stream to measure progress puts it into flowing mode and consumes it
  // then and there, so fetch was handed an already-drained stream and the
  // upload died with "request body length does not match content-length" —
  // which reads like a header bug and is in fact a stolen stream. A transform
  // sits IN the pipe and passes every chunk on.
  let sent = 0;
  const counter = new Transform({
    transform(chunk, _enc, cb) {
      sent += chunk.length;
      opts.onProgress?.(sent, stat.size);
      cb(null, chunk);
    },
  });
  const stream = fs.createReadStream(opts.videoPath).pipe(counter);

  const put = await fetch(location, {
    method: "PUT",
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(stat.size),
    },
    body: stream as unknown as BodyInit,
    // Node needs telling that a stream body is a stream.
    duplex: "half",
  } as RequestInit & { duplex: "half" });

  if (!put.ok) {
    throw new Error(
      `The upload failed at ${Math.round((sent / stat.size) * 100)}%: ` +
        `${put.status} ${put.statusText} — ${await put.text()}`
    );
  }

  const video = (await put.json()) as {
    id: string;
    status?: { privacyStatus?: string; publishAt?: string };
  };

  return {
    videoId: video.id,
    url: `https://www.youtube.com/watch?v=${video.id}`,
    // READ BACK, not assumed. If the schedule did not take, this is where it
    // shows, rather than on the day nothing appeared.
    privacyStatus: video.status?.privacyStatus ?? "unknown",
    publishAt: video.status?.publishAt,
  };
}

/**
 * One publish time per day, at a fixed hour, starting tomorrow.
 *
 * Times are produced in UTC because that is what the API takes; the hour is
 * given in local terms and converted, so "10am" means 10am where Ak is rather
 * than 10am in Greenwich.
 */
export function dailySchedule(
  count: number,
  opts: { startDaysFromNow?: number; hourLocal?: number; from?: Date } = {}
): string[] {
  const startIn = opts.startDaysFromNow ?? 1;
  const hour = opts.hourLocal ?? 10;
  const base = opts.from ? new Date(opts.from) : new Date();
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() + startIn + i);
    d.setHours(hour, 0, 0, 0);
    out.push(d.toISOString());
  }
  return out;
}
