import { useEffect, useRef, useState } from "react";
import { HudButton } from "./components/ui/HudButton";
import { Toggle } from "./components/ui/Toggle";
import { Slider } from "./components/ui/Slider";
import { SpeakerAvatar } from "./components/canvas/SpeakerAvatar";
import { WaveformRenderer } from "./components/canvas/WaveformRenderer";
import BackendPanel from "./components/settings/BackendPanel";
import { useProjectStore } from "./store/useProjectStore";
import { useSettingsStore } from "./store/useSettingsStore";
import { useVoicesStore } from "./store/useVoicesStore";
import { deriveAccentShades } from "./lib/color/deriveShades";
import { VISEME } from "./lib/visemes/visemeMap";
import type { Fps, WaveformConfig } from "./store/types";

const FPS_OPTIONS: Fps[] = [10, 24, 30];
const WAVEFORM_STYLES: WaveformConfig["style"][] = ["bars", "lines", "wave", "mirror", "dots", "rings"];
const WAVEFORM_POSITIONS: WaveformConfig["position"][] = ["circular", "top", "bottom", "left", "right"];
const WAVEFORM_BEHAVIORS: { id: WaveformConfig["behavior"]; label: string }[] = [
  { id: "single", label: "Single" },
  { id: "single-colorshift", label: "Color-shift" },
  { id: "dual", label: "Dual" },
  { id: "dual-plus-music", label: "Dual+Music" },
  { id: "triple", label: "Triple" },
];

/** Two corner-bracket accents — the recurring HUD-panel detail. Drop this
 *  inside any element with position:relative that uses .panel-hud. */
function HudCorners() {
  return (
    <>
      <span className="hud-corner tl" />
      <span className="hud-corner br" />
    </>
  );
}

