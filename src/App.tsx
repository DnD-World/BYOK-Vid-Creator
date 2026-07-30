import { useEffect, useMemo, useRef, useState } from "react";
import { Toggle } from "./components/ui/Toggle";
import { SpeakerAvatar } from "./components/canvas/SpeakerAvatar";
import { WaveformScene } from "./components/canvas/WaveformScene";
import { SubtitleScene } from "./components/canvas/SubtitleScene";
import { usePreviewClock } from "./lib/motion/usePreviewClock";
import { buildCues } from "./lib/subtitles/wordTiming";
import { buildSpeakerVisemeTracks } from "./lib/visemes/speakerTracks";
import { visemeAt } from "./lib/visemes/timeline";
import { useSheetUrls } from "./lib/visemes/useSheetUrls";
import { CastPanel } from "./components/panels/CastPanel";
import { ScenePanel } from "./components/panels/ScenePanel";
import { buildTracks } from "./lib/waveform/buildTracks";
import BackendPanel from "./components/settings/BackendPanel";
import NarrationPanel from "./components/settings/NarrationPanel";
import { useProjectStore } from "./store/useProjectStore";
import { useSettingsStore } from "./store/useSettingsStore";
import { deriveAccentShades } from "./lib/color/deriveShades";
import { useCornerFlare } from "./lib/motion/useCornerFlare";
import { VISEME } from "./lib/visemes/visemeMap";

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
  const render = useProjectStore((s) => s.render);
  const speakers = useProjectStore((s) => s.speakers);
  const updateSpeaker = useProjectStore((s) => s.updateSpeaker);
  const musicWaveform = useProjectStore((s) => s.musicWaveform);
  const musicColor = useProjectStore((s) => s.musicColor);
  const narration = useProjectStore((s) => s.narration);
  const subtitles = useProjectStore((s) => s.subtitles);
  const attachedAudio = useProjectStore((s) => s.attachedAudio);

  // Attached audio wins, matching the render bar: whatever ends up in the
  // video is what the preview animates to.
  const activeAnalysis = attachedAudio?.analysis ?? narration?.analysis ?? null;

  // One clock shared by every canvas overlay. Loops over the narration so the
  // preview shows the real audio cycling rather than drifting into silence.
  const previewTimeMs = usePreviewClock(activeAnalysis?.durationMs);
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
  const tracks = useMemo(
    () => buildTracks(speakers, musicWaveform, musicColor),
    [speakers, musicWaveform, musicColor]
  );
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
  const sceneFlare = useCornerFlare<HTMLElement>();

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
        {/* LEFT: the cast — one tab per speaker, plus music */}
        <aside
          ref={asideFlare.ref}
          onClick={asideFlare.fire}
          className="panel-hud hud-flare-target relative w-96 p-5 min-h-0"
        >
          <HudCorners />
          <CastPanel />
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
                tracks={tracks}
                width={canvasSize.w}
                height={canvasSize.h}
                timeMs={previewTimeMs}
                analysis={activeAnalysis}
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
                    outlineShape={sp.outlineShape}
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

        {/* RIGHT: the scene — frame, subtitles, render, presets */}
        <aside
          ref={sceneFlare.ref}
          onClick={sceneFlare.fire}
          className="panel-hud hud-flare-target relative w-96 p-5 min-h-0"
        >
          <HudCorners />
          <ScenePanel />
        </aside>
      </div>
    </div>
  );
}
