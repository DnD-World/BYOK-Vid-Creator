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
import { useProjectStore } from "../../store/useProjectStore";

interface RenderResult {
  outputPath: string;
  frames: number;
}

export function RenderBar() {
  const render = useProjectStore((s) => s.render);
  const fps = useProjectStore((s) => s.fps);
  const waveform = useProjectStore((s) => s.waveform);
  const speakers = useProjectStore((s) => s.speakers);

  const [durationSec, setDurationSec] = useState(5);
  const [audioPath, setAudioPath] = useState<string | null>(null);
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
    if (p) setAudioPath(p);
  }

  async function start() {
    setBusy(true);
    setError(null);
    setResult(null);
    setPct(0);
    setNote("Starting…");

    try {
      const res = await window.byok.render.start({
        waveform,
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
        })),
        width: render.width,
        height: render.height,
        fps,
        durationSec,
        audioFilePath: audioPath,
        // Speaker sizes are authored in preview-canvas pixels; the renderer
        // scales them up against this.
        authoredWidth: render.width,
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

      <label className="flex items-center gap-3">
        <span className="label-etched whitespace-nowrap">Length</span>
        <input
          type="number"
          min={1}
          max={600}
          value={durationSec}
          disabled={busy}
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
          {audioPath ? "Change Audio" : "Attach Audio"}
        </HudButton>
        {audioPath && (
          <button
            onClick={() => setAudioPath(null)}
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
