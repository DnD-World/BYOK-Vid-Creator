// ---------------------------------------------------------------------------
// Turning a puppet definition into a list of files on disk.
//
// Deliberately dependency-free — no node:path, no IPC, no React. Three
// different places need this exact arithmetic and they do not share a runtime:
// the preview (browser, contextIsolation on), the render prep (Electron main),
// and the offline tools. A helper that reached for node:path would be unusable
// in the first of those, and duplicating it is how the preview and the render
// drift apart.
//
// The rule is one line: a puppet's `dir` is relative to the puppet FILE, never
// to a working directory. tools/make-puppet.mjs writes it that way on purpose,
// so the folder can be moved as a unit and a file dialog can hand us a path
// from anywhere on disk.
// ---------------------------------------------------------------------------

import type { Puppet } from "../../store/puppetTypes";
import { puppetFiles } from "../../store/puppetTypes";

/** Split on either separator — a Windows path may legitimately contain both,
 *  since the `dir` we write is always forward-slashed. */
function split(p: string): string[] {
  return p.split(/[\\/]/);
}

/** Whichever separator the input already used, so the result still looks like
 *  a native path to the process that has to open it. */
function sepOf(p: string): string {
  return p.includes("\\") ? "\\" : "/";
}

/** The folder holding a file path. */
export function dirOf(filePath: string): string {
  const parts = split(filePath);
  parts.pop();
  return parts.join(sepOf(filePath));
}

/**
 * Resolve a puppet's asset folder from the path its JSON was loaded from.
 *
 * `..` segments are collapsed rather than left in the string: the path is
 * handed to `readFile` over IPC and to `copyFile` in main, and a literal
 * `C:\a\puppet\..\viseme` works on Windows but is impossible to compare, log
 * or deduplicate against the same folder spelled any other way.
 */
export function resolveAssetDir(puppetPath: string, dir: string | undefined): string {
  const sep = sepOf(puppetPath);
  const base = split(dirOf(puppetPath));
  for (const seg of split(dir ?? ".")) {
    if (seg === "" || seg === ".") continue;
    // A `..` that would climb past the root is dropped, not kept — there is no
    // meaningful path above a drive letter, and keeping it would produce one
    // that silently fails to open much later.
    if (seg === "..") {
      if (base.length > 1) base.pop();
      continue;
    }
    base.push(seg);
  }
  return base.join(sep);
}

/** Join a folder and a bare filename with the folder's own separator. */
export function joinPath(dir: string, file: string): string {
  return dir + sepOf(dir) + file;
}

/**
 * Every layer file a puppet needs, as `layer file name -> absolute path`.
 *
 * Keyed by the name the layers themselves use, because that is what both
 * renderers look up: `PuppetAvatar` is handed a `urls` map and indexes it by
 * `layer.file`. Whatever a consumer turns the path into — a blob URL in the
 * preview, a copy in the render's public dir — the key stays the same.
 */
export function puppetAssetPaths(puppet: Puppet, puppetPath: string): Record<string, string> {
  const dir = resolveAssetDir(puppetPath, puppet.dir);
  const out: Record<string, string> = {};
  for (const file of puppetFiles(puppet)) out[file] = joinPath(dir, file);
  return out;
}

/**
 * Reject anything that isn't actually a puppet before it reaches a renderer.
 *
 * The file arrives from a user's file dialog, so "they picked the wrong JSON"
 * is a normal event, not a corrupt-state bug. Failing here with a reason is
 * worth a great deal more than a blank avatar and a console full of undefined
 * property reads a few layers deep.
 */
export function validatePuppet(data: unknown): { ok: true; puppet: Puppet } | { ok: false; error: string } {
  const p = data as Partial<Puppet> | null;
  if (!p || typeof p !== "object") return { ok: false, error: "Not a JSON object." };
  if (typeof p.base !== "string") return { ok: false, error: "No `base` image." };
  if (!p.head || typeof p.head.w !== "number") {
    return { ok: false, error: "No `head` box — is this a .spec.json rather than a .puppet.json?" };
  }
  if (typeof p.sourceHeadWidth !== "number" || p.sourceHeadWidth <= 0) {
    return { ok: false, error: "No `sourceHeadWidth`." };
  }
  if (!p.eyes?.whites || !p.eyes?.lids?.open) {
    return { ok: false, error: "Needs eyes.whites and eyes.lids.open." };
  }
  if (!p.mouths || !p.mouths["0"]) return { ok: false, error: "Needs a mouth for viseme 0." };
  // Layer dimensions are stamped in by make-puppet.mjs and are not optional:
  // without them every layer lays out at zero size, which looks like missing
  // art rather than like a malformed file.
  if (typeof p.eyes.whites.w !== "number") {
    return { ok: false, error: "Layers have no pixel dimensions — rebuild with tools/make-puppet.mjs." };
  }
  return { ok: true, puppet: p as Puppet };
}
