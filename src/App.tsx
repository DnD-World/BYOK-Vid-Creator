import { useEffect, useRef, useState } from "react";
import { PlasticButton } from "./components/ui/PlasticButton";
import { SpeakerAvatar } from "./components/canvas/SpeakerAvatar";
import { WaveformRenderer } from "./components/canvas/WaveformRenderer";
import BackendPanel from "./components/settings/BackendPanel";
import { useProjectStore } from "./store/useProjectStore";
import { useVoicesStore } from "./store/useVoicesStore";
import { VISEME } from "./lib/visemes/visemeMap";
import type { Fps, WaveformConfig } from "./store/types";

const FPS_OPTIONS: Fps[] = [10, 24, 30];
const WAVEFORM_STYLES: WaveformConfig["style"][] = ["bars", "lines", "wave", "mirror", "dots"];
const WAVEFORM_POSITIONS: WaveformConfig["position"][] = ["circular", "top", "bottom", "left", "right"];
const WAVEFORM_BEHAVIORS: { id: WaveformConfig["behavior"]; label: string }[] = [
  { id: "single", label: "Single" },
  { id: "single-colorshift", label: "Color-shift" },
  { id: "dual", label: "Dual" },
  { id: "dual-plus-music", label: "Dual+Music" },
  { id: "triple", label: "Triple" },
];

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

  const isPortrait = render.format === "9:16";

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
      {/* Top bar */}
      <header className="panel-metal m-3 px-6 py-3 flex items-center justify-between">
        <h1 className="font-display uppercase tracking-[0.25em] text-lg label-lit">
          BYOK-Vid-Creator
        </h1>
        <div className="flex items-center gap-4">
          <span className="label-etched hidden sm:inline">Deterministic Video Studio</span>
          <button
            onClick={() => setView(view === "canvas" ? "settings" : "canvas")}
            className="label-etched rounded-lg border border-zinc-700 px-3 py-1.5 hover:border-amber-500 hover:text-amber-400"
          >
            {view === "canvas" ? "⚙ Backend Settings" : "← Back to Canvas"}
          </button>
        </div>
      </header>

      <div className="flex flex-1 gap-3 px-3 pb-3 min-h-0">
        {/* LEFT RAIL */}
        <aside className="panel-metal w-72 p-5 flex flex-col gap-7 overflow-y-auto">
          <section>
            <div className="label-etched mb-2">Frame Rate</div>
            <div className="flex gap-2">
              {FPS_OPTIONS.map((f) => (
                <PlasticButton key={f} active={fps === f} onClick={() => setFps(f)}>
                  {f}
                </PlasticButton>
              ))}
            </div>
          </section>

          <section>
            <div className="label-etched mb-2">Aspect Ratio</div>
            <div className="flex gap-2">
              <PlasticButton
                active={render.format === "9:16"}
                onClick={() => setRender({ format: "9:16", width: 1080, height: 1920 })}
              >
                9:16
              </PlasticButton>
              <PlasticButton
                active={render.format === "16:9"}
                onClick={() => setRender({ format: "16:9", width: 1920, height: 1080 })}
              >
                16:9
              </PlasticButton>
            </div>
          </section>

          <section>
            <div className="label-etched mb-2">Waveform Style</div>
            <div className="flex flex-wrap gap-2">
              {WAVEFORM_STYLES.map((s) => (
                <PlasticButton key={s} active={waveform.style === s} onClick={() => setWaveform({ style: s })}>
                  {s}
                </PlasticButton>
              ))}
            </div>
          </section>

          <section>
            <div className="label-etched mb-2">Waveform Position</div>
            <div className="flex flex-wrap gap-2">
              {WAVEFORM_POSITIONS.map((p) => (
                <PlasticButton key={p} active={waveform.position === p} onClick={() => setWaveform({ position: p })}>
                  {p}
                </PlasticButton>
              ))}
            </div>
          </section>

          <section>
            <div className="label-etched mb-2">Waveform Mode</div>
            <div className="flex flex-wrap gap-2">
              {WAVEFORM_BEHAVIORS.map((b) => (
                <PlasticButton
                  key={b.id}
                  active={waveform.behavior === b.id}
                  onClick={() => setWaveform({ behavior: b.id })}
                >
                  {b.label}
                </PlasticButton>
              ))}
            </div>
          </section>

          <section>
            <div className="label-etched mb-2">Waveform Colors</div>
            <div className="flex items-center gap-3">
              {([
                ["colorA", "Speaker A"],
                ["colorB", "Speaker B"],
                ["colorMusic", "Music"],
              ] as const).map(([key, label]) => (
                <label key={key} className="flex flex-col items-center gap-1">
                  <input
                    type="color"
                    value={waveform[key]}
                    onChange={(e) => setWaveform({ [key]: e.target.value } as Partial<WaveformConfig>)}
                    className="h-7 w-7 rounded-md border border-zinc-700 bg-transparent p-0"
                  />
                  <span className="text-[10px] text-zinc-500">{label}</span>
                </label>
              ))}
            </div>
          </section>

          <section>
            <div className="label-etched mb-2 flex items-center justify-between">
              <span>Speakers</span>
              <button onClick={addSpeaker} className="text-amber-400 hover:text-amber-300 text-xs">
                + Add
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {speakers.length === 0 && <p className="text-xs text-zinc-600">No speakers yet.</p>}
              {speakers.map((sp) => (
                <div
                  key={sp.id}
                  className="rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 py-2 space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: sp.borderColor }} />
                      <span className="text-sm text-zinc-200">{sp.label}</span>
                    </div>
                    <button onClick={() => removeSpeaker(sp.id)} className="text-zinc-500 hover:text-red-400 text-xs">
                      ✕
                    </button>
                  </div>
                  {voices.length > 0 ? (
                    <select
                      value={sp.voiceId ?? ""}
                      onChange={(e) => updateSpeaker(sp.id, { voiceId: e.target.value || undefined })}
                      className="w-full rounded-md bg-zinc-950 border border-zinc-700 px-2 py-1 text-xs text-zinc-300 outline-none focus:border-amber-500"
                    >
                      <option value="">No voice assigned</option>
                      {voices.map((v) => (
                        <option key={v.id} value={v.onnxPath}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-[10px] text-zinc-600">
                      Scan for voices in Backend Settings to assign one.
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        </aside>

        {/* CENTER: preview canvas or backend settings */}
        <main className="panel-metal flex-1 grid place-items-center p-6 min-h-0">
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
