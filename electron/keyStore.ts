import { app, safeStorage } from "electron";
import { promises as fs } from "fs";
import path from "path";

// ---------------------------------------------------------------------------
// Encrypted key vault — the ONLY place API keys are read/written from disk.
// Raw key values never leave the main process except when a caller in the
// main process explicitly asks for one (e.g. to make an outgoing API call).
// ---------------------------------------------------------------------------

const vaultFile = () => path.join(app.getPath("userData"), "byok.secrets.enc");

type Vault = Record<string, string>; // { azure: "xxx", nvidia: "xxx", ... }

export interface WriteResult {
  ok: boolean;
  /** true if the OS keychain wasn't available and we fell back to a
   *  plaintext (but still 0600-permissioned) file on disk. The UI should
   *  warn the user when this is true. */
  plaintextFallback: boolean;
}

async function readVault(): Promise<Vault> {
  try {
    const buf = await fs.readFile(vaultFile());
    if (!safeStorage.isEncryptionAvailable()) {
      return JSON.parse(buf.toString("utf-8"));
    }
    try {
      return JSON.parse(safeStorage.decryptString(buf));
    } catch {
      // Vault may have been written before encryption was available on this
      // machine (or vice versa) — fall back to reading it as plain JSON
      // rather than losing the user's keys.
      return JSON.parse(buf.toString("utf-8"));
    }
  } catch {
    return {};
  }
}

async function writeVault(v: Vault): Promise<WriteResult> {
  await fs.mkdir(path.dirname(vaultFile()), { recursive: true });
  const json = JSON.stringify(v);
  if (safeStorage.isEncryptionAvailable()) {
    await fs.writeFile(vaultFile(), safeStorage.encryptString(json), { mode: 0o600 });
    return { ok: true, plaintextFallback: false };
  }
  // No OS keychain (e.g. some Linux setups without a keyring running).
  // Fail soft rather than crashing the app, but tell the caller.
  await fs.writeFile(vaultFile(), Buffer.from(json, "utf-8"), { mode: 0o600 });
  return { ok: true, plaintextFallback: true };
}

export async function listKeys(): Promise<string[]> {
  return Object.keys(await readVault());
}

export async function getKey(provider: string): Promise<string | null> {
  const v = await readVault();
  return v[provider] ?? null;
}

export async function setKey(provider: string, value: string): Promise<WriteResult> {
  const v = await readVault();
  v[provider] = value;
  return writeVault(v);
}

export async function deleteKey(provider: string): Promise<WriteResult> {
  const v = await readVault();
  delete v[provider];
  return writeVault(v);
}

/** For the UI: whether a key exists + a masked hint. Never the raw value. */
export async function getKeyStatus(): Promise<Record<string, string>> {
  const v = await readVault();
  const out: Record<string, string> = {};
  for (const [p, k] of Object.entries(v)) {
    out[p] = k.length > 4 ? `••••${k.slice(-4)}` : "••••";
  }
  return out;
}

export function encryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable();
}
