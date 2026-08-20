// ---------------------------------------------------------------------------
// The local media library — everything already downloaded, on this machine.
//
// 177 clips have accumulated in the media cache from background searches, and
// nothing has ever been able to look at them. Every render went back to the
// stock providers and downloaded again, which costs API quota, costs time, and
// means a clip you liked in lesson 3 cannot be reused in lesson 40 without
// finding it by luck.
//
// A folder listing is all this is. No database, no index, no thumbnails cached
// anywhere — the file on disk is the truth, and the browser reads it fresh.
// ---------------------------------------------------------------------------

import fsp from "node:fs/promises";
import path from "node:path";

export interface MediaItem {
  fileName: string;
  filePath: string;
  /** "video" or "audio", from the extension. The picker shows them apart. */
  kind: "video" | "audio";
  bytes: number;
  /** When it landed, so the newest are shown first — usually what you want
   *  right after a render has pulled a batch in. */
  modifiedMs: number;
  /** Which provider it came from, when the file name says so. */
  source?: string;
}

const VIDEO = new Set([".mp4", ".mov", ".webm", ".mkv", ".m4v"]);
const AUDIO = new Set([".wav", ".mp3", ".m4a", ".ogg", ".flac"]);

export async function listMedia(dirs: string[]): Promise<MediaItem[]> {
  const out: MediaItem[] = [];
  for (const dir of dirs) {
    let names: string[];
    try {
      names = await fsp.readdir(dir);
    } catch {
      continue;      // a folder that does not exist yet is not an error
    }
    for (const name of names) {
      const ext = path.extname(name).toLowerCase();
      const kind = VIDEO.has(ext) ? "video" : AUDIO.has(ext) ? "audio" : null;
      if (!kind) continue;
      const filePath = path.join(dir, name);
      try {
        const st = await fsp.stat(filePath);
        if (!st.isFile()) continue;
        out.push({
          fileName: name,
          filePath,
          kind,
          bytes: st.size,
          modifiedMs: st.mtimeMs,
          source: name.match(/^(pexels|pixabay|freesound)/i)?.[1]?.toLowerCase(),
        });
      } catch {
        // A file that vanished between readdir and stat is not worth failing
        // the whole listing over.
      }
    }
  }
  return out.sort((a, b) => b.modifiedMs - a.modifiedMs);
}
