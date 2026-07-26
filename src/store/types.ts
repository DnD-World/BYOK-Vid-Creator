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

export interface SpeakerConfig {
  id: string;
  label: string;         // "Male Dog" / "Female"
  sheetUrl: string;      // viseme sprite-sheet PNG
  bgOpacity: number;     // default 0 (invisible disk)
  borderOpacity: number; // default 1
  bgColor: string;
  borderColor: string;
  x: number;
  y: number;
  size: number;          // diameter in px on canvas
  voiceId?: string;      // assigned Piper voice's onnxPath, if any (test-tier engine)
  chatterboxVoiceMode?: "predefined" | "clone"; // production-tier engine voice assignment
  chatterboxVoiceRef?: string; // predefined_voice_id or reference_audio_filename, depending on mode above
}

export interface ProjectState {
  render: RenderSettings;
  waveform: WaveformConfig;
  bgRelevancy: number;   // 0 = fewer/longer, 1 = many/fast
  fps: Fps;
  speakers: SpeakerConfig[];
  script: string;        // raw "Label: text" per line narration script
  language: string;      // narration language code, e.g. "el", "en"
}
