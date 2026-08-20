// ---------------------------------------------------------------------------
// The cast that ships with the app.
//
// Three characters are drawn, rigged and committed as puppets, but until now
// nothing in the UI offered them: "Add speaker" made a blank speaker, and the
// library dropdown only appeared once you had saved someone into it yourself.
// So the built-in cast was invisible unless you knew to go and find the JSON
// files by hand in a file dialog.
//
// Colours are per character rather than one accent for all of them: a
// speaker's outline colour IS their waveform colour, so giving three speakers
// the same one makes the waveforms indistinguishable the moment two of them
// are on screen.
// ---------------------------------------------------------------------------

import type { DramaboxParams } from "../lib/narration/dramaboxParams";

/** A character the app ships with, ready to drop onto the canvas. */
export interface BuiltinCharacter {
  /** Filename inside the app's bundled `puppet/` folder. */
  file: string;
  /** Shown in the UI, and used as the script label the narration parser
   *  matches against — so these are the Greek names, not slugs. */
  label: string;
  /** One-line description, for the picker. */
  note: string;
  borderColor: string;
  /** Starting position, 0–1 of the frame. Spread so adding all three doesn't
   *  stack them on top of each other. */
  x: number;
  y: number;
  /** The phrase this character's script blocks open with. How a block finds
   *  its voice — see parseDramaboxScript. */
  openingPhrase: string;
  /** Their DramaBox reference clip, by file name, inside voice-refs/. */
  voiceRef: string;
  /** Engine settings, SETTLED BY EAR on 19 Aug 2026 from the fifteen takes in
   *  dramabox-audition/settings/. Only what differs from the defaults. */
  dramabox?: Partial<DramaboxParams>;
}

export const BUILTIN_CAST: BuiltinCharacter[] = [
  {
    file: "kaiti.puppet.json",
    label: "Καίτη",
    note: "Human presenter",
    borderColor: "#e8a24a",
    x: 0.28,
    y: 0.42,
    openingPhrase: "A bright woman",
    voiceRef: "kaiti.wav",
    // Chosen by ear over "house": same acting, less time for the words. She
    // tumbles over them, and at 1.0 she had room she did not want.
    dramabox: { durationMultiplier: 0.85 },
  },
  {
    file: "serifis.puppet.json",
    label: "Σερίφης",
    note: "Schnauzer — bushy brows",
    borderColor: "#6fb3d9",
    x: 0.5,
    y: 0.7,
    openingPhrase: "A grave man",
    voiceRef: "serifis.wav",
    // The defaults, chosen over both the bigger and the faster takes.
  },
  {
    file: "tsika.puppet.json",
    label: "Τσίκα",
    note: "Chihuahua",
    borderColor: "#c98ad9",
    x: 0.72,
    y: 0.42,
    openingPhrase: "A tiny woman",
    voiceRef: "tsika.wav",
    // The defaults. Her speed is a WRITING device — words run together in the
    // script, then repeated properly — not a setting. See docs/SCRIPT-GEM.md.
  },
];

/** Absolute path to a built-in puppet, resolved against the app's own folder.
 *
 *  The renderer can't work this out: it has no filesystem and no idea where the
 *  app is installed. Main answers with the folder, and this joins the filename
 *  onto it with whichever separator that path already uses. */
export function builtinPuppetPath(dir: string, file: string): string {
  const sep = dir.includes("\\") ? "\\" : "/";
  return dir.endsWith(sep) ? dir + file : dir + sep + file;
}
