export {};

// The real shape, not a hand-copied approximation of it. This file used to
// re-declare the analysis inline, which meant adding `spectrum` to
// AudioAnalysis left the renderer's view of the IPC boundary silently stale.
import type { AudioAnalysis } from "./store/types";

declare global {
  interface Window {
    byok: {
      keys: {
        list: () => Promise<string[]>;
        get: (provider: string) => Promise<string | null>;
        set: (provider: string, value: string) => Promise<boolean>;
        remove: (provider: string) => Promise<boolean>;
        encryptionAvailable: () => Promise<boolean>;
        test: (
          provider: string,
          opts?: { azureRegion?: string }
        ) => Promise<{ ok: boolean; message: string }>;
      };
      dialog: {
        openFile: (filters?: unknown) => Promise<string | null>;
        saveFile: (defaultName: string, filters?: unknown) => Promise<string | null>;
      };
      audio: {
        analyzeFile: (filePath: string) => Promise<AudioAnalysis | null>;
      };
      storage: {
        outputDir: () => Promise<string>;
        openOutputDir: () => Promise<boolean>;
        puppetDir: () => Promise<string>;
        readFile: (filePath: string) => Promise<ArrayBuffer>;
        writeFile: (filePath: string, data: ArrayBuffer) => Promise<boolean>;
      };
      render: {
        start: (
          job: unknown
        ) => Promise<
          | {
              ok: true;
              jobId: string;
              outputPath: string;
              durationSec: number;
              frames: number;
            }
          | { ok: false; jobId: string; error: string }
        >;
        onProgress: (
          cb: (payload: { jobId: string; pct: number; note?: string }) => void
        ) => () => void;
      };
      tts: {
        listPiperVoices: (voicesDir: string) => Promise<{ id: string; name: string; onnxPath: string }[]>;
        synthesizePiper: (
          pythonPath: string,
          onnxPath: string,
          text: string
        ) => Promise<{ audioBuffer: ArrayBuffer; durationMs: number }>;
        chatterbox: {
          ensureRunning: (cfg: { installPath: string; port: number }) => Promise<boolean>;
          isRunning: () => Promise<boolean>;
          listPredefinedVoices: () => Promise<{ id: string; label: string }[]>;
          listReferenceAudio: () => Promise<{ id: string; label: string }[]>;
          synthesize: (opts: {
            text: string;
            language: string;
            voiceMode: "predefined" | "clone";
            predefinedVoiceId?: string;
            referenceAudioFilename?: string;
            seed?: number;
            exaggeration?: number;
            cfgWeight?: number;
          }) => Promise<{ audioBuffer: ArrayBuffer; durationMs: number }>;
        };
        generateNarration: (
          segments: {
            speakerId: string;
            speakerLabel: string;
            text: string;
            language: string;
            voiceMode: "predefined" | "clone";
            predefinedVoiceId?: string;
            referenceAudioFilename?: string;
            exaggeration?: number;
            cfgWeight?: number;
            engine?: "chatterbox" | "piper";
            piperPythonPath?: string;
            piperOnnxPath?: string;
          }[],
          speakerOrder: string[],
          pauses?: { sameMs: number; turnMs: number }
        ) => Promise<{
          filePath: string;
          segments: { speakerId: string; speakerLabel: string; text: string; startMs: number; endMs: number }[];
          analysis: AudioAnalysis | null;
        }>;
      };
      llm: {
        draftScript: (opts: {
          topic: string;
          speakerLabels: string[];
          languageName: string;
          tone?: string;
        }) => Promise<string>;
      };
    };
  }
}
