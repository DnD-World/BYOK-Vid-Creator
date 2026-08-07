// ---------------------------------------------------------------------------
// Sound effects — a bark, a whistle, a clicker, pinned to a moment.
//
// Two sources, one list: a file from your own disk, or a CC0 search of
// Freesound. They are the same thing once added, because the point is placing
// a sound at a time, not where it came from.
//
// The time is typed in seconds rather than dragged on a timeline. There is no
// timeline in this app, and inventing one for a handful of barks would be a
// week of work to replace a number that a user can already read off the
// subtitle they want it to land on.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { HudButton } from "../ui/HudButton";
import { useProjectStore } from "../../store/useProjectStore";

type Hit = Awaited<ReturnType<typeof window.byok.sound.search>>["hits"][number];

export function SfxPanel() {
  const sfx = useProjectStore((s) => s.sfx);
  const addSfx = useProjectStore((s) => s.addSfx);
  const updateSfx = useProjectStore((s) => s.updateSfx);
  const removeSfx = useProjectStore((s) => s.removeSfx);
  const narration = useProjectStore((s) => s.narration);

  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Where a newly added effect lands: the end of the narration, or 0. Adding
   *  everything at 0s and making the user move each one is the worse default —
   *  the end is at least somewhere you can hear it. */
  const nextAtMs = narration?.segments.at(-1)?.endMs
    ? Math.round(narration.segments.at(-1)!.endMs / 2)
    : 0;

  async function addFromDisk() {
    const p = await window.byok.dialog.openFile([
      { name: "Audio", extensions: ["wav", "mp3", "m4a", "ogg", "flac"] },
    ]);
    if (!p) return;
    addSfx({
      filePath: p,
      label: p.split(/[\\/]/).pop() ?? "sound",
      atMs: nextAtMs,
      volume: 0.8,
    });
  }

  async function runSearch() {
    if (!query.trim()) return;
    setBusy("Searching…");
    setError(null);
    try {
      const res = await window.byok.sound.search(query.trim());
      setHits(res.hits);
      setNotes(res.notes);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function useHit(hit: Hit) {
    setBusy("Fetching…");
    setError(null);
    try {
      const filePath = await window.byok.media.download(hit.id, hit.url);
      addSfx({ filePath, label: hit.name, atMs: nextAtMs, volume: 0.8 });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <HudButton onClick={addFromDisk} disabled={!!busy}>
          Add from disk
        </HudButton>
      </div>

      <div className="flex items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && runSearch()}
          placeholder="dog bark"
          className="flex-1 min-w-0 bg-black/60 px-3 py-2 text-neutral-200 outline-none border border-accent/25"
        />
        <HudButton onClick={runSearch} disabled={!!busy}>
          Search
        </HudButton>
      </div>
      <p className="text-sm text-neutral-500">
        Freesound, restricted to CC0 — no attribution, commercial use, no strings. The
        other licences there need per-sound credit this app has nowhere to put, so they
        aren't offered.
      </p>

      {busy && <p className="label-etched text-accent-bright">{busy}</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}
      {notes.map((n, i) => (
        <p key={i} className="text-sm text-amber-400">{n}</p>
      ))}

      {hits.length > 0 && (
        <div className="space-y-1 max-h-56 overflow-y-auto border border-accent/15 p-2">
          {hits.map((h) => (
            <button
              key={h.id}
              onClick={() => useHit(h)}
              disabled={!!busy}
              className="w-full text-left px-2 py-1 hover:bg-accent/10"
              title={`${h.author} · ${h.license}`}
            >
              <span className="text-sm text-neutral-300">{h.name}</span>
              <span className="text-sm text-neutral-600"> · {h.durationSec}s</span>
            </button>
          ))}
        </div>
      )}

      <div className="space-y-3 border-t border-accent/15 pt-3">
        {sfx.length === 0 && (
          <p className="text-sm text-neutral-500">
            No effects yet. Each one plays once, at the second you give it, over
            everything else — effects aren't ducked.
          </p>
        )}
        {sfx.map((c) => (
          <div key={c.id} className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-sm text-neutral-300 truncate flex-1" title={c.filePath}>
                {c.label}
              </span>
              <button
                onClick={() => removeSfx(c.id)}
                className="label-etched underline hover:text-red-400 shrink-0"
              >
                remove
              </button>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5">
                <span className="label-etched">at</span>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={(c.atMs / 1000).toFixed(1)}
                  onChange={(e) => {
                    const secs = Number(e.target.value);
                    if (Number.isFinite(secs)) {
                      updateSfx(c.id, { atMs: Math.max(0, Math.round(secs * 1000)) });
                    }
                  }}
                  className="w-20 bg-black/40 border border-accent/30 px-2 py-1 text-accent-bright"
                />
                <span className="label-etched">s</span>
              </label>
              <label className="flex items-center gap-1.5 flex-1">
                <span className="label-etched">vol</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={c.volume}
                  onChange={(e) => updateSfx(c.id, { volume: parseFloat(e.target.value) })}
                  className="hud-slider flex-1"
                />
                <span className="text-sm text-neutral-500 w-9 text-right">
                  {Math.round(c.volume * 100)}%
                </span>
              </label>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
