// NOTE: API key values themselves are never stored here or anywhere in the
// renderer/localStorage. They live only in the encrypted Electron vault
// (electron/keyStore.ts) and are read/written via window.byok.keys.*.
// This file only holds non-secret backend configuration.

// REMOVED: ttsPrimary, ttsFallback, llmScenePlanner, defaultTransition,
// storageTarget, azureRegion. Every one was declared here, given a default,
// persisted — and read by NOTHING. A settings field that nothing consumes is
// worse than a missing one: it describes a feature to whoever reads the file
// next, and the app behaves as though the setting isn't there, so the two can
// never be reconciled by testing. Engine choice is per-speaker on the speaker
// itself, which is the only place it was ever actually read from.
export interface BackendDefaults {
  piperPythonPath: string; // e.g. "python3" or a full path to your python executable
  piperVoicesDir: string;  // folder containing your installed .onnx voice models
  /** Where the DramaBox reference clips live — one .wav per character. The
   *  file names are on the speakers; this is the folder they sit in. */
  voiceRefsDir: string;
}
