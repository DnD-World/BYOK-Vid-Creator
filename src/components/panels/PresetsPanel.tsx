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
import type { ProjectPreset } from "../../store/templatesTypes";
import { builtinPresets } from "../../store/builtinPresets";
import { sampleProject, SAMPLE_NAME } from "../../store/sampleProject";
import { migrateSurface } from "../../store/types";


export function PresetsPanel() {
  const speakers = useProjectStore((s) => s.speakers);
  const updateSpeaker = useProjectStore((s) => s.updateSpeaker);
  const setSpeakerWaveform = useProjectStore((s) => s.setSpeakerWaveform);
  const setMusicWaveform = useProjectStore((s) => s.setMusicWaveform);
  const setMusicColor = useProjectStore((s) => s.setMusicColor);
  const setSubtitles = useProjectStore((s) => s.setSubtitles);
  const setBackgroundStyle = useProjectStore((s) => s.setBackgroundStyle);
  const loadSnapshot = useProjectStore((s) => s.loadSnapshot);
  const loadProject = useProjectStore((s) => s.loadProject);
  const setNarration = useProjectStore((s) => s.setNarration);

  const render = useProjectStore((s) => s.render);
  const fps = useProjectStore((s) => s.fps);
  const musicWaveform = useProjectStore((s) => s.musicWaveform);
  const musicColor = useProjectStore((s) => s.musicColor);
  const subtitles = useProjectStore((s) => s.subtitles);
  const backgroundDim = useProjectStore((s) => s.backgroundDim);
  const backgroundCrossfadeMs = useProjectStore((s) => s.backgroundCrossfadeMs);

  const templates = useTemplatesStore((s) => s.templates);
  const saveTemplate = useTemplatesStore((s) => s.saveTemplate);
  const deleteTemplate = useTemplatesStore((s) => s.deleteTemplate);

  const [name, setName] = useState("");
  const [note, setNote] = useState<string | null>(null);

  /** Apply one of the nine, the same nine a job file names.
   *
   *  THIS PANEL USED TO HAVE ITS OWN THREE. They shared the names Halo,
   *  Broadcast and Orbit with the real ones and were not the same objects: the
   *  panel's restyled waveforms and captions only, while a preset also carries
   *  where each speaker STANDS and how big they are. So "Halo · duo" in a job
   *  file and "Halo" in the app produced visibly different videos, and the six
   *  presets with a speaker count in their name could not be applied here at
   *  all. Both now read builtinPresets(). */
  const applyBuiltIn = (b: ReturnType<typeof builtinPresets>[number]) => {
    const slots = b.slots ?? [];
    speakers.forEach((sp, i) => {
      // A preset made for two speakers applied to three: the third keeps its
      // place rather than landing on top of the second.
      const slot = slots[i];
      if (!slot) return;
      updateSpeaker(sp.id, {
        outlineShape: slot.outlineShape,
        x: slot.x,
        y: slot.y,
        size: slot.size,
        surface: slot.surface,
      });
      setSpeakerWaveform(sp.id, slot.waveform);
    });
    if (b.musicWaveform) setMusicWaveform(b.musicWaveform);
    if (b.musicColor) setMusicColor(b.musicColor);
    if (b.subtitles) setSubtitles(b.subtitles);
    if (b.backgroundDim !== undefined || b.backgroundCrossfadeMs !== undefined) {
      setBackgroundStyle({ dim: b.backgroundDim, crossfadeMs: b.backgroundCrossfadeMs });
    }

    const extra = speakers.length - slots.length;
    setNote(
      speakers.length === 0
        ? `Applied "${b.name}" — add a speaker to see it.`
        : extra > 0
          ? `Applied "${b.name}" to ${slots.length} of ${speakers.length} speakers. ` +
            `It is a ${slots.length}-speaker look, so ${extra} kept their place — ` +
            `use the "${b.name.split(" · ")[0]}" preset for ${speakers.length} instead.`
          : `Applied "${b.name}" to ${speakers.length} speaker(s). Faces and voices kept.`
    );
  };

  /** The look as it stands, ready to save.
   *
   *  SLOTS, NOT SPEAKERS. Saving whole speakers put each character's face and
   *  voice inside the preset, so loading it swapped your cast for the one that
   *  happened to be on screen when the look was saved. A look is where people
   *  stand and how they are dressed; who they are is the project's business. */
  const currentPreset = (): Omit<ProjectPreset, "savedAt"> => ({
    render, fps, musicWaveform, musicColor, subtitles,
    backgroundDim, backgroundCrossfadeMs,
    slots: speakers.map((sp) => ({
      x: sp.x,
      y: sp.y,
      size: sp.size,
      outlineShape: sp.outlineShape,
      surface: migrateSurface(sp),
      waveform: sp.waveform,
    })),
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

  const saveProject = async () => {
    const target = await window.byok.dialog.saveFile("project.byokproj.json", [
      { name: "BYOK project", extensions: ["json"] },
    ]);
    if (!target) return;
    // The analysis is derived from the narration WAV and is megabytes; the file
    // path is enough to rebuild it on open.
    const s = useProjectStore.getState();
    const doc = {
      kind: "byok-project" as const,
      version: 1,
      savedAt: Date.now(),
      project: {
        render: s.render, fps: s.fps, speakers: s.speakers,
        musicWaveform: s.musicWaveform, musicColor: s.musicColor,
        subtitles: s.subtitles, script: s.script, language: s.language,
        pauseSameMs: s.pauseSameMs, pauseTurnMs: s.pauseTurnMs,
        visemeFadeMs: s.visemeFadeMs,
        narration: s.narration
          ? { filePath: s.narration.filePath, segments: s.narration.segments, analysis: null }
          : null,
      },
    };
    const json = JSON.stringify(doc, null, 2);
    await window.byok.storage.writeFile(target, new TextEncoder().encode(json).buffer as ArrayBuffer);
    setNote(`Saved project to ${target.split(/[\\/]/).pop()}`);
  };

  const openProject = async () => {
    const src = await window.byok.dialog.openFile([{ name: "BYOK project", extensions: ["json"] }]);
    if (!src) return;
    try {
      const buf = await window.byok.storage.readFile(src);
      const doc = JSON.parse(new TextDecoder().decode(buf));
      if (doc?.kind !== "byok-project" || !doc.project) {
        setNote("That's not a project file. Presets load with Import… above.");
        return;
      }
      loadProject(doc.project);
      // Rebuild the analysis from the WAV the project points at, exactly like
      // the autosave does on startup.
      const n = useProjectStore.getState().narration;
      if (n?.filePath) {
        try {
          const analysis = await window.byok.audio.analyzeFile(n.filePath);
          if (analysis) setNarration({ ...n, analysis });
        } catch {
          setNote(`Loaded, but its narration file is missing — regenerate to get the waveform back.`);
          return;
        }
      }
      setNote(`Opened ${src.split(/[\\/]/).pop()}`);
    } catch (e) {
      setNote(`Couldn't read that project — ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const BUILT_INS = builtinPresets();
  const saved = Object.entries(templates);

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="label-etched">Built-in looks</div>
        {BUILT_INS.filter((b) => b.speakerCount === Math.min(3, Math.max(1, speakers.length || 2))).map((b) => (
          <div key={b.name} className="border border-accent/25 bg-metal-800/60 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-base text-neutral-200">{b.name}</span>
              <HudButton onClick={() => applyBuiltIn(b)}>Apply</HudButton>
            </div>
            <p className="text-sm text-neutral-500">{b.description}</p>
          </div>
        ))}
        <p className="text-sm text-neutral-500">
          Showing the {Math.min(3, Math.max(1, speakers.length || 2))}-speaker
          versions, matching your cast. Each look has a solo, duo and trio
          layout — the same nine a job file can name.
        </p>
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

      {/* Presets carry the look. A project carries everything — cast, script,
          the narration you already generated, pacing, subtitles. Keeping the
          two separate is the point: "try a different look" must not throw away
          your script, and "open last week's video" must not be a look. */}
      <section className="space-y-3 border-t border-accent/15 pt-5">
        <div className="label-etched">Project</div>
        <p className="text-sm text-neutral-500">
          Everything, not just the look. Your work is autosaved as you go — this
          is for keeping named copies and moving them between machines.
        </p>
        <div className="flex gap-2">
          <HudButton onClick={saveProject}>Save project…</HudButton>
          <HudButton onClick={openProject}>Open project…</HudButton>
        </div>
      </section>

      {/* A whole finished video, in a click. Someone opening this app for the
          first time otherwise faces an empty canvas and no idea what it makes. */}
      <section className="space-y-3 border-t border-accent/15 pt-5">
        <div className="label-etched">Sample project</div>
        <p className="text-sm text-neutral-500">
          "{SAMPLE_NAME}" — all three characters, a written script, the house
          look and subtitles. Press Render and you get a video. It replaces what
          is on screen now, so save first if you want to keep it.
        </p>
        <HudButton
          onClick={async () => {
            if (
              speakers.length > 0 &&
              !window.confirm("This replaces the current project. Continue?")
            ) {
              return;
            }
            const dir = await window.byok?.storage?.puppetDir().catch(() => null);
            loadProject(sampleProject(dir ?? null));
            setNote(`Loaded "${SAMPLE_NAME}".`);
          }}
        >
          Load {SAMPLE_NAME}
        </HudButton>
      </section>

      <section className="space-y-3 border-t border-accent/15 pt-5">
        <div className="label-etched">Share the look as a file</div>
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
