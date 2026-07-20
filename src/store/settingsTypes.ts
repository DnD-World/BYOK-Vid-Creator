export interface ApiKeys {
  azureSpeechKey: string;
  azureRegion: string;
  glmKey: string;        // GLM 5.2 via NVIDIA provider
  pixabayKey: string;
  jamendoKey: string;
  freesoundKey: string;
}

export interface BackendDefaults {
  ttsPrimary: "coqui-xtts-v2" | "azure";
  ttsFallback: "piper";
  llmScenePlanner: "glm-5.2";
  defaultTransition: "fade_zoom" | "glitch" | "cut";
  storageTarget: "local";        // "gdrive" reserved (future)
}
