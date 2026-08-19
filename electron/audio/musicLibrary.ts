// ---------------------------------------------------------------------------
// The music library: a folder of loops, and which one a given lesson gets.
//
// Seven pizzicato loops, all royalty-free and cleared for YouTube, all the same
// family so a course cut from them sounds like one course. They live in
// `music/` beside the puppets and the voice references.
//
// WHY THE CHOICE IS DERIVED AND NOT RANDOM. A lesson gets re-rendered — a typo
// in the script, a new subtitle setting, a background that came out wrong — and
// a random pick would give it different music every time. Half a course would
// quietly drift into a different bed than the half already signed off. So the
// track is chosen from the lesson's own name: the same lesson always gets the
// same loop, a different lesson gets the next one along, and the sequence walks
// through all seven rather than favouring any of them.
// ---------------------------------------------------------------------------

import fsp from "node:fs/promises";
import path from "node:path";

export interface MusicTrack {
  /** File name, as it appears in the folder. */
  name: string;
  filePath: string;
}

/** Everything in the folder that a render could actually use.
 *
 *  WAV only, and not because of taste: the analysis that lets a loop REPEAT
 *  reads 16-bit PCM. An MP3 here would play once, stop, and leave four silent
 *  minutes that nobody notices until the lesson is watched to the end. */
export async function listMusic(dir: string): Promise<MusicTrack[]> {
  let names: string[];
  try {
    names = await fsp.readdir(dir);
  } catch {
    return [];
  }
  return names
    .filter((n) => n.toLowerCase().endsWith(".wav"))
    .sort()
    .map((name) => ({ name, filePath: path.join(dir, name) }));
}

/** A small, stable hash. Same string in, same number out, every run and every
 *  machine — which is the whole point, so it cannot be Math.random or a
 *  timestamp or the order the filesystem happened to return. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Which loop this lesson gets.
 *
 * `key` should identify the LESSON and not the run — its script path is ideal.
 *
 * ROTATION, NOT A LOTTERY. Hashing the whole name was stable but it was not a
 * rotation: over fourteen lessons one loop came up four times and three came up
 * once. Lessons are numbered, so the numbers are what to count on — `101.1`,
 * `101.2`, `101.3` walk to the next track each time, and the sequence comes
 * back round after seven. A name with no number in it falls back to the hash,
 * which is at least stable.
 */
export function pickMusic(tracks: MusicTrack[], key: string): MusicTrack | null {
  if (tracks.length === 0) return null;
  const base = key.split(/[\\/]/).pop() ?? key;
  const digits = base.match(/\d+/g);
  const index = digits
    ? Number(digits.join("")) % tracks.length
    : hash(key) % tracks.length;
  return tracks[index];
}

/** Under a voice, not beside it.
 *
 *  0.28 was chosen when music was something you added deliberately to one
 *  video. A bed running under 72 lessons is a different job: it should be felt
 *  and not listened to, and at 0.28 it competes with the narration in every
 *  quiet moment. The duck takes it further down under speech again. */
export const BACKGROUND_VOLUME = 0.12;
