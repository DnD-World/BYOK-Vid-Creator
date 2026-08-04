// ---------------------------------------------------------------------------
// Controls for ONE waveform track — used by both a speaker's tab and the
// music tab, so the two can never end up with different capabilities.
//
// Deliberately wider ranges and finer steps than the old global panel had.
// The previous version felt untweakable because Size was capped at 1.8x with a
// 0.05 step and there was no control at all over bar thickness or smoothing —
// the two things that most change how a waveform reads.
// ---------------------------------------------------------------------------

import { HudButton } from "../ui/HudButton";
import { Slider } from "../ui/Slider";
import { Toggle } from "../ui/Toggle";
import type { TrackWaveform } from "../../store/types";

const STYLES: TrackWaveform["style"][] = ["bars", "lines", "wave", "mirror", "dots", "rings"];
const POSITIONS: TrackWaveform["position"][] = [
  "speaker", "circular", "top", "bottom", "left", "right",
];
const POSITION_LABEL: Record<TrackWaveform["position"], string> = {
  speaker: "around face",
  circular: "circular",
  top: "top",
  bottom: "bottom",
  left: "left",
  right: "right",
};

interface Props {
  value: TrackWaveform;
  onChange: (patch: Partial<TrackWaveform>) => void;
  /** Shown next to the enable toggle, e.g. "Καίτη's waveform". */
  label: string;
  /** Music has no face to ring, so it doesn't get the "around face" option. */
  canAnchorToFace?: boolean;
}

export function WaveformControls({ value, onChange, label, canAnchorToFace = true }: Props) {
  return (
    <div className="space-y-4">
      <Toggle label={label} checked={value.enabled} onChange={(v) => onChange({ enabled: v })} />

      {value.enabled && (
        <>
          <div>
            <div className="label-etched mb-2">Style</div>
            <div className="flex flex-wrap gap-2">
              {STYLES.map((s) => (
                <HudButton key={s} active={value.style === s} onClick={() => onChange({ style: s })}>
                  {s}
                </HudButton>
              ))}
            </div>
          </div>

          {value.style !== "rings" && (
            <div>
              <div className="label-etched mb-2">Position</div>
              <div className="flex flex-wrap gap-2">
                {POSITIONS.filter((p) => p !== "speaker" || canAnchorToFace).map((p) => (
                  <HudButton key={p} active={value.position === p} onClick={() => onChange({ position: p })}>
                    {POSITION_LABEL[p]}
                  </HudButton>
                ))}
              </div>
              {value.position === "speaker" && (
                <p className="text-sm text-neutral-500 mt-2">
                  A halo on this speaker's own face — it moves with them. Ring
                  Size pushes it out from the artwork.
                </p>
              )}
            </div>
          )}

          {value.position === "speaker" && value.style !== "rings" && (
            <Slider
              label="Ring Size" value={value.ringSize} min={0.6} max={3} step={0.02}
              onChange={(v) => onChange({ ringSize: v })} format={(v) => `${v.toFixed(2)}x`}
            />
          )}

          <Slider
            label="Height" value={value.scale} min={0.2} max={2.5} step={0.02}
            onChange={(v) => onChange({ scale: v })} format={(v) => `${v.toFixed(2)}x`}
          />
          <Slider
            label="Count" value={value.density} min={8} max={160} step={1}
            onChange={(v) => onChange({ density: Math.round(v) })} format={(v) => `${Math.round(v)}`}
          />
          <Slider
            label="Thickness" value={value.thickness} min={0.2} max={3} step={0.05}
            onChange={(v) => onChange({ thickness: v })} format={(v) => `${v.toFixed(2)}x`}
          />
          <Slider
            label="Smoothing" value={value.smoothing} min={0} max={1} step={0.02}
            onChange={(v) => onChange({ smoothing: v })}
            format={(v) => (v === 0 ? "raw" : `${Math.round(v * 100)}%`)}
          />
          <Slider
            label="Lane Offset" value={value.lane} min={-3} max={3} step={0.1}
            onChange={(v) => onChange({ lane: v })} format={(v) => v.toFixed(1)}
          />
          <Slider
            label="Sparkle" value={value.sparkle} min={0} max={1} step={0.05}
            onChange={(v) => onChange({ sparkle: v })}
            format={(v) => (v === 0 ? "off" : `${Math.round(v * 100)}%`)}
          />

          {value.style === "dots" && (
            <Slider
              label="Dot Size" value={value.dotSize} min={0.2} max={4} step={0.05}
              onChange={(v) => onChange({ dotSize: v })} format={(v) => `${v.toFixed(2)}x`}
            />
          )}

          {value.style !== "rings" && value.position !== "circular" && (
            <Toggle
              label="Flush to edge" checked={value.edgeFlush}
              onChange={(v) => onChange({ edgeFlush: v })}
            />
          )}

          {value.style === "rings" && (
            <>
              <Slider
                label="Ring Size" value={value.ringSize} min={0.2} max={2} step={0.02}
                onChange={(v) => onChange({ ringSize: v })} format={(v) => `${v.toFixed(2)}x`}
              />
              <Slider
                label="Center Opening" value={value.ringInnerRadius} min={0} max={0.9} step={0.01}
                onChange={(v) => onChange({ ringInnerRadius: v })} format={(v) => `${Math.round(v * 100)}%`}
              />
              <Slider
                label="Ring X" value={value.ringX} min={0} max={1} step={0.01}
                onChange={(v) => onChange({ ringX: v })} format={(v) => `${Math.round(v * 100)}%`}
              />
              <Slider
                label="Ring Y" value={value.ringY} min={0} max={1} step={0.01}
                onChange={(v) => onChange({ ringY: v })} format={(v) => `${Math.round(v * 100)}%`}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
