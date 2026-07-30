import { useEffect, useMemo, useRef, useState } from "react";
import { HudButton } from "./components/ui/HudButton";
import { Toggle } from "./components/ui/Toggle";
import { Slider } from "./components/ui/Slider";
import { SpeakerAvatar } from "./components/canvas/SpeakerAvatar";
import { WaveformScene } from "./components/canvas/WaveformScene";
import { SubtitleScene } from "./components/canvas/SubtitleScene";
import { usePreviewClock } from "./lib/motion/usePreviewClock";
import { buildCues } from "./lib/subtitles/wordTiming";
import { buildSpeakerVisemeTracks } from "./lib/visemes/speakerTracks";
import { visemeAt } from "./lib/visemes/timeline";
import { useSheetUrls } from "./lib/visemes/useSheetUrls";
import { TemplatesPanel } from "./components/canvas/TemplatesPanel";
import { RoadmapSection } from "./components/canvas/RoadmapSection";
import BackendPanel from "./components/settings/BackendPanel";
import NarrationPanel from "./components/settings/NarrationPanel";
import { RenderBar } from "./components/render/RenderBar";
import { useProjectStore } from "./store/useProjectStore";
import { useSettingsStore } from "./store/useSettingsStore";
import { useVoicesStore } from "./store/useVoicesStore";
import { deriveAccentShades } from "./lib/color/deriveShades";
import { useCornerFlare } from "./lib/motion/useCornerFlare";
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
 *  inside any element with position:relative that uses .panel-hud. Always
 *  breathes (cheap — two small elements, not the whole panel body). */
function HudCorners() {
  return (
    <>
      <span className="hud-corner tl hud-breathe" />
      <span className="hud-corner br hud-breathe" />
    </>
  );
}