export default function App() {
  const [view, setView] = useState<"canvas" | "settings">("canvas");
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });

  const fps = useProjectStore((s) => s.fps);
  const setFps = useProjectStore((s) => s.setFps);
  const render = useProjectStore((s) => s.render);
  const setRender = useProjectStore((s) => s.setRender);
  const speakers = useProjectStore((s) => s.speakers);
  const addSpeaker = useProjectStore((s) => s.addSpeaker);
  const removeSpeaker = useProjectStore((s) => s.removeSpeaker);
  const updateSpeaker = useProjectStore((s) => s.updateSpeaker);
  const voices = useVoicesStore((s) => s.voices);
  const waveform = useProjectStore((s) => s.waveform);
  const setWaveform = useProjectStore((s) => s.setWaveform);
  const accentColor = useSettingsStore((s) => s.accentColor);

  const isPortrait = render.format === "9:16";

  // Recolor every accent-* class + glow effect live, including on first
  // mount (so a previously chosen color persists across restarts).
  useEffect(() => {
    const { base, bright, deep } = deriveAccentShades(accentColor);
    const root = document.documentElement.style;
    root.setProperty("--accent-rgb", base);
    root.setProperty("--accent-bright-rgb", bright);
    root.setProperty("--accent-deep-rgb", deep);
  }, [accentColor]);

  // The waveform SVG needs real pixel dimensions of the aspect-locked slot,
  // which CSS aspect-ratio computes at layout time — so track it via
  // ResizeObserver rather than guessing from render.width/height.
  useEffect(() => {
    if (!canvasRef.current) return;
    const el = canvasRef.current;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setCanvasSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [view]);

  return (
    <div className="h-full w-full flex flex-col bg-metal-900 text-neutral-200">
      <div className="scanlines" />

      {/* Top bar */}
      <header className="panel-hud relative m-3 px-6 py-3 flex items-center justify-between">
        <HudCorners />
        <h1 className="font-display font-semibold uppercase tracking-[0.25em] text-xl label-lit">
          BYOK-Vid-Creator
        </h1>
        <div className="flex items-center gap-4">
          <span className="label-etched hidden sm:inline">Deterministic Video Studio</span>
          <button
            onClick={() => setView(view === "canvas" ? "settings" : "canvas")}
            className="label-etched px-3 py-1.5 border border-accent/30 hover:border-accent hover:text-accent-bright"
          >
            {view === "canvas" ? "⚙ Backend Settings" : "← Back to Canvas"}
          </button>
        </div>
      </header>

      <div className="flex flex-1 gap-3 px-3 pb-3 min-h-0">
        {/* LEFT RAIL */}
        <aside className="panel-hud relative w-80 p-5 flex flex-col gap-7 overflow-y-auto">
          <HudCorners />
          <section>
            <div className="label-etched mb-2">Frame Rate</div>
            <div className="flex gap-2">
              {FPS_OPTIONS.map((f) => (
                <HudButton key={f} active={fps === f} onClick={() => setFps(f)}>
                  {f}
                </HudButton>
              ))}
            </div>
          </section>

          <section>
            <div className="label-etched mb-2">Aspect Ratio</div>
            <div className="flex gap-2">
              <HudButton
                active={render.format === "9:16"}
                onClick={() => setRender({ format: "9:16", width: 1080, height: 1920 })}
              >
                9:16
              </HudButton>
              <HudButton
                active={render.format === "16:9"}
                onClick={() => setRender({ format: "16:9", width: 1920, height: 1080 })}
              >
                16:9
              </HudButton>
            </div>
          </section>

          <section>
            <div className="label-etched mb-2">Waveform Style</div>
            <div className="flex flex-wrap gap-2">
              {WAVEFORM_STYLES.map((s) => (
                <HudButton key={s} active={waveform.style === s} onClick={() => setWaveform({ style: s })}>
                  {s}
                </HudButton>
              ))}
            </div>
          </section>

          <section>
            <div className="label-etched mb-2">Waveform Position</div>
            <div className="flex flex-wrap gap-2">
              {WAVEFORM_POSITIONS.map((p) => (
                <HudButton key={p} active={waveform.position === p} onClick={() => setWaveform({ position: p })}>
                  {p}
                </HudButton>
              ))}
            </div>
          </section>

          <section>
            <div className="label-etched mb-2">Waveform Shape</div>
            <div className="space-y-4">
              <Slider
                label="Size"
                value={waveform.scale}
                min={0.5} max={1.8} step={0.05}
                onChange={(v) => setWaveform({ scale: v })}
                format={(v) => `${v.toFixed(2)}x`}
              />
              <Slider
                label="Density"
                value={waveform.density}
                min={16} max={96} step={4}
                onChange={(v) => setWaveform({ density: v })}
                format={(v) => `${Math.round(v)}`}
              />
              {waveform.position !== "circular" && waveform.style !== "rings" && (
                <Toggle
                  label="Flush to edge"
                  checked={waveform.edgeFlush}
                  onChange={(v) => setWaveform({ edgeFlush: v })}
                />
              )}
              {waveform.style === "dots" && (
                <Slider
                  label="Dot Size"
                  value={waveform.dotSize}
                  min={0.4} max={2.5} step={0.1}
                  onChange={(v) => setWaveform({ dotSize: v })}
                  format={(v) => `${v.toFixed(1)}x`}
                />
              )}
              {waveform.style === "rings" && (
                <>
                  <Slider
                    label="Ring Size"
                    value={waveform.ringSize}
                    min={0.5} max={1.5} step={0.05}
                    onChange={(v) => setWaveform({ ringSize: v })}
                    format={(v) => `${v.toFixed(2)}x`}
                  />
                  <Slider
                    label="Center Opening"
                    value={waveform.ringInnerRadius}
                    min={0} max={0.8} step={0.02}
                    onChange={(v) => setWaveform({ ringInnerRadius: v })}
                    format={(v) => `${Math.round(v * 100)}%`}
                  />
                  <Slider
                    label="Position X"
                    value={waveform.ringX}
                    min={0} max={1} step={0.02}
                    onChange={(v) => setWaveform({ ringX: v })}
                    format={(v) => `${Math.round(v * 100)}%`}
                  />
                  <Slider
                    label="Position Y"
                    value={waveform.ringY}
                    min={0} max={1} step={0.02}
                    onChange={(v) => setWaveform({ ringY: v })}
                    format={(v) => `${Math.round(v * 100)}%`}
                  />
                </>
              )}
            </div>
          </section>

          <section>
            <div className="label-etched mb-2">Waveform Mode</div>
            <div className="flex flex-wrap gap-2">
              {WAVEFORM_BEHAVIORS.map((b) => (
                <HudButton
                  key={b.id}
                  active={waveform.behavior === b.id}
                  onClick={() => setWaveform({ behavior: b.id })}
                >
                  {b.label}
                </HudButton>
              ))}
            </div>
          </section>

          <section>
            <div className="label-etched mb-2">Waveform Colors</div>
            <div className="flex items-center gap-4">
              {([
                ["colorA", "Speaker A"],
                ["colorB", "Speaker B"],
                ["colorMusic", "Music"],
              ] as const).map(([key, label]) => (
                <label key={key} className="flex flex-col items-center gap-1.5">
                  <input
                    type="color"
                    value={waveform[key]}
                    onChange={(e) => setWaveform({ [key]: e.target.value } as Partial<WaveformConfig>)}
                    className="h-8 w-8 border border-accent/30 bg-transparent p-0"
                  />
                  <span className="text-sm text-neutral-400">{label}</span>
                </label>
              ))}
            </div>
          </section>

          <section>
            <div className="label-etched mb-2 flex items-center justify-between">
              <span>Speakers</span>
              <button onClick={addSpeaker} className="text-accent-bright hover:text-accent text-sm">
                + Add
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {speakers.length === 0 && <p className="text-sm text-neutral-500">No speakers yet.</p>}
              {speakers.map((sp) => (
                <div
                  key={sp.id}
                  className="border border-accent/25 bg-metal-800/60 px-3 py-2.5 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: sp.borderColor }} />
                      <span className="text-base text-neutral-200">{sp.label}</span>
                    </div>
                    <button onClick={() => removeSpeaker(sp.id)} className="text-neutral-500 hover:text-red-400 text-sm">
                      ✕
                    </button>
                  </div>
                  {voices.length > 0 ? (
                    <select
                      value={sp.voiceId ?? ""}
                      onChange={(e) => updateSpeaker(sp.id, { voiceId: e.target.value || undefined })}
                      className="w-full bg-metal-900 border border-accent/25 px-2 py-1.5 text-sm text-neutral-300 outline-none focus:border-accent"
                    >
                      <option value="">No voice assigned</option>
                      {voices.map((v) => (
                        <option key={v.id} value={v.onnxPath}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-sm text-neutral-500">
                      Scan for voices in Backend Settings to assign one.
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        </aside>

        {/* CENTER: preview canvas or backend settings */}
        <main
          className={`panel-hud relative flex-1 p-6 min-h-0 ${
            view === "settings" ? "overflow-hidden" : "grid place-items-center"
          }`}
        >
          <HudCorners />
          {view === "settings" ? (
            <div className="w-full h-full">
              <BackendPanel />
            </div>
          ) : (
            <div
              ref={canvasRef}
              className="slot-recessed relative grid place-items-center overflow-hidden"
              style={{
                aspectRatio: isPortrait ? "9 / 16" : "16 / 9",
                height: isPortrait ? "80%" : "auto",
                width: isPortrait ? "auto" : "80%",
              }}
            >
              <WaveformRenderer config={waveform} width={canvasSize.w} height={canvasSize.h} />

              <span className="label-etched text-center leading-relaxed relative z-10">
                {render.format} · {fps} FPS
                <br />
                {render.width}×{render.height}
              </span>

              {speakers.map((sp) => (
                <div
                  key={sp.id}
                  style={{
                    position: "absolute",
                    left: `${sp.x * 100}%`,
                    top: `${sp.y * 100}%`,
                    transform: "translate(-50%, -50%)",
                  }}
                  className="z-10"
                >
                  <SpeakerAvatar
                    sheetUrl={sp.sheetUrl}
                    viseme={VISEME.NEUTRAL}
                    size={sp.size}
                    bgOpacity={sp.bgOpacity}
                    borderOpacity={sp.borderOpacity}
                    bgColor={sp.bgColor}
                    borderColor={sp.borderColor}
                  />
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
