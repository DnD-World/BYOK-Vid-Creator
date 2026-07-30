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
  borderColor: string;
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
  waveform: WaveformConfig;
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
