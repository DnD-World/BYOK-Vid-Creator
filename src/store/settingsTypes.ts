// NOTE: API key values themselves are never stored here or anywhere in the
// renderer/localStorage. They live only in the encrypted Electron vault
// (electron/keyStore.ts) and are read/written via window.byok.keys.*.
// This file only holds non-secret backend configuration.

export interface BackendDefaults {
  ttsPrimary: "coqui-xtts-v2" | "azure";
  ttsFallback: "piper";
  llmScenePlanner: "glm-5.2";
  defaultTransition: "fade_zoom" | "glitch" | "cut";
  storageTarget: "local"; // "gdrive" reserved (future)
  azureRegion: string;    // e.g. "eastus" — not secret, but Azure Speech needs it
  piperPythonPath: string; // e.g. "python3" or a full path to your python executable
  piperVoicesDir: string;  // folder containing your installed .onnx voice models
}
