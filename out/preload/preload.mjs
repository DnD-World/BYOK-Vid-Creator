import { contextBridge, ipcRenderer } from "electron";
const api = {
  keys: {
    list: () => ipcRenderer.invoke("keys:list"),
    get: (provider) => ipcRenderer.invoke("keys:get", provider),
    set: (provider, value) => ipcRenderer.invoke("keys:set", provider, value),
    remove: (provider) => ipcRenderer.invoke("keys:delete", provider),
    encryptionAvailable: () => ipcRenderer.invoke("keys:encryptionAvailable")
  },
  dialog: {
    openFile: (filters) => ipcRenderer.invoke("dialog:openFile", filters),
    saveFile: (defaultName, filters) => ipcRenderer.invoke("dialog:saveFile", defaultName, filters)
  },
  storage: {
    outputDir: () => ipcRenderer.invoke("storage:outputDir"),
    openOutputDir: () => ipcRenderer.invoke("storage:openOutputDir"),
    readFile: (filePath) => ipcRenderer.invoke("storage:readFile", filePath),
    writeFile: (filePath, data) => ipcRenderer.invoke("storage:writeFile", filePath, data)
  },
  render: {
    start: (job) => ipcRenderer.invoke("render:start", job),
    onProgress: (cb) => {
      const listener = (_e, payload) => cb(payload);
      ipcRenderer.on("render:progress", listener);
      return () => ipcRenderer.removeListener("render:progress", listener);
    }
  },
  tts: {
    listPiperVoices: (voicesDir) => ipcRenderer.invoke("tts:listPiperVoices", voicesDir),
    synthesizePiper: (pythonPath, onnxPath, text) => ipcRenderer.invoke("tts:synthesizePiper", pythonPath, onnxPath, text),
    chatterbox: {
      ensureRunning: (cfg) => ipcRenderer.invoke("tts:chatterboxEnsureRunning", cfg),
      isRunning: () => ipcRenderer.invoke("tts:chatterboxIsRunning"),
      listPredefinedVoices: () => ipcRenderer.invoke("tts:chatterboxListPredefinedVoices"),
      listReferenceAudio: () => ipcRenderer.invoke("tts:chatterboxListReferenceAudio"),
      synthesize: (opts) => ipcRenderer.invoke("tts:chatterboxSynthesize", opts)
    },
    generateNarration: (segments) => ipcRenderer.invoke("tts:generateNarration", segments)
  },
  llm: {
    draftScript: (opts) => ipcRenderer.invoke("llm:draftScript", opts)
  }
};
contextBridge.exposeInMainWorld("byok", api);
