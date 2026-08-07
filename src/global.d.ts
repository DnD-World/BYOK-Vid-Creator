export {};

// The real shape, not a hand-copied approximation of it. This file used to
// re-declare the analysis inline, which meant adding `spectrum` to
// AudioAnalysis left the renderer's view of the IPC boundary silently stale.
import type { AudioAnalysis } from "./store/types";

/** The vendored Deco Noir behaviour layer (src/styles/deco-noir.js). It is a
 *  plain IIFE that attaches to window rather than an ES module, because the
 *  same file has to run unchanged in a WordPress admin page and a browser
 *  extension popup — neither of which can rely on a bundler. */
interface DecoNoirApi {
  init: (opts?: {
    /** There is ONE ground now and its colour derives from --accent, so it
     *  follows the accent picker automatically. The old named grounds
     *  ("steel" / "gold") are gone. */
    ground?: "on" | "off";
    grain?: boolean;
    glow?: boolean;
    spark?: boolean;
    reveal?: boolean;
    glowSensitivity?: number;
  }) => void;
  /** Re-scan for `.dialwrap` elements mounted after init. */
  dials: () => void;
  setColorway: (name: string) => void;
  setDress: (name: string) => void;
  setGround: (name: "on" | "off") => void;
  /** Writes --accent, --accent-hi, --accent-lo and --accent-rgb from one hex,
   *  deriving the shades. One call replaces four hand-written properties, so
   *  the channel and colour forms cannot drift apart. */
  setAccent: (hex: string, opts?: { hi?: string; lo?: string }) => void;
}

declare global {
  interface Window {
    DecoNoir?: DecoNoirApi;
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
      media: {
        searchVideos: (
          query: string,
          providers?: ("pixabay" | "pexels")[]
        ) => Promise<{
          hits: {
            id: string;
            provider: "pixabay" | "pexels";
            url: string;
            thumbUrl: string;
            width: number;
            height: number;
            durationSec: number;
            author: string;
            pageUrl: string;
          }[];
          notes: string[];
        }>;
        /** Returns the absolute path the clip was saved to. */
        download: (id: string, url: string) => Promise<string>;
        /** Reads the script, plans a query per scene and picks a clip for each. */
        autoBackgrounds: (opts: {
          segments: { text: string; startMs: number; endMs: number; speakerLabel: string }[];
          languageName: string;
          portrait: boolean;
          topic?: string;
          minSceneMs?: number;
        }) => Promise<{
          look: string;
          scenes: {
            startMs: number;
            endMs: number;
            query: string;
            reason: string;
            note?: string;
            hit: {
              id: string;
              provider: "pixabay" | "pexels";
              url: string;
              thumbUrl: string;
              width: number;
              height: number;
              durationSec: number;
              author: string;
              pageUrl: string;
            } | null;
          }[];
        }>;
      };
      sound: {
        search: (query: string) => Promise<{
          hits: {
            id: string;
            name: string;
            url: string;
            durationSec: number;
            author: string;
            pageUrl: string;
            license: string;
          }[];
          notes: string[];
        }>;
      };
      fonts: {
        list: () => Promise<
          { family: string; weights: number[]; greek: boolean }[]
        >;
        ensure: (
          family: string,
          weight: number
        ) => Promise<{
          family: string;
          weight: number;
          /** False means the family genuinely has no Greek subset. */
          hasGreek: boolean;
          faces: { path: string; fileName: string; unicodeRange: string }[];
        }>;
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