/** Snap step for avatar dragging — 5% of the frame in each axis. */
const SNAP_GRID = 0.05;
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export default function App() {
  const [view, setView] = useState<"canvas" | "settings" | "narration">("canvas");
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [draggingId, setDraggingId] = useState<string | null>(null);

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
  const narration = useProjectStore((s) => s.narration);
  const subtitles = useProjectStore((s) => s.subtitles);
  const setSubtitles = useProjectStore((s) => s.setSubtitles);

  // One clock shared by every canvas overlay. Loops over the narration so the
  // preview shows the real audio cycling rather than drifting into silence.
  const previewTimeMs = usePreviewClock(narration?.analysis?.durationMs);
  const cues = useMemo(
    () => buildCues(narration?.segments ?? [], subtitles.maxChars),
    [narration, subtitles.maxChars]
  );

  // Lip-sync, driven by exactly the same word timings as the subtitles.
  const visemeTracks = useMemo(
    () => buildSpeakerVisemeTracks(narration?.segments ?? [], fps),
    [narration, fps]
  );
  const sheetUrls = useSheetUrls(speakers.map((sp) => sp.sheetPath));
  const accentColor = useSettingsStore((s) => s.accentColor);
  const motionEnabled = useSettingsStore((s) => s.motionEnabled);

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

  // Gates the breathing glow / click flash / corner flare CSS effects.
  // prefers-reduced-motion is handled entirely in CSS and always wins
  // regardless of this — this is the separate, explicit app-level toggle.
  useEffect(() => {
    document.documentElement.setAttribute("data-hud-motion", motionEnabled ? "on" : "off");
  }, [motionEnabled]);

  const headerFlare = useCornerFlare<HTMLElement>();
  const asideFlare = useCornerFlare<HTMLElement>();
  const mainFlare = useCornerFlare<HTMLElement>();

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

  // Avatar dragging. The listeners live on window rather than the avatar so a
  // fast drag that outruns the cursor doesn't drop the gesture the moment the
  // pointer leaves the small disk.
  useEffect(() => {
    if (!draggingId) return;
    const onMove = (e: PointerEvent) => {
      const el = canvasRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      let x = (e.clientX - r.left) / r.width;
      let y = (e.clientY - r.top) / r.height;
      if (snapToGrid) {
        x = Math.round(x / SNAP_GRID) * SNAP_GRID;
        y = Math.round(y / SNAP_GRID) * SNAP_GRID;
      }
      updateSpeaker(draggingId, { x: clamp01(x), y: clamp01(y) });
    };
    const onUp = () => setDraggingId(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [draggingId, snapToGrid, updateSpeaker]);

  return (
    <div className="h-full w-full flex flex-col bg-metal-900 text-neutral-200">
      <div className="scanlines" />

      {/* Top bar */}
      <header
        ref={headerFlare.ref}
        onClick={headerFlare.fire}
        className="panel-hud hud-flare-target relative m-3 px-6 py-3 flex items-center justify-between"
      >
        <HudCorners />
        <h1 className="font-display font-semibold uppercase tracking-[0.25em] text-xl label-lit">
          BYOK-Vid-Creator
        </h1>
        <div className="flex items-center gap-3">
          <span className="label-etched hidden sm:inline mr-2">Deterministic Video Studio</span>
          <button
            onClick={() => setView("canvas")}
            className={`label-etched px-3 py-1.5 border ${
              view === "canvas" ? "border-accent text-accent-bright" : "border-accent/30 hover:border-accent hover:text-accent-bright"
            }`}
          >
            Canvas
          </button>
          <button
            onClick={() => setView("narration")}
            className={`label-etched px-3 py-1.5 border ${
              view === "narration" ? "border-accent text-accent-bright" : "border-accent/30 hover:border-accent hover:text-accent-bright"
            }`}
          >
            Narration
          </button>
          <button
            onClick={() => setView("settings")}
            className={`label-etched px-3 py-1.5 border ${
              view === "settings" ? "border-accent text-accent-bright" : "border-accent/30 hover:border-accent hover:text-accent-bright"
            }`}
          >
            ⚙ Backend Settings
          </button>
        </div>
      </header>

      <div className="flex flex-1 gap-3 px-3 pb-3 min-h-0">
        {/* LEFT RAIL */}
        <aside
          ref={asideFlare.ref}
          onClick={asideFlare.fire}
          className="panel-hud hud-flare-target relative w-80 p-5 flex flex-col gap-7 overflow-y-auto"
        >
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
            <div className="label-etched mb-2">Subtitles</div>
            <div className="space-y-4">
              <Toggle
                label="Show subtitles"
                checked={subtitles.enabled}
                onChange={(v) => setSubtitles({ enabled: v })}
              />
              {subtitles.enabled && (
                <>
                  <div className="flex flex-wrap gap-2">
                    {(["top", "center", "bottom"] as const).map((p) => (
                      <HudButton
                        key={p}
                        active={subtitles.position === p}
                        onClick={() => setSubtitles({ position: p })}
                      >
                        {p}
                      </HudButton>
                    ))}
                  </div>
                  <Slider
                    label="Text Size"
                    value={subtitles.fontSize}
                    min={0.025} max={0.11} step={0.005}
                    onChange={(v) => setSubtitles({ fontSize: v })}
                    format={(v) => `${(v * 100).toFixed(1)}%`}
                  />
                  <Slider
                    label="Outline"
                    value={subtitles.strokeWidth}
                    min={0} max={0.3} step={0.01}
                    onChange={(v) => setSubtitles({ strokeWidth: v })}
                    format={(v) => `${Math.round(v * 100)}%`}
                  />
                  <Slider
                    label="Active Word Glow"
                    value={subtitles.activeGlow}
                    min={0} max={1.5} step={0.05}
                    onChange={(v) => setSubtitles({ activeGlow: v })}
                    format={(v) => (v === 0 ? "off" : `${v.toFixed(2)}x`)}
                  />
                  <Slider
                    label="Line Length"
                    value={subtitles.maxChars}
                    min={16} max={70} step={2}
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
                          type="color"
                          value={subtitles[key]}
                          onChange={(e) => setSubtitles({ [key]: e.target.value })}
                          className="h-8 w-8 border border-accent/30 bg-transparent p-0"
                        />
                        <span className="text-sm text-neutral-400">{label}</span>
                      </label>
                    ))}
                  </div>
                  {!narration && (
                    <p className="text-sm text-neutral-500">
                      Generate narration to see real subtitles here.
                    </p>
                  )}
                </>
              )}
            </div>
          </section>

          <section>
            <div className="label-etched mb-2 flex items-center justify-between">
              <span>Speakers</span>
              <button onClick={addSpeaker} className="text-accent-bright hover:text-accent text-sm">
                + Add
              </button>
            </div>
            {speakers.length > 0 && (
              <div className="mb-3">
                <Toggle label="Snap to grid when dragging" checked={snapToGrid} onChange={setSnapToGrid} />
              </div>
            )}
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
                  <div className="flex items-center gap-2">
                    <button
                      onClick={async () => {
                        const p = await window.byok.dialog.openFile([
                          { name: "Viseme sheet", extensions: ["png"] },
                        ]);
                        if (p) updateSpeaker(sp.id, { sheetPath: p });
                      }}
                      className="label-etched underline hover:text-accent-bright"
                    >
                      {sp.sheetPath ? "Change face" : "Choose face…"}
                    </button>
                    {sp.sheetPath && (
                      <button
                        onClick={() => updateSpeaker(sp.id, { sheetPath: undefined })}
                        className="label-etched underline text-neutral-500 hover:text-red-400"
                      >
                        clear
                      </button>
                    )}
                  </div>
                  {sp.sheetPath && (
                    <p className="text-sm text-neutral-500 truncate" title={sp.sheetPath}>
                      {sp.sheetPath.split(/[\\/]/).pop()}
                    </p>
                  )}
                  <Slider
                    label="Size"
                    value={sp.size}
                    min={0.05} max={0.9} step={0.01}
                    onChange={(v) => updateSpeaker(sp.id, { size: v })}
                    format={(v) => `${Math.round(v * 100)}%`}
                  />
                  <Slider
                    label="Position X"
                    value={sp.x}
                    min={0} max={1} step={0.01}
                    onChange={(v) => updateSpeaker(sp.id, { x: v })}
                    format={(v) => `${Math.round(v * 100)}%`}
                  />
                  <Slider
                    label="Position Y"
                    value={sp.y}
                    min={0} max={1} step={0.01}
                    onChange={(v) => updateSpeaker(sp.id, { y: v })}
                    format={(v) => `${Math.round(v * 100)}%`}
                  />
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

          <TemplatesPanel />

          <RenderBar />

          <RoadmapSection />
        </aside>

        {/* CENTER: preview canvas, narration, or backend settings */}
        <main
          ref={mainFlare.ref}
          onClick={mainFlare.fire}
          className={`panel-hud hud-flare-target relative flex-1 p-6 min-h-0 ${
            view === "canvas" ? "grid place-items-center" : "overflow-hidden"
          }`}
        >
          <HudCorners />
          {view === "settings" ? (
            <div className="w-full h-full">
              <BackendPanel />
            </div>
          ) : view === "narration" ? (
            <div className="w-full h-full">
              <NarrationPanel />
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
              <WaveformScene
                config={waveform}
                width={canvasSize.w}
                height={canvasSize.h}
                timeMs={previewTimeMs}
                analysis={narration?.analysis}
              />

              {/* Only while actually dragging — a permanent grid would fight
                  the preview, but an invisible snap feels like drift. */}
              {draggingId && snapToGrid && (
                <div
                  className="absolute inset-0 z-20 pointer-events-none"
                  style={{
                    backgroundImage:
                      "linear-gradient(to right, rgba(var(--accent-rgb), 0.18) 1px, transparent 1px)," +
                      "linear-gradient(to bottom, rgba(var(--accent-rgb), 0.18) 1px, transparent 1px)",
                    backgroundSize: `${SNAP_GRID * 100}% ${SNAP_GRID * 100}%`,
                  }}
                />
              )}

              <span className="label-etched text-center leading-relaxed relative z-10">
                {render.format} · {fps} FPS
                <br />
                {render.width}×{render.height}
              </span>

              {speakers.map((sp) => (
                <div
                  key={sp.id}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDraggingId(sp.id);
                  }}
                  title="Drag to reposition"
                  style={{
                    position: "absolute",
                    left: `${sp.x * 100}%`,
                    top: `${sp.y * 100}%`,
                    transform: "translate(-50%, -50%)",
                    cursor: draggingId === sp.id ? "grabbing" : "grab",
                    touchAction: "none",
                  }}
                  className="z-10"
                >
                  <SpeakerAvatar
                    sheetUrl={(sp.sheetPath && sheetUrls[sp.sheetPath]) || ""}
                    viseme={
                      visemeTracks[sp.id]
                        ? visemeAt(visemeTracks[sp.id], previewTimeMs / 1000)
                        : VISEME.NEUTRAL
                    }
                    // size is a fraction of frame width; the render resolves it
                    // against the output width the exact same way.
                    size={sp.size * canvasSize.w}
                    bgOpacity={sp.bgOpacity}
                    borderOpacity={sp.borderOpacity}
                    bgColor={sp.bgColor}
                    borderColor={sp.borderColor}
                  />
                </div>
              ))}

              {/* Above the avatars, matching the render's layer order. */}
              <SubtitleScene
                cues={cues}
                config={subtitles}
                width={canvasSize.w}
                height={canvasSize.h}
                timeMs={previewTimeMs}
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
