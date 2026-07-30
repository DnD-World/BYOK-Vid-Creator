// ---------------------------------------------------------------------------
// LEFT PANEL — the cast.
//
// One tab per speaker plus a Music tab. Everything that belongs to a sound
// source lives in its own tab: appearance, position, voice, and that source's
// waveform. This is what stops speakers stacking vertically forever, which was
// the main reason the old single rail became unusable.
//
// The colour rule worth knowing: a speaker's outline colour IS their waveform
// colour. There is no second control, because two controls would drift.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { HudButton } from "../ui/HudButton";
import { Slider } from "../ui/Slider";
import { Tabs } from "../ui/Tabs";
import { WaveformControls } from "./WaveformControls";
import { useProjectStore } from "../../store/useProjectStore";
import { useVoicesStore } from "../../store/useVoicesStore";
import type { OutlineShape } from "../../store/types";

const SHAPES: { id: OutlineShape; label: string }[] = [
  { id: "circle", label: "Circle" },
  { id: "rounded", label: "Rounded" },
  { id: "square", label: "Square" },
  { id: "none", label: "No frame" },
];

export function CastPanel() {
  const speakers = useProjectStore((s) => s.speakers);
  const addSpeaker = useProjectStore((s) => s.addSpeaker);
  const removeSpeaker = useProjectStore((s) => s.removeSpeaker);
  const updateSpeaker = useProjectStore((s) => s.updateSpeaker);
  const setSpeakerWaveform = useProjectStore((s) => s.setSpeakerWaveform);
  const musicWaveform = useProjectStore((s) => s.musicWaveform);
  const setMusicWaveform = useProjectStore((s) => s.setMusicWaveform);
  const musicColor = useProjectStore((s) => s.musicColor);
  const setMusicColor = useProjectStore((s) => s.setMusicColor);
  const voices = useVoicesStore((s) => s.voices);

  const [active, setActive] = useState<string>("music");

  // Follow the cast: land on a real speaker when one exists, and never leave
  // the panel pointing at a speaker that has just been deleted.
  useEffect(() => {
    if (active !== "music" && !speakers.some((s) => s.id === active)) {
      setActive(speakers[0]?.id ?? "music");
    }
  }, [speakers, active]);

  const tabs = [
    ...speakers.map((s) => ({ id: s.id, label: s.label })),
    { id: "music", label: "♪ Music" },
  ];

  const speaker = speakers.find((s) => s.id === active);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <h2 className="label-lit text-base">Cast</h2>
        <button onClick={addSpeaker} className="label-etched underline hover:text-accent-bright">
          + Add speaker
        </button>
      </div>

      <Tabs tabs={tabs} active={active} onChange={setActive} />

      <div className="flex-1 overflow-y-auto pr-1 space-y-6">
        {active === "music" ? (
          <>
            <div className="flex items-center gap-3">
              <input
                type="color" value={musicColor}
                onChange={(e) => setMusicColor(e.target.value)}
                className="h-9 w-9 border border-accent/30 bg-transparent p-0"
              />
              <span className="text-sm text-neutral-400">Music waveform colour</span>
            </div>
            <WaveformControls
              label="Show music waveform"
              value={musicWaveform}
              onChange={setMusicWaveform}
            />
            <p className="text-sm text-neutral-500">
              The music track always animates — music doesn't take turns the way
              speakers do. Adding actual music files is still to come.
            </p>
          </>
        ) : !speaker ? (
          <p className="text-sm text-neutral-500">
            No speakers yet. Add one to give your video a voice.
          </p>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <input
                type="text" value={speaker.label}
                onChange={(e) => updateSpeaker(speaker.id, { label: e.target.value })}
                className="flex-1 min-w-0 bg-metal-900 border border-accent/25 px-3 py-2 text-base text-neutral-100 outline-none focus:border-accent"
              />
              <button
                onClick={() => removeSpeaker(speaker.id)}
                className="label-etched underline text-neutral-500 hover:text-red-400"
              >
                Remove
              </button>
            </div>
            <p className="text-sm text-neutral-500 -mt-4">
              This name must match the label used in your script lines.
            </p>

            <section className="space-y-3">
              <div className="label-etched">Face</div>
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    const p = await window.byok.dialog.openFile([
                      { name: "Viseme sheet", extensions: ["png"] },
                    ]);
                    if (p) updateSpeaker(speaker.id, { sheetPath: p });
                  }}
                  className="label-etched underline hover:text-accent-bright"
                >
                  {speaker.sheetPath ? "Change face" : "Choose face…"}
                </button>
                {speaker.sheetPath && (
                  <button
                    onClick={() => updateSpeaker(speaker.id, { sheetPath: undefined })}
                    className="label-etched underline text-neutral-500 hover:text-red-400"
                  >
                    clear
                  </button>
                )}
              </div>
              {speaker.sheetPath && (
                <p className="text-sm text-neutral-500 truncate" title={speaker.sheetPath}>
                  {speaker.sheetPath.split(/[\\/]/).pop()}
                </p>
              )}
            </section>

            <section className="space-y-3">
              <div className="label-etched">Frame</div>
              <div className="flex flex-wrap gap-2">
                {SHAPES.map((s) => (
                  <HudButton
                    key={s.id}
                    active={speaker.outlineShape === s.id}
                    onClick={() => updateSpeaker(speaker.id, { outlineShape: s.id })}
                  >
                    {s.label}
                  </HudButton>
                ))}
              </div>
              <div className="flex items-center gap-4">
                <label className="flex flex-col items-center gap-1.5">
                  <input
                    type="color" value={speaker.borderColor}
                    onChange={(e) => updateSpeaker(speaker.id, { borderColor: e.target.value })}
                    className="h-9 w-9 border border-accent/30 bg-transparent p-0"
                  />
                  <span className="text-sm text-neutral-400">Outline</span>
                </label>
                <label className="flex flex-col items-center gap-1.5">
                  <input
                    type="color" value={speaker.bgColor}
                    onChange={(e) => updateSpeaker(speaker.id, { bgColor: e.target.value })}
                    className="h-9 w-9 border border-accent/30 bg-transparent p-0"
                  />
                  <span className="text-sm text-neutral-400">Fill</span>
                </label>
                <p className="text-sm text-neutral-500 flex-1">
                  The outline colour is also this speaker's waveform colour.
                </p>
              </div>
              <Slider
                label="Outline Opacity" value={speaker.borderOpacity} min={0} max={1} step={0.05}
                onChange={(v) => updateSpeaker(speaker.id, { borderOpacity: v })}
                format={(v) => `${Math.round(v * 100)}%`}
              />
              <Slider
                label="Fill Opacity" value={speaker.bgOpacity} min={0} max={1} step={0.05}
                onChange={(v) => updateSpeaker(speaker.id, { bgOpacity: v })}
                format={(v) => (v === 0 ? "transparent" : `${Math.round(v * 100)}%`)}
              />
            </section>

            <section className="space-y-3">
              <div className="label-etched">Placement</div>
              <Slider
                label="Size" value={speaker.size} min={0.05} max={0.9} step={0.01}
                onChange={(v) => updateSpeaker(speaker.id, { size: v })}
                format={(v) => `${Math.round(v * 100)}%`}
              />
              <Slider
                label="Position X" value={speaker.x} min={0} max={1} step={0.01}
                onChange={(v) => updateSpeaker(speaker.id, { x: v })}
                format={(v) => `${Math.round(v * 100)}%`}
              />
              <Slider
                label="Position Y" value={speaker.y} min={0} max={1} step={0.01}
                onChange={(v) => updateSpeaker(speaker.id, { y: v })}
                format={(v) => `${Math.round(v * 100)}%`}
              />
              <p className="text-sm text-neutral-500">Or just drag them on the canvas.</p>
            </section>

            <section className="space-y-3">
              <div className="label-etched">Voice</div>
              <select
                value={speaker.ttsEngine ?? "chatterbox"}
                onChange={(e) =>
                  updateSpeaker(speaker.id, { ttsEngine: e.target.value as "chatterbox" | "piper" })
                }
                className="w-full bg-metal-900 border border-accent/25 px-3 py-2 text-base text-neutral-100 outline-none focus:border-accent"
              >
                <option value="piper">Piper — fast, local</option>
                <option value="chatterbox">Chatterbox — higher quality</option>
              </select>
              {(speaker.ttsEngine ?? "chatterbox") === "piper" && (
                <select
                  value={speaker.voiceId ?? ""}
                  onChange={(e) => updateSpeaker(speaker.id, { voiceId: e.target.value || undefined })}
                  className="w-full bg-metal-900 border border-accent/25 px-3 py-2 text-base text-neutral-100 outline-none focus:border-accent"
                >
                  <option value="">
                    {voices.length === 0 ? "No voices — scan in Backend Settings" : "No voice assigned"}
                  </option>
                  {voices.map((v) => (
                    <option key={v.id} value={v.onnxPath}>{v.name}</option>
                  ))}
                </select>
              )}
              <p className="text-sm text-neutral-500">
                Chatterbox voices are assigned in the Narration tab.
              </p>
            </section>

            <section className="space-y-3 border-t border-accent/15 pt-5">
              <div className="label-etched">Waveform</div>
              <WaveformControls
                label={`Show ${speaker.label}'s waveform`}
                value={speaker.waveform}
                onChange={(patch) => setSpeakerWaveform(speaker.id, patch)}
              />
            </section>
          </>
        )}
      </div>
    </div>
  );
}
