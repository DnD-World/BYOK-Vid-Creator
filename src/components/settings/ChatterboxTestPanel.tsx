import { useState } from "react";
import { useSettingsStore } from "../../store/useSettingsStore";
import { useChatterboxVoicesStore } from "../../store/useChatterboxVoicesStore";
import { Knob } from "../ui/Knob";

const LANGUAGES = [
  { code: "el", label: "Greek" },
  { code: "en", label: "English" },
];

/**
 * Chatterbox Multilingual v3 test panel — proves the real quality/cloning
 * TTS engine end-to-end (Electron spawns the server, health-checks it,
 * synthesizes, plays back) before wiring it into actual scene narration.
 * Electron owns the server's lifecycle here (Ak's explicit choice), so
 * starting it is a real "please wait" operation, not instant like Piper.
 * Voice lists live in useChatterboxVoicesStore so the per-speaker voice
 * picker (in App.tsx) sees the same data without a separate fetch.
 */
export default function ChatterboxTestPanel() {
  const installPath = useSettingsStore((s) => s.defaults.chatterboxInstallPath);
  const port = useSettingsStore((s) => s.defaults.chatterboxPort);
  const exaggeration = useSettingsStore((s) => s.defaults.chatterboxExaggeration);
  const cfgWeight = useSettingsStore((s) => s.defaults.chatterboxCfgWeight);
  const setDefaultFn = useSettingsStore((s) => s.setDefault);

  const predefinedVoices = useChatterboxVoicesStore((s) => s.predefinedVoices);
  const referenceFiles = useChatterboxVoicesStore((s) => s.referenceFiles);
  const serverRunning = useChatterboxVoicesStore((s) => s.serverRunning);
  const refreshVoices = useChatterboxVoicesStore((s) => s.refresh);

  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const [voiceMode, setVoiceMode] = useState<"predefined" | "clone">("predefined");
  const [selectedVoice, setSelectedVoice] = useState("");
  const [language, setLanguage] = useState("el");
  const [testText, setTestText] = useState("Καλησπέρα! Αυτή είναι μια δοκιμή.");

  const [synthesizing, setSynthesizing] = useState(false);
  const [synthError, setSynthError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);

  const startServer = async () => {
    if (!installPath) return;
    setStarting(true);
    setStartError(null);
    try {
      await window.byok.tts.chatterbox.ensureRunning({ installPath, port });
      await refreshVoices();
      const voices = useChatterboxVoicesStore.getState().predefinedVoices;
      if (voices.length > 0) setSelectedVoice(voices[0].id);
    } catch (e: any) {
      setStartError(e?.message ?? String(e));
    } finally {
      setStarting(false);
    }
  };

  const runSynthesize = async () => {
    setSynthesizing(true);
    setSynthError(null);
    setAudioUrl(null);
    try {
      const { audioBuffer, durationMs: ms } = await window.byok.tts.chatterbox.synthesize({
        text: testText,
        language,
        voiceMode,
        predefinedVoiceId: voiceMode === "predefined" ? selectedVoice : undefined,
        referenceAudioFilename: voiceMode === "clone" ? selectedVoice : undefined,
        exaggeration,
        cfgWeight,
      });
      const blob = new Blob([audioBuffer], { type: "audio/wav" });
      setAudioUrl(URL.createObjectURL(blob));
      setDurationMs(ms);
    } catch (e: any) {
      setSynthError(e?.message ?? String(e));
    } finally {
      setSynthesizing(false);
    }
  };

  const activeVoiceList = voiceMode === "predefined" ? predefinedVoices : referenceFiles;

  return (
    <div className="border border-accent/25 bg-metal-800/60 p-4 space-y-3">
      <h3 className="label-lit text-sm">Chatterbox Multilingual (TTS + Voice Cloning)</h3>
      <p className="text-sm">
        One-time setup needed first: clone{" "}
        <span className="text-accent-bright">devnen/Chatterbox-TTS-Server</span>, run{" "}
        <span className="text-accent-bright">start.bat</span> once (Portable Mode recommended), and
        pick "Chatterbox Multilingual" in its own Web UI so it's saved as the active engine. After
        that, point this at the install folder and this app starts it for you.
      </p>

      <div className="space-y-2">
        <input
          type="text"
          placeholder="Chatterbox-TTS-Server install folder (contains server.py)…"
          value={installPath}
          onChange={(e) => setDefaultFn("chatterboxInstallPath", e.target.value)}
          className="w-full bg-metal-900 border border-accent/25 px-3 py-2 text-base text-neutral-100 outline-none focus:border-accent"
        />
        <div className="flex items-center gap-3">
          <input
            type="number"
            value={port}
            onChange={(e) => setDefaultFn("chatterboxPort", parseInt(e.target.value) || 8004)}
            className="w-28 bg-metal-900 border border-accent/25 px-3 py-2 text-base text-neutral-100 outline-none focus:border-accent"
          />
          <button
            onClick={startServer}
            disabled={starting || !installPath}
            className="btn cut-sm btn-primary px-4 py-2 text-sm font-display font-semibold uppercase tracking-[0.1em] text-accent-bright disabled:opacity-40"
          >
            {starting ? "Starting… (can take a while first run)" : serverRunning ? "Restart Server" : "Start Server"}
          </button>
          {serverRunning && <span className="text-sm text-emerald-400">running ✓</span>}
        </div>
        {startError && <p className="text-sm text-red-400 whitespace-pre-wrap">{startError}</p>}
      </div>

      {serverRunning && (
        <div className="space-y-3 pt-2 border-t border-accent/15">
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-base">
              <input
                type="radio"
                checked={voiceMode === "predefined"}
                onChange={() => {
                  setVoiceMode("predefined");
                  setSelectedVoice(predefinedVoices[0]?.id ?? "");
                }}
              />
              Predefined voice
            </label>
            <label className="flex items-center gap-2 text-base">
              <input
                type="radio"
                checked={voiceMode === "clone"}
                onChange={() => {
                  setVoiceMode("clone");
                  setSelectedVoice(referenceFiles[0]?.id ?? "");
                }}
              />
              Clone from reference audio
            </label>
          </div>

          {activeVoiceList.length > 0 ? (
            <select
              value={selectedVoice}
              onChange={(e) => setSelectedVoice(e.target.value)}
              className="w-full bg-metal-900 border border-accent/25 px-3 py-2 text-base text-neutral-100 outline-none focus:border-accent"
            >
              {activeVoiceList.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-sm text-neutral-500">
              {voiceMode === "clone"
                ? "No reference audio files found — upload one via the Chatterbox server's own Web UI first."
                : "No predefined voices found on the server."}
            </p>
          )}

          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full bg-metal-900 border border-accent/25 px-3 py-2 text-base text-neutral-100 outline-none focus:border-accent"
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>

          <div className="flex items-center justify-center gap-10 py-2">
            <Knob
              label="Exaggeration"
              value={exaggeration}
              min={0}
              max={2}
              onChange={(v) => setDefaultFn("chatterboxExaggeration", v)}
            />
            <Knob
              label="CFG Weight"
              value={cfgWeight}
              min={0}
              max={1}
              onChange={(v) => setDefaultFn("chatterboxCfgWeight", v)}
            />
          </div>

          <textarea
            value={testText}
            onChange={(e) => setTestText(e.target.value)}
            rows={2}
            className="w-full bg-metal-900 border border-accent/25 px-3 py-2 text-base text-neutral-100 outline-none focus:border-accent resize-none"
          />
          <button
            onClick={runSynthesize}
            disabled={synthesizing || !selectedVoice}
            className="btn cut-sm btn-primary px-4 py-2 text-sm font-display font-semibold uppercase tracking-[0.1em] text-accent-bright disabled:opacity-40"
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
      )}
    </div>
  );
}
