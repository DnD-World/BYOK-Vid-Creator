import { ProjectState } from "./types";
import { defaultTrackWaveform } from "../lib/waveform/buildTracks";

export const defaultProject: ProjectState = {
  render: {
    format: "9:16",
    width: 1080,
    height: 1920,
    durationSec: 180,
    engine: "remotion",
  },
  // Music defaults to off: most projects start with narration only, and an
  // always-animating track with no music behind it looks broken.
  musicWaveform: { ...defaultTrackWaveform(0), enabled: false, style: "wave", position: "bottom" },
  musicColor: "#8a8a8a",
  subtitles: {
    enabled: true,
    position: "bottom",
    fontSize: 0.055,
    color: "#ffffff",
    activeColor: "#ff9a3c",
    strokeColor: "#000000",
    strokeWidth: 0.14,
    activeGlow: 0.6,
    activeFromSpeaker: true,
    uppercase: false,
    maxChars: 42,
    // Comfortaa, not "whatever the system picks". A default of null meant
    // every new project started in a different face from every finished one,
    // and the lessons that shipped were all set to this by hand.
    fontFamily: "Comfortaa",
    fontWeight: 700,
  },
  pauseSameMs: 120,
  pauseTurnMs: 340,
  // A CUT, not a dissolve. Cross-fading two mouth drawings blends them, and a
  // half-and-half of an open mouth and a closed one has neither shape's outline
  // nor either fill — it reads as the mouth vanishing for a frame. At 70ms,
  // under two frames at 24fps, about one frame of every viseme change landed in
  // that state. Measured against a hard cut on the same frames of the same
  // render: two washed-out mouths in eight, versus none.
  //
  // This is what cel animation has always done — mouths cut. The control is
  // still in the Scene panel for anyone who wants it.
  visemeFadeMs: 0,
  idleMotion: 0.7,
  fps: 24,
  speakers: [],
  script: "",
  backgrounds: [],
  // Dark enough that the waveform and the subtitles still read over daylight
  // footage, light enough that you can tell what the clip is of.
  backgroundDim: 0.45,
  // Sharp by default. Blur is a look, and looks belong in presets — a default
  // that softens every project's footage would be a decision made for people
  // who never asked for it.
  backgroundBlur: 0,
  backgroundCrossfadeMs: 600,
  language: "el",
  narration: null,
  attachedAudio: null,
  music: null,
  sfx: [],
  // A bed, not a soundtrack: loud enough to hear under speech, quiet enough
  // that nobody reaches for the volume.
  musicVolume: 0.28,
  musicDuck: 0.7,
};
