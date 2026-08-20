/**
 * Sign in to YouTube once, and keep the token.
 *
 *   node tools/youtube-auth.mjs
 *
 * YOU RUN THIS, not an assistant and not a script on a schedule. It opens a
 * browser, you pick the Google account and approve, and the refresh token it
 * gets back is written to `youtube-token.json` — which is gitignored, along
 * with the client secret, because both are credentials.
 *
 * After this, uploads run unattended until the token is revoked.
 *
 * WHAT IT NEEDS FIRST: an OAuth client of type **Desktop app**. A "Web
 * application" client cannot complete this flow unless a redirect address is
 * registered against it, and Desktop clients are the kind meant for a program
 * running on your own machine. The check below says so rather than failing
 * later with something obscure.
 *
 * WHERE THE SECRETS LIVE: `../SECRETS`, beside the project rather than inside
 * it. Ak put them there and it is the right place — a credential in a working
 * tree is one `git add -A` away from being published, and gitignoring it only
 * works for as long as nobody edits the ignore file. Set BYOK_SECRETS_DIR to
 * override.
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "..");
/** Outside the repository on purpose. See the note above. */
const SECRETS =
  process.env.BYOK_SECRETS_DIR ?? path.resolve(ROOT, "..", "SECRETS");
const PORT = 53682;
const REDIRECT = `http://localhost:${PORT}`;
const SCOPE = "https://www.googleapis.com/auth/youtube.upload";

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

if (kind === "web") {
  const allowed = client.redirect_uris ?? [];
  if (!allowed.some((u) => u.startsWith(REDIRECT))) {
    console.error(
      `This is a "Web application" OAuth client, and it has no redirect address\n` +
        `for this machine, so Google will refuse the sign-in.\n\n` +
        `Two ways to fix it, either is fine:\n\n` +
        `  A. Make a new client of type "Desktop app" and use that JSON instead.\n` +
        `     This is the kind meant for a program on your own computer.\n\n` +
        `  B. Keep this one, and in the Google Cloud console add exactly:\n` +
        `         ${REDIRECT}\n` +
        `     to its "Authorised redirect URIs", then download the JSON again.\n`
    );
    process.exit(1);
  }
}

// A one-time random value, checked when Google sends the browser back. Without
// it, anything that can reach this port during the sign-in could hand us a code
// of its own choosing.
const state = crypto.randomBytes(16).toString("hex");

const authUrl =
  "https://accounts.google.com/o/oauth2/v2/auth?" +
  new URLSearchParams({
    client_id: client.client_id,
    redirect_uri: REDIRECT,
    response_type: "code",
    scope: SCOPE,
    // Both are needed to be GIVEN a refresh token rather than just an hour of
    // access: offline asks for one, and consent forces the prompt that issues
    // it even if this account has approved before.
    access_type: "offline",
    prompt: "consent",
    state,
  });

console.log(
  `\nOpening your browser to sign in.\n` +
    `If it does not open, paste this in yourself:\n\n${authUrl}\n`
);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", REDIRECT);
  const code = url.searchParams.get("code");
  const err = url.searchParams.get("error");

  const say = (msg) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      `<body style="font:16px system-ui;background:#0b0b0d;color:#eee;padding:3rem">` +
        `<p>${msg}</p><p style="color:#888">You can close this tab.</p></body>`
    );
  };

  if (err) {
    say(`Sign-in was refused: ${err}`);
    console.error(`\nGoogle said: ${err}`);
    server.close();
    process.exit(1);
  }
  if (!code) return say("Waiting…");

  if (url.searchParams.get("state") !== state) {
    say("That response did not match this request, so it was ignored.");
    console.error("\nThe state value did not match. Nothing was saved. Run this again.");
    server.close();
    process.exit(1);
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
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
  const body = await tokenRes.json();

  if (!body.refresh_token) {
    say("Signed in, but Google did not send a lasting token.");
    console.error(
      `\nNo refresh token came back. This usually means the account has approved\n` +
        `this client before. Remove it at https://myaccount.google.com/permissions\n` +
        `and run this again.`
    );
    server.close();
    process.exit(1);
  }

  fs.mkdirSync(SECRETS, { recursive: true });
  fs.writeFileSync(
    path.join(SECRETS, "youtube-token.json"),
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

  say("Signed in. The token has been saved.");
  console.log(
    `\nSaved ${path.join(SECRETS, "youtube-token.json")}\n` +
      `Uploads can now run without you.\n`
  );
  server.close();
  process.exit(0);
});

server.listen(PORT, () => {
  // AN AMPERSAND IS A COMMAND SEPARATOR IN cmd.
  //
  // `cmd /c start "" <url>` cut this URL at its first `&`, so Google received
  // the client_id and nothing else and refused with "Required parameter is
  // missing: response_type". Every OAuth URL is mostly ampersands, so this was
  // never going to work.
  //
  // PowerShell's Start-Process takes the whole thing as one argument, and the
  // URL is single-quoted inside the command so nothing in it is interpreted.
  // There is no apostrophe in a URL Google builds, but it is escaped anyway.
  const open =
    process.platform === "win32"
      ? [
          "powershell",
          [
            "-NoProfile",
            "-Command",
            `Start-Process '${authUrl.replace(/'/g, "''")}'`,
          ],
        ]
      : process.platform === "darwin"
        ? ["open", [authUrl]]
        : ["xdg-open", [authUrl]];
  spawn(open[0], open[1], { stdio: "ignore", detached: true }).unref();
});

setTimeout(() => {
  console.error("\nNothing came back within five minutes. Stopping.");
  process.exit(1);
}, 5 * 60 * 1000);
