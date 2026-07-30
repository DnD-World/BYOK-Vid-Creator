// ---------------------------------------------------------------------------
// Presets — three built-in looks, plus your own saved ones.
//
// A built-in deliberately does NOT replace your cast. It restyles the speakers
// you already have (waveform, outline shape) and sets the frame and subtitle
// look. Replacing speakers would throw away the faces and voices you assigned,
// which is never what "try a different look" should mean.
//
// Saved presets are plain JSON and can be exported/imported as files. That is
// on purpose: it makes a preset something an AI assistant can simply write for
// you, with no integration on the app's side.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { HudButton } from "../ui/HudButton";
import { useProjectStore } from "../../store/useProjectStore";
import { useTemplatesStore } from "../../store/useTemplatesStore";
import type { OutlineShape, SubtitleConfig, TrackWaveform } from "../../store/types";
import type { ProjectPreset } from "../../store/templatesTypes";

interface BuiltIn {
  name: string;
  description: string;
  outlineShape: OutlineShape;
  speakerWaveform: Partial<TrackWaveform>;
  musicWaveform: Partial<TrackWaveform>;
  musicColor: string;
  subtitles: Partial<SubtitleConfig>;
}

const BUILT_INS: BuiltIn[] = [
  {
    name: "Halo",
    description: "Circular bars ringing each speaker. Calm, symmetrical, the house look.",
    outlineShape: "circle",
    speakerWaveform: { enabled: true, style: "bars", position: "circular", scale: 1.1, density: 64, thickness: 1, smoothing: 0.35 },
    musicWaveform: { enabled: false },
    musicColor: "#8a8a8a",
    subtitles: { position: "bottom", fontSize: 0.052, strokeWidth: 0.14, activeGlow: 0.6, uppercase: false },
  },
  {
    name: "Broadcast",
    description: "Flat bars along the bottom with bold uppercase captions. Reads as news/explainer.",
    outlineShape: "rounded",
    speakerWaveform: { enabled: true, style: "bars", position: "bottom", scale: 0.8, density: 96, thickness: 0.7, smoothing: 0.2, edgeFlush: true },
    musicWaveform: { enabled: true, style: "lines", position: "top", scale: 0.5, density: 120, thickness: 0.6, smoothing: 0.6 },
    musicColor: "#5a5a68",
    subtitles: { position: "bottom", fontSize: 0.058, strokeWidth: 0.18, activeGlow: 0.35, uppercase: true, maxChars: 34 },
  },
  {
    name: "Orbit",
    description: "Glowing chaotic rings behind frameless avatars. The most cinematic of the three.",
    outlineShape: "none",
    speakerWaveform: { enabled: true, style: "rings", position: "circular", scale: 1.4, density: 48, thickness: 1.4, smoothing: 0.5, ringInnerRadius: 0.28, ringSize: 1.1 },
    musicWaveform: { enabled: true, style: "wave", position: "bottom", scale: 0.7, density: 80, thickness: 1, smoothing: 0.8 },
    musicColor: "#3cb4ff",
    subtitles: { position: "bottom", fontSize: 0.05, strokeWidth: 0.1, activeGlow: 1.0, uppercase: false },
  },
];

