/**
 * Voices for a batch of lessons, on the rented GPU, in one session.
 *
 *   node tools/narrate-remote.mjs jobs/101.1.json jobs/101.2.json
 *   node tools/narrate-remote.mjs --queue queue.json
 *   node tools/narrate-remote.mjs jobs/101.1.json --keep-running
 *
 * WHAT IT REPLACES. Every lesson so far has needed a person to: build the
 * blocks, copy them up, start the box, run the generator, run the aligner, copy
 * the audio back, and remember to switch the machine off. Seven steps, and at
 * seventy-two lessons that is five hundred opportunities to get one wrong.
 *
 * ONE SESSION FOR ALL OF THEM. The model takes a minute or two to load, so
 * doing it per lesson would waste over an hour of rented card on nothing. Every
 * lesson goes up first, the generator is told about all of them at once, and
 * everything comes back together.
 *
 * IT TURNS THE MACHINE OFF. Ak's standing rule, and the one that costs money
 * when forgotten. A shutdown is also scheduled ON the box before the work
 * starts, so the card dies even if this script is killed, the laptop sleeps or
 * the connection drops. `--keep-running` opts out for a session where more work
 * is coming.
 */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "..");
const INSTANCE = "dramabox-smoke";
const ZONE = "us-east1-c";
const PROJECT = "tier-1-ak";
const REMOTE = "/opt/dramabox/work";
const VENV = "/opt/dramabox/DramaBox/.venv/bin/python";
/** Safety net on the box itself, in minutes. Long enough for a big batch,
 *  short enough that a forgotten machine is hours rather than days. */
const SHUTDOWN_IN = 180;

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const val = (n) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

let jobFiles = argv.filter((a) => !a.startsWith("--") && a.endsWith(".json"));
const queueFile = val("queue");
if (queueFile) {
  const rows = JSON.parse(fs.readFileSync(queueFile, "utf8"));
  jobFiles = rows.map((r) => (typeof r === "string" ? r : r.job)).filter(Boolean);
}
jobFiles = [...new Set(jobFiles.filter((f) => f !== queueFile))];

if (jobFiles.length === 0) {
  console.error(
    `usage: narrate-remote.mjs <job.json...> | --queue queue.json [--keep-running]`
  );
  process.exit(1);
}

/** Run a command, showing its output as it happens. */
function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd: ROOT, windowsHide: true, ...opts });
    let out = "";
    const take = (d) => {
      const s = String(d);
      out += s;
      if (!opts.quiet) process.stdout.write(s);
    };
    p.stdout.on("data", take);
    p.stderr.on("data", take);
    p.on("error", (e) => resolve({ code: -1, out: String(e) }));
    p.on("close", (code) => resolve({ code: code ?? -1, out }));
  });
}

const gcloud = (args, opts) =>
  run("gcloud", [...args, `--project=${PROJECT}`], opts);

const ssh = (command, opts) =>
  gcloud(["compute", "ssh", INSTANCE, `--zone=${ZONE}`, "--command", command], opts);

const say = (msg) => console.log(`\n── ${msg}`);

// ---- 1. blocks for every lesson, locally -----------------------------------

say(`Building blocks for ${jobFiles.length} lesson(s)`);
const lessons = [];
for (const jobFile of jobFiles) {
  const name = path.basename(jobFile, ".json");
  const outDir = path.join(ROOT, "voice-refs", "work", "lessons", name);
  fs.mkdirSync(outDir, { recursive: true });
  const r = await run(process.execPath, [
    "--experimental-strip-types",
    path.join(ROOT, "tools", "make-blocks.mjs"),
    jobFile,
    path.join(outDir, "blocks.json"),
  ]);
  if (r.code !== 0) {
    console.error(`\n${name}: blocks could not be built. Nothing was sent.\n`);
    process.exit(1);
  }
  lessons.push({ name, jobFile, outDir });
}

// ---- 2. the machine --------------------------------------------------------

say("Starting the GPU box");
const list = await gcloud(
  ["compute", "instances", "list", `--filter=name=${INSTANCE}`, "--format=value(status)"],
  { quiet: true }
);
const status = list.out.trim();
console.log(`   currently ${status || "unknown"}`);

if (status !== "RUNNING") {
  // L4 capacity comes and goes; a stockout is a "try again", not a failure.
  let started = false;
  for (let attempt = 1; attempt <= 5 && !started; attempt++) {
    const r = await gcloud(
      ["compute", "instances", "start", INSTANCE, `--zone=${ZONE}`],
      { quiet: true }
    );
    if (r.code === 0 && !/STOCKOUT|does not have enough/i.test(r.out)) started = true;
    else {
      console.log(`   attempt ${attempt}: the zone is out of cards, waiting…`);
      await new Promise((r2) => setTimeout(r2, 20000));
    }
  }
  if (!started) {
    console.error(`\nCould not get a card in ${ZONE} after five tries. Nothing was spent.\n`);
    process.exit(1);
  }
}
console.log(`   running`);

