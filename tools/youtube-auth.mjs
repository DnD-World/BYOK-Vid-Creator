/**
 * Sign in to YouTube once, and keep the token.
 *
 *   node tools/youtube-auth.mjs
 *
 * YOU RUN THIS, not an assistant and not a script on a schedule. It opens a
 * browser, you pick the Google account and approve, and the refresh token it
 * gets back is written beside the client secret.
 *
 * After this, uploads run unattended until the token is revoked.
 *
 * WHAT IT NEEDS FIRST: an OAuth client of type **Desktop app**. A "Web
 * application" client cannot complete this flow unless a redirect address is
 * registered against it, and Desktop clients are the kind meant for a program
 * running on your own machine.
 *
 * WHERE THE SECRETS LIVE: `../SECRETS`, beside the project rather than inside
 * it. A credential in a working tree is one `git add -A` away from being
 * published, and an ignore rule only holds for as long as nobody edits the
 * ignore file. Set BYOK_SECRETS_DIR to override.
 *
 * THREE WAYS IN, because the first two failed in practice.
 *
 * The one that cannot go wrong is the two-step:
 *
 *     node tools/youtube-auth.mjs --link     prints the address, saves nothing
 *     ...approve in the browser, let it fail to connect, copy the address...
 *     node tools/youtube-auth.mjs --code "<paste it here>"
 *
 * Nothing is listening, nothing is waiting, and there is no session to lose.
 * The two steps can be minutes apart. This exists because the automatic route
 * kept failing for reasons that had nothing to do with Google: a browser
 * reopening an old tab, a firewall, a window closed at the wrong moment.
 *
 * THE OTHER TWO WAYS IN, from before. Normally the browser
 * comes back to a small server running here and everything happens by itself.
 * But that server has to still be listening at the moment you approve, and if
 * it is not — the window was closed, the wait ran out, something else took the
 * port — the browser lands on "localhost refused to connect" and the sign-in is
 * lost with no way to finish it. So the address bar can also be pasted back
 * here by hand. Same code, same result, no need to start again.
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import crypto from "node:crypto";
import readline from "node:readline";
import { spawn } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "..");
const SECRETS =
  process.env.BYOK_SECRETS_DIR ?? path.resolve(ROOT, "..", "SECRETS");
const PORT = 53682;
const REDIRECT = `http://localhost:${PORT}`;
const SCOPE = "https://www.googleapis.com/auth/youtube.upload";
/** Long enough to find the right Google account, read the consent screen, and
 *  make a cup of tea. Five minutes was not, and running out looks exactly like
 *  a bug. */
const WAIT_MS = 20 * 60 * 1000;

// ---- the client -----------------------------------------------------------

let secretFile = null;
try {
  secretFile = fs
    .readdirSync(SECRETS)
    .find((n) => n.startsWith("client_secret") && n.endsWith(".json"));
} catch {
  // No such folder yet, which is the same problem as an empty one.
}

if (!secretFile) {
  console.error(
    `No client_secret*.json in ${SECRETS}.\n` +
      `Create an OAuth client (type: Desktop app) in the Google Cloud console,\n` +
      `download the JSON, and put it in that folder.`
  );
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(path.join(SECRETS, secretFile), "utf8"));
const kind = raw.installed ? "installed" : raw.web ? "web" : null;
if (!kind) {
  console.error(`${secretFile} is not a Google OAuth client file.`);
  process.exit(1);
}
const client = raw[kind];

if (kind === "web" && !(client.redirect_uris ?? []).some((u) => u.startsWith(REDIRECT))) {
  console.error(
    `This is a "Web application" OAuth client with no redirect address for this\n` +
      `machine, so Google will refuse the sign-in.\n\n` +
      `  A. Make a new client of type "Desktop app" and use that JSON instead.\n` +
      `  B. Or add exactly ${REDIRECT} to this one's\n` +
      `     "Authorised redirect URIs" and download the JSON again.\n`
  );
  process.exit(1);
}

// ---- which mode ------------------------------------------------------------

const argv = process.argv.slice(2);
const wantLink = argv.includes("--link");
const codeArgIndex = argv.indexOf("--code");
const codeArg = codeArgIndex >= 0 ? argv[codeArgIndex + 1] : null;

