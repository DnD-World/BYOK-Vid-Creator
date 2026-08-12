// ---------------------------------------------------------------------------
// Every process this app starts, and the guarantee that it dies with the app.
//
// WHY THIS EXISTS. Cleanup used to live entirely in app.on("will-quit"), which
// runs on the one exit path where everything is already going well. It does not
// run when the app crashes, when it is force-quit from Task Manager, or when
// `npm run dev` restarts the main process after an edit — and that last one
// happens dozens of times an afternoon.
//
// What survives is not harmless. Chatterbox holds several GB of an 8 GB card
// for as long as it lives, so an orphan quietly takes a quarter to a half of
// the machine's video memory with nothing on screen to explain it. Enough of
// them and the machine needs a restart to come back — which is exactly what
// happened here, alongside "several applications I do not recognize running".
// They were ours: python.exe, with no window and no name anyone would know.
//
// TWO HOLES, both fixed here.
//
// First, `proc.kill()` on Windows kills the process named and nothing it
// started. `python server.py` is a launcher; the server that holds the card is
// its child. Killing the parent orphans the part that actually matters. So we
// kill by tree, with `taskkill /T`, addressed BY PROCESS ID — never by name.
// python.exe and node.exe on this machine belong to other agents as much as to
// us, and /IM would take theirs too.
//
// Second, a process that is already gone cannot clean up after itself. So each
// spawn is written to a small file first. On the next start we read it back and
// kill anything still alive from a session that never got to say goodbye.
// ---------------------------------------------------------------------------

import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { app } from "electron";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/** Processes started by THIS session, newest last. */
const live = new Set<ChildProcess>();

/** Where surviving process ids are recorded, so a crash is recoverable. */
function ledgerPath(): string {
  return path.join(app.getPath("userData"), "child-processes.json");
}

interface LedgerEntry {
  pid: number;
  /** Recorded so we can refuse to kill a pid Windows has since recycled. */
  command: string;
  startedAt: number;
}

function readLedger(): LedgerEntry[] {
  try {
    return JSON.parse(fs.readFileSync(ledgerPath(), "utf8")) as LedgerEntry[];
  } catch {
    return [];
  }
}

function writeLedger(entries: LedgerEntry[]): void {
  try {
    fs.mkdirSync(path.dirname(ledgerPath()), { recursive: true });
    fs.writeFileSync(ledgerPath(), JSON.stringify(entries, null, 2));
  } catch {
    // A ledger we cannot write is a worse crash recovery, not a broken app.
  }
}

function forgetPid(pid: number): void {
  writeLedger(readLedger().filter((e) => e.pid !== pid));
}

/**
 * Kill a process and everything it started.
 *
 * /T is the whole point — the tree, not the one we hold a handle to. /F because
 * these are servers being torn down, not asked politely. The pid comes from a
 * process we started ourselves; nothing here ever takes a process name.
 */
export function killTree(pid: number): Promise<void> {
  return new Promise((resolve) => {
    if (process.platform !== "win32") {
      try {
        process.kill(-pid, "SIGKILL");
      } catch {
        /* already gone */
      }
      resolve();
      return;
    }
    execFile("taskkill", ["/PID", String(pid), "/T", "/F"], () => resolve());
  });
}

/**
 * spawn(), with the child recorded and its whole tree tied to this app's life.
 *
 * Use this everywhere instead of node's spawn. The only thing a caller has to
 * remember is that the returned child is already being watched — there is no
 * registration step to forget.
 */
export function spawnTracked(
  command: string,
  args: readonly string[],
  options: SpawnOptions
): ChildProcess {
  const proc = spawn(command, args, options);

  if (proc.pid) {
    const entry: LedgerEntry = {
      pid: proc.pid,
      command: `${command} ${args.join(" ")}`,
      startedAt: Date.now(),
    };
    writeLedger([...readLedger(), entry]);
  }

  live.add(proc);
  proc.on("exit", () => {
    live.delete(proc);
    if (proc.pid) forgetPid(proc.pid);
  });

  return proc;
}

/**
 * Kill everything this session started. Safe to call more than once, and safe
 * to call when nothing is running.
 *
 * `onBeforeKill` is where a graceful goodbye goes — Chatterbox releasing the
 * card's memory, for instance. It is given a time limit because a hung server
 * must not be the reason the app cannot close; if it does not answer we take
 * the tree down anyway, which frees the memory the slower way.
 */
export async function killAllTracked(
  onBeforeKill?: () => Promise<void>,
  graceMs = 4000
): Promise<void> {
  if (onBeforeKill) {
    await Promise.race([
      onBeforeKill().catch(() => undefined),
      new Promise((r) => setTimeout(r, graceMs)),
    ]);
  }

  const pids = [...live].map((p) => p.pid).filter((p): p is number => typeof p === "number");
  await Promise.all(pids.map(killTree));
  live.clear();
}

/**
 * Kill leftovers from a session that crashed or was force-quit.
 *
 * Call once at startup, before anything is spawned. A pid alone is not proof:
 * Windows reuses them, and killing a stranger's tree because it inherited our
 * number is the exact failure this file exists to prevent. So each one is
 * checked against the command line we recorded, and anything that doesn't match
 * is dropped from the ledger untouched.
 */
export async function reapOrphansFromLastSession(): Promise<number> {
  const entries = readLedger();
  if (entries.length === 0) return 0;

  writeLedger([]);

  let killed = 0;
  for (const entry of entries) {
    const stillOurs = await commandLineMatches(entry.pid, entry.command);
    if (stillOurs) {
      await killTree(entry.pid);
      killed++;
    }
  }
  return killed;
}

/** Whether the process at `pid` is still the one we recorded. */
function commandLineMatches(pid: number, recorded: string): Promise<boolean> {
  if (process.platform !== "win32") return Promise.resolve(false);

  // The first token is enough and is the safest thing to compare: it is the
  // executable path we chose, and it is stable. Comparing whole command lines
  // fails on quoting differences that mean nothing.
  const exe = recorded.split(" ")[0]?.replace(/"/g, "");
  if (!exe) return Promise.resolve(false);

  return new Promise((resolve) => {
    execFile(
      "powershell",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`,
      ],
      (err, stdout) => {
        if (err) return resolve(false);
        resolve(stdout.trim().length > 0 && stdout.includes(exe));
      }
    );
  });
}

/**
 * Wire cleanup into every way this app can end, not just the polite one.
 *
 * will-quit is the graceful path and the only one that can wait for anything,
 * so the goodbye goes there. The rest are last resorts: they cannot await, so
 * they fire the tree kill and hope. Even a partial kill beats an orphan holding
 * the card.
 */
export function installExitHandlers(onBeforeKill?: () => Promise<void>): void {
  let quitting = false;

  app.on("will-quit", (event) => {
    if (quitting) return;
    quitting = true;
    event.preventDefault();
    killAllTracked(onBeforeKill).finally(() => app.exit(0));
  });

  const lastResort = () => {
    for (const proc of live) {
      if (proc.pid) {
        try {
          // Synchronous on purpose: inside these handlers there is no event
          // loop left to run a promise on.
          require("node:child_process").execFileSync(
            "taskkill",
            ["/PID", String(proc.pid), "/T", "/F"],
            { stdio: "ignore" }
          );
        } catch {
          /* nothing better to try */
        }
      }
    }
  };

  process.on("exit", lastResort);
  process.on("SIGINT", () => {
    lastResort();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    lastResort();
    process.exit(0);
  });
  process.on("uncaughtException", (err) => {
    console.error("Uncaught exception — killing spawned engines before exit:", err);
    lastResort();
    process.exit(1);
  });
}
