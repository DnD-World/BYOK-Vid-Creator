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
    test: (
      provider: string,
      opts?: { azureRegion?: string }
    ): Promise<{ ok: boolean; message: string }> =>
      ipcRenderer.invoke("keys:test", provider, opts),
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

  audio: {
    analyzeFile: (
      filePath: string
    ): Promise<{ hz: number; durationMs: number; amp: number[]; speaker: number[] } | null> =>
      ipcRenderer.invoke("audio:analyzeFile", filePath),
  },

  media: {
    searchVideos: (query: string, providers?: ("pixabay" | "pexels")[]) =>
      ipcRenderer.invoke("media:searchVideos", query, providers),
    download: (id: string, url: string): Promise<string> =>
      ipcRenderer.invoke("media:download", id, url),
    autoBackgrounds: (opts: unknown) => ipcRenderer.invoke("media:autoBackgrounds", opts),
    /** Everything already downloaded to this machine. */
    library: (): Promise<{
      fileName: string; filePath: string; kind: "video" | "audio";
      bytes: number; modifiedMs: number; source?: string;
    }[]> => ipcRenderer.invoke("media:library"),
  },

  sound: {
    /** Freesound, hard-filtered to CC0. Downloading uses media.download. */
    search: (query: string) => ipcRenderer.invoke("sound:search", query),
  },

  fonts: {
    list: () => ipcRenderer.invoke("fonts:list"),
    /** Downloads on first use, then reads from the cache. Returns the files
     *  and, honestly, whether the family really has Greek. */
    ensure: (family: string, weight: number) =>
      ipcRenderer.invoke("fonts:ensure", family, weight),
  },

  storage: {
    outputDir: (): Promise<string> => ipcRenderer.invoke("storage:outputDir"),
    openOutputDir: (): Promise<boolean> =>
      ipcRenderer.invoke("storage:openOutputDir"),
    puppetDir: (): Promise<string> => ipcRenderer.invoke("storage:puppetDir"),
    readFile: (filePath: string): Promise<ArrayBuffer> =>
      ipcRenderer.invoke("storage:readFile", filePath),
    writeFile: (filePath: string, data: ArrayBuffer): Promise<boolean> =>
      ipcRenderer.invoke("storage:writeFile", filePath, data),
  },

  music: {
    /** The loops that ship with the app. */
    list: (): Promise<{ name: string; filePath: string }[]> =>
      ipcRenderer.invoke("music:list"),
  },

  dramabox: {
    /** Write blocks.json and align.json for the current script and cast.
     *  The settings on each speaker travel with them. */
    writeBlocks: (
      scriptText: string,
      speakers: unknown[],
      outDir: string
    ): Promise<{
      ok: boolean;
      errors: string[];
      count?: number;
      summary: string[];
    }> => ipcRenderer.invoke("dramabox:writeBlocks", scriptText, speakers, outDir),
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

    generateNarration: (
      segments: {
        speakerId: string;
        speakerLabel: string;
        text: string;
        language: string;
        engine?: "piper";
        piperPythonPath?: string;
        piperOnnxPath?: string;
      }[],
      speakerOrder: string[],
      pauses?: { sameMs: number; turnMs: number }
    ): Promise<{
      filePath: string;
      segments: { speakerId: string; speakerLabel: string; text: string; startMs: number; endMs: number }[];
      analysis: unknown;
    }> => ipcRenderer.invoke("tts:generateNarration", segments, speakerOrder, pauses),
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