/** Where the one-time value is kept between the two steps, so the second can
 *  check the first really asked for it. Beside the secrets, not in the repo. */
const STATE_FILE = path.join(SECRETS, ".youtube-auth-state");

// A one-time random value, checked when Google sends the browser back. Without
// it, anything that can reach this port during the sign-in could hand us a code
// of its own choosing.
//
// In two-step mode the value from the --link run is reused, because a fresh one
// would never match what the browser is carrying.
const state =
  codeArg && fs.existsSync(STATE_FILE)
    ? fs.readFileSync(STATE_FILE, "utf8").trim()
    : crypto.randomBytes(16).toString("hex");

const authUrl =
  "https://accounts.google.com/o/oauth2/v2/auth?" +
  new URLSearchParams({
    client_id: client.client_id,
    redirect_uri: REDIRECT,
    response_type: "code",
    scope: SCOPE,
    // Both are needed to be GIVEN a lasting token rather than an hour of
    // access: offline asks for one, consent forces the prompt that issues it
    // even if this account has approved before.
    access_type: "offline",
    prompt: "consent",
    state,
  });

// ---- finishing, from either route -----------------------------------------

let finished = false;

async function finish(code, sentState) {
  if (finished) return "already done";
  if (sentState && sentState !== state) {
    throw new Error(
      "That address is from a different sign-in attempt. Nothing was saved — " +
        "run this again and use the new link."
    );
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: client.client_id,
      client_secret: client.client_secret,
      redirect_uri: REDIRECT,
      grant_type: "authorization_code",
    }),
  });
  const body = await res.json();

  if (!body.refresh_token) {
    const why = String(body.error_description ?? body.error ?? "no reason given");
    if (/malformed/i.test(why)) {
      throw new Error(
        `That does not look like an authorisation code. Paste the WHOLE address ` +
          `from the browser's bar, in quotes — the one starting\n` +
          `http://localhost:${PORT}/?state=…`
      );
    }
    if (/expired|invalid_grant|already redeemed/i.test(why)) {
      throw new Error(
        `That code was already used or has expired — they last a few minutes and ` +
          `work once. Get a fresh one with:\n\n` +
          `  node tools/youtube-auth.mjs --link`
      );
    }
    throw new Error(
      `Google did not send a lasting token (${why}).\n` +
        `That usually means this account has approved the app before. Remove it at\n` +
        `https://myaccount.google.com/permissions and run this again.`
    );
  }

  fs.mkdirSync(SECRETS, { recursive: true });
  const dest = path.join(SECRETS, "youtube-token.json");
  fs.writeFileSync(
    dest,
    JSON.stringify(
      {
        refresh_token: body.refresh_token,
        client_id: client.client_id,
        obtained: new Date().toISOString(),
      },
      null,
      1
    ),
    "utf8"
  );
  finished = true;
  return dest;
}

