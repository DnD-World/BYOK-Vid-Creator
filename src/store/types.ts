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
  style: "bars" | "lines" | "wave" | "mirror" | "dots";
  colorA: string;
  colorB: string;
  colorMusic: string;
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
  voiceId?: string;      // assigned Piper voice's onnxPath, if any
}

export interface ProjectState {
  render: RenderSettings;
  waveform: WaveformConfig;
  bgRelevancy: number;   // 0 = fewer/longer, 1 = many/fast
  fps: Fps;
  speakers: SpeakerConfig[];
}
