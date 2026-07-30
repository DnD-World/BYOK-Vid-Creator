// ---------------------------------------------------------------------------
// Turns viseme-sheet disk paths into blob URLs the preview can actually load.
//
// Why this is needed: the renderer runs with contextIsolation on and cannot
// read from the filesystem, and a file:// background-image is blocked from the
// app's own origin. So the bytes come across the existing storage.readFile IPC
// and become an in-memory blob URL.
//
// Cached by path, and blob URLs are revoked when they stop being referenced —
// a 12MB sheet leaked on every edit would add up fast.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";

export function useSheetUrls(paths: (string | undefined)[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  // Kept in a ref as well so cleanup can revoke without re-running on state.
  const cacheRef = useRef<Record<string, string>>({});

  // Join into a stable primitive so the effect doesn't re-fire on every render
  // just because the caller built a new array.
  const key = paths.filter(Boolean).sort().join("|");

  useEffect(() => {
    const wanted = new Set(key ? key.split("|") : []);
    let cancelled = false;

    // Drop anything no longer referenced.
    for (const [path, url] of Object.entries(cacheRef.current)) {
      if (!wanted.has(path)) {
        URL.revokeObjectURL(url);
        delete cacheRef.current[path];
      }
    }

    const missing = [...wanted].filter((p) => !cacheRef.current[p]);
    if (missing.length === 0) {
      setUrls({ ...cacheRef.current });
      return;
    }

    (async () => {
      for (const path of missing) {
        try {
          const buf = await window.byok.storage.readFile(path);
          if (cancelled) return;
          cacheRef.current[path] = URL.createObjectURL(new Blob([buf], { type: "image/png" }));
        } catch {
          // A sheet that's been moved or deleted just means no face — the disk
          // still renders, so this is not worth surfacing as an error.
        }
      }
      if (!cancelled) setUrls({ ...cacheRef.current });
    })();

    return () => {
      cancelled = true;
    };
  }, [key]);

  // Revoke everything on unmount.
  useEffect(() => {
    return () => {
      for (const url of Object.values(cacheRef.current)) URL.revokeObjectURL(url);
      cacheRef.current = {};
    };
  }, []);

  return urls;
}
