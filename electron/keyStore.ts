import { app, safeStorage } from "electron";
import { promises as fs } from "fs";
import path from "path";

// Encrypted key vault. Raw keys NEVER leave the main process.
const VAULT = path.join(app.getPath("userData"), "keys.enc");

type Vault = Record<string, string>; // { azure: "xxx", nvidia: "xxx", ... }

async function readVault(): Promise<Vault> {
  try {
    const buf = await fs.readFile(VAULT);
    if (!safeStorage.isEncryptionAvailable()) return {};
    const json = safeStorage.decryptString(buf);
    return JSON.parse(json);
  } catch {
    return {};
  }
}

async function writeVault(v: Vault): Promise<void> {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("OS secure storage unavailable — refusing to write keys in plaintext.");
  }
  const enc = safeStorage.encryptString(JSON.stringify(v));
  await fs.writeFile(VAULT, enc, { mode: 0o600 });
}

export async function setKey(provider: string, key: string) {
  const v = await readVault();
  v[provider] = key;
  await writeVault(v);
}

export async function deleteKey(provider: string) {
  const v = await readVault();
  delete v[provider];
  await writeVault(v);
}

// For the UI: return ONLY whether a key exists + a masked hint. Never the raw value.
export async function getKeyStatus(): Promise<Record<string, string>> {
  const v = await readVault();
  const out: Record<string, string> = {};
  for (const [p, k] of Object.entries(v)) {
    out[p] = k.length > 4 ? `••••${k.slice(-4)}` : "••••";
  }
  return out;
}

// Internal use only (e.g. by the Azure/NVIDIA fetch calls in the main process)
export async function getRawKey(provider: string): Promise<string | undefined> {
  const v = await readVault();
  return v[provider];
}
