import { useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject, ReactNode } from "react";
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

/** A side rail that can fold away to a spine.
 *
 *  At the 1280px minimum window width the two 384px rails leave the preview
 *  267px wide for a 1080x1920 frame — too small to judge subtitle size or
 *  waveform detail, which is most of what the preview is for. Folding one rail
 *  hands that width straight to the canvas. */
function Rail({
  title, side, open, onToggle, flareRef, onFlare, children,
}: {
  title: string;
  side: "left" | "right";
  open: boolean;
  onToggle: () => void;
  flareRef: MutableRefObject<HTMLElement | null>;
  onFlare: () => void;
  children: ReactNode;
}) {
  // ‹ collapses a left rail and expands a right one, so the arrow always points
  // the way the panel will move.
  const glyph = open ? (side === "left" ? "‹" : "›") : side === "left" ? "›" : "‹";
  return (
    <aside
      ref={flareRef}
      onClick={onFlare}
      className={`panel-hud hud-flare-target relative min-h-0 transition-[width] duration-200 ${
        open ? "w-96 p-5" : "w-9 px-0 py-3"
      }`}
    >
      <HudCorners />
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        title={open ? `Collapse ${title}` : `Expand ${title}`}
        className={`absolute top-2 z-20 h-6 w-6 grid place-items-center text-accent-bright/70 hover:text-accent-bright ${
          side === "left" ? "right-2" : "left-2"
        }`}
      >
        {glyph}
      </button>
      {open ? (
        children
      ) : (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className="label-etched absolute inset-x-0 top-10 mx-auto whitespace-nowrap hover:text-accent-bright"
          style={{ writingMode: "vertical-rl" }}
        >
          {title}
        </button>
      )}
    </aside>
  );
}

export default function App() {
  const [view, setView] = useState<"canvas" | "settings" | "narration">("canvas");
  const canvasRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ w: 0, h: 0 });
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [castOpen, setCastOpen] = useState(true);
  const [sceneOpen, setSceneOpen] = useState(true);

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

  // Measure the room the preview has, then size the frame to fit inside it —
  // rather than the reverse. CSS can't express "contain" here: aspect-ratio
  // plus max-width/max-height clamps one axis and lets the other keep its
  // specified size, which silently un-squares the frame. Computing it means
  // the preview is always as large as the space genuinely allows, in both
  // orientations, and the SVG gets exact pixel dimensions for free.
  useEffect(() => {
    if (!stageRef.current) return;
    const el = stageRef.current;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setStageSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [view]);

  const canvasSize = useMemo(() => {
    const ratio = isPortrait ? 9 / 16 : 16 / 9;
    const w = Math.floor(Math.min(stageSize.w, stageSize.h * ratio));
    return { w: Math.max(0, w), h: Math.max(0, Math.floor(w / ratio)) };
  }, [stageSize, isPortrait]);

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
        {/* LEFT: the cast — one tab per speaker, plus music */}
        <Rail
          title="Cast"
          side="left"
          open={castOpen}
          onToggle={() => setCastOpen((v) => !v)}
          flareRef={asideFlare.ref}
          onFlare={asideFlare.fire}
        >
          <CastPanel />
        </Rail>

        {/* CENTER: preview canvas, narration, or backend settings */}
        <main
          ref={mainFlare.ref}
          onClick={mainFlare.fire}
          // No place-items-center here: a centred grid item has an indefinite
          // height, so the stage's h-full resolved against nothing and never
          // shrank when the window did. The stage stretches; the centring
          // happens inside it.
          className={`panel-hud hud-flare-target relative flex-1 p-6 min-h-0 ${
            view === "canvas" ? "grid" : "overflow-hidden"
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
            <div ref={stageRef} className="min-w-0 min-h-0 grid place-items-center">
            <div
              ref={canvasRef}
              className="slot-recessed relative grid place-items-center overflow-hidden"
              style={{ width: canvasSize.w, height: canvasSize.h }}
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
            </div>
          )}
        </main>

        {/* RIGHT: the scene — frame, subtitles, render, presets */}
        <Rail
          title="Scene"
          side="right"
          open={sceneOpen}
          onToggle={() => setSceneOpen((v) => !v)}
          flareRef={sceneFlare.ref}
          onFlare={sceneFlare.fire}
        >
          <ScenePanel />
        </Rail>
      </div>
    </div>
  );
}
