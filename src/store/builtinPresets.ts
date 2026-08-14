// ---------------------------------------------------------------------------
// The nine looks that ship with the app.
//
// WHY NINE AND NOT THREE. A preset is not just how the avatars are dressed. It
// decides subtitle size, how dark the background is, how much blur sits behind
// the text, and where everyone stands — and every one of those wants a
// different answer for one talking head than for three. Three styles with a
// layout knob would mean editing a layout inside a style; nine flat entries
// means editing one entry.
//
// WHY THEY LIVE HERE AND NOT IN THE PANEL. They used to be a hardcoded array
// inside PresetsPanel.tsx, which is why they could not be edited. As ordinary
// ProjectPreset objects they are seeded into the store on first run, after
// which there is exactly one kind of preset: editing a built-in edits a stored
// preset, and "Reset to default" copies the version below back over it.
//
// WHAT A BUILT-IN MUST NEVER DO is replace the cast. Slots carry placement and
// dress and no identity at all, so applying one restyles the speakers already
// there and leaves their faces, names and voices alone.
// ---------------------------------------------------------------------------

import { defaultTrackWaveform } from "../lib/waveform/buildTracks";
import { defaultSubtitleTransition, defaultSurface } from "./types";
import type { OutlineShape, Surface, SubtitleConfig, TrackWaveform } from "./types";
import type { ProjectPreset, SpeakerSlot } from "./templatesTypes";

/** Where speakers stand, by how many of them there are.
 *
 *  The solo row is the fix for a real complaint: one speaker used to inherit a
 *  three-speaker position and stand off-centre with nothing to balance her. */
const LAYOUTS: Record<1 | 2 | 3, { x: number; y: number; size: number }[]> = {
  1: [{ x: 0.5, y: 0.4, size: 0.42 }],
  2: [
    { x: 0.27, y: 0.42, size: 0.34 },
    { x: 0.73, y: 0.42, size: 0.34 },
  ],
  // A triangle rather than a row: three discs side by side in a 9:16 frame are
  // too small to read a face in.
  3: [
    { x: 0.24, y: 0.36, size: 0.3 },
    { x: 0.76, y: 0.36, size: 0.3 },
    { x: 0.5, y: 0.64, size: 0.3 },
  ],
};

interface Style {
  name: string;
  description: string;
  outlineShape: OutlineShape;
  waveform: (i: number) => Partial<TrackWaveform>;
  surface: Partial<Surface>;
  subtitles: Partial<SubtitleConfig>;
  backgroundDim: number;
  backgroundBlur: number;
}

const STYLES: Style[] = [
  {
    name: "Halo",
    description:
      "Bars ringing each speaker's own face. Calm, symmetrical, the house look.",
    outlineShape: "circle",
    // "speaker", not "circular" — this is the halo, and it is why the setting
    // exists. A ring in the middle of the frame belongs to nobody, which is
    // exactly how it read on screen.
    waveform: () => ({
      enabled: true,
      style: "bars",
      position: "speaker",
      scale: 1.1,
      density: 64,
      thickness: 1,
      smoothing: 0.2,
    }),
    surface: { style: "none" },
    subtitles: { position: "bottom", fontSize: 0.052, strokeWidth: 0.14, activeGlow: 0.6, uppercase: false },
    backgroundDim: 0.45,
    backgroundBlur: 0,
  },
  {
    name: "Broadcast",
    description:
      "Flat bars along the bottom, bold caps on a frosted slab. Reads as news or explainer.",
    outlineShape: "rounded",
    waveform: (i) => ({
      enabled: true,
      style: "bars",
      position: "bottom",
      scale: 0.8,
      density: 96,
      thickness: 0.7,
      smoothing: 0.2,
      edgeFlush: true,
      lane: i === 0 ? 0 : i % 2 === 1 ? 1 : -1,
    }),
    surface: { style: "solid", color: "#0b0b0d", opacity: 0.5 },
    subtitles: {
      position: "bottom",
      fontSize: 0.058,
      strokeWidth: 0.18,
      activeGlow: 0.35,
      // All-caps reads as shouting, and a lesson is not shouting. Kept as a
      // setting for the line where a character actually raises their voice;
      // never the default. When it IS used, toUpperGreek drops the accent and
      // keeps the dialytika, which is what Greek orthography asks for.
      uppercase: false,
      maxChars: 34,
    },
    // Brighter footage than Halo, because the text carries its own surface and
    // no longer needs the whole frame darkened to stay readable.
    backgroundDim: 0.3,
    backgroundBlur: 0,
  },
  {
    name: "Orbit",
    description:
      "Glowing rings behind frameless avatars on blurred footage. The most cinematic of the three.",
    outlineShape: "none",
    waveform: () => ({
      enabled: true,
      style: "rings",
      position: "speaker",
      scale: 1.4,
      density: 48,
      thickness: 1.4,
      smoothing: 0.5,
      ringInnerRadius: 0.28,
      ringSize: 1.1,
    }),
    // A real refracting disc behind each face now, not a tinted circle.
    surface: { style: "glass", color: "#0b0b0d", opacity: 0.28, blur: 0.01, borderOpacity: 0.3 },
    subtitles: { position: "bottom", fontSize: 0.05, strokeWidth: 0.1, activeGlow: 1.0, uppercase: false },
    // The background is pushed back with blur rather than darkness, so the
    // footage stays legible as footage.
    backgroundDim: 0.3,
    backgroundBlur: 0.012,
  },
];

function slotsFor(style: Style, count: 1 | 2 | 3): SpeakerSlot[] {
  return LAYOUTS[count].map((place, i) => ({
    ...place,
    outlineShape: style.outlineShape,
    waveform: { ...defaultTrackWaveform(i), ...style.waveform(i) } as TrackWaveform,
    surface: { ...defaultSurface(), ...style.surface },
  }));
}

/** The nine, built fresh each call so nothing can hand out a shared object that
 *  a later edit mutates underneath everyone else. */
export function builtinPresets(): (ProjectPreset & { name: string })[] {
  const out: (ProjectPreset & { name: string })[] = [];
  for (const count of [1, 2, 3] as const) {
    for (const style of STYLES) {
      const noun = count === 1 ? "solo" : count === 2 ? "duo" : "trio";
      out.push({
        name: `${style.name} · ${noun}`,
        description: style.description,
        speakerCount: count,
        builtIn: true,
        slots: slotsFor(style, count),
        // Partial on purpose, and NOT cast to a full SubtitleConfig.
        //
        // A preset is partial by contract — anything it omits falls back to the
        // app's defaults. An `as SubtitleConfig` here claimed otherwise, and
        // the claim was believed: the batch runner used the object whole, so
        // every render made from a built-in got `enabled: undefined` and no
        // colours. The cast did not create the bug, but it is why nothing
        // caught it. Consumers merge over defaults; the type now says so.
        subtitles: {
          ...style.subtitles,
          surface:
            style.name === "Broadcast" || style.name === "Orbit"
              ? // A pill of glass under the caption. Orbit gets one too: its
                // faces already sit on glass discs, and a bare caption beneath
                // them looks like two different videos.
                { ...defaultSurface(), style: "glass" }
              : { ...defaultSurface(), style: "none" },
          transition: defaultSubtitleTransition(),
        },
        backgroundDim: style.backgroundDim,
        backgroundBlur: style.backgroundBlur,
        savedAt: 0,
      });
    }
  }
  return out;
}
