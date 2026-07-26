import { useState } from "react";
import { useProjectStore } from "../../store/useProjectStore";
import { useChatterboxVoicesStore } from "../../store/useChatterboxVoicesStore";
import { parseScript } from "../../lib/narration/parseScript";

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

  const predefinedVoices = useChatterboxVoicesStore((s) => s.predefinedVoices);
  const referenceFiles = useChatterboxVoicesStore((s) => s.referenceFiles);
  const serverRunning = useChatterboxVoicesStore((s) => s.serverRunning);

  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [unmatchedLines, setUnmatchedLines] = useState<string[]>([]);
  const [result, setResult] = useState<NarrationResult | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

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
      return !sp?.chatterboxVoiceRef;
    });
    if (missingVoice) {
      setGenError(`Speaker "${missingVoice.speakerLabel}" has no Chatterbox voice assigned below.`);
      setGenerating(false);
      return;
    }

    try {
      const resolvedSegments = segments.map((seg) => {
        const sp = speakerById.get(seg.speakerId)!;
        return {
          speakerId: seg.speakerId,
          speakerLabel: seg.speakerLabel,
          text: seg.text,
          language,
          voiceMode: sp.chatterboxVoiceMode ?? "predefined",
          predefinedVoiceId: sp.chatterboxVoiceMode === "clone" ? undefined : sp.chatterboxVoiceRef,
          referenceAudioFilename: sp.chatterboxVoiceMode === "clone" ? sp.chatterboxVoiceRef : undefined,
        };
      });

      const res = await window.byok.tts.generateNarration(resolvedSegments);
      setResult(res);
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
      <p className="text-sm text-neutral-400">
        Write your script as one line per speech, formatted "Label: text" — the label must match a
        speaker's label exactly (case-insensitive). Generates one combined audio file, with each
        segment's timing preserved for later subtitle/lip-sync work.
      </p>

      {!serverRunning && (
        <p className="text-sm text-accent-bright border border-accent-deep/40 bg-accent-deep/10 px-3 py-2">
          Chatterbox server isn't running — start it from Backend Settings first.
        </p>
      )}

      <div className="border border-accent/25 bg-metal-800/60 p-4 space-y-3">
        <h3 className="label-lit text-sm">Speaker Voices</h3>
        {speakers.length === 0 && <p className="text-sm text-neutral-500">No speakers yet — add some from the left rail.</p>}
        {speakers.map((sp) => (
          <div key={sp.id} className="flex flex-wrap items-center gap-3 border-b border-accent/10 pb-3 last:border-0 last:pb-0">
            <span className="text-base text-neutral-200 min-w-[100px]">{sp.label}</span>
            <select
              value={sp.chatterboxVoiceMode ?? "predefined"}
              onChange={(e) =>
                updateSpeaker(sp.id, {
                  chatterboxVoiceMode: e.target.value as "predefined" | "clone",
                  chatterboxVoiceRef: undefined,
                })
              }
              className="bg-metal-900 border border-accent/25 px-2 py-1.5 text-sm text-neutral-300 outline-none focus:border-accent"
            >
              <option value="predefined">Predefined</option>
              <option value="clone">Clone</option>
            </select>
            <select
              value={sp.chatterboxVoiceRef ?? ""}
              onChange={(e) => updateSpeaker(sp.id, { chatterboxVoiceRef: e.target.value || undefined })}
              className="flex-1 min-w-[160px] bg-metal-900 border border-accent/25 px-2 py-1.5 text-sm text-neutral-300 outline-none focus:border-accent"
            >
              <option value="">No voice assigned</option>
              {(sp.chatterboxVoiceMode === "clone" ? referenceFiles : predefinedVoices).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
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
        disabled={generating || !serverRunning || !script.trim()}
        className="hud-btn hud-btn-active px-4 py-2 text-sm font-display font-semibold uppercase tracking-[0.1em] text-accent-bright disabled:opacity-40"
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
              <div key={i} className="text-sm text-neutral-400 flex gap-2">
                <span className="text-accent-bright shrink-0">
                  {(seg.startMs / 1000).toFixed(1)}s–{(seg.endMs / 1000).toFixed(1)}s
                </span>
                <span className="shrink-0 text-neutral-300">{seg.speakerLabel}:</span>
                <span>{seg.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
