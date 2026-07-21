import { useProjectStore } from "./store/useProjectStore";
import { PlasticButton } from "./components/ui/PlasticButton";
import BackendPanel from "./components/settings/BackendPanel";
import { Fps } from "./store/types";

const FPS_OPTIONS: Fps[] = [10, 24, 30];

export default function App() {
  const fps = useProjectStore((s) => s.fps);
  const setFps = useProjectStore((s) => s.setFps);
  const render = useProjectStore(import { PlasticButton } from "./components/ui/PlasticButton";
import { useProjectStore } from "./store/useProjectStore";
import type { Fps } from "./store/types";

export default function App() {
  const fps = useProjectStore((s) => s.fps);
  const setFps = useProjectStore((s) => s.setFps);
  const format = useProjectStore((s) => s.render.format);
  const setRender = useProjectStore((s) => s.setRender);

  const fpsOptions: Fps[] = [10, 24, 30];

  return (
    <div className="h-full w-full flex flex-col bg-metal-900 text-neutral-200">
      {/* Top bar */}
      <header className="panel-metal m-3 px-6 py-3 flex items-center justify-between">
        <h1 className="font-display uppercase tracking-[0.25em] text-lg label-lit">
          BYOK-Vid-Creator
        </h1>
        <span className="label-etched">Deterministic Video Studio</span>
      </header>

      <div className="flex flex-1 gap-3 px-3 pb-3 min-h-0">
        {/* Left rail */}
        <aside className="panel-metal w-64 p-4 space-y-6 overflow-y-auto">
          <section>
            <div className="label-etched mb-2">Frame Rate</div>
            <div className="flex gap-2">
              {fpsOptions.map((f) => (
                <PlasticButton
                  key={f}
                  active={fps === f}
                  onClick={() => setFps(f)}
                >
                  {f}
                </PlasticButton>
              ))}
            </div>
          </section>

          <section>
            <div className="label-etched mb-2">Aspect</div>
            <div className="flex gap-2">
              <PlasticButton
                active={format === "9:16"}
                onClick={() =>
                  setRender({ format: "9:16", width: 1080, height: 1920 })
                }
              >
                9:16
              </PlasticButton>
              <PlasticButton
                active={format === "16:9"}
                onClick={() =>
                  setRender({ format: "16:9", width: 1920, height: 1080 })
                }
              >
                16:9
              </PlasticButton>
            </div>
          </section>
        </aside>

        {/* Center preview */}
        <main className="panel-metal flex-1 grid place-items-center min-h-0">
          <div className="text-center space-y-2">
            <div className="label-etched">Preview Canvas</div>
            <div className="text-neutral-500 text-sm">
              {format} · {fps} fps
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
(s) => s.render);
  const setRender = useProjectStore((s) => s.setRender);

  const isPortrait = render.format === "9:16";

  return (
    <div className="h-full w-full flex gap-3 p-3 bg-metal-900">
      {/* LEFT RAIL */}
      <aside className="panel-metal w-72 p-5 flex flex-col gap-7 overflow-y-auto">
        <h1 className="label-lit font-display uppercase tracking-[0.2em] text-sm">
          BYOK · Vid Creator
        </h1>

        <div>
          <div className="label-etched mb-2">Frame Rate</div>
          <div className="flex gap-2">
            {FPS_OPTIONS.map((f) => (
              <PlasticButton key={f} active={fps === f} onClick={() => setFps(f)}>
                {f}
              </PlasticButton>
            ))}
          </div>
        </div>

        <div>
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
        </div>
      </aside>

      {/* CENTER PREVIEW */}
      <main className="panel-metal flex-1 grid place-items-center p-6">
        <div
          className="slot-recessed grid place-items-center"
          style={{
            aspectRatio: isPortrait ? "9 / 16" : "16 / 9",
            height: isPortrait ? "80%" : "auto",
            width: isPortrait ? "auto" : "80%",
          }}
        >
          <span className="label-etched text-center leading-relaxed">
            {render.format} · {fps} FPS
            <br />
            {render.width}×{render.height}
          </span>
        </div>
      </main>

      {/* RIGHT PANEL — API keys */}
      <aside className="panel-metal w-96 overflow-y-auto">
        <BackendPanel />
      </aside>
    </div>
  );
}