export function PresetsPanel() {
  const speakers = useProjectStore((s) => s.speakers);
  const updateSpeaker = useProjectStore((s) => s.updateSpeaker);
  const setSpeakerWaveform = useProjectStore((s) => s.setSpeakerWaveform);
  const setMusicWaveform = useProjectStore((s) => s.setMusicWaveform);
  const setMusicColor = useProjectStore((s) => s.setMusicColor);
  const setSubtitles = useProjectStore((s) => s.setSubtitles);
  const loadSnapshot = useProjectStore((s) => s.loadSnapshot);

  const render = useProjectStore((s) => s.render);
  const fps = useProjectStore((s) => s.fps);
  const musicWaveform = useProjectStore((s) => s.musicWaveform);
  const musicColor = useProjectStore((s) => s.musicColor);
  const subtitles = useProjectStore((s) => s.subtitles);

  const templates = useTemplatesStore((s) => s.templates);
  const saveTemplate = useTemplatesStore((s) => s.saveTemplate);
  const deleteTemplate = useTemplatesStore((s) => s.deleteTemplate);

  const [name, setName] = useState("");
  const [note, setNote] = useState<string | null>(null);

  const applyBuiltIn = (b: BuiltIn) => {
    speakers.forEach((sp, i) => {
      updateSpeaker(sp.id, { outlineShape: b.outlineShape });
      // Keep the alternating lane so a second speaker stays visually separate.
      setSpeakerWaveform(sp.id, {
        ...b.speakerWaveform,
        lane: i === 0 ? 0 : i % 2 === 1 ? 1 : -1,
      });
    });
    setMusicWaveform(b.musicWaveform);
    setMusicColor(b.musicColor);
    setSubtitles(b.subtitles);
    setNote(
      speakers.length === 0
        ? `Applied "${b.name}" — add a speaker to see it.`
        : `Applied "${b.name}" to ${speakers.length} speaker(s). Faces and voices kept.`
    );
  };

  const currentPreset = (): Omit<ProjectPreset, "savedAt"> => ({
    render, fps, speakers, musicWaveform, musicColor, subtitles,
  });

  const exportPreset = async () => {
    const target = await window.byok.dialog.saveFile("preset.json", [
      { name: "Preset", extensions: ["json"] },
    ]);
    if (!target) return;
    const json = JSON.stringify({ ...currentPreset(), savedAt: Date.now() }, null, 2);
    await window.byok.storage.writeFile(target, new TextEncoder().encode(json).buffer as ArrayBuffer);
    setNote(`Exported to ${target.split(/[\\/]/).pop()}`);
  };

  const importPreset = async () => {
    const src = await window.byok.dialog.openFile([{ name: "Preset", extensions: ["json"] }]);
    if (!src) return;
    try {
      const buf = await window.byok.storage.readFile(src);
      const parsed = JSON.parse(new TextDecoder().decode(buf)) as ProjectPreset;
      loadSnapshot(parsed);
      setNote(`Loaded ${src.split(/[\\/]/).pop()}`);
    } catch (e) {
      setNote(`Couldn't read that preset — ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const saved = Object.entries(templates);

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="label-etched">Built-in looks</div>
        {BUILT_INS.map((b) => (
          <div key={b.name} className="border border-accent/25 bg-metal-800/60 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-base text-neutral-200">{b.name}</span>
              <HudButton onClick={() => applyBuiltIn(b)}>Apply</HudButton>
            </div>
            <p className="text-sm text-neutral-500">{b.description}</p>
          </div>
        ))}
        <p className="text-sm text-neutral-500">
          Applying a look restyles your existing speakers. It never replaces
          them, so faces and voices survive.
        </p>
      </section>

      <section className="space-y-3 border-t border-accent/15 pt-5">
        <div className="label-etched">Your presets</div>
        <div className="flex gap-2">
          <input
            type="text" placeholder="Name this look…" value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 min-w-0 bg-metal-900 border border-accent/25 px-3 py-2 text-base text-neutral-100 outline-none focus:border-accent"
          />
          <HudButton
            onClick={() => {
              const n = name.trim();
              if (!n) return;
              saveTemplate(n, currentPreset());
              setName("");
              setNote(`Saved "${n}".`);
            }}
          >
            Save
          </HudButton>
        </div>

        {saved.length === 0 ? (
          <p className="text-sm text-neutral-500">Nothing saved yet.</p>
        ) : (
          saved.map(([key, tpl]) => (
            <div key={key} className="flex items-center justify-between gap-2 border border-accent/20 bg-metal-900/60 px-3 py-2">
              <div className="min-w-0">
                <div className="text-base text-neutral-200 truncate">{key}</div>
                <div className="text-sm text-neutral-500">
                  {new Date(tpl.savedAt).toLocaleDateString()}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => loadSnapshot(tpl)} className="label-etched underline hover:text-accent-bright">Load</button>
                <button onClick={() => deleteTemplate(key)} className="label-etched underline text-neutral-500 hover:text-red-400">Delete</button>
              </div>
            </div>
          ))
        )}
      </section>

      <section className="space-y-3 border-t border-accent/15 pt-5">
        <div className="label-etched">Share as a file</div>
        <div className="flex gap-2">
          <HudButton onClick={exportPreset}>Export…</HudButton>
          <HudButton onClick={importPreset}>Import…</HudButton>
        </div>
        <p className="text-sm text-neutral-500">
          Presets are plain JSON, so an assistant can write one for you and you
          just import it.
        </p>
      </section>

      {note && <p className="text-sm text-accent-bright">{note}</p>}
    </div>
  );
}
