import { useEffect, useState } from "react";
import { useSettingsStore } from "../../store/useSettingsStore";
import { Toggle } from "../ui/Toggle";
import TtsTestPanel from "./TtsTestPanel";
import ChatterboxTestPanel from "./ChatterboxTestPanel";

// Every provider carries its own plain-English explanation and a direct link
// to the page that issues the key. The `access` field is the important one:
// "instant" vs "approval" is the difference between a key you can have in two
// minutes and one you wait days for, and not knowing which is which is what
// makes this screen feel like a wall.
type Access = "instant" | "approval" | "future";

interface Provider {
  id: string;
  label: string;
  what: string;
  url: string;
  access: Access;
}

const PROVIDERS: Provider[] = [
  {
    id: "nvidia",
    label: "NVIDIA",
    what: "Writes and polishes your script with GLM-5.2. Free to use.",
    url: "https://build.nvidia.com/",
    access: "instant",
  },
  {
    id: "pixabay",
    label: "Pixabay",
    what: "Background video clips and images.",
    url: "https://pixabay.com/api/docs/",
    access: "instant",
  },
  {
    id: "pexels",
    label: "Pexels",
    what: "Background video clips and images — a second source, so you're not stuck with one library's stock look.",
    url: "https://www.pexels.com/api/",
    access: "instant",
  },
  {
    id: "jamendo",
    label: "Jamendo",
    what: "Background music tracks.",
    url: "https://devportal.jamendo.com/",
    access: "approval",
  },
  {
    id: "freesound",
    label: "Freesound",
    what: "Sound effects.",
    url: "https://freesound.org/apiv2/apply/",
    access: "approval",
  },
  {
    id: "azure",
    label: "Azure Speech",
    what: "Optional backup voice engine. Chatterbox and Piper below cover normal use — you don't need this.",
    url: "https://portal.azure.com/",
    access: "instant",
  },
  {
    id: "gdrive",
    label: "Google Drive",
    what: "Upload finished renders straight to Drive.",
    url: "https://console.cloud.google.com/",
    access: "future",
  },
  {
    id: "elevenlabs",
    label: "ElevenLabs",
    what: "Premium voice engine.",
    url: "https://elevenlabs.io/",
    access: "future",
  },
];

const ACCESS_BADGE: Record<Access, { text: string; className: string }> = {
  instant: {
    text: "FREE · INSTANT",
    className: "bg-emerald-500/15 text-emerald-300",
  },
  approval: {
    text: "NEEDS APPROVAL",
    className: "bg-amber-500/15 text-amber-300",
  },
  future: {
    text: "COMING SOON",
    className: "bg-accent-deep/25 text-accent-bright",
  },
};

interface TestState {
  busy: boolean;
  result?: { ok: boolean; message: string };
}