// The card dies on its own even if everything here goes wrong.
await ssh(`sudo shutdown -h +${SHUTDOWN_IN}`, { quiet: true });
console.log(`   safety shutdown set for +${SHUTDOWN_IN} min`);

// ---- 3. up ----------------------------------------------------------------

say("Sending the lessons and the voice clips");
await ssh(`mkdir -p ${REMOTE}/refs ${REMOTE}/lessons`, { quiet: true });
await gcloud([
  "compute", "scp", `--zone=${ZONE}`,
  ...fs.readdirSync(path.join(ROOT, "voice-refs")).filter((n) => n.endsWith(".wav"))
    .map((n) => path.join(ROOT, "voice-refs", n)),
  `${INSTANCE}:${REMOTE}/refs/`,
], { quiet: true });

for (const l of lessons) {
  await ssh(`mkdir -p ${REMOTE}/lessons/${l.name}`, { quiet: true });
  await gcloud([
    "compute", "scp", `--zone=${ZONE}`,
    path.join(l.outDir, "blocks.json"),
    path.join(l.outDir, "align.json"),
    `${INSTANCE}:${REMOTE}/lessons/${l.name}/`,
  ], { quiet: true });
  console.log(`   ${l.name}`);
}

await gcloud([
  "compute", "scp", `--zone=${ZONE}`,
  path.join(ROOT, "tools", "dramabox-render-blocks.py"),
  path.join(ROOT, "tools", "dramabox-align.py"),
  `${INSTANCE}:${REMOTE}/`,
], { quiet: true });

// ---- 4. generate, then align ----------------------------------------------

const remoteDirs = lessons.map((l) => `${REMOTE}/lessons/${l.name}`).join(" ");

say(`Generating voices — the model loads once for all ${lessons.length}`);
const gen = await ssh(`cd ${REMOTE} && ${VENV} dramabox-render-blocks.py ${remoteDirs}`);
if (gen.code !== 0) {
  console.error(`\nGeneration failed. The box is still up — nothing was thrown away.\n`);
  process.exit(1);
}

say("Measuring when every word was said");
for (const l of lessons) {
  await ssh(`cd ${REMOTE} && ${VENV} dramabox-align.py ${REMOTE}/lessons/${l.name}`);
}

// ---- 5. back ---------------------------------------------------------------

say("Bringing the audio home");
for (const l of lessons) {
  fs.mkdirSync(path.join(l.outDir, "out"), { recursive: true });
  await gcloud([
    "compute", "scp", `--zone=${ZONE}`, "--recurse",
    `${INSTANCE}:${REMOTE}/lessons/${l.name}/out`,
    l.outDir,
  ], { quiet: true });
  await gcloud([
    "compute", "scp", `--zone=${ZONE}`,
    `${INSTANCE}:${REMOTE}/lessons/${l.name}/words.json`,
    l.outDir,
  ], { quiet: true });

  const wavs = fs.existsSync(path.join(l.outDir, "out"))
    ? fs.readdirSync(path.join(l.outDir, "out")).filter((n) => n.endsWith(".wav")).length
    : 0;
  console.log(`   ${l.name}: ${wavs} takes`);

  // Point the job at what just arrived, so rendering is one command with no
  // paths to remember.
  const job = JSON.parse(fs.readFileSync(l.jobFile, "utf8"));
  job.dramaboxWavDir = path.join(l.outDir, "out").replace(/\\/g, "/");
  job.dramaboxWordsPath = path.join(l.outDir, "words.json").replace(/\\/g, "/");
  fs.writeFileSync(l.jobFile, JSON.stringify(job, null, 2), "utf8");
}

// ---- 6. off ----------------------------------------------------------------

if (flag("keep-running")) {
  console.log(`\nThe box is STILL RUNNING because you asked. It is billing.\n`);
} else {
  say("Switching the GPU box off");
  await gcloud(["compute", "instances", "stop", INSTANCE, `--zone=${ZONE}`], { quiet: true });
  const after = await gcloud(
    ["compute", "instances", "list", `--filter=name=${INSTANCE}`, "--format=value(status)"],
    { quiet: true }
  );
  console.log(`   ${after.out.trim()}`);
}

console.log(`\nVoices done for ${lessons.length} lesson(s). Render them with:\n`);
for (const l of lessons) console.log(`  npm run job -- ${l.jobFile}`);
console.log();
