import { useEffect, useState } from "react";
import { useSettingsStore } from "../../store/useSettingsStore";
import { useProjectStore } from "../../store/useProjectStore";
import { useTemplatesStore } from "../../store/useTemplatesStore";

const PROVIDERS = [
  { id: "nvidia", label: "NVIDIA (GLM 5.2 — scene chunking)", required: true },
  { id: "azure", label: "Azure Speech (TTS quality fallback)", required: true },
  { id: "pixabay", label: "Pixabay (background video)", required: true },
  { id: "jamendo", label: "Jamendo (background music)", required: true },
  { id: "freesound", label: "Freesound (SFX)", required: true },
  { id: "gdrive", label: "Google Drive (render storage)", required: false, future: true },
  { id: "elevenlabs", label: "ElevenLabs (premium TTS)", required: false, future: true },
];

export default function BackendPanel() {
  const [saved, setSaved] = useState<string[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [encryptionAvailable, setEncryptionAvailable] = useState(true);

  const azureRegion = useSettingsStore((s) => s.defaults.azureRegion);
  const setDefault = useSettingsStore((s) => s.setDefault);

  const render = useProjectStore((s) => s.render);
  const fps = useProjectStore((s) => s.fps);
  const waveform = useProjectStore((s) => s.waveform);
  const speakers = useProjectStore((s) => s.speakers);
  const loadSnapshot = useProjectStore((s) => s.loadSnapshot);

  const templates = useTemplatesStore((s) => s.templates);
  const saveTemplate = useTemplatesStore((s) => s.saveTemplate);
  const deleteTemplate = useTemplatesStore((s) => s.deleteTemplate);
  const [templateName, setTemplateName] = useState("");

  const refresh = () => window.byok.keys.list().then(setSaved);
  useEffect(() => {
    refresh();
    window.byok.keys.encryptionAvailable().then(setEncryptionAvailable);
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
    <div className="p-6 space-y-4 overflow-y-auto h-full">
      <h2 className="label-lit font-display uppercase tracking-[0.18em] text-sm">
        API Keys & Backend
      </h2>
      <p className="text-xs text-zinc-500">
        Keys are encrypted with your OS keychain and never leave this machine.
      </p>
      {!encryptionAvailable && (
        <p className="text-xs text-amber-400 border border-amber-900/50 bg-amber-950/30 rounded-lg px-3 py-2">
          Your OS keychain isn't available, so keys are being saved to a
          local file instead of encrypted storage. They still never leave
          this machine, but consider unlocking your OS keychain for
          stronger protection.
        </p>
      )}

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

            {p.id === "azure" && (
              <div className="mt-2">
                <input
                  type="text"
                  placeholder="Azure region (e.g. eastus)"
                  value={azureRegion}
                  onChange={(e) => setDefault("azureRegion", e.target.value)}
                  className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500"
                />
              </div>
            )}
          </div>
        );
      })}

      <div className="rounded-xl border border-zinc-700 bg-zinc-900/80 p-4 space-y-3">
        <h3 className="label-lit font-display uppercase tracking-[0.18em] text-xs">
          Saved Templates
        </h3>
        <p className="text-xs text-zinc-500">
          Captures render settings, waveform config, and speaker setup —
          not API keys or backend defaults.
        </p>

        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Template name…"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            className="flex-1 rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500"
          />
          <button
            onClick={() => {
              const name = templateName.trim();
              if (!name) return;
              saveTemplate(name, { render, fps, waveform, speakers });
              setTemplateName("");
            }}
            className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-black hover:bg-amber-500"
          >
            Save Current
          </button>
        </div>

        {Object.keys(templates).length === 0 ? (
          <p className="text-xs text-zinc-600">No templates saved yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {Object.entries(templates).map(([name, tpl]) => (
              <div
                key={name}
                className="flex items-center justify-between rounded-lg border border-zinc-700 bg-zinc-950/60 px-3 py-2"
              >
                <div>
                  <div className="text-sm text-zinc-200">{name}</div>
                  <div className="text-[10px] text-zinc-600">
                    {new Date(tpl.savedAt).toLocaleString()}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => loadSnapshot(tpl)}
                    className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-amber-500 hover:text-amber-400"
                  >
                    Load
                  </button>
                  <button
                    onClick={() => deleteTemplate(name)}
                    className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-500 hover:text-red-400"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
