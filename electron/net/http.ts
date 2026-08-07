// ---------------------------------------------------------------------------
// The ONE way this app talks to the internet.
//
// WHY THIS EXISTS, AND WHY IT IS NOT `node:https`.
//
// Every outbound call used to use Node's https module, each file with its own
// near-identical `request()` helper. On a machine running antivirus with
// HTTPS scanning turned on — Avast here, but Kaspersky, ESET and Bitdefender
// all do it — that fails with:
//
//     Error: unable to verify the first certificate
//
// The antivirus terminates TLS itself and re-signs every response with its own
// root certificate, which it installs in the WINDOWS certificate store. Node
// does not read the Windows store. It ships its own copy of the Mozilla CA
// list and trusts nothing else, so it sees a certificate signed by an issuer it
// has never heard of and refuses the connection. Chromium, meanwhile, DOES use
// the Windows store, which is why the same URL opens fine in a browser on the
// same machine.
//
// Electron's `net` module runs on Chromium's network stack. Using it means the
// OS trust store, system proxy settings and corporate middleboxes are all
// handled the way the user's browser already handles them, rather than being a
// class of bug this app rediscovers on each new machine.
//
// THE FAILURE IS INTERMITTENT, which is what makes it expensive. Avast does not
// intercept every connection — it skips domains by reputation and leaves some
// processes alone entirely. So Pixabay and Pexels passed their tests while
// Freesound failed, on the same machine, minutes apart, with identical code.
// Anything that looks provider-specific here probably isn't.
// ---------------------------------------------------------------------------

import { net } from "electron";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";

export interface HttpResponse {
  status: number;
  body: string;
}

export interface RequestInit {
  method?: string;
  headers?: Record<string, string>;
  /** Sent as-is. Callers set their own Content-Type. */
  body?: string;
  /** Defaults to 20s, which suits an API call. Downloads pass their own. */
  timeoutMs?: number;
}

/** Text request. Rejects on transport failure; a 4xx/5xx is a resolved value. */
export async function request(url: string, init: RequestInit = {}): Promise<HttpResponse> {
  const buf = await requestBuffer(url, init);
  return { status: buf.status, body: buf.body.toString("utf-8") };
}

/** As `request`, but keeps the bytes — for anything that isn't text. */
export function requestBuffer(
  url: string,
  init: RequestInit = {}
): Promise<{ status: number; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const req = net.request({
      url,
      method: init.method ?? "GET",
      // Chromium follows redirects itself, which is why the hand-rolled
      // redirect hopping the download path used to do is gone.
      redirect: "follow",
    });

    for (const [k, v] of Object.entries(init.headers ?? {})) req.setHeader(k, v);

    const timeoutMs = init.timeoutMs ?? 20000;
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      req.abort();
      reject(new Error("Timed out"));
    }, timeoutMs);

    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      fn();
    };

    req.on("response", (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () =>
        finish(() => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks) }))
      );
      // A stream that dies mid-body is a transport failure, not a status.
      res.on("error", (e: Error) => finish(() => reject(e)));
    });

    req.on("error", (e) => finish(() => reject(e)));
    req.on("abort", () => finish(() => reject(new Error("Aborted"))));

    if (init.body) req.write(init.body);
    req.end();
  });
}

/**
 * Stream a URL to a file, creating the parent directory.
 *
 * Streamed rather than buffered because background clips run to tens of
 * megabytes and there is no reason for all of one to sit in memory at once.
 */
export async function downloadToFile(
  url: string,
  destPath: string,
  init: RequestInit = {}
): Promise<void> {
  await mkdir(path.dirname(destPath), { recursive: true });

  return new Promise((resolve, reject) => {
    const req = net.request({ url, method: init.method ?? "GET", redirect: "follow" });
    for (const [k, v] of Object.entries(init.headers ?? {})) req.setHeader(k, v);

    const timeoutMs = init.timeoutMs ?? 120000;
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      req.abort();
      reject(new Error("Timed out"));
    }, timeoutMs);

    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      fn();
    };

    req.on("response", (res) => {
      const status = res.statusCode ?? 0;
      if (status !== 200) {
        // Drain, or the socket is left hanging.
        res.on("data", () => {});
        res.on("end", () => finish(() => reject(new Error(`HTTP ${status}`))));
        return;
      }
      const out = createWriteStream(destPath);
      res.on("data", (c: Buffer) => out.write(c));
      res.on("end", () => out.end());
      res.on("error", (e: Error) => finish(() => reject(e)));
      out.on("finish", () => finish(() => resolve()));
      out.on("error", (e) => finish(() => reject(e)));
    });

    req.on("error", (e) => finish(() => reject(e)));
    req.end();
  });
}
