import { useEffect, useState } from "react";

const PROVIDERS = [
  { id: "nvidia", label: "NVIDIA (GLM 5.2 — scene chunking)", required: true },
  { id: "azure", label: "Azure Speech (TTS quality fallback)", required: true },
  { id: "pixabay", label: "Pixabay (background video)", required: true },
  { id: "freesound", label: "Freesound (SFX + music)", required: true },
  { id: "gdrive", label: "Google Drive (render storage)", required: false, future: true },
  { id: "elevenlabs", label: "ElevenLabs (premium TTS)", required: false, future: true },
];

export default function BackendPanel() {
  const [saved, setSaved] = useState<string[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});

  const refresh = () => window.byok.keys.list().then(setSaved);
  useEffect(() => {
    refresh();
  }, []);

  const save = async (id: string) => {
    if (!draft[id]) return;
    await window.byok.keys.set(id, draft[id]);
    setDraft((d) => ({ ...d, [id]: "" }));
    refresh();
  };
  const remove = async (id: string) => {
    await window.byok.keys.remove(id);
    refresh();
  };

  return (
    <div className="p-6 space-y-4">
      <h2 className="label-lit font-display uppercase tracking-[0.18em] text-sm">
        API Keys & Backend
      </h2>
      <p className="text-xs text-zinc-500">
        Keys are encrypted with your OS keychain and never leave this machine.
      </p>

      {PROVIDERS.map((p) => {
        const isSaved = saved.includes(p.id);
        return (
          <div
            key={p.id}
            className={`rounded-xl border p-4 ${
              p.future
                ? "border-zinc-800 bg-zinc-900/40 opacity-60"
                : "border-zinc-700 bg-zinc-900/80"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-zinc-200">
                {p.label}
                {p.future && (
                  <span className="ml-2 rounded bg-amber-900/40 px-2 py-0.5 text-[10px] text-amber-400">
                    COMING SOON
                  </span>
                )}
              </span>
              {isSaved && !p.future && (
                <span className="text-xs text-emerald-400">saved ✓</span>
              )}
            </div>

            {!p.future && (
              <div className="flex gap-2">
                <input
                  type="password"
                  placeholder={isSaved ? "Replace key…" : "Paste key…"}
                  value={draft[p.id] ?? ""}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, [p.id]: e.target.value }))
                  }
                  className="flex-1 rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500"
                />
                <button
                  onClick={() => save(p.id)}
                  className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-black hover:bg-amber-500"
                >
                  Save
                </button>
                {isSaved && (
                  <button
                    onClick={() => remove(p.id)}
                    className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-400 hover:text-red-400"
                  >
                    Clear
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
