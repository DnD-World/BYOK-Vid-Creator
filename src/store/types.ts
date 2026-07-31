export type AspectRatio = "9:16" | "16:9";
export type Engine = "remotion" | "ffmpeg";
export type Fps = 10 | 24 | 30;

export interface RenderSettings {
  format: AspectRatio;
  width: number;
  height: number;
  durationSec: number;   // max 600 (10 min)
  engine: Engine;
}

/** One waveform belonging to one sound source — a speaker, or the music.
 *
 *  This replaces the old single global WaveformConfig plus its `behavior` enum
 *  ("single" / "dual" / "dual-plus-music" / "triple"). Those combinations are
 *  now emergent: which tracks exist and which are enabled IS the behaviour, so
 *  the enum stopped describing anything the data didn't already say.
 *
 *  Colour deliberately lives on the owner, not here — a speaker's waveform is
 *  their outline colour, so the two cannot drift apart. */
export interface TrackWaveform {
  enabled: boolean;
  style: "bars" | "lines" | "wave" | "mirror" | "dots" | "rings";
  position: "circular" | "top" | "bottom" | "left" | "right";
  scale: number;       // 0.2–2.5, amplitude-extension multiplier
  density: number;     // sample/bar count, 8–160
  thickness: number;   // 0.2–3, bar/stroke width multiplier
  dotSize: number;     // dots-style only
  edgeFlush: boolean;
  smoothing: number;   // 0–1, how much neighbouring bars influence each other
  ringInnerRadius: number;
  ringSize: number;
  ringX: number;
  ringY: number;
  /** Lateral offset so simultaneous tracks read as separate lanes. */
  lane: number;
}

export type OutlineShape = "circle" | "rounded" | "square" | "none";

/** Legacy global waveform config. Kept only so old saved templates can be
 *  read and migrated; nothing new should reference it. */
export interface WaveformConfig {
  position: "circular" | "top" | "bottom" | "left" | "right";
  behavior: "single" | "single-colorshift" | "dual" | "dual-plus-music" | "triple";
  style: "bars" | "lines" | "wave" | "mirror" | "dots" | "rings";
  colorA: string;
  colorB: string;
  colorMusic: string;
  scale: number;       // 0.5–1.8, overall amplitude-extension multiplier
  density: number;      // sample/bar count, 16–96
  dotSize: number;      // dots-style-only radius multiplier, 0.4–2.5
  edgeFlush: boolean;   // true = hug the true edge, false = inset margin
  ringInnerRadius: number; // 0–0.8, how much open space in the middle (for an avatar)
  ringSize: number;     // 0.5–1.5, overall ring cluster scale
  ringX: number;        // 0–1, ring cluster center (fraction of frame)
  ringY: number;        // 0–1
}

export interface SubtitleConfig {
  enabled: boolean;
  position: "bottom" | "center" | "top";
  /** Font size as a fraction of frame WIDTH — resolution-independent, same
   *  convention as speaker size/position. */
  fontSize: number;
  color: string;
  /** Colour of the word currently being spoken. */
  activeColor: string;
  strokeColor: string;
  /** Stroke width as a fraction of the font size. */
  strokeWidth: number;
  /** Glow strength on the active word, 0 = off. */
  activeGlow: number;
  uppercase: boolean;
  /** Characters per cue before the text wraps to a new cue. */
  maxChars: number;
}

