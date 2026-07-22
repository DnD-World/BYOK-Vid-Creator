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

  const runScan = async () => {
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
    <div className="rounded-xl border border-zinc-700 bg-zinc-900/80 p-4 space-y-3">
      <h3 className="label-lit font-display uppercase tracking-[0.18em] text-xs">
        Local TTS Test (Piper)
      </h3>
      <p className="text-xs text-zinc-500">
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
          className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500"
        />
        <input
          type="text"
          placeholder="Folder containing your .onnx voice models…"
          value={piperVoicesDir}
          onChange={(e) => setDefault("piperVoicesDir", e.target.value)}
          className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500"
        />
        <div className="flex items-center gap-3">
          <button
            onClick={runScan}
            disabled={scanning || !piperVoicesDir}
            className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:border-amber-500 hover:text-amber-400 disabled:opacity-50"
          >
            {scanning ? "Scanning…" : "Scan for Voices"}
          </button>
          {voices.length > 0 && (
            <span className="text-xs text-emerald-400">{voices.length} voice(s) found</span>
          )}
          {scanError && <span className="text-xs text-red-400">{scanError}</span>}
        </div>

        {voices.length > 0 && (
          <select
            value={selectedVoice}
            onChange={(e) => setSelectedVoice(e.target.value)}
            className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500"
          >
            {voices.map((v) => (
              <option key={v.id} value={v.onnxPath}>
                {v.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="space-y-2 pt-2 border-t border-zinc-800">
        <textarea
          value={testText}
          onChange={(e) => setTestText(e.target.value)}
          rows={2}
          className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500 resize-none"
        />
        <button
          onClick={runSynthesize}
          disabled={synthesizing || !selectedVoice}
          className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-black hover:bg-amber-500 disabled:opacity-40"
        >
          {synthesizing ? "Synthesizing…" : "Synthesize & Play"}
        </button>
        {synthError && <p className="text-xs text-red-400 whitespace-pre-wrap">{synthError}</p>}
        {audioUrl && (
          <div className="space-y-1">
            <audio src={audioUrl} controls autoPlay className="w-full" />
            {durationMs !== null && (
              <p className="text-[10px] text-zinc-500">Duration: {(durationMs / 1000).toFixed(2)}s</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
