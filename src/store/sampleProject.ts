// ---------------------------------------------------------------------------
// "Dogs & Butterflies" — the sample project.
//
// WHAT IT IS FOR. Someone opening this app for the first time has an empty
// canvas, no script, no cast and no idea what a finished video looks like. This
// gives them a whole one in a click: three characters, a written script, the
// house look, subtitles, music. They press Render and get a video.
//
// WHAT IT DELIBERATELY AVOIDS. It names no file that might not exist. Puppets
// are attached at load time from the app's own bundled folder, because their
// absolute path is different on every machine and a sample project that opens
// with three broken faces is worse than none. The music comes from the library
// that ships with the app, and the backgrounds are left on "auto" so the sample
// does not depend on 200MB of clips being committed to the repository.
//
// The script is in the DramaBox format the real lessons use, so it doubles as a
// worked example of the format: opening phrases, directions outside the quotes,
// Greek inside them, a sound cue on its own line.
// ---------------------------------------------------------------------------

import type { ProjectState } from "./types";
import { defaultProject } from "./defaults";
import { defaultTrackWaveform } from "../lib/waveform/buildTracks";
import { BUILTIN_CAST } from "./builtinCast";

export const SAMPLE_NAME = "Dogs & Butterflies";

/** A short lesson: why a dog chases what moves, and what to do about it.
 *
 *  Written to the same rules as the real course, so it exercises the things
 *  that actually break — a spelled laugh, a shout in capitals, a sound cue
 *  between two blocks, and a turn that changes speaker three times. */
const SAMPLE_SCRIPT = `A bright woman speaks warmly, "Η σκυλίτσα μου κυνηγάει πεταλούδες. Κάθε μία. Κάθε φορά." She laughs, "Hahaha! Και ποτέ, μα ποτέ, δεν πιάνει καμία."

A grave man speaks evenly, "Δεν κυνηγάει πεταλούδες. Κυνηγάει κάτι που κινείται." He sharpens suddenly, "ΑΥΤΟ ΕΙΝΑΙ ΤΟ ΕΝΣΤΙΚΤΟ. Δεν διαλέγει το θήραμα."

A tiny woman speaks with delight, "Εγώ κυνηγάω τα πάντα! Πεταλούδες, φύλλα, τη σκιά μου!" She hums quietly, "Mmmm-mmm, η σκιά μου είναι η καλύτερη."

A bright woman speaks warmly, "Οπότε δεν φταίει που δεν με ακούει όταν τρέχει;"

A grave man speaks heavily, "Δεν σε ακούει επειδή το κυνήγι είναι πιο δυνατό από τη φωνή σου." He speaks with frustration, "Πρέπει να γίνεις πιο ενδιαφέρουσα από την πεταλούδα. Και αυτό δεν γίνεται με φωνές."

[SFX: clicker-training]

A bright woman continues, "Ξεκινάμε μέσα στο σπίτι, εκεί που δεν πετάει τίποτα." She pauses, "Λες το όνομά της. Μόλις γυρίσει το κεφάλι, λες ναι, και δίνεις κάτι πολύ καλό."

A tiny woman bursts into uncontrollable laughter, "Hahaha! Τυρί! Πες ότι είναι τυρί!"

A bright woman speaks tenderly, "Τυρί, ναι. Και μετά, σιγά σιγά, βγαίνεις έξω." She continues, "Πρώτα στην αυλή. Μετά στο πάρκο. Και μόνο όταν αυτό δουλεύει, δοκιμάζεις με μια πεταλούδα στον ορίζοντα."

A grave man speaks evenly, "Μία αλλαγή τη φορά. Ποτέ δύο." He drops to a whisper, "Και σταμάτα πριν βαρεθεί. Πάντα."`;

/**
 * The sample, built fresh.
 *
 * `puppetDir` comes from the main process, which is the only place that knows
 * where the app is installed. Without it the cast still loads — they simply
 * have no faces, which is a sample with a missing picture rather than a sample
 * that fails to open.
 */
export function sampleProject(puppetDir: string | null): Partial<ProjectState> {
  // One above, two below — the arrangement settled for three speakers, which
  // leaves the middle of the frame clear for the centred subtitles.
  const places = [
    { x: 0.55, y: 0.2 },
    { x: 0.31, y: 0.73 },
    { x: 0.76, y: 0.73 },
  ];

  const speakers = BUILTIN_CAST.map((c, i) => ({
    id: `sample-${i + 1}`,
    label: c.label,
    puppetPath: puppetDir
      ? (puppetDir.endsWith("/") || puppetDir.endsWith("\\")
          ? puppetDir + c.file
          : puppetDir + (puppetDir.includes("\\") ? "\\" : "/") + c.file)
      : undefined,
    openingPhrase: c.openingPhrase,
    voiceRef: c.voiceRef,
    ttsEngine: "dramabox" as const,
    ...(c.dramabox ? { dramabox: c.dramabox } : {}),
    borderColor: c.borderColor,
    bgColor: "#1a1a1a",
    bgOpacity: 0,
    borderOpacity: 1,
    outlineShape: "none" as const,
    size: 0.26,
    x: places[i].x,
    y: places[i].y,
    waveform: {
      ...defaultTrackWaveform(i === 0 ? 0 : i % 2 === 1 ? 1 : -1),
      enabled: true,
      style: "bloomBars" as const,
      position: "speaker" as const,
    },
  }));

  return {
    ...defaultProject,
    speakers,
    script: SAMPLE_SCRIPT,
    language: "el",
    // Left for the render to fetch. Committing the clips would put hundreds of
    // megabytes in the repository to save one search.
    backgrounds: [],
    narration: null,
    music: null,
  };
}
