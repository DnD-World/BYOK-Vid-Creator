import { contextBridge, ipcRenderer } from "electron";

// ---------------------------------------------------------------------------
// BYOK-Vid-Creator — Preload bridge
// Exposes a small, whitelisted, type-safe API as window.byok
// contextIsolation MUST be true (set in main.ts) for this to work.
// ---------------------------------------------------------------------------

const api = {
  keys: {
    list: (): Promise<string[]> => ipcRenderer.invoke("keys:list"),
    get: (provider: string): Promise<string | null> =>
      ipcRenderer.invoke("keys:get", provider),
    set: (provider: string, value: string): Promise<boolean> =>
      ipcRenderer.invoke("keys:set", provider, value),
    remove: (provider: string): Promise<boolean> =>
      ipcRenderer.invoke("keys:delete", provider),
    encryptionAvailable: (): Promise<boolean> =>
      ipcRenderer.invoke("keys:encryptionAvailable"),
  },

  dialog: {
    openFile: (filters?: Electron.FileFilter[]): Promise<string | null> =>
      ipcRenderer.invoke("dialog:openFile", filters),
    saveFile: (
      defaultName: string,
      filters?: Electron.FileFilter[]
    ): Promise<string | null> =>
      ipcRenderer.invoke("dialog:saveFile", defaultName, filters),
  },

  storage: {
    outputDir: (): Promise<string> => ipcRenderer.invoke("storage:outputDir"),
    openOutputDir: (): Promise<boolean> =>
      ipcRenderer.invoke("storage:openOutputDir"),
    readFile: (filePath: string): Promise<ArrayBuffer> =>
      ipcRenderer.invoke("storage:readFile", filePath),
    writeFile: (filePath: string, data: ArrayBuffer): Promise<boolean> =>
      ipcRenderer.invoke("storage:writeFile", filePath, data),
  },

  render: {
    start: (
      job: unknown
    ): Promise<
      | { ok: true; jobId: string; outputPath: string; durationSec: number; frames: number }
      | { ok: false; jobId: string; error: string }
    > => ipcRenderer.invoke("render:start", job),
    onProgress: (cb: (payload: { jobId: string; pct: number; note?: string }) => void) => {
      const listener = (_e: unknown, payload: any) => cb(payload);
      ipcRenderer.on("render:progress", listener);
      // return an unsubscribe function
      return () => ipcRenderer.removeListener("render:progress", listener);
    },
  },

  tts: {
    listPiperVoices: (voicesDir: string): Promise<{ id: string; name: string; onnxPath: string }[]> =>
      ipcRenderer.invoke("tts:listPiperVoices", voicesDir),
    synthesizePiper: (
      pythonPath: string,
      onnxPath: string,
      text: string
    ): Promise<{ audioBuffer: ArrayBuffer; durationMs: number }> =>
      ipcRenderer.invoke("tts:synthesizePiper", pythonPath, onnxPath, text),

    chatterbox: {
      ensureRunning: (cfg: { installPath: string; port: number }): Promise<boolean> =>
        ipcRenderer.invoke("tts:chatterboxEnsureRunning", cfg),
      isRunning: (): Promise<boolean> => ipcRenderer.invoke("tts:chatterboxIsRunning"),
      listPredefinedVoices: (): Promise<{ id: string; label: string }[]> =>
        ipcRenderer.invoke("tts:chatterboxListPredefinedVoices"),
      listReferenceAudio: (): Promise<{ id: string; label: string }[]> =>
        ipcRenderer.invoke("tts:chatterboxListReferenceAudio"),
      synthesize: (opts: {
        text: string;
        language: string;
        voiceMode: "predefined" | "clone";
        predefinedVoiceId?: string;
        referenceAudioFilename?: string;
        seed?: number;
        exaggeration?: number;
        cfgWeight?: number;
      }): Promise<{ audioBuffer: ArrayBuffer; durationMs: number }> =>
        ipcRenderer.invoke("tts:chatterboxSynthesize", opts),
    },

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
      }[]
    ): Promise<{
      filePath: string;
      segments: { speakerId: string; speakerLabel: string; text: string; startMs: number; endMs: number }[];
    }> => ipcRenderer.invoke("tts:generateNarration", segments),
  },

  llm: {
    draftScript: (opts: {
      topic: string;
      speakerLabels: string[];
      languageName: string;
      tone?: string;
    }): Promise<string> => ipcRenderer.invoke("llm:draftScript", opts),
  },
};

contextBridge.exposeInMainWorld("byok", api);

// Global typing so the renderer gets autocomplete for window.byok
export type ByokApi = typeof api;