export interface SpeakerConfig {
  id: string;
  label: string;         // "Male Dog" / "Female"
  /** Absolute path on disk to the 3072x3072 viseme sheet — the source of truth,
   *  and what templates save. Deliberately NOT directly loadable by either
   *  renderer: the preview turns it into a blob URL over IPC, and the render
   *  copies the file into Remotion's public dir. */
  sheetPath?: string;
  bgOpacity: number;     // default 0 (invisible disk)
  borderOpacity: number; // default 1
  bgColor: string;
  /** Outline colour — and, by construction, this speaker's waveform colour. */
  borderColor: string;
  outlineShape: OutlineShape;
  /** This speaker's own waveform. Animates only while they are speaking. */
  waveform: TrackWaveform;
  x: number;
  y: number;
  // Diameter as a 0–1 fraction of frame WIDTH — same convention as x/y above,
  // and for the same reason. Storing it in pixels meant a size authored on the
  // small preview canvas rendered at that literal pixel count on a 1080-wide
  // frame, so avatars came out several times too small. A fraction is
  // resolution-independent: preview and render each multiply by their own
  // width and agree by construction.
  size: number;
  /** Which engine speaks this speaker's lines. Per-speaker, not global, so a
   *  fast Piper voice and a cloned Chatterbox voice can share one script. */
  ttsEngine?: "chatterbox" | "piper";
  voiceId?: string;      // assigned Piper voice's onnxPath, if any (test-tier engine)
  chatterboxVoiceMode?: "predefined" | "clone"; // production-tier engine voice assignment
  chatterboxVoiceRef?: string; // predefined_voice_id or reference_audio_filename, depending on mode above
}

/** Per-band spectrum for every analysis frame — the data that lets bars move
 *  independently instead of all scaling with one loudness number.
 *
 *  Frame-major and quantised: frame `f`, band `b` is byte `f * bandCount + b`,
 *  0–255. Packed as base64 rather than a number[][] because at 60Hz and 24
 *  bands a ten-minute narration is 864k values per array — as JSON that is
 *  megabytes of "0.42," and it has to cross an IPC boundary and then a render
 *  boundary. A byte per value is all the precision a bar height can show. */
export interface AudioSpectrum {
  bandCount: number;
  /** base64 Uint8Array — the band's current level. */
  bands: string;
  /** base64 Uint8Array — the peak-hold cap above that level. */
  peaks: string;
}

/** Precomputed loudness + who's-talking data for the narration audio, sampled
 *  at a fixed `hz` so one analysis serves the preview and any render fps.
 *  Produced by electron/audio/analyzeNarration.ts. */
export interface AudioAnalysis {
  hz: number;
  durationMs: number;
  /** 0–1 smoothed RMS envelope, one entry per analysis frame. */
  amp: number[];
  /** Index into the speakers array, or -1 for silence. Same length as `amp`. */
  speaker: number[];
  /** Absent when the spectrum travels out of band — during a render it is
   *  written into the public dir and fetched by the composition instead of
   *  riding along in inputProps. The waveform falls back to the shape function
   *  when it is missing, so this staying null is a degradation, not a break. */
  spectrum?: AudioSpectrum | null;
}

export interface NarrationSegment {
  speakerId: string;
  speakerLabel: string;
  text: string;
  startMs: number;   // offset within the combined file
  endMs: number;
}

/** The last successfully generated narration. Held in the project store
 *  rather than in NarrationPanel's local state so the render bar can attach
 *  it and match its length automatically, and so the waveform and subtitles
 *  have a single source of truth for timing later. */
export interface NarrationResult {
  filePath: string;
  segments: NarrationSegment[];
  /** null if the WAV couldn't be analysed (unexpected encoding). */
  analysis: AudioAnalysis | null;
}

export interface ProjectState {
  render: RenderSettings;
  /** The music track's waveform, and its colour. Always animating — music
   *  doesn't take turns the way speakers do. */
  musicWaveform: TrackWaveform;
  musicColor: string;
  subtitles: SubtitleConfig;
  bgRelevancy: number;   // 0 = fewer/longer, 1 = many/fast
  fps: Fps;
  speakers: SpeakerConfig[];
  script: string;        // raw "Label: text" per line narration script
  language: string;      // narration language code, e.g. "el", "en"
  narration: NarrationResult | null;
  /** An audio file the user attached by hand, overriding the narration. It has
   *  no speaker segments — nobody said who is talking — so it drives the
   *  waveform but not subtitles or lip-sync. */
  attachedAudio: { filePath: string; analysis: AudioAnalysis | null } | null;
}