export default function BackendPanel() {
  const [saved, setSaved] = useState<string[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [tests, setTests] = useState<Record<string, TestState>>({});
  const [encryptionAvailable, setEncryptionAvailable] = useState(true);

  const azureRegion = useSettingsStore((s) => s.defaults.azureRegion);
  const setDefault = useSettingsStore((s) => s.setDefault);
  const accentColor = useSettingsStore((s) => s.accentColor);
  const setAccentColor = useSettingsStore((s) => s.setAccentColor);
  const motionEnabled = useSettingsStore((s) => s.motionEnabled);
  const setMotionEnabled = useSettingsStore((s) => s.setMotionEnabled);

  const refresh = () => window.byok.keys.list().then(setSaved);
  useEffect(() => {
    refresh();
    window.byok.keys.encryptionAvailable().then(setEncryptionAvailable);
  }, []);

  const save = async (id: string) => {
    if (!draft[id]) return;
    await window.byok.keys.set(id, draft[id]);
    setDraft((d) => ({ ...d, [id]: "" }));
    // A previous test result describes the old key, so drop it.
    setTests((t) => ({ ...t, [id]: { busy: false } }));
    refresh();
  };

  const remove = async (id: string) => {
    await window.byok.keys.remove(id);
    setTests((t) => ({ ...t, [id]: { busy: false } }));
    refresh();
  };

  const test = async (id: string) => {
    setTests((t) => ({ ...t, [id]: { busy: true } }));
    try {
      const result = await window.byok.keys.test(id, { azureRegion });
      setTests((t) => ({ ...t, [id]: { busy: false, result } }));
    } catch (e) {
      // Without this the button sticks on "Testing…" forever and the real
      // problem stays invisible. The common cause is the Electron main
      // process still running older code that has no keys:test handler —
      // the UI hot-reloads, main does not.
      const msg = e instanceof Error ? e.message : String(e);
      setTests((t) => ({
        ...t,
        [id]: {
          busy: false,
          result: {
            ok: false,
            message: msg.includes("No handler registered")
              ? "This build of the app doesn't have the connectivity test yet — fully quit and restart the app (Ctrl+C the dev server and run npm run dev again)."
              : `Test couldn't run — ${msg}`,
          },
        },
      }));
    }
  };

  return (
    <div className="p-6 space-y-4 overflow-y-auto h-full">
      <h2 className="label-lit text-base">API Keys &amp; Backend</h2>
      <p className="text-sm text-neutral-400">
        Keys are encrypted with your OS keychain and never leave this machine.
        Paste a key, press Save, then press Test to confirm it actually works —
        Test makes one real call to the provider.
      </p>

      <div className="border border-accent/25 bg-metal-800/60 p-4 space-y-3">
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
        <Toggle
          label="Interface motion (breathing glow & click effects)"
          checked={motionEnabled}
          onChange={setMotionEnabled}
        />
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
        const isFuture = p.access === "future";
        const badge = ACCESS_BADGE[p.access];
        const state = tests[p.id];
        return (
          <div
            key={p.id}
            className={`border p-4 ${
              isFuture
                ? "border-neutral-800 bg-metal-800/30 opacity-60"
                : "border-accent/25 bg-metal-800/60"
            }`}
          >
            <div className="flex items-center justify-between mb-1 gap-3">
              <span className="text-base text-neutral-200">
                {p.label}
                <span className={`ml-2 px-2 py-0.5 text-sm ${badge.className}`}>
                  {badge.text}
                </span>
              </span>
              {isSaved && !isFuture && (
                <span className="text-sm text-emerald-400 shrink-0">saved ✓</span>
              )}
            </div>

            <p className="text-sm text-neutral-400 mb-2">{p.what}</p>

            <a
              href={p.url}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-accent-bright underline hover:text-accent inline-block mb-3"
            >
              Get a key →
            </a>

            {!isFuture && (
              <>
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
                  <button
                    onClick={() => save(p.id)}
                    className="hud-btn hud-btn-active px-4 py-2 text-sm font-display font-semibold uppercase tracking-[0.1em] text-accent-bright"
                  >
                    Save
                  </button>
                  {isSaved && (
                    <>
                      <button
                        onClick={() => test(p.id)}
                        disabled={state?.busy}
                        className="hud-btn px-4 py-2 text-sm font-display uppercase tracking-[0.1em] text-neutral-300 hover:text-accent-bright disabled:opacity-40"
                      >
                        {state?.busy ? "Testing…" : "Test"}
                      </button>
                      <button
                        onClick={() => remove(p.id)}
                        className="hud-btn px-4 py-2 text-sm font-display uppercase tracking-[0.1em] text-neutral-400 hover:text-red-400"
                      >
                        Clear
                      </button>
                    </>
                  )}
                </div>

                {state?.result && (
                  <p
                    className={`text-sm mt-2 ${
                      state.result.ok ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {state.result.ok ? "✓ " : "✕ "}
                    {state.result.message}
                  </p>
                )}
              </>
            )}

            {p.id === "azure" && !isFuture && (
              <div className="mt-2">
                <input
                  type="text"
                  placeholder="Azure region (e.g. eastus)"
                  value={azureRegion}
                  onChange={(e) => setDefault("azureRegion", e.target.value)}
                  className="w-full bg-metal-900 border border-accent/25 px-3 py-2 text-base text-neutral-100 outline-none focus:border-accent"
                />
                <p className="text-sm text-neutral-500 mt-1">
                  Not a key — the region your Azure Speech resource was created in.
                  Testing the key needs this too.
                </p>
              </div>
            )}
          </div>
        );
      })}

      <div className="border border-accent/25 bg-metal-800/60 p-4">
        <h3 className="label-lit text-sm mb-2">Voice Engines — no API key needed</h3>
        <p className="text-sm text-neutral-400">
          Chatterbox and Piper run entirely on your own machine, so there's
          nothing to sign up for and nothing to paste. What they ask for below
          are <em>folder paths</em> on this computer — where you installed them —
          not keys. Chatterbox is the quality voice; Piper is the fast one for
          quick tests.
        </p>
      </div>

      <ChatterboxTestPanel />

      <TtsTestPanel />
    </div>
  );
}
