import { useState } from "react";
import { useSettingsStore } from "../../store/useSettingsStore";
import { useVoicesStore } from "../../store/useVoicesStore";

/**
 * Phase 2, step 1: prove the whole TTS pipeline (persistent Piper server ->
 * audio bytes over IPC -> play in the renderer) before wiring in XTTS-v2 as
 * the "quality" engine on top of the same pattern. Voice discovery lives in
 * useVoicesStore so the per-speaker voice picker (in App.tsx) sees the same
 * scanned list without a separate scan.
 */
export default function TtsTestPanel() {
  const piperPythonPath = useSettingsStore((s) => s.defaults.piperPythonPath);
  const piperVoicesDir = useSettingsStore((s) => s.defaults.piperVoicesDir);
  const setDefault = useSettingsStore((s) => s.setDefault);

  const voices = useVoicesStore((s) => s.voices);
  const scanning = useVoicesStore((s) => s.scanning);
  const scanError = useVoicesStore((s) => s.error);
  const scan = useVoicesStore((s) => s.scan);

  const [selectedVoice, setSelectedVoice] = useState<string>("");
  const [testText, setTestText] = useState("Καλησπέρα! This is a Piper test.");
  const [synthesizing, setSynthesizing] = useState(false);
  const [synthError, setSynthError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);

  // Same rule as the Draft button: never disable for missing input, because a
  // dead button tells the user nothing about what's wrong. Say it instead.
  const [scanHint, setScanHint] = useState<string | null>(null);
  const runScan = async () => {
    setScanHint(null);
    if (!piperVoicesDir.trim()) {
      setScanHint("Enter the folder holding your .onnx voice models first — the bundled one is ./piper-voices.");
      return;
    }
    await scan(piperVoicesDir);
    const found = useVoicesStore.getState().voices;
    if (found.length > 0) setSelectedVoice(found[0].onnxPath);
  };

  const runSynthesize = async () => {
    if (!selectedVoice) return;
    setSynthesizing(true);
    setSynthError(null);
    setAudioUrl(null);
    try {
      // First call for a given voice spawns and warms up its server, so this
      // can take a few seconds; subsequent calls to the same voice are fast.
      const { audioBuffer, durationMs: ms } = await window.byok.tts.synthesizePiper(
        piperPythonPath,
        selectedVoice,
        testText
      );
      const blob = new Blob([audioBuffer], { type: "audio/wav" });
      setAudioUrl(URL.createObjectURL(blob));
      setDurationMs(ms);
    } catch (e: any) {
      setSynthError(e?.message ?? String(e));
    } finally {
      setSynthesizing(false);
    }
  };

  return (
    <div className="border border-accent/25 bg-metal-800/60 p-4 space-y-3">
      <h3 className="label-lit text-sm">Local TTS Test (Piper)</h3>
      <p className="text-sm text-neutral-400">
        Proves the full pipeline — start a persistent Piper server, get
        audio, play it — before wiring in XTTS-v2. First synthesis per voice
        is slower (server warm-up); after that it's fast.
      </p>

      <div className="space-y-2">
        <input
          type="text"
          placeholder="Python executable (e.g. python3, or a full path)…"
          value={piperPythonPath}
          onChange={(e) => setDefault("piperPythonPath", e.target.value)}
          className="w-full bg-metal-900 border border-accent/25 px-3 py-2 text-base text-neutral-100 outline-none focus:border-accent"
        />
        <input
          type="text"
          placeholder="Folder containing your .onnx voice models…"
          value={piperVoicesDir}
          onChange={(e) => setDefault("piperVoicesDir", e.target.value)}
          className="w-full bg-metal-900 border border-accent/25 px-3 py-2 text-base text-neutral-100 outline-none focus:border-accent"
        />
        <div className="flex items-center gap-3">
          <button
            onClick={runScan}
            disabled={scanning}
            className="hud-btn px-4 py-2 text-sm font-display uppercase tracking-[0.1em] text-neutral-300 hover:text-accent-bright disabled:opacity-50"
          >
            {scanning ? "Scanning…" : "Scan for Voices"}
          </button>
          {voices.length > 0 && (
            <span className="text-sm text-emerald-400">{voices.length} voice(s) found</span>
          )}
          {scanError && <span className="text-sm text-red-400">{scanError}</span>}
          {scanHint && <span className="text-sm text-accent-bright">{scanHint}</span>}
        </div>

        {voices.length > 0 && (
          <select
            value={selectedVoice}
            onChange={(e) => setSelectedVoice(e.target.value)}
            className="w-full bg-metal-900 border border-accent/25 px-3 py-2 text-base text-neutral-100 outline-none focus:border-accent"
          >
            {voices.map((v) => (
              <option key={v.id} value={v.onnxPath}>
                {v.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="space-y-2 pt-2 border-t border-accent/15">
        <textarea
          value={testText}
          onChange={(e) => setTestText(e.target.value)}
          rows={2}
          className="w-full bg-metal-900 border border-accent/25 px-3 py-2 text-base text-neutral-100 outline-none focus:border-accent resize-none"
        />
        <button
          onClick={runSynthesize}
          disabled={synthesizing || !selectedVoice}
          className="hud-btn hud-btn-active px-4 py-2 text-sm font-display font-semibold uppercase tracking-[0.1em] text-accent-bright disabled:opacity-40"
        >
          {synthesizing ? "Synthesizing…" : "Synthesize & Play"}
        </button>
        {synthError && <p className="text-sm text-red-400 whitespace-pre-wrap">{synthError}</p>}
        {audioUrl && (
          <div className="space-y-1">
            <audio src={audioUrl} controls autoPlay className="w-full" />
            {durationMs !== null && (
              <p className="text-sm text-neutral-500">Duration: {(durationMs / 1000).toFixed(2)}s</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
