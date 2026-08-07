import { useEffect, useState } from "react";
import { useProjectStore } from "../../store/useProjectStore";
import { useSettingsStore } from "../../store/useSettingsStore";
import { useChatterboxVoicesStore } from "../../store/useChatterboxVoicesStore";
import { useVoicesStore } from "../../store/useVoicesStore";
import { parseScript } from "../../lib/narration/parseScript";
import { Slider } from "../ui/Slider";

const LANGUAGES = [
  { code: "el", label: "Greek" },
  { code: "en", label: "English" },
];

interface NarrationResult {
  filePath: string;
  segments: { speakerId: string; speakerLabel: string; text: string; startMs: number; endMs: number }[];
}

/**
 * The actual Phase 2 goal: turn a script into ONE combined narration audio
 * file using each speaker's assigned Chatterbox voice — not just a
 * standalone test-panel preview. Requires the Chatterbox server already
 * running (start it from Backend Settings first) and each speaker to have
 * a voice assigned below.
 */
export default function NarrationPanel() {
  const speakers = useProjectStore((s) => s.speakers);
  const updateSpeaker = useProjectStore((s) => s.updateSpeaker);
  const script = useProjectStore((s) => s.script);
  const setScript = useProjectStore((s) => s.setScript);
  const language = useProjectStore((s) => s.language);
  const setLanguage = useProjectStore((s) => s.setLanguage);
  const setNarration = useProjectStore((s) => s.setNarration);
  const pauseSameMs = useProjectStore((s) => s.pauseSameMs);
  const pauseTurnMs = useProjectStore((s) => s.pauseTurnMs);
  const setPauses = useProjectStore((s) => s.setPauses);
  const exaggeration = useSettingsStore((s) => s.defaults.chatterboxExaggeration);
  const cfgWeight = useSettingsStore((s) => s.defaults.chatterboxCfgWeight);
  const piperPythonPath = useSettingsStore((s) => s.defaults.piperPythonPath);
  const piperVoices = useVoicesStore((s) => s.voices);

  const predefinedVoices = useChatterboxVoicesStore((s) => s.predefinedVoices);
  const referenceFiles = useChatterboxVoicesStore((s) => s.referenceFiles);
  const serverRunning = useChatterboxVoicesStore((s) => s.serverRunning);

  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [unmatchedLines, setUnmatchedLines] = useState<string[]>([]);
  const [result, setResult] = useState<NarrationResult | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);

  // GLM-5.2 took 274s on a real key here — well inside the 5 minute timeout,
  // but a button that just says "Drafting…" for four and a half minutes is
  // indistinguishable from a hang. A ticking counter is the whole fix.
  const [draftSec, setDraftSec] = useState(0);
  useEffect(() => {
    if (!drafting) return;
    setDraftSec(0);
    const id = window.setInterval(() => setDraftSec((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [drafting]);

  const runDraft = async () => {
    // Every one of these used to be a silent `return`, which is exactly why
    // the button appeared to do nothing at all. Always say why.
    setDraftError(null);
    if (speakers.length === 0) {
      setDraftError("Add at least one speaker on the Canvas tab first — the draft is written as dialogue between your speakers.");
      return;
    }
    if (!topic.trim()) {
      setDraftError("Enter a topic first.");
      return;
    }
    if (script.trim() && !window.confirm("This will replace your current script. Continue?")) return;

    setDrafting(true);
    try {
      const languageName = LANGUAGES.find((l) => l.code === language)?.label ?? language;
      const draft = await window.byok.llm.draftScript({
        topic,
        speakerLabels: speakers.map((s) => s.label),
        languageName,
        tone: tone.trim() || undefined,
      });
      setScript(draft);
    } catch (e: any) {
      setDraftError(e?.message ?? String(e));
    } finally {
      setDrafting(false);
    }
  };

  const generate = async () => {
    setGenerating(true);
    setGenError(null);
    setResult(null);
    setAudioUrl(null);

    const { segments, unmatchedLines: unmatched } = parseScript(script, speakers);
    setUnmatchedLines(unmatched);

    if (segments.length === 0) {
      setGenError("No script lines matched a speaker label — check the format is \"Label: text\" per line.");
      setGenerating(false);
      return;
    }

    const speakerById = new Map(speakers.map((s) => [s.id, s]));
    const missingVoice = segments.find((seg) => {
      const sp = speakerById.get(seg.speakerId);
      if (!sp) return true;
      return (sp.ttsEngine ?? "chatterbox") === "piper"
        ? !sp.voiceId
        : !sp.chatterboxVoiceRef;
    });
    if (missingVoice) {
      const sp = speakerById.get(missingVoice.speakerId);
      const engine = (sp?.ttsEngine ?? "chatterbox") === "piper" ? "Piper" : "Chatterbox";
      setGenError(`Speaker "${missingVoice.speakerLabel}" has no ${engine} voice assigned below.`);
      setGenerating(false);
      return;
    }

    // Chatterbox needs its server up; Piper starts its own on demand, so a
    // Piper-only script must not be blocked by a stopped Chatterbox.
    if (!serverRunning && segments.some((seg) => (speakerById.get(seg.speakerId)?.ttsEngine ?? "chatterbox") === "chatterbox")) {
      setGenError("Chatterbox server isn't running — start it in Backend Settings, or switch those speakers to Piper.");
      setGenerating(false);
      return;
    }

    try {
      const resolvedSegments = segments.map((seg) => {
        const sp = speakerById.get(seg.speakerId)!;
        const usePiper = (sp.ttsEngine ?? "chatterbox") === "piper";
        return {
          speakerId: seg.speakerId,
          speakerLabel: seg.speakerLabel,
          text: seg.text,
          language,
          engine: usePiper ? ("piper" as const) : ("chatterbox" as const),
          piperPythonPath: usePiper ? piperPythonPath : undefined,
          piperOnnxPath: usePiper ? sp.voiceId : undefined,
          voiceMode: sp.chatterboxVoiceMode ?? "predefined",
          predefinedVoiceId: sp.chatterboxVoiceMode === "clone" ? undefined : sp.chatterboxVoiceRef,
          referenceAudioFilename: sp.chatterboxVoiceMode === "clone" ? sp.chatterboxVoiceRef : undefined,
          exaggeration,
          cfgWeight,
        };
      });

      const res = await window.byok.tts.generateNarration(
        resolvedSegments,
        speakers.map((s) => s.id),
        { sameMs: pauseSameMs, turnMs: pauseTurnMs }
      );
      setResult(res);
      // Publish it so the render bar can attach it and match its length
      // without the user hand-picking the file, and so the waveform can be
      // driven by the real audio instead of the placeholder animation.
      setNarration({
        filePath: res.filePath,
        segments: res.segments,
        analysis: res.analysis,
      });
      const buf = await window.byok.storage.readFile(res.filePath);
      const blob = new Blob([buf], { type: "audio/wav" });
      setAudioUrl(URL.createObjectURL(blob));
    } catch (e: any) {
      setGenError(e?.message ?? String(e));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="p-6 space-y-4 overflow-y-auto h-full">
      <h2 className="label-lit text-base">Narration</h2>
      <p className="text-sm">
        Write your script as one line per speech, formatted "Label: text" — the label must match a
        speaker's label exactly (case-insensitive). Generates one combined audio file, with each
        segment's timing preserved for later subtitle/lip-sync work.
      </p>

      {!serverRunning && speakers.some((sp) => (sp.ttsEngine ?? "chatterbox") === "chatterbox") && (
        <p className="text-sm text-accent-bright border border-accent-deep/40 bg-accent-deep/10 px-3 py-2">
          Chatterbox server isn't running — start it from Backend Settings, or set those
          speakers to Piper, which needs no server of its own.
        </p>
      )}

      <div className="border border-accent/25 bg-metal-800/60 p-4 space-y-3">
        <h3 className="label-lit text-sm">Speaker Voices</h3>
        {speakers.length === 0 && <p className="text-sm text-neutral-500">No speakers yet — add some from the left rail.</p>}
        {speakers.map((sp) => (
          <div key={sp.id} className="flex flex-wrap items-center gap-3 border-b border-accent/10 pb-3 last:border-0 last:pb-0">
            <span className="text-base text-neutral-200 min-w-[100px]">{sp.label}</span>

            <select
              value={sp.ttsEngine ?? "chatterbox"}
              onChange={(e) => updateSpeaker(sp.id, { ttsEngine: e.target.value as "chatterbox" | "piper" })}
              className="bg-metal-900 border border-accent/25 px-2 py-1.5 text-sm outline-none focus:border-accent"
            >
              <option value="piper">Piper (fast)</option>
              <option value="chatterbox">Chatterbox (quality)</option>
            </select>

            {(sp.ttsEngine ?? "chatterbox") === "piper" ? (
              <select
                value={sp.voiceId ?? ""}
                onChange={(e) => updateSpeaker(sp.id, { voiceId: e.target.value || undefined })}
                className="flex-1 min-w-[160px] bg-metal-900 border border-accent/25 px-2 py-1.5 text-sm outline-none focus:border-accent"
              >
                <option value="">
                  {piperVoices.length === 0 ? "No voices — scan in Backend Settings" : "No voice assigned"}
                </option>
                {piperVoices.map((v) => (
                  <option key={v.id} value={v.onnxPath}>
                    {v.name}
                  </option>
                ))}
              </select>
            ) : (
              <>
                <select
                  value={sp.chatterboxVoiceMode ?? "predefined"}
                  onChange={(e) =>
                    updateSpeaker(sp.id, {
                      chatterboxVoiceMode: e.target.value as "predefined" | "clone",
                      chatterboxVoiceRef: undefined,
                    })
                  }
                  className="bg-metal-900 border border-accent/25 px-2 py-1.5 text-sm outline-none focus:border-accent"
                >
                  <option value="predefined">Predefined</option>
                  <option value="clone">Clone</option>
                </select>
                <select
                  value={sp.chatterboxVoiceRef ?? ""}
                  onChange={(e) => updateSpeaker(sp.id, { chatterboxVoiceRef: e.target.value || undefined })}
                  className="flex-1 min-w-[160px] bg-metal-900 border border-accent/25 px-2 py-1.5 text-sm outline-none focus:border-accent"
                >
                  <option value="">No voice assigned</option>
                  {(sp.chatterboxVoiceMode === "clone" ? referenceFiles : predefinedVoices).map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <span className="label-etched text-sm">Language</span>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="bg-metal-900 border border-accent/25 px-3 py-2 text-base text-neutral-100 outline-none focus:border-accent"
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
      </div>

      <div className="border border-accent/25 bg-metal-800/60 p-4 space-y-3">
        <h3 className="label-lit text-sm">Pacing</h3>
        <p className="text-sm">
          Silence inserted between lines. Two people swapping turns with no gap
          at all is the clearest tell that a conversation was assembled rather
          than recorded. Takes effect the next time you generate.
        </p>
        <Slider
          label="Breath (same speaker)" value={pauseSameMs} min={0} max={800} step={10}
          onChange={(v) => setPauses({ sameMs: Math.round(v) })}
          format={(v) => `${Math.round(v)} ms`}
        />
        <Slider
          label="Beat (speaker changes)" value={pauseTurnMs} min={0} max={1500} step={10}
          onChange={(v) => setPauses({ turnMs: Math.round(v) })}
          format={(v) => `${Math.round(v)} ms`}
        />
      </div>

      <div className="border border-accent/25 bg-metal-800/60 p-4 space-y-2">
        <h3 className="label-lit text-sm">Draft Script with GLM-5.2</h3>
        <p className="text-sm">
          Optional — describe what the video should be about and get a starting draft in the right
          format, which you can then edit freely below. Needs an NVIDIA key in Backend Settings.
        </p>
        <input
          type="text"
          placeholder="Topic, e.g. 'why dogs love belly rubs'…"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          className="w-full bg-metal-900 border border-accent/25 px-3 py-2 text-base text-neutral-100 outline-none focus:border-accent"
        />
        <input
          type="text"
          placeholder="Tone (optional), e.g. 'playful', 'informative'…"
          value={tone}
          onChange={(e) => setTone(e.target.value)}
          className="w-full bg-metal-900 border border-accent/25 px-3 py-2 text-base text-neutral-100 outline-none focus:border-accent"
        />
        <button
          onClick={runDraft}
          // Only ever disabled while a request is in flight. Disabling it for
          // missing input is what hid the reason from the user.
          disabled={drafting}
          className="btn cut-sm px-4 py-2 text-sm font-display uppercase tracking-[0.1em] hover:text-accent-bright disabled:opacity-40"
        >
          {drafting ? `Drafting… ${draftSec}s` : "Generate Draft"}
        </button>
        {drafting && (
          <p className="text-sm text-neutral-500">
            GLM-5.2 is slow — a few minutes is normal, and it gives up at five.
          </p>
        )}
        {draftError && <p className="text-sm text-red-400 whitespace-pre-wrap">{draftError}</p>}
      </div>

      <textarea
        value={script}
        onChange={(e) => setScript(e.target.value)}
        rows={8}
        placeholder={`${speakers[0]?.label ?? "Speaker 1"}: Hello there!\n${speakers[1]?.label ?? "Speaker 2"}: Hi, good to see you.`}
        className="w-full bg-metal-900 border border-accent/25 px-3 py-2 text-base text-neutral-100 outline-none focus:border-accent resize-none font-mono"
      />

      {unmatchedLines.length > 0 && (
        <div className="text-sm text-accent-bright border border-accent-deep/40 bg-accent-deep/10 px-3 py-2">
          {unmatchedLines.length} line(s) didn't match a speaker and were skipped:
          <ul className="list-disc pl-5 mt-1">
            {unmatchedLines.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </div>
      )}

      <button
        onClick={generate}
        disabled={generating || !script.trim()}
        className="btn cut-sm btn-primary px-4 py-2 text-sm font-display font-semibold uppercase tracking-[0.1em] text-accent-bright disabled:opacity-40"
      >
        {generating ? "Generating…" : "Generate Narration"}
      </button>
      {genError && <p className="text-sm text-red-400 whitespace-pre-wrap">{genError}</p>}

      {audioUrl && result && (
        <div className="border border-accent/25 bg-metal-800/60 p-4 space-y-3">
          <h3 className="label-lit text-sm">Result</h3>
          <audio src={audioUrl} controls className="w-full" />
          <p className="text-sm text-neutral-500">Saved to: {result.filePath}</p>
          <div className="space-y-1">
            {result.segments.map((seg, i) => (
              <div key={i} className="text-sm flex gap-2">
                <span className="text-accent-bright shrink-0">
                  {(seg.startMs / 1000).toFixed(1)}s–{(seg.endMs / 1000).toFixed(1)}s
                </span>
                <span className="shrink-0">{seg.speakerLabel}:</span>
                <span>{seg.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
