// ---------------------------------------------------------------------------
// Saved templates.
//
// Lives in the Canvas left rail, not Backend Settings. A template captures
// render settings, waveform config and speaker setup — every one of which is
// controlled by the sliders directly above this panel. It deliberately does
// NOT capture API keys or backend defaults, which is exactly why it never
// belonged on the backend screen.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { HudButton } from "../ui/HudButton";
import { useProjectStore } from "../../store/useProjectStore";
import { useTemplatesStore } from "../../store/useTemplatesStore";

export function TemplatesPanel() {
  const render = useProjectStore((s) => s.render);
  const fps = useProjectStore((s) => s.fps);
  const waveform = useProjectStore((s) => s.waveform);
  const speakers = useProjectStore((s) => s.speakers);
  const loadSnapshot = useProjectStore((s) => s.loadSnapshot);

  const templates = useTemplatesStore((s) => s.templates);
  const saveTemplate = useTemplatesStore((s) => s.saveTemplate);
  const deleteTemplate = useTemplatesStore((s) => s.deleteTemplate);

  const [name, setName] = useState("");

  const entries = Object.entries(templates);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="label-etched">Saved Looks</h2>
      <p className="text-sm text-neutral-500">
        Saves your frame rate, aspect ratio, waveform and speakers — not your keys.
      </p>

      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Name this look…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 min-w-0 bg-black/40 border border-accent/30 px-2 py-1 text-base text-neutral-100 outline-none focus:border-accent"
        />
        <HudButton
          onClick={() => {
            const trimmed = name.trim();
            if (!trimmed) return;
            saveTemplate(trimmed, { render, fps, waveform, speakers });
            setName("");
          }}
        >
          Save
        </HudButton>
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-neutral-500">Nothing saved yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {entries.map(([key, tpl]) => (
            <div
              key={key}
              className="flex items-center justify-between gap-2 border border-accent/25 bg-metal-800/60 px-3 py-2"
            >
              <div className="min-w-0">
                <div className="text-base text-neutral-200 truncate">{key}</div>
                <div className="text-sm text-neutral-500">
                  {new Date(tpl.savedAt).toLocaleDateString()}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => loadSnapshot(tpl)}
                  className="label-etched underline hover:text-accent-bright"
                >
                  Load
                </button>
                <button
                  onClick={() => deleteTemplate(key)}
                  className="label-etched underline text-neutral-500 hover:text-red-400"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
