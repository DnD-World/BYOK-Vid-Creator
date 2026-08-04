// ---------------------------------------------------------------------------
// Loads layered puppets for the preview: JSON off disk, then a blob URL per
// layer file.
//
// Split into two stages on purpose. The JSON is a few KB and settles almost
// immediately; the layers are twenty-odd PNGs and take visibly longer. Loading
// them together would mean the avatar has neither geometry nor pixels until
// the slowest file lands. Loading them apart means the layout is already
// correct when the images arrive, so the face fills in rather than jumping
// into place.
//
// A puppet whose files are missing resolves to no URLs, and PuppetAvatar draws
// nothing for a layer it has no URL for. A moved folder therefore costs you a
// face, not a crash — the same tolerance the sprite sheets had.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useState } from "react";
import type { Puppet } from "../../store/puppetTypes";
import { puppetAssetPaths, validatePuppet } from "./puppetAssets";
import { useFileUrls } from "../assets/useFileUrls";

export interface LoadedPuppet {
  puppet: Puppet;
  /** layer file name -> blob URL, exactly the map PuppetAvatar wants. */
  urls: Record<string, string>;
}

/**
 * Just the definitions — no images.
 *
 * Separate from `usePuppets` so the Cast panel can say "that file isn't a
 * puppet" without paying for the art. Reading a few KB of JSON twice is free;
 * resolving twenty PNGs into a second set of blob URLs, for a panel that draws
 * none of them, is not.
 */
export function usePuppetDefs(paths: (string | undefined)[]): {
  defs: Record<string, Puppet>;
  /** path -> why it failed, ready to render next to the filename. */
  errors: Record<string, string>;
} {
  const [defs, setDefs] = useState<Record<string, Puppet>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  // A stable primitive, so the effect doesn't re-fire just because the caller
  // built a fresh array on a re-render.
  const key = paths.filter(Boolean).sort().join("|");

  useEffect(() => {
    const wanted = key ? key.split("|") : [];
    let cancelled = false;

    (async () => {
      const next: Record<string, Puppet> = {};
      const problems: Record<string, string> = {};
      for (const path of wanted) {
        try {
          const buf = await window.byok.storage.readFile(path);
          const data = JSON.parse(new TextDecoder().decode(buf));
          const res = validatePuppet(data);
          if (res.ok) next[path] = res.puppet;
          else problems[path] = res.error;
        } catch (e) {
          problems[path] =
            e instanceof SyntaxError ? "Not valid JSON." : "Couldn't read the file.";
        }
      }
      if (cancelled) return;
      setDefs(next);
      setErrors(problems);
    })();

    return () => {
      cancelled = true;
    };
  }, [key]);

  return { defs, errors };
}

/** Definitions plus a blob URL per layer — everything PuppetAvatar needs. */
export function usePuppets(paths: (string | undefined)[]): {
  puppets: Record<string, LoadedPuppet>;
  errors: Record<string, string>;
} {
  const { defs, errors } = usePuppetDefs(paths);

  // Every layer of every loaded puppet, flattened, so one hook call fetches
  // the lot and the cache is shared when two speakers use the same character.
  const assetPaths = useMemo(() => {
    const out: Record<string, Record<string, string>> = {};
    for (const [path, puppet] of Object.entries(defs)) {
      out[path] = puppetAssetPaths(puppet, path);
    }
    return out;
  }, [defs]);

  const flat = useMemo(
    () => [...new Set(Object.values(assetPaths).flatMap((m) => Object.values(m)))],
    [assetPaths]
  );
  const urls = useFileUrls(flat);

  const puppets = useMemo(() => {
    const out: Record<string, LoadedPuppet> = {};
    for (const [path, puppet] of Object.entries(defs)) {
      const map: Record<string, string> = {};
      for (const [file, abs] of Object.entries(assetPaths[path] ?? {})) {
        const url = urls[abs];
        if (url) map[file] = url;
      }
      out[path] = { puppet, urls: map };
    }
    return out;
  }, [defs, assetPaths, urls]);

  return { puppets, errors };
}
