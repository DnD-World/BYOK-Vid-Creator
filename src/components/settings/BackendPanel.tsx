import { useEffect, useState } from "react";
import { useSettingsStore } from "../../store/useSettingsStore";
import { useProjectStore } from "../../store/useProjectStore";
import { useTemplatesStore } from "../../store/useTemplatesStore";
import TtsTestPanel from "./TtsTestPanel";

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
  const accentColor = useSettingsStore((s) => s.accentColor);
  const setAccentColor = useSettingsStore((s) => s.setAccentColor);

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
      <h2 className="label-lit text-base">API Keys &amp; Backend</h2>
      <p className="text-sm text-neutral-400">
        Keys are encrypted with your OS keychain and never leave this machine.
      </p>

      <div className="border border-accent/25 bg-metal-800/60 p-4 space-y-2">
        <h3 className="label-lit text-sm">Appearance</h3>
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={accentColor}
            onChange={(e) => setAccentColor(e.target.value)}
            className="h-9 w-9 border border-accent/30 bg-transparent p-0"
          />
          <span className="text-sm text-neutral-400">
            Accent color — recolors glows, highlights, and active states everywhere
          </span>
        </div>
      </div>
      {!encryptionAvailable && (
        <p className="text-sm text-accent-bright border border-accent-deep/40 bg-accent-deep/10 px-3 py-2">
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
            className={`border p-4 ${
              p.future
                ? "border-neutral-800 bg-metal-800/30 opacity-60"
                : "border-accent/25 bg-metal-800/60"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-base text-neutral-200">
                {p.label}
                {p.future && (
                  <span className="ml-2 bg-accent-deep/25 px-2 py-0.5 text-sm text-accent-bright">
                    COMING SOON
                  </span>
                )}
              </span>
              {isSaved && !p.future && (
                <span className="text-sm text-emerald-400">saved ✓</span>
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
                  className="flex-1 bg-metal-900 border border-accent/25 px-3 py-2 text-base text-neutral-100 outline-none focus:border-accent"
                />
                <button onClick={() => save(p.id)} className="hud-btn hud-btn-active px-4 py-2 text-sm font-display font-semibold uppercase tracking-[0.1em] text-accent-bright">
                  Save
                </button>
                {isSaved && (
                  <button onClick={() => remove(p.id)} className="hud-btn px-4 py-2 text-sm font-display uppercase tracking-[0.1em] text-neutral-400 hover:text-red-400">
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
                  className="w-full bg-metal-900 border border-accent/25 px-3 py-2 text-base text-neutral-100 outline-none focus:border-accent"
                />
              </div>
            )}
          </div>
        );
      })}

      <TtsTestPanel />

      <div className="border border-accent/25 bg-metal-800/60 p-4 space-y-3">
        <h3 className="label-lit text-sm">Saved Templates</h3>
        <p className="text-sm text-neutral-400">
          Captures render settings, waveform config, and speaker setup —
          not API keys or backend defaults.
        </p>

        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Template name…"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            className="flex-1 bg-metal-900 border border-accent/25 px-3 py-2 text-base text-neutral-100 outline-none focus:border-accent"
          />
          <button
            onClick={() => {
              const name = templateName.trim();
              if (!name) return;
              saveTemplate(name, { render, fps, waveform, speakers });
              setTemplateName("");
            }}
            className="hud-btn hud-btn-active px-4 py-2 text-sm font-display font-semibold uppercase tracking-[0.1em] text-accent-bright whitespace-nowrap"
          >
            Save Current
          </button>
        </div>

        {Object.keys(templates).length === 0 ? (
          <p className="text-sm text-neutral-500">No templates saved yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {Object.entries(templates).map(([name, tpl]) => (
              <div
                key={name}
                className="flex items-center justify-between border border-accent/20 bg-metal-900/60 px-3 py-2"
              >
                <div>
                  <div className="text-base text-neutral-200">{name}</div>
                  <div className="text-sm text-neutral-500">
                    {new Date(tpl.savedAt).toLocaleString()}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => loadSnapshot(tpl)}
                    className="hud-btn px-3 py-1.5 text-sm font-display uppercase tracking-[0.1em] text-neutral-300 hover:text-accent-bright"
                  >
                    Load
                  </button>
                  <button
                    onClick={() => deleteTemplate(name)}
                    className="hud-btn px-3 py-1.5 text-sm font-display uppercase tracking-[0.1em] text-neutral-500 hover:text-red-400"
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
