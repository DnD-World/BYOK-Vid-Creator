import { useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject, ReactNode } from "react";
import { Toggle } from "./components/ui/Toggle";
import { SpeakerAvatar } from "./components/canvas/SpeakerAvatar";
import { PuppetAvatar } from "./components/canvas/PuppetAvatar";
import { WaveformScene } from "./components/canvas/WaveformScene";
import { BackgroundScene } from "./components/canvas/BackgroundScene";
import { SubtitleScene } from "./components/canvas/SubtitleScene";
import { usePreviewClock } from "./lib/motion/usePreviewClock";
import { buildCues } from "./lib/subtitles/wordTiming";
import { buildSpeakerVisemeTracks } from "./lib/visemes/speakerTracks";
import { visemeBlendAt } from "./lib/visemes/timeline";
import { useFileUrls } from "./lib/assets/useFileUrls";
import { useSubtitleFont } from "./lib/assets/useSubtitleFont";
import { usePuppets } from "./lib/puppets/usePuppets";
import { CastPanel } from "./components/panels/CastPanel";
import { ScenePanel } from "./components/panels/ScenePanel";
import { buildTracks } from "./lib/waveform/buildTracks";
import BackendPanel from "./components/settings/BackendPanel";
import NarrationPanel from "./components/settings/NarrationPanel";
import { useProjectStore } from "./store/useProjectStore";
import { useChatterboxVoicesStore } from "./store/useChatterboxVoicesStore";
import { useSettingsStore } from "./store/useSettingsStore";
import { deriveAccentShades, rgbTripleToHex } from "./lib/color/deriveShades";
import { headMotion, motionTransform } from "./lib/motion/idleMotion";
import {
  blinkAt, browAt, buildSpeakerBrowTracks,
  buildSpeakerHeadTracks, headPoseAt,
} from "./lib/motion/facePerformance";
import { sampleAnalysis } from "./lib/waveform/audioAnalysis";
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
        aria-label={open ? `Collapse ${title}` : `Expand ${title}`}
        // Was h-6 w-6 — a 24px target for the control that reshapes the whole
        // window, and the one you reach for most on a 1280px screen. 36px with
        // its own chamfered plate, so it reads as a control rather than as a
        // stray glyph floating in the corner of the panel.
        className={`absolute top-2 z-20 h-9 w-9 grid place-items-center text-lg leading-none
          text-accent-bright/80 hover:text-accent-bright cut-sm
          bg-[color-mix(in_srgb,var(--accent)_16%,var(--metal-lo))]
          hover:bg-[color-mix(in_srgb,var(--accent)_30%,var(--metal-lo))]
          transition-colors ${side === "left" ? "right-2" : "left-2"}`}
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
  const visemeFadeMs = useProjectStore((s) => s.visemeFadeMs);
  const idleMotion = useProjectStore((s) => s.idleMotion);
  const music = useProjectStore((s) => s.music);
  // Loaded here rather than in the Subtitles panel: the canvas has to draw in
  // it whether or not that panel is open.
  useSubtitleFont(subtitles.fontFamily, subtitles.fontWeight ?? 800);
  const backgrounds = useProjectStore((s) => s.backgrounds);
  const backgroundDim = useProjectStore((s) => s.backgroundDim);
  const backgroundCrossfadeMs = useProjectStore((s) => s.backgroundCrossfadeMs);

  // Attached audio wins, matching the render bar: whatever ends up in the
  // video is what the preview animates to.
  const activeAnalysis = attachedAudio?.analysis ?? narration?.analysis ?? null;

  // One clock shared by every canvas overlay. Loops over the narration so the
  // preview shows the real audio cycling rather than drifting into silence.
  const previewTimeMs = usePreviewClock(activeAnalysis?.durationMs);

  // Who is talking right now, for the "speaking heads move a little more" cue.
  // Read from the same analysis the waveform uses so the two never disagree.
  const activeSpeakerId = useMemo(() => {
    const m = sampleAnalysis(activeAnalysis, previewTimeMs);
    if (!m || m.speaker < 0) return null;
    return speakers[m.speaker]?.id ?? null;
  }, [activeAnalysis, previewTimeMs, speakers]);
  const cues = useMemo(
    () => buildCues(narration?.segments ?? [], subtitles.maxChars),
    [narration, subtitles.maxChars]
  );

  // Lip-sync, driven by exactly the same word timings as the subtitles.
  const visemeTracks = useMemo(
    () => buildSpeakerVisemeTracks(narration?.segments ?? [], fps),
    [narration, fps]
  );
  const sheetUrls = useFileUrls(speakers.map((sp) => sp.sheetPath));
  const backgroundUrls = useFileUrls(
    backgrounds.map((b) => b.filePath),
    "video/mp4"
  );
  // The clips as the timing code wants them: it has no business knowing about
  // providers, thumbnails or why a scene was chosen.
  const backgroundClips = useMemo(
    () =>
      backgrounds.map((b) => ({
        startMs: b.startMs,
        endMs: b.endMs,
        sourceSec: b.hit?.durationSec ?? 0,
        filePath: b.filePath,
      })),
    [backgrounds]
  );
  const { puppets } = usePuppets(speakers.map((sp) => sp.puppetPath));
  const browTracks = useMemo(
    () => buildSpeakerBrowTracks(narration?.segments ?? []),
    [narration]
  );
  const headTracks = useMemo(
    () => buildSpeakerHeadTracks(narration?.segments ?? []),
    [narration]
  );
  const speakerColors = useMemo(
    () => Object.fromEntries(speakers.map((sp) => [sp.id, sp.borderColor])),
    [speakers]
  );
  const tracks = useMemo(
    () => buildTracks(speakers, musicWaveform, musicColor),
    [speakers, musicWaveform, musicColor]
  );
  const accentColor = useSettingsStore((s) => s.accentColor);
  const motionEnabled = useSettingsStore((s) => s.motionEnabled);

  const isPortrait = render.format === "9:16";

  // The autosave stores the narration's path and timings but not its analysis —
  // a ten-minute spectrum is megabytes and localStorage would refuse it. The
  // WAV is still on disk, so re-analyse it once on startup and the waveform
  // comes back to life without the user regenerating anything.
  const setNarration = useProjectStore((s) => s.setNarration);
  const setAttachedAudio = useProjectStore((s) => s.setAttachedAudio);
  const setMusic = useProjectStore((s) => s.setMusic);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const n = useProjectStore.getState().narration;
      if (n?.filePath && !n.analysis) {
        try {
          const analysis = await window.byok.audio.analyzeFile(n.filePath);
          if (!cancelled && analysis) setNarration({ ...n, analysis });
        } catch {
          // The file was moved or deleted. Keeping the segments is still worth
          // it — subtitles and lip-sync work, the waveform just idles.
        }
      }
      const a = useProjectStore.getState().attachedAudio;
      if (a?.filePath && !a.analysis) {
        try {
          const analysis = await window.byok.audio.analyzeFile(a.filePath);
          if (!cancelled && analysis) setAttachedAudio({ ...a, analysis });
        } catch {
          /* same */
        }
      }
      const m = useProjectStore.getState().music;
      if (m?.filePath && !m.analysis) {
        try {
          const analysis = await window.byok.audio.analyzeFile(m.filePath);
          if (!cancelled && analysis) setMusic({ ...m, analysis });
        } catch {
          /* same: the track still plays, its waveform just idles */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setNarration, setAttachedAudio, setMusic]);

  // Recolor every accent-* class + glow effect live, including on first
  // mount (so a previously chosen color persists across restarts).
  useEffect(() => {
    const { base, bright, deep } = deriveAccentShades(accentColor);
    const root = document.documentElement.style;
    root.setProperty("--accent-rgb", base);
    root.setProperty("--accent-bright-rgb", bright);
    root.setProperty("--accent-deep-rgb", deep);
    // Deco Noir needs the same accent as COLOURS, not channels — color-mix()
    // and gradients can't take a bare "R G B" triple. `setAccent` writes all
    // four of its properties from one hex, so nothing here can leave the
    // channel form and the colour form disagreeing.
    //
    // The shades are still handed over explicitly rather than left to the
    // library to derive: this app's own accent-bright / accent-deep classes
    // read the same two values, and letting each side compute its own would
    // reintroduce exactly the drift this replaced.
    window.DecoNoir?.setAccent(accentColor, {
      hi: rgbTripleToHex(bright),
      lo: rgbTripleToHex(deep),
    });
  }, [accentColor]);

  // Deco Noir's behaviour layer: the brushed ground, film grain and the
  // edge-proximity border glow on keys. Mounted once — it installs document
  // level listeners, so re-running it would stack them.
  //
  // `spark` and `reveal` are off deliberately. Sparks fire on every click in
  // an app where clicking is constant work rather than an occasional flourish,
  // and reveal-on-scroll belongs to a marketing page, not a control surface
  // the user is already looking at.
  useEffect(() => {
    window.DecoNoir?.init({
      // One ground, tinted from --accent, so it follows the Appearance picker
      // instead of being a fixed steel or gold that fights a chosen colour.
      ground: "on",
      grain: true,
      glow: true,
      spark: false,
      reveal: false,
    });
  }, []);

  // Keep the Chatterbox status honest.
  //
  // It was reported once, when Start Server succeeded, and then believed
  // forever. The server does not last forever: in dev every main-process edit
  // restarts Electron and kills the child it spawned, and in a packaged build
  // a crash or an out-of-memory does the same. The panel went on showing
  // "running ✓" over a server that had been gone for an hour, and everything
  // failed with "failed to fetch" against a green tick — which sends you
  // looking at the network, the port, the install, anywhere except the one
  // true cause.
  //
  // Twelve seconds is one localhost ping; the voice lists are only re-fetched
  // when the answer actually changes. Also on window focus, because coming
  // back to the app after leaving it running is exactly when it will have died
  // without anyone watching.
  const refreshChatterbox = useChatterboxVoicesStore((s) => s.refresh);
  useEffect(() => {
    void refreshChatterbox();
    const id = window.setInterval(() => void refreshChatterbox(), 12000);
    const onFocus = () => void refreshChatterbox();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [refreshChatterbox]);

  // The grain is ambient motion, so it answers to the app's own motion toggle
  // as well as to prefers-reduced-motion.
  useEffect(() => {
    document.body.dataset.tex = motionEnabled ? "on" : "off";
  }, [motionEnabled]);

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
    // No background class here on purpose: the brushed-metal ground is a fixed
    // layer behind the whole app, and an opaque shell would paint over it.
    //
    // The shell is lifted above it: #dn-field is position:fixed with z-index 0,
    // and a positioned element paints above non-positioned in-flow content
    // regardless of DOM order. Panels escape that on their own by being
    // position:relative, but loose text in a static container would not. The
    // library's own demo lifts its wrapper the same way.
    <div className="relative z-[1] h-full w-full flex flex-col text-neutral-200">
      <div className="scanlines" />

      {/* Top bar */}
      <header
        ref={headerFlare.ref}
        onClick={headerFlare.fire}
        className="panel-hud hud-flare-target relative m-3 px-6 py-3 flex items-center justify-between"
      >
        <HudCorners />
        <h1 className="title-deco uppercase text-2xl">
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
          //
          // `items-stretch` is stated rather than left to the default, and that
          // is not belt-and-braces. The stretch IS the layout: the stage is
          // measured to size the canvas, so anything that lets it shrink to its
          // content collapses it to zero and keeps it there. Leaving it implicit
          // is what let a stylesheet turn the whole preview off by accident.
          className={`panel-hud hud-flare-target relative flex-1 p-6 min-h-0 ${
            view === "canvas" ? "grid items-stretch" : "overflow-hidden"
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
              {/* Under everything, as in the render. */}
              <BackgroundScene
                clips={backgroundClips}
                urls={backgroundUrls}
                timeMs={previewTimeMs}
                fps={fps}
                crossfadeMs={backgroundCrossfadeMs}
                dim={backgroundDim}
              />

              <WaveformScene
                tracks={tracks}
                width={canvasSize.w}
                height={canvasSize.h}
                timeMs={previewTimeMs}
                analysis={activeAnalysis}
                musicAnalysis={music?.analysis ?? null}
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

              {speakers.map((sp) => {
                // The puppet wins when a speaker has both. Resolved once here
                // rather than inside the JSX, so the render's identical rule
                // (electron/render/renderVideo.ts) has something to match.
                const loaded = sp.puppetPath ? puppets[sp.puppetPath] : undefined;
                const track = visemeTracks[sp.id];
                const blend = track
                  ? visemeBlendAt(track, previewTimeMs / 1000, visemeFadeMs / 1000)
                  : { from: VISEME.NEUTRAL, to: VISEME.NEUTRAL, mix: 1 };
                return (
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
                    // Dragging freezes the idle motion: a head that keeps
                    // breathing while you're trying to place it fights the mouse.
                    transform:
                      "translate(-50%, -50%)" +
                      (draggingId === sp.id
                        ? ""
                        : motionTransform(
                            headMotion(
                              sp.id,
                              previewTimeMs,
                              activeSpeakerId === sp.id,
                              idleMotion
                            ),
                            sp.size * canvasSize.w
                          )),
                    cursor: draggingId === sp.id ? "grabbing" : "grab",
                    touchAction: "none",
                  }}
                  className="z-10"
                >
                  {loaded ? (
                    <PuppetAvatar
                      puppet={loaded.puppet}
                      urls={loaded.urls}
                      viseme={blend.to}
                      prevViseme={blend.from}
                      mix={blend.mix}
                      lidLeft={blinkAt(sp.id, previewTimeMs, idleMotion)}
                      lidRight={blinkAt(sp.id, previewTimeMs, idleMotion)}
                      browLeft={browAt(browTracks[sp.id], previewTimeMs)}
                      browRight={browAt(browTracks[sp.id], previewTimeMs)}
                      head={headPoseAt(sp.id, headTracks[sp.id], previewTimeMs, idleMotion)}
                      // size is a fraction of frame width; the render resolves
                      // it against the output width the exact same way.
                      size={sp.size * canvasSize.w}
                      bgOpacity={sp.bgOpacity}
                      borderOpacity={sp.borderOpacity}
                      bgColor={sp.bgColor}
                      borderColor={sp.borderColor}
                      outlineShape={sp.outlineShape}
                    />
                  ) : (
                    <SpeakerAvatar
                      sheetUrl={(sp.sheetPath && sheetUrls[sp.sheetPath]) || ""}
                      viseme={blend.to}
                      prevViseme={blend.from}
                      mix={blend.mix}
                      size={sp.size * canvasSize.w}
                      bgOpacity={sp.bgOpacity}
                      borderOpacity={sp.borderOpacity}
                      bgColor={sp.bgColor}
                      borderColor={sp.borderColor}
                      outlineShape={sp.outlineShape}
                    />
                  )}
                </div>
                );
              })}

              {/* Above the avatars, matching the render's layer order. */}
              <SubtitleScene
                cues={cues}
                config={subtitles}
                width={canvasSize.w}
                height={canvasSize.h}
                timeMs={previewTimeMs}
                speakerColors={speakerColors}
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
