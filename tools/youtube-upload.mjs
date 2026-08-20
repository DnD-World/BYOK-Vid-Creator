/**
 * Put one finished video on YouTube.
 *
 *   node tools/youtube-upload.mjs video.mp4 --title "..." --description "..."
 *   node tools/youtube-upload.mjs video.mp4 --title "..." --publish-at 2026-09-01T10:00
 *
 * Private unless told otherwise. A publish date makes it appear at that moment
 * — no countdown and no live chat, which is a Premiere and a different thing.
 *
 * The status is read back off YouTube's own answer rather than assumed, because
 * a schedule that quietly did not take is the kind of failure discovered by a
 * subscriber rather than by a log.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SECRETS = process.env.BYOK_SECRETS_DIR ?? path.resolve(ROOT, "..", "SECRETS");

const { readClientSecret, uploadVideo } = await import(
  "file://" + path.join(ROOT, "electron/net/youtube.ts")
);

const argv = process.argv.slice(2);
const videoPath = argv.find((a) => !a.startsWith("--"));
const val = (n) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

if (!videoPath) {
  console.error(`usage: youtube-upload.mjs <video.mp4> --title "..." [--description "..."] [--publish-at ISO] [--privacy private|unlisted|public]`);
  process.exit(1);
}

const secretFile = fs.readdirSync(SECRETS).find((n) => n.startsWith("client_secret"));
const client = await readClientSecret(path.join(SECRETS, secretFile));
const token = JSON.parse(fs.readFileSync(path.join(SECRETS, "youtube-token.json"), "utf8"));

const size = fs.statSync(videoPath).size;
console.log(`\nUploading ${path.basename(videoPath)} (${(size / 1024 / 1024).toFixed(1)} MB)…`);

let lastShown = 0;
const result = await uploadVideo(client, token, {
  videoPath: path.resolve(videoPath),
  title: val("title") ?? path.basename(videoPath, path.extname(videoPath)),
  description: val("description") ?? "",
  publishAt: val("publish-at") ? new Date(val("publish-at")).toISOString() : undefined,
  privacy: val("privacy") ?? "private",
  onProgress: (sent, total) => {
    const pct = Math.floor((sent / total) * 100);
    if (pct >= lastShown + 10) {
      lastShown = pct;
      process.stdout.write(`  ${pct}%\n`);
    }
  },
});

console.log(`\nDone.`);
console.log(`  ${result.url}`);
console.log(`  status     ${result.privacyStatus}`);
if (result.publishAt) {
  console.log(`  goes public ${new Date(result.publishAt).toLocaleString()}`);
}
console.log();
