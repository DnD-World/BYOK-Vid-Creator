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
import { Empty } from "../ui/Empty";
import { Picker } from "../ui/Picker";
import { HudButton } from "../ui/HudButton";
import { Slider } from "../ui/Slider";
import { Tabs } from "../ui/Tabs";
import { WaveformControls } from "./WaveformControls";
import { VoiceControls } from "./VoiceControls";
import { SfxPanel } from "./SfxPanel";
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
  const music = useProjectStore((s) => s.music);
  const setMusic = useProjectStore((s) => s.setMusic);
  const musicVolume = useProjectStore((s) => s.musicVolume);
  const musicDuck = useProjectStore((s) => s.musicDuck);
  const setMusicMix = useProjectStore((s) => s.setMusicMix);
  const [musicBusy, setMusicBusy] = useState(false);
  const [elevenVoices, setElevenVoices] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    window.byok?.tts?.listElevenVoices?.().then(setElevenVoices).catch(() => setElevenVoices([]));
  }, []);
  const [musicLibrary, setMusicLibrary] = useState<{ name: string; filePath: string }[]>([]);
  useEffect(() => {
    window.byok?.music?.list().then(setMusicLibrary).catch(() => setMusicLibrary([]));
  }, []);
  const [musicNote, setMusicNote] = useState<string | null>(null);
  const voices = useVoicesStore((s) => s.voices);
  // Definitions only, no art: this panel needs to know whether a puppet file
  // is valid, not what it looks like.
  const { errors: puppetErrors } = usePuppetDefs(speakers.map((sp) => sp.puppetPath));

  /** Load one track and analyse it. Shared by the library buttons and the file
   *  dialog, because an unanalysed bed plays once and then leaves silence —
   *  which is the whole reason the analysis is not optional here. */
  const loadMusicFile = async (p: string) => {
    setMusicBusy(true);
    setMusicNote(null);
    try {
      const analysis = await window.byok.audio.analyzeFile(p);
      setMusic({ filePath: p, analysis });
      if (!analysis) {
        setMusicNote(
          "Loaded. It will play, but it couldn't be analysed — the music waveform " +
            "won't follow it and it won't repeat if it's shorter than the video. " +
            "A 16-bit PCM .wav does both."
        );
      }
    } catch (e) {
      setMusic({ filePath: p, analysis: null });
      setMusicNote(
        `Loaded, but analysing it failed (${e instanceof Error ? e.message : String(e)}). ` +
          "It will still play."
      );
    } finally {
      setMusicBusy(false);
    }
  };

  const pickMusic = async () => {
    const p = await window.byok.dialog.openFile([
      { name: "Audio", extensions: ["wav", "mp3", "m4a", "ogg", "flac"] },
    ]);
    if (p) await loadMusicFile(p);
  };

  const addSpeakerFrom = useProjectStore((s) => s.addSpeakerFrom);
  const library = useSpeakerLibraryStore((s) => s.speakers);
  const saveToLibrary = useSpeakerLibraryStore((s) => s.save);
  const removeFromLibrary = useSpeakerLibraryStore((s) => s.remove);

  const [section, setSection] = useState<"speakers" | "music" | "sfx" | "waveforms">(
    "speakers"
  );
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
    // Optional-chained because `window.byok` only exists inside Electron. An
    // unguarded call threw during mount and took the ENTIRE app down when the
    // built renderer was served over http for a screenshot — a blank page, and
    // a bug that looked like a styling failure for far longer than it should
    // have. The bridge being absent should cost the built-in cast, nothing else.
    window.byok?.storage
      ?.puppetDir()
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
      // The voice comes with the character. Adding Καίτη used to give you her
      // face and none of her voice — no opening phrase, no reference clip, no
      // settings — so every project re-typed all three by hand, or shipped
      // without them.
      openingPhrase: c.openingPhrase,
      voiceRef: c.voiceRef,
      ttsEngine: "dramabox",
      ...(c.dramabox ? { dramabox: c.dramabox } : {}),
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
        <h2 className="title-deco uppercase text-lg">Cast</h2>
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
      {musicLibrary.length > 0 && (
        <div className="flex items-center gap-2 mb-3">
          <Picker
            aria-label="Add a saved speaker from the library"
            className="flex-1 min-w-0"
            value=""
            placeholder="Add from library…"
            options={[
              { value: "", label: "Add from library…" },
              ...library.map((l) => ({ value: l.savedId, label: l.label })),
            ]}
            onChange={(v) => {
              const entry = library.find((l) => l.savedId === v);
              if (!entry) return;
              const { savedId: _s, savedAt: _a, ...rest } = entry;
              addSpeakerFrom(rest);
            }}
          />
        </div>
      )}

      <Tabs
        tabs={[
          { id: "speakers" as const, label: "Speakers" },
          { id: "music" as const, label: "♪ Music" },
          { id: "sfx" as const, label: "SFX" },
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
        ) : section === "sfx" ? (
          <SfxPanel />
        ) : section === "music" ? (
          <>
            {/* The loops that ship with the app. A batch picks from these by
                itself; this is for choosing one by hand on a single video. */}
            {musicLibrary.length > 0 && (
              <div className="space-y-2">
                <div className="label-etched">Library</div>
                <div className="flex flex-wrap gap-2">
                  {musicLibrary.map((t) => (
                    <HudButton
                      key={t.filePath}
                      active={music?.filePath === t.filePath}
                      onClick={() => loadMusicFile(t.filePath)}
                    >
                      {t.name.replace(/\.wav$/i, "").replace(/[_-]+/g, " ").slice(0, 28)}
                    </HudButton>
                  ))}
                </div>
                <p className="text-sm text-neutral-500">
                  All loopable and cleared for use. A batch gives each lesson one
                  of these on rotation, so the same lesson always gets the same
                  bed and the next one gets the next track along.
                </p>
              </div>
            )}

            <div className="flex items-center gap-2">
              <HudButton onClick={pickMusic} disabled={musicBusy}>
                {musicBusy ? "Analysing…" : music ? "Change Track" : "Load Music"}
              </HudButton>
              {music && (
                <button
                  onClick={() => {
                    setMusic(null);
                    setMusicNote(null);
                  }}
                  className="label-etched underline hover:text-red-400"
                >
                  remove
                </button>
              )}
            </div>
            {music && (
              <p className="text-xs text-neutral-500 break-all">
                {music.filePath.split(/[\\/]/).pop()}
                {music.analysis
                  ? ` · ${Math.round(music.analysis.durationMs / 1000)}s`
                  : " · not analysed"}
              </p>
            )}
            {musicNote && <p className="text-sm text-amber-400">{musicNote}</p>}

            <Slider
              label="Music level"
              value={musicVolume}
              min={0} max={1} step={0.02}
              format={(v) => (v === 0 ? "silent" : `${Math.round(v * 100)}%`)}
              onChange={(volume) => setMusicMix({ volume })}
            />
            <Slider
              label="Duck under speech"
              value={musicDuck}
              min={0} max={1} step={0.05}
              format={(v) => (v === 0 ? "off" : `−${Math.round(v * 100)}%`)}
              onChange={(duck) => setMusicMix({ duck })}
            />
            <p className="text-sm text-neutral-500">
              The bed drops out of the way just before each line and comes back
              slowly after it — early, because a duck that arrives with the voice
              always sounds late. A track shorter than the video repeats.
            </p>

            <div className="flex items-center gap-3 border-t border-accent/15 pt-4">
              <input
                type="color" value={musicColor}
                onChange={(e) => setMusicColor(e.target.value)}
                className="h-9 w-9 border border-accent/30 bg-transparent p-0"
              />
              <span className="text-sm text-neutral-400">Music colour</span>
            </div>
            <p className="text-sm text-neutral-500">
              The music track always animates — music doesn't take turns the way
              speakers do. With a track loaded it animates to the music itself;
              without one it borrows the narration. Its waveform is on the
              Waveforms tab.
            </p>
          </>
        ) : !speaker ? (
          <Empty>No speakers yet. Add one to give your video a voice.</Empty>
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
              <Picker
                aria-label="Voice engine"
                className="w-full"
                value={speaker.ttsEngine ?? "dramabox"}
                options={[
                  { value: "dramabox", label: "DramaBox — acts, runs on the GPU box" },
                  { value: "elevenlabs", label: "ElevenLabs — charged per character" },
                  { value: "piper", label: "Piper — fast, local, flat" },
                ]}
                onChange={(v) =>
                  updateSpeaker(speaker.id, {
                    ttsEngine: v as "dramabox" | "elevenlabs" | "piper",
                  })
                }
              />
              {(speaker.ttsEngine ?? "dramabox") === "piper" && (
                <Picker
                  aria-label="Piper voice"
                  className="w-full"
                  placeholder={
                    voices.length === 0
                      ? "No voices — scan in Backend Settings"
                      : "Saved voice not found — pick another"
                  }
                  value={speaker.voiceId ?? ""}
                  options={[
                    {
                      value: "",
                      label:
                        voices.length === 0
                          ? "No voices — scan in Backend Settings"
                          : "No voice assigned",
                    },
                    ...voices.map((v) => ({ value: v.onnxPath, label: v.name })),
                  ]}
                  onChange={(v) => updateSpeaker(speaker.id, { voiceId: v || undefined })}
                />
              )}
              <p className="text-sm text-neutral-500">
                DramaBox voices come from the reference clip below, and the
                audio is generated on the GPU box — write its files from the
                Narration tab.
              </p>
            </section>

            {/* Every DramaBox knob, per character. These used to be literals in
                a Python file on the GPU box, which meant one setting for the
                whole cast and no way to see what it was. */}
            <section className="space-y-3">
              <div className="label-etched">DramaBox — this voice</div>
              <label className="block">
                <span className="label-etched text-sm">Opens their blocks with</span>
                <input
                  type="text"
                  className="w-full mt-1 bg-black/30 border border-accent/20 rounded px-2 py-1 text-sm"
                  placeholder="A grave man"
                  value={speaker.openingPhrase ?? ""}
                  onChange={(e) =>
                    updateSpeaker(speaker.id, { openingPhrase: e.target.value || undefined })
                  }
                />
              </label>
              <label className="block">
                <span className="label-etched text-sm">Reference clip</span>
                <input
                  type="text"
                  className="w-full mt-1 bg-black/30 border border-accent/20 rounded px-2 py-1 text-sm"
                  placeholder="kaiti.wav"
                  value={speaker.voiceRef ?? ""}
                  onChange={(e) =>
                    updateSpeaker(speaker.id, { voiceRef: e.target.value || undefined })
                  }
                />
              </label>
              {(speaker.ttsEngine ?? "dramabox") === "elevenlabs" && (
                <div className="space-y-2">
                  <label className="block">
                    <span className="label-etched text-sm">ElevenLabs voice</span>
                    <Picker
                      aria-label="ElevenLabs voice"
                      className="mt-1 w-full"
                      placeholder={
                        elevenVoices.length === 0
                          ? "No voices — save a key in Backend Settings"
                          : "Pick a voice"
                      }
                      value={speaker.elevenVoiceId ?? ""}
                      options={[
                        { value: "", label: "No voice chosen" },
                        ...elevenVoices.map((v) => ({ value: v.id, label: v.name })),
                      ]}
                      onChange={(v) =>
                        updateSpeaker(speaker.id, { elevenVoiceId: v || undefined })
                      }
                    />
                  </label>
                  <Slider
                    label="Speed" value={speaker.eleven?.speed ?? 1} min={0.7} max={1.2} step={0.05}
                    onChange={(v) =>
                      updateSpeaker(speaker.id, { eleven: { ...speaker.eleven, speed: v } })
                    }
                    format={(v) => `${v.toFixed(2)}x`}
                  />
                  <Slider
                    label="Steadiness" value={speaker.eleven?.stability ?? 0.5} min={0} max={1} step={0.05}
                    onChange={(v) =>
                      updateSpeaker(speaker.id, { eleven: { ...speaker.eleven, stability: v } })
                    }
                    format={(v) => `${Math.round(v * 100)}%`}
                  />
                  <p className="text-sm text-neutral-500">
                    Low steadiness wanders and is more expressive; high is even and
                    flatter. Every generation is charged by the character, and a
                    re-render is charged again.
                  </p>
                </div>
              )}

              {(speaker.ttsEngine ?? "dramabox") !== "elevenlabs" && (
              <VoiceControls
                value={speaker.dramabox ?? {}}
                onChange={(dramabox) => updateSpeaker(speaker.id, { dramabox })}
                expression={speaker.expression ?? {}}
                onExpressionChange={(expression) =>
                  updateSpeaker(speaker.id, { expression })
                }
              />
              )}
            </section>

          </>
        )}
      </div>
    </div>
  );
}
