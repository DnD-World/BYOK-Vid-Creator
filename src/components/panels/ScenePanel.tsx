// ---------------------------------------------------------------------------
// RIGHT PANEL — the scene: everything that isn't tied to one sound source.
// Frame settings, subtitles, render, and presets.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { HudButton } from "../ui/HudButton";
import { Slider } from "../ui/Slider";
import { Toggle } from "../ui/Toggle";
import { Tabs } from "../ui/Tabs";
import { BackgroundPanel } from "./BackgroundPanel";
import { SubtitleFontPicker } from "./SubtitleFontPicker";
import { RenderBar } from "../render/RenderBar";
import { PresetsPanel } from "./PresetsPanel";
import { RoadmapSection } from "../canvas/RoadmapSection";
import { useProjectStore } from "../../store/useProjectStore";
import { buildCues } from "../../lib/subtitles/wordTiming";
import { toSrt } from "../../lib/subtitles/srt";
import type { Fps, SubtitleConfig } from "../../store/types";

type Tab = "frame" | "background" | "subtitles" | "render" | "presets";

const FPS_OPTIONS: Fps[] = [10, 24, 30];
const SUB_POS: SubtitleConfig["position"][] = ["top", "center", "bottom"];

export function ScenePanel() {
  const [tab, setTab] = useState<Tab>("frame");

  const fps = useProjectStore((s) => s.fps);
  const setFps = useProjectStore((s) => s.setFps);
  const render = useProjectStore((s) => s.render);
  const setRender = useProjectStore((s) => s.setRender);
  const subtitles = useProjectStore((s) => s.subtitles);
  const setSubtitles = useProjectStore((s) => s.setSubtitles);
  const narration = useProjectStore((s) => s.narration);
  const visemeFadeMs = useProjectStore((s) => s.visemeFadeMs);
  const setVisemeFadeMs = useProjectStore((s) => s.setVisemeFadeMs);
  const idleMotion = useProjectStore((s) => s.idleMotion);
  const setIdleMotion = useProjectStore((s) => s.setIdleMotion);
  const [srtNote, setSrtNote] = useState<string | null>(null);

  const exportSrt = async () => {
    if (!narration) return;
    setSrtNote(null);
    const target = await window.byok.dialog.saveFile("subtitles.srt", [
      { name: "SubRip subtitles", extensions: ["srt"] },
    ]);
    if (!target) return;
    try {
      // Built through buildCues with the SAME maxChars the video uses, so the
      // file breaks its lines exactly where the picture does.
      const text = toSrt(buildCues(narration.segments, subtitles.maxChars));
      await window.byok.storage.writeFile(
        target,
        new TextEncoder().encode(text).buffer as ArrayBuffer
      );
      setSrtNote(`Saved ${target.split(/[\\/]/).pop()}`);
    } catch (e) {
      setSrtNote(`Couldn't save it: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <h2 className="title-deco uppercase text-lg mb-3">Scene</h2>

      <Tabs
        tabs={[
          { id: "frame", label: "Frame" },
          { id: "background", label: "Background" },
          { id: "subtitles", label: "Subtitles" },
          { id: "render", label: "Render" },
          { id: "presets", label: "Presets" },
        ]}
        active={tab}
        onChange={setTab}
      />

      <div className="flex-1 overflow-y-auto pr-1 space-y-6">
        {tab === "frame" && (
          <>
            <section>
              <div className="label-etched mb-2">Aspect Ratio</div>
              <div className="flex gap-2">
                <HudButton
                  active={render.format === "9:16"}
                  onClick={() => setRender({ format: "9:16", width: 1080, height: 1920 })}
                >
                  9:16 vertical
                </HudButton>
                <HudButton
                  active={render.format === "16:9"}
                  onClick={() => setRender({ format: "16:9", width: 1920, height: 1080 })}
                >
                  16:9 wide
                </HudButton>
              </div>
            </section>

            <section>
              <div className="label-etched mb-2">Frame Rate</div>
              <div className="flex gap-2">
                {FPS_OPTIONS.map((f) => (
                  <HudButton key={f} active={fps === f} onClick={() => setFps(f)}>
                    {f} fps
                  </HudButton>
                ))}
              </div>
              <p className="text-sm text-neutral-500 mt-2">
                Higher is smoother and slower to render. 24 is a good default.
              </p>
            </section>

            <section>
              <div className="label-etched mb-2">Lip-sync</div>
              <Slider
                label="Mouth Crossfade" value={visemeFadeMs} min={0} max={200} step={5}
                onChange={(v) => setVisemeFadeMs(Math.round(v))}
                format={(v) => (v === 0 ? "hard cut" : `${Math.round(v)} ms`)}
              />
              <p className="text-sm text-neutral-500 mt-2">
                Blends one mouth shape into the next instead of cutting. At {fps}
                {" "}fps a frame is {Math.round(1000 / fps)}ms, so anything under
                that lands on a single frame and won't read.
              </p>
              <div className="mt-4">
                <Slider
                  label="Idle Motion" value={idleMotion} min={0} max={1} step={0.05}
                  onChange={setIdleMotion}
                  format={(v) => (v === 0 ? "still" : `${Math.round(v * 100)}%`)}
                />
                <p className="text-sm text-neutral-500 mt-2">
                  Breathing and a slow drift, so a head isn't a photograph with a
                  moving mouth. Whoever is speaking moves slightly more.
                </p>
              </div>
            </section>

            <RoadmapSection />
          </>
        )}

        {tab === "background" && <BackgroundPanel />}

        {tab === "subtitles" && (
          <section className="space-y-4">
            <Toggle
              label="Show subtitles"
              checked={subtitles.enabled}
              onChange={(v) => setSubtitles({ enabled: v })}
            />
            {subtitles.enabled && (
              <>
                <SubtitleFontPicker />

                <div>
                  <div className="label-etched mb-2">Position</div>
                  <div className="flex flex-wrap gap-2">
                    {SUB_POS.map((p) => (
                      <HudButton
                        key={p}
                        active={subtitles.position === p}
                        onClick={() => setSubtitles({ position: p })}
                      >
                        {p}
                      </HudButton>
                    ))}
                  </div>
                </div>
                <Slider
                  label="Text Size" value={subtitles.fontSize} min={0.02} max={0.14} step={0.002}
                  onChange={(v) => setSubtitles({ fontSize: v })}
                  format={(v) => `${(v * 100).toFixed(1)}%`}
                />
                <Slider
                  label="Outline" value={subtitles.strokeWidth} min={0} max={0.35} step={0.01}
                  onChange={(v) => setSubtitles({ strokeWidth: v })}
                  format={(v) => (v === 0 ? "none" : `${Math.round(v * 100)}%`)}
                />
                <Slider
                  label="Active Word Glow" value={subtitles.activeGlow} min={0} max={1.5} step={0.05}
                  onChange={(v) => setSubtitles({ activeGlow: v })}
                  format={(v) => (v === 0 ? "off" : `${v.toFixed(2)}x`)}
                />
                <Slider
                  label="Line Length" value={subtitles.maxChars} min={14} max={80} step={1}
                  onChange={(v) => setSubtitles({ maxChars: Math.round(v) })}
                  format={(v) => `${Math.round(v)} chars`}
                />
                <Toggle
                  label="Active word takes the speaker's colour"
                  checked={subtitles.activeFromSpeaker}
                  onChange={(v) => setSubtitles({ activeFromSpeaker: v })}
                />
                <Toggle
                  label="UPPERCASE"
                  checked={subtitles.uppercase}
                  onChange={(v) => setSubtitles({ uppercase: v })}
                />
                <div className="flex items-center gap-4">
                  {(
                    [
                      ["color", "Text"],
                      // Hidden rather than disabled while the speaker drives it:
                      // a control that visibly does nothing is worse than one
                      // that isn't there.
                      ...(subtitles.activeFromSpeaker
                        ? []
                        : ([["activeColor", "Active"]] as const)),
                      ["strokeColor", "Outline"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="flex flex-col items-center gap-1.5">
                      <input
                        type="color" value={subtitles[key]}
                        onChange={(e) => setSubtitles({ [key]: e.target.value })}
                        className="h-9 w-9 border border-accent/30 bg-transparent p-0"
                      />
                      <span className="text-sm text-neutral-400">{label}</span>
                    </label>
                  ))}
                </div>
                {!narration && (
                  <p className="text-sm text-neutral-500">
                    Generate narration to see real subtitles on the canvas.
                  </p>
                )}

                <div className="border-t border-accent/15 pt-4 space-y-2">
                  <HudButton onClick={exportSrt} disabled={!narration}>
                    Export .srt
                  </HudButton>
                  <p className="text-sm text-neutral-500">
                    The same lines and the same timing the video burns in, as a subtitle
                    file — for platforms that want their own captions. Styling isn't
                    carried: an .srt is text and timing, and the player draws it.
                  </p>
                  {srtNote && <p className="text-sm text-accent-bright">{srtNote}</p>}
                </div>
              </>
            )}
          </section>
        )}

        {tab === "render" && <RenderBar />}

        {tab === "presets" && <PresetsPanel />}
      </div>
    </div>
  );
}
