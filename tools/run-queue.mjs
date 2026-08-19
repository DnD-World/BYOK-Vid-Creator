/**
 * Render a list of lessons, one after another, and remember what happened.
 *
 *   node tools/run-queue.mjs queue.json
 *   node tools/run-queue.mjs queue.json --pace 20m
 *   node tools/run-queue.mjs queue.json --retry-failed
 *
 * WHY A SEPARATE RUNNER. `npm run job` makes one video. Four hundred of them is
 * a different problem: something will fail somewhere in the middle — a stock
 * provider will rate-limit, a disk will fill, a laptop will sleep — and losing
 * eight hours of finished renders because row 340 threw is not acceptable.
 *
 * So every row's outcome is written to disk the moment it happens. Run the same
 * queue again and it skips what already succeeded. `--retry-failed` picks up
 * only the ones that did not.
 *
 * THE QUEUE FILE is a JSON array. Each entry is either a path to a job file:
 *
 *     ["jobs/101.1.json", "jobs/101.2.json"]
 *
 * or an object that names one and overrides a few fields, which is what a
 * spreadsheet export turns into:
 *
 *     [{ "job": "jobs/template.json",
 *        "scriptPath": "scripts/101.1.txt",
 *        "topic": "how a dog thinks",
 *        "outputName": "101.1" }]
 *
 * PACING exists because this machine is also used for other things, and a
 * render pins it. `--pace 20m` leaves twenty minutes between the END of one and
 * the START of the next.
 */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const ROOT = path.resolve(import.meta.dirname, "..");
/** The electron executable, as the electron package reports it. */
const ELECTRON = createRequire(path.join(ROOT, "package.json"))("electron");

const args = process.argv.slice(2);
const queuePath = args.find((a) => !a.startsWith("--"));
const flag = (name) => args.includes(`--${name}`);
const value = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

if (!queuePath) {
  console.error(
    "usage: run-queue.mjs <queue.json> [--pace 20m] [--retry-failed] [--limit N]"
  );
  process.exit(1);
}

/** "20m", "45s", "2h" — or a bare number of minutes. */
function parsePace(s) {
  if (!s) return 0;
  const m = String(s).match(/^(\d+(?:\.\d+)?)\s*([smh]?)$/i);
  if (!m) return 0;
  const n = Number(m[1]);
  return n * ({ s: 1000, m: 60000, h: 3600000 }[m[2].toLowerCase()] ?? 60000);
}

const paceMs = parsePace(value("pace"));
const limit = Number(value("limit") ?? Infinity);

const queue = JSON.parse(fs.readFileSync(queuePath, "utf8"));
const statePath = queuePath.replace(/\.json$/i, "") + ".state.json";
const state = fs.existsSync(statePath)
  ? JSON.parse(fs.readFileSync(statePath, "utf8"))
  : { rows: {} };

const saveState = () =>
  fs.writeFileSync(statePath, JSON.stringify(state, null, 1), "utf8");

/** A stable name for a row, so state survives the queue being reordered. */
const idOf = (row, i) =>
  typeof row === "string"
    ? row
    : row.outputName || row.scriptPath || `${row.job}#${i}`;

/** Rows that need doing, given what the state file already knows. */
const todo = queue
  .map((row, i) => ({ row, i, id: idOf(row, i) }))
  .filter(({ id }) => {
    const seen = state.rows[id];
    if (!seen) return true;
    if (seen.status === "ok") return false;
    return flag("retry-failed") || seen.status !== "failed";
  })
  .slice(0, limit);

console.log(
  `${queue.length} in the queue, ${todo.length} to run` +
    (paceMs ? `, ${paceMs / 60000} min between them` : "")
);
if (todo.length === 0) process.exit(0);

/** Write a temporary job file when a row overrides fields. */
function materialise(row, id) {
  if (typeof row === "string") return path.resolve(ROOT, row);
  const base = JSON.parse(
    fs.readFileSync(path.resolve(ROOT, row.job), "utf8")
  );
  const merged = { ...base, ...row };
  delete merged.job;
  const dir = path.join(ROOT, "jobs", ".queue");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${id.replace(/[^\w.-]/g, "_")}.json`);
  fs.writeFileSync(file, JSON.stringify(merged, null, 2), "utf8");
  return file;
}

function runOne(jobFile) {
  return new Promise((resolve) => {
    const started = Date.now();
    let out = "";
    // ELECTRON DIRECTLY, not `npm run job`, and not through a shell.
    //
    // Two Windows problems at once. Through a shell, the project's path — which
    // contains a space — arrives as two arguments and every row fails with a
    // file-not-found on a job file that is plainly there. Without a shell, Node
    // 22 refuses to spawn npm at all, because npm on Windows is a .cmd. Running
    // the binary that `npm run job` would have run avoids both, and drops a
    // process from every render.
    const p = spawn(ELECTRON, [".", "--job", jobFile], {
      cwd: ROOT,
      windowsHide: true,
    });
    const take = (d) => {
      const s = String(d);
      out += s;
      // Progress lines are worth seeing live; everything else is kept for the
      // state file so a failure can be read without re-running anything.
      for (const line of s.split("\n")) {
        if (/^\[\s*\d+%\]|Done in|Job failed/.test(line.trim())) {
          process.stdout.write(`    ${line.trim()}\n`);
        }
      }
    };
    p.stdout.on("data", take);
    p.stderr.on("data", take);
    p.on("close", (code) => {
      const video = out.match(/video\s+(.+\.mp4)/)?.[1]?.trim();
      resolve({
        status: code === 0 && video ? "ok" : "failed",
        code,
        video: video ?? null,
        minutes: +((Date.now() - started) / 60000).toFixed(1),
        tail: out.split("\n").slice(-12).join("\n"),
      });
    });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let done = 0;
let failed = 0;
for (const [n, { row, id }] of todo.entries()) {
  console.log(`\n[${n + 1}/${todo.length}] ${id}`);
  let jobFile;
  try {
    jobFile = materialise(row, id);
  } catch (e) {
    state.rows[id] = { status: "failed", error: `queue row unusable: ${String(e)}` };
    saveState();
    failed++;
    continue;
  }

  const result = await runOne(jobFile);
  state.rows[id] = { ...result, at: new Date().toISOString(), job: jobFile };
  saveState();

  if (result.status === "ok") {
    done++;
    console.log(`    ok — ${result.minutes} min — ${path.basename(result.video)}`);
  } else {
    failed++;
    console.log(`    FAILED (exit ${result.code}). Kept in ${path.basename(statePath)}.`);
  }

  if (paceMs && n < todo.length - 1) {
    console.log(`    waiting ${paceMs / 60000} min…`);
    await sleep(paceMs);
  }
}

console.log(`\n${done} rendered, ${failed} failed. State: ${statePath}`);
if (failed) {
  console.log("Re-run with --retry-failed to try the failures again.");
  process.exit(1);
}
