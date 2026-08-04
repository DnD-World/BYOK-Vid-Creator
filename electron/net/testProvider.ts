// ---------------------------------------------------------------------------
// "Does this key actually work?" — one real, minimal, authenticated call per
// provider.
//
// This deliberately does NOT just check that a key is non-empty. The whole
// point is to replace guessing: a saved key that returns 401 looks identical
// to a working one in the UI otherwise, and finding that out during a render
// is the worst possible time.
//
// Every request is the cheapest documented endpoint that still requires auth,
// so testing is free and instant on all of these providers' free tiers.
// ---------------------------------------------------------------------------

import https from "node:https";
import * as keyStore from "../keyStore";

export interface ProviderTestResult {
  ok: boolean;
  /** Short, human-readable, safe to show directly in the UI. */
  message: string;
}

interface HttpResponse {
  status: number;
  body: string;
}

function request(
  url: string,
  init: { method?: string; headers?: Record<string, string> } = {}
): Promise<HttpResponse> {
  const u = new URL(url);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: u.host,
        path: `${u.pathname}${u.search}`,
        method: init.method ?? "GET",
        headers: init.headers ?? {},
        timeout: 15000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf-8"),
          })
        );
        res.on("error", reject);
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timed out after 15s."));
    });
    req.end();
  });
}

/** Maps an HTTP status to the thing the user actually needs to do about it. */
function interpret(status: number, body: string): ProviderTestResult {
  if (status >= 200 && status < 300) return { ok: true, message: "Key works." };
  if (status === 401 || status === 403) {
    return { ok: false, message: "Key rejected (401/403) — wrong key, or it hasn't been activated yet." };
  }
  if (status === 429) {
    return { ok: false, message: "Rate limited (429) — the key is probably valid, just try again shortly." };
  }
  const snippet = body.trim().slice(0, 160);
  return { ok: false, message: `Provider returned ${status}${snippet ? ` — ${snippet}` : ""}` };
}

export interface TestOptions {
  /** Required for Azure Speech, whose endpoint host is region-specific. */
  azureRegion?: string;
}

export async function testProvider(
  providerId: string,
  opts: TestOptions = {}
): Promise<ProviderTestResult> {
  const key = await keyStore.getKey(providerId);
  if (!key) {
    return { ok: false, message: "No key saved yet — paste one above and press Save first." };
  }

  try {
    switch (providerId) {
      case "nvidia": {
        const r = await request("https://integrate.api.nvidia.com/v1/models", {
          headers: { Authorization: `Bearer ${key}` },
        });
        return interpret(r.status, r.body);
      }

      case "azure": {
        const region = opts.azureRegion?.trim();
        if (!region) {
          return { ok: false, message: "Set your Azure region below first (e.g. eastus) — the endpoint depends on it." };
        }
        // Issuing a token is the canonical zero-cost way to validate an Azure
        // Speech key, and it fails loudly if the region is wrong too.
        const r = await request(
          `https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`,
          { method: "POST", headers: { "Ocp-Apim-Subscription-Key": key, "Content-Length": "0" } }
        );
        if (r.status === 404) {
          return { ok: false, message: `No Speech resource found in region "${region}" — check the region matches your Azure resource.` };
        }
        return interpret(r.status, r.body);
      }

      case "pixabay": {
        const r = await request(
          `https://pixabay.com/api/?key=${encodeURIComponent(key)}&q=dog&per_page=3`
        );
        return interpret(r.status, r.body);
      }

      case "pexels": {
        const r = await request("https://api.pexels.com/v1/search?query=dog&per_page=1", {
          headers: { Authorization: key },
        });
        return interpret(r.status, r.body);
      }

      case "jamendo": {
        const r = await request(
          `https://api.jamendo.com/v3.0/tracks/?client_id=${encodeURIComponent(key)}&limit=1&format=json`
        );
        // Jamendo answers 200 even for a bad client_id and puts the real
        // outcome in headers.status, so the status code alone would lie here.
        if (r.status === 200) {
          try {
            const parsed = JSON.parse(r.body);
            if (parsed?.headers?.status === "success") return { ok: true, message: "Key works." };
            return {
              ok: false,
              message: `Jamendo rejected the client ID — ${parsed?.headers?.error_message ?? "no reason given"}.`,
            };
          } catch {
            return { ok: false, message: "Jamendo returned a response that couldn't be parsed." };
          }
        }
        return interpret(r.status, r.body);
      }

      case "freesound": {
        const r = await request(
          `https://freesound.org/apiv2/search/text/?query=dog&page_size=1&token=${encodeURIComponent(key)}`
        );
        return interpret(r.status, r.body);
      }

      default:
        return { ok: false, message: `No connectivity test is defined for "${providerId}" yet.` };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: `Couldn't reach the provider — ${msg}` };
  }
}
