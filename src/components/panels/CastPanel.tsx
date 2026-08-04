// ---------------------------------------------------------------------------
// LEFT PANEL — the cast.
//
// Three sections: Speakers (who they are and how they look), Music, and
// Waveforms (every track together). Waveforms get their own tab rather than
// living inside each speaker because tuning them is comparative work — you
// judge one track against the others, so they need to be side by side.
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
import { useSpeakerLibraryStore } from "../../store/useSpeakerLibraryStore";
import { usePuppetDefs } from "../../lib/puppets/usePuppets";
import { BUILTIN_CAST, builtinPuppetPath, type BuiltinCharacter } from "../../store/builtinCast";
import { defaultTrackWaveform } from "../../lib/waveform/buildTracks";
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
  // Definitions only, no art: this panel needs to know whether a puppet file
  // is valid, not what it looks like.
  const { errors: puppetErrors } = usePuppetDefs(speakers.map((sp) => sp.puppetPath));

  const addSpeakerFrom = useProjectStore((s) => s.addSpeakerFrom);
  const library = useSpeakerLibraryStore((s) => s.speakers);
  const saveToLibrary = useSpeakerLibraryStore((s) => s.save);
  const removeFromLibrary = useSpeakerLibraryStore((s) => s.remove);

  const [section, setSection] = useState<"speakers" | "music" | "waveforms">("speakers");
  const [active, setActive] = useState<string>("");
  const [saved, setSaved] = useState<string | null>(null);

  // Never leave the panel pointing at a speaker that has just been deleted.
  useEffect(() => {
    if (speakers.length > 0 && !speakers.some((s) => s.id === active)) {
      setActive(speakers[0].id);
    }
  }, [speakers, active]);

  const speaker = speakers.find((s) => s.id === active);

  // Where the bundled puppets live. Asked for once — it cannot change while
  // the app is running, and it is a round trip to the main process.
  const [puppetDir, setPuppetDir] = useState<string | null>(null);
  const [castError, setCastError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    window.byok.storage
      .puppetDir()
      .then((d) => !cancelled && setPuppetDir(d))
      .catch(() => !cancelled && setCastError("Couldn't locate the bundled characters."));
    return () => {
      cancelled = true;
    };
  }, []);

  /** Add a built-in character, with their puppet already assigned. */
  function addBuiltin(c: BuiltinCharacter) {
    if (!puppetDir) return;
    setCastError(null);
    // Same defaults a blank speaker gets, so a built-in character differs only
    // in the things that actually make them that character: name, face, colour.
    addSpeakerFrom({
      label: c.label,
      puppetPath: builtinPuppetPath(puppetDir, c.file),
      borderColor: c.borderColor,
      bgColor: "#1a1a1a",
      bgOpacity: 0,
      borderOpacity: 1,
      outlineShape: "none",
      size: 0.28,
      waveform: defaultTrackWaveform(speakers.length === 0 ? 0 : speakers.length % 2 === 1 ? 1 : -1),
    });
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-2">
        <h2 className="label-lit text-base">Cast</h2>
        <button onClick={addSpeaker} className="label-etched underline hover:text-accent-bright">
          + Add speaker
        </button>
      </div>

      {/* The cast that ships with the app. These were drawn, rigged and
          committed, but nothing offered them: "Add speaker" produced a blank,
          and the library below only appears once you have saved someone into
          it yourself — so the built-in characters were invisible unless you
          knew to hunt down their JSON in a file dialog. */}
      <div className="mb-3">
        <div className="label-etched mb-1.5">Characters</div>
        <div className="flex flex-wrap gap-2">
          {BUILTIN_CAST.map((c) => (
            <HudButton
              key={c.file}
              onClick={() => addBuiltin(c)}
              disabled={!puppetDir}
              title={
                puppetDir
                  ? `${c.note} — adds ${c.label} with their puppet already assigned`
                  : "Looking for the bundled characters…"
              }
            >
              + {c.label}
            </HudButton>
          ))}
        </div>
        {castError && <p className="text-sm text-red-400 mt-1.5">{castError}</p>}
      </div>

      {/* Recall a saved speaker. A face, a voice and a look are properties of a
          character, not of one video — picking them again every time is the
          most repetitive thing in the app. */}
      {library.length > 0 && (
        <div className="flex items-center gap-2 mb-3">
          <select
            value=""
            onChange={(e) => {
              const entry = library.find((l) => l.savedId === e.target.value);
              if (!entry) return;
              const { savedId: _s, savedAt: _a, ...rest } = entry;
              addSpeakerFrom(rest);
            }}
            className="flex-1 min-w-0 bg-metal-900 border border-accent/25 px-2 py-1.5 text-sm text-neutral-300 outline-none focus:border-accent"
          >
            <option value="">Add from library…</option>
            {library.map((l) => (
              <option key={l.savedId} value={l.savedId}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <Tabs
        tabs={[
          { id: "speakers" as const, label: "Speakers" },
          { id: "music" as const, label: "♪ Music" },
          { id: "waveforms" as const, label: "Waveforms" },
        ]}
        active={section}
        onChange={setSection}
      />

      {/* Which speaker the Speakers tab is editing. Only shown when it's
          relevant, so a single-speaker project has no redundant strip. */}
      {section === "speakers" && speakers.length > 1 && (
        <Tabs
          tabs={speakers.map((s) => ({ id: s.id, label: s.label }))}
          active={active}
          onChange={setActive}
        />
      )}

      <div className="flex-1 overflow-y-auto pr-1 space-y-6">
        {section === "waveforms" ? (
          <>
            <p className="text-sm text-neutral-500">
              Every track in one place, so you can tune them against each other
              instead of hopping between tabs. Each speaker's waveform takes its
              colour from that speaker's outline.
            </p>
            {speakers.map((sp) => (
              <section key={sp.id} className="space-y-3 border-t border-accent/15 pt-5 first:border-0 first:pt-0">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-full" style={{ background: sp.borderColor }} />
                  <span className="label-etched">{sp.label}</span>
                </div>
                <WaveformControls
                  label={`Show ${sp.label}'s waveform`}
                  value={sp.waveform}
                  onChange={(patch) => setSpeakerWaveform(sp.id, patch)}
                />
              </section>
            ))}
            <section className="space-y-3 border-t border-accent/15 pt-5">
              <div className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded-full" style={{ background: musicColor }} />
                <span className="label-etched">Music</span>
              </div>
              <WaveformControls
                label="Show music waveform"
                value={musicWaveform}
                onChange={setMusicWaveform}
                canAnchorToFace={false}
              />
            </section>
            {speakers.length === 0 && (
              <p className="text-sm text-neutral-500">Add a speaker to get a speaker waveform.</p>
            )}
          </>
        ) : section === "music" ? (
          <>
            <div className="flex items-center gap-3">
              <input
                type="color" value={musicColor}
                onChange={(e) => setMusicColor(e.target.value)}
                className="h-9 w-9 border border-accent/30 bg-transparent p-0"
              />
              <span className="text-sm text-neutral-400">Music colour</span>
            </div>
            <p className="text-sm text-neutral-500">
              The music track always animates — music doesn't take turns the way
              speakers do. Its waveform is on the Waveforms tab. Loading actual
              music files is still to come.
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

            <div className="flex items-center gap-3 -mt-2">
              <button
                onClick={() => {
                  saveToLibrary(speaker);
                  setSaved(speaker.label);
                  window.setTimeout(() => setSaved(null), 2000);
                }}
                className="label-etched underline hover:text-accent-bright"
              >
                Save to library
              </button>
              {library.some(
                (l) => l.label.trim().toLowerCase() === speaker.label.trim().toLowerCase()
              ) && (
                <button
                  onClick={() => {
                    const hit = library.find(
                      (l) => l.label.trim().toLowerCase() === speaker.label.trim().toLowerCase()
                    );
                    if (hit) removeFromLibrary(hit.savedId);
                  }}
                  className="label-etched underline text-neutral-500 hover:text-red-400"
                >
                  forget
                </button>
              )}
              {saved === speaker.label && (
                <span className="text-sm text-emerald-400">saved ✓</span>
              )}
            </div>
            <p className="text-sm text-neutral-500 -mt-4">
              Keeps the face, voice, colours and waveform — not where they stand.
            </p>

            {/* Two kinds of face, listed puppet-first because it is the better
                one and the one being chosen from here on. The flattened sheet
                stays for every project that already has one — and it is still
                the only option for a character nobody has cut into layers. */}
            <section className="space-y-3">
              <div className="label-etched">Face</div>

              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    const p = await window.byok.dialog.openFile([
                      { name: "Puppet", extensions: ["json"] },
                    ]);
                    if (p) updateSpeaker(speaker.id, { puppetPath: p });
                  }}
                  className="label-etched underline hover:text-accent-bright"
                >
                  {speaker.puppetPath ? "Change puppet" : "Choose puppet…"}
                </button>
                {speaker.puppetPath && (
                  <button
                    onClick={() => updateSpeaker(speaker.id, { puppetPath: undefined })}
                    className="label-etched underline text-neutral-500 hover:text-red-400"
                  >
                    clear
                  </button>
                )}
              </div>
              {speaker.puppetPath && (
                <p className="text-sm text-neutral-500 truncate" title={speaker.puppetPath}>
                  {speaker.puppetPath.split(/[\\/]/).pop()}
                  {puppetErrors[speaker.puppetPath] && (
                    <span className="text-red-400"> — {puppetErrors[speaker.puppetPath]}</span>
                  )}
                </p>
              )}

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
                  {speaker.sheetPath ? "Change sheet" : "Choose sheet…"}
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
                  {/* Silently ignoring the sheet would read as the picker being
                      broken — say which one is actually on screen. */}
                  {speaker.puppetPath && !puppetErrors[speaker.puppetPath] && (
                    <span className="text-neutral-600"> — unused, the puppet is drawn</span>
                  )}
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

          </>
        )}
      </div>
    </div>
  );
}