/** Accepts the whole address, or just the code out of it. */
function codeFrom(input) {
  const s = input.trim().replace(/^["']|["']$/g, "");
  if (!s) return null;
  if (s.startsWith("http")) {
    const u = new URL(s);
    return { code: u.searchParams.get("code"), state: u.searchParams.get("state") };
  }
  return { code: s, state: null };
}

const done = (dest) => {
  console.log(`\nSaved ${dest}\nUploads can now run without you.\n`);
  process.exit(0);
};

const failed = (e) => {
  console.error(`\n${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
};

// ---- the two-step, which has nothing to go wrong --------------------------

if (wantLink) {
  fs.mkdirSync(SECRETS, { recursive: true });
  fs.writeFileSync(STATE_FILE, state, "utf8");
  console.log(
    `
Step 1 of 2. Open this address and approve:

${authUrl}

` +
      `The browser will then try to reach ${REDIRECT} and FAIL — "this site
` +
      `can't be reached". That is expected and fine. Nothing is listening.

` +
      `Copy the whole address out of the bar and run:

` +
      `  node tools/youtube-auth.mjs --code "<paste the address>"

` +
      `Keep the quotes. There is no hurry — a few minutes is fine.
`
  );
  process.exit(0);
}

if (codeArg !== null) {
  if (!codeArg) {
    console.error(`
Nothing came after --code. Put the address in quotes.
`);
    process.exit(1);
  }
  const parsed = codeFrom(codeArg);
  if (!parsed?.code) {
    console.error(
      `
Could not find a code in that. Paste the whole address, in quotes —
` +
        `the one starting http://localhost:${PORT}/?state=...
`
    );
    process.exit(1);
  }
  if (!fs.existsSync(STATE_FILE)) {
    console.error(
      `
Run this first, to get an address to approve:

` +
        `  node tools/youtube-auth.mjs --link
`
    );
    process.exit(1);
  }
  try {
    const dest = await finish(parsed.code, parsed.state);
    try { fs.unlinkSync(STATE_FILE); } catch { /* already gone */ }
    console.log(`
Saved ${dest}
Uploads can now run without you.
`);
    process.exit(0);
  } catch (e) {
    console.error(`
${e instanceof Error ? e.message : String(e)}
`);
    process.exit(1);
  }
}

// ---- route one: the browser comes back ------------------------------------

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", REDIRECT);
  const say = (msg) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      `<body style="font:16px system-ui;background:#0b0b0d;color:#eee;padding:3rem">` +
        `<p>${msg}</p><p style="color:#888">You can close this tab.</p></body>`
    );
  };

  const err = url.searchParams.get("error");
  if (err) {
    say(`Sign-in was refused: ${err}`);
    failed(new Error(`Google said: ${err}`));
    return;
  }

  const code = url.searchParams.get("code");
  if (!code) return say("Waiting…");

  try {
    const dest = await finish(code, url.searchParams.get("state"));
    say("Signed in. The token has been saved.");
    server.close();
    done(dest);
  } catch (e) {
    // The reason goes in the TAB as well as the terminal. "See the terminal"
    // sent someone to a window that had scrolled, and the actual cause — an
    // address reused from an earlier attempt — was never read.
    const why = e instanceof Error ? e.message : String(e);
    say(`Signed in, but the token could not be saved.<br><br>${why.split("\n").join("<br>")}`);
    console.error(`\n${why}`);
    console.error(`Still listening. Approve again in the browser to try once more.\n`);
  }
});

server.on("error", (e) => {
  if (e.code === "EADDRINUSE") {
    console.error(
      `\nPort ${PORT} is already in use — another copy of this tool is probably\n` +
        `still running. Close it and try again.\n`
    );
  } else {
    console.error(`\nCould not listen on ${REDIRECT}: ${e.message}\n`);
  }
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(
    `\nListening on ${REDIRECT} — leave this window open.\n\n` +
      `A browser should open. If it does not, paste this in yourself:\n\n${authUrl}\n\n` +
      `If the browser ends up on "localhost refused to connect", copy the whole\n` +
      `address out of the bar and paste it here, then press Enter.\n`
  );

  // An ampersand is a command separator in cmd, which cut this URL at the first
  // one and made Google refuse with "response_type is missing". PowerShell takes
  // the whole thing as one argument.
  const open =
    process.platform === "win32"
      ? ["powershell", ["-NoProfile", "-Command", `Start-Process '${authUrl.replace(/'/g, "''")}'`]]
      : process.platform === "darwin"
        ? ["open", [authUrl]]
        : ["xdg-open", [authUrl]];
  spawn(open[0], open[1], { stdio: "ignore", detached: true }).unref();
});

// ---- route two: paste it back ---------------------------------------------

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.on("line", async (line) => {
  const parsed = codeFrom(line);
  if (!parsed?.code) return;
  try {
    const dest = await finish(parsed.code, parsed.state);
    server.close();
    done(dest);
  } catch (e) {
    // A BAD PASTE MUST NOT END THE SESSION. The first version exited here, so
    // pasting the address from an earlier attempt — the easy mistake, since it
    // is sitting right there in another tab — killed a sign-in that was still
    // perfectly good and forced the whole thing to start again.
    console.error(`\n${e instanceof Error ? e.message : String(e)}`);
    console.error(`Still listening. Approve in the browser, or paste the new address here.\n`);
  }
});

setTimeout(() => {
  console.error(`\nNothing came back within ${WAIT_MS / 60000} minutes. Stopping.`);
  process.exit(1);
}, WAIT_MS);
