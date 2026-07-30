// ---------------------------------------------------------------------------
// RIGHT PANEL — the scene: everything that isn't tied to one sound source.
// Frame settings, subtitles, render, and presets.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { HudButton } from "../ui/HudButton";
import { Slider } from "../ui/Slider";
import { Toggle } from "../ui/Toggle";
import { Tabs } from "../ui/Tabs";
import { RenderBar } from "../render/RenderBar";
import { PresetsPanel } from "./PresetsPanel";
import { RoadmapSection } from "../canvas/RoadmapSection";
import { useProjectStore } from "../../store/useProjectStore";
import type { Fps, SubtitleConfig } from "../../store/types";

type Tab = "frame" | "subtitles" | "render" | "presets";

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

  return (
    <div className="flex flex-col h-full">
      <h2 className="label-lit text-base mb-3">Scene</h2>

      <Tabs
        tabs={[
          { id: "frame", label: "Frame" },
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

            <RoadmapSection />
          </>
        )}

        {tab === "subtitles" && (
          <section className="space-y-4">
            <Toggle
              label="Show subtitles"
              checked={subtitles.enabled}
              onChange={(v) => setSubtitles({ enabled: v })}
            />
            {subtitles.enabled && (
              <>
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
                  label="UPPERCASE"
                  checked={subtitles.uppercase}
                  onChange={(v) => setSubtitles({ uppercase: v })}
                />
                <div className="flex items-center gap-4">
                  {([
                    ["color", "Text"],
                    ["activeColor", "Active"],
                    ["strokeColor", "Outline"],
                  ] as const).map(([key, label]) => (
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
