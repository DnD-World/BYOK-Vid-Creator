// ---------------------------------------------------------------------------
// Render controls.
//
// Deliberately minimal: pick a length, optionally attach a narration WAV,
// press render, watch a bar, open the folder. The point of this first pass is
// to make the pipeline visible and provable end to end, not to be a full
// export dialog.
//
// The narration WAV is chosen by hand here rather than picked up automatically
// from the Narration panel — that panel currently keeps its result in local
// component state, so there's nothing global to read. Lifting it into the
// project store is the follow-up that makes this automatic.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";
import { HudButton } from "../ui/HudButton";
import { Toggle } from "../ui/Toggle";
import { useProjectStore } from "../../store/useProjectStore";

interface RenderResult {
  outputPath: string;
  frames: number;
}

export function RenderBar() {
  const render = useProjectStore((s) => s.render);
  const fps = useProjectStore((s) => s.fps);
  const musicWaveform = useProjectStore((s) => s.musicWaveform);
  const musicColor = useProjectStore((s) => s.musicColor);
  const speakers = useProjectStore((s) => s.speakers);
  const narration = useProjectStore((s) => s.narration);
  const subtitles = useProjectStore((s) => s.subtitles);
  const visemeFadeMs = useProjectStore((s) => s.visemeFadeMs);
  const idleMotion = useProjectStore((s) => s.idleMotion);
  const attachedAudio = useProjectStore((s) => s.attachedAudio);
  const setAttachedAudio = useProjectStore((s) => s.setAttachedAudio);
  const [analyzing, setAnalyzing] = useState(false);

  const [durationSec, setDurationSec] = useState(5);
  const [audioPath, setAudioPath] = useState<string | null>(null);
  const [matchNarration, setMatchNarration] = useState(true);

  // The combined narration's length is the end of its last segment. Rounded up
  // so the final word is never clipped by a partial second.
  const narrationSec = narration
    ? Math.max(1, Math.ceil(Math.max(...narration.segments.map((s) => s.endMs)) / 1000))
    : null;

  // A hand-picked file always wins — that's the override. Otherwise the most
  // recent narration is used automatically.
  const effectiveAudioPath = audioPath ?? narration?.filePath ?? null;
  const effectiveDuration =
    matchNarration && narrationSec && !audioPath ? narrationSec : durationSec;
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RenderResult | null>(null);

  // Subscribe once. The unsubscribe matters: without it every remount would
  // stack another listener and progress would arrive multiplied.
  const busyRef = useRef(busy);
  busyRef.current = busy;
  useEffect(() => {
    return window.byok.render.onProgress(({ pct, note }) => {
      if (!busyRef.current) return;
      setPct(pct);
      if (note) setNote(note);
    });
  }, []);

  async function pickAudio() {
    const p = await window.byok.dialog.openFile([
      { name: "Audio", extensions: ["wav"] },
    ]);
    if (!p) return;
    setAudioPath(p);
    // Analyse it immediately so the waveform reacts to the attached file the
    // same way it reacts to generated narration. Without this the file plays
    // in the render while the waveform animates to a sine wave — which is
    // exactly what it used to do.
    setAnalyzing(true);
    try {
      const analysis = await window.byok.audio.analyzeFile(p);
      setAttachedAudio({ filePath: p, analysis });
    } catch (e) {
      setAttachedAudio({ filePath: p, analysis: null });
      setError(
        `Attached the audio, but couldn't analyse it (${e instanceof Error ? e.message : String(e)}). ` +
          "It will still play; the waveform just won't follow it. 16-bit PCM WAV analyses reliably."
      );
    } finally {
      setAnalyzing(false);
    }
  }

  async function start() {
    setBusy(true);
    setError(null);
    setResult(null);
    setPct(0);
    setNote("Starting…");

    try {
      const res = await window.byok.render.start({
        musicWaveform,
        musicColor,
        // Only the fields the video needs — the sprite sheet and voice
        // assignments aren't used by the renderer yet.
        speakers: speakers.map((sp) => ({
          id: sp.id,
          label: sp.label,
          x: sp.x,
          y: sp.y,
          size: sp.size,
          bgColor: sp.bgColor,
          borderColor: sp.borderColor,
          bgOpacity: sp.bgOpacity,
          borderOpacity: sp.borderOpacity,
          outlineShape: sp.outlineShape,
          waveform: sp.waveform,
          // Paths, not URLs — main copies the files into the render's public
          // dir. The puppet wins over the sheet there, as it does in the
          // preview; both are sent so that precedence lives in exactly one
          // place rather than being decided twice.
          sheetPath: sp.sheetPath,
          puppetPath: sp.puppetPath,
        })),
        width: render.width,
        height: render.height,
        fps,
        durationSec: effectiveDuration,
        audioFilePath: effectiveAudioPath,
        // Whichever audio is actually in the video is the one that drives the
        // waveform.
        analysis: audioPath ? attachedAudio?.analysis ?? null : narration?.analysis ?? null,
        subtitles,
        visemeFadeMs,
        idleMotion,
        // Same reasoning: subtitles are only meaningful against the narration
        // whose timings produced them.
        narrationSegments: audioPath ? [] : narration?.segments ?? [],
      });

      if (res.ok) {
        setResult({ outputPath: res.outputPath, frames: res.frames });
        setNote("Done");
        setPct(100);
      } else {
        setError(res.error ?? "Render failed.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="label-etched">Render</h2>

      {narration && narrationSec && (
        <div className="border border-accent/25 bg-metal-800/60 px-3 py-2 space-y-2">
          <p className="text-sm text-neutral-300">
            Narration ready — {narrationSec}s, {narration.segments.length} lines.
            {audioPath ? " (overridden below)" : " Attached automatically."}
          </p>
          <Toggle
            label="Match video length to narration"
            checked={matchNarration}
            onChange={setMatchNarration}
          />
        </div>
      )}

      <label className="flex items-center gap-3">
        <span className="label-etched whitespace-nowrap">Length</span>
        <input
          type="number"
          min={1}
          max={600}
          value={effectiveDuration}
          disabled={busy || (matchNarration && !!narrationSec && !audioPath)}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) setDurationSec(Math.max(1, Math.min(600, Math.round(n))));
          }}
          className="w-20 bg-black/40 border border-accent/30 px-2 py-1 text-accent-bright"
        />
        <span className="label-etched">sec</span>
      </label>

      <div className="flex items-center gap-2">
        <HudButton onClick={pickAudio}>
          {analyzing
            ? "Analysing…"
            : audioPath
              ? "Change Audio"
              : narration
                ? "Use Different Audio"
                : "Attach Audio"}
        </HudButton>
        {audioPath && (
          <button
            onClick={() => {
              setAudioPath(null);
              setAttachedAudio(null);
            }}
            className="label-etched underline hover:text-accent-bright"
          >
            clear
          </button>
        )}
      </div>
      {audioPath && (
        <p className="text-xs text-neutral-500 break-all">{audioPath}</p>
      )}

      <HudButton active={!busy} onClick={busy ? undefined : start}>
        {busy ? "Rendering…" : "▶ Render Video"}
      </HudButton>

      {busy && (
        <div className="flex flex-col gap-1">
          <div className="h-2 bg-black/50 border border-accent/30">
            <div
              className="h-full bg-accent transition-[width] duration-200"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-xs text-neutral-400">
            {pct}% · {note}
          </p>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-400 break-words">{error}</p>
      )}

      {result && !busy && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-neutral-400 break-all">
            {result.frames} frames → {result.outputPath}
          </p>
          <HudButton onClick={() => window.byok.storage.openOutputDir()}>
            Open Folder
          </HudButton>
        </div>
      )}
    </section>
  );
}
