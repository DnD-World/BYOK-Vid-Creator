// ---------------------------------------------------------------------------
// One speaker's voice engine settings, as controls.
//
// NOTHING HERE IS HAND-WRITTEN PER KNOB. The controls are built from
// DRAMABOX_KNOBS, so a knob added to that table appears in the app without this
// file being touched — which is the whole reason the last set went unused:
// adding one meant editing a Python file on a machine that is switched off.
//
// A control that has never been moved shows the default and stores nothing, so
// a project saved today does not freeze today's defaults into itself.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { Slider } from "../ui/Slider";
import { Toggle } from "../ui/Toggle";
import { NumberField } from "../ui/NumberField";
import { Picker } from "../ui/Picker";
import {
  DRAMABOX_DEFAULTS,
  DRAMABOX_KNOBS,
  VOICE_PRESETS,
  type DramaboxParams,
  type KnobSpec,
} from "../../lib/narration/dramaboxParams";
import type { ExpressionOptions } from "../../lib/narration/expression";

interface Props {
  /** Only what this speaker has actually changed. */
  value: Partial<DramaboxParams>;
  onChange: (next: Partial<DramaboxParams>) => void;
  expression: ExpressionOptions;
  onExpressionChange: (next: ExpressionOptions) => void;
}

export function VoiceControls({
  value,
  onChange,
  expression,
  onExpressionChange,
}: Props) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const current = <K extends keyof DramaboxParams>(k: K): DramaboxParams[K] =>
    (value[k] ?? DRAMABOX_DEFAULTS[k]) as DramaboxParams[K];

  const set = (k: keyof DramaboxParams, v: number | boolean | null) =>
    onChange({ ...value, [k]: v });

  const changedCount = Object.keys(value).length;
  const knobs = DRAMABOX_KNOBS.filter((k) => showAdvanced || !k.advanced);

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="label-etched text-sm">Starting point</span>
        <Picker
          aria-label="Starting point"
          className="mt-1 w-full"
          value=""
          options={[
            {
              value: "",
              label: changedCount ? `Custom · ${changedCount} changed` : "Untouched",
            },
            ...Object.keys(VOICE_PRESETS).map((name) => ({ value: name, label: name })),
          ]}
          onChange={(name) => name && onChange({ ...value, ...VOICE_PRESETS[name] })}
        />
      </label>

      {knobs.map((knob) => (
        <KnobControl
          key={knob.key}
          knob={knob}
          value={current(knob.key)}
          isDefault={value[knob.key] === undefined}
          onChange={(v) => set(knob.key, v)}
          onReset={() => {
            const next = { ...value };
            delete next[knob.key];
            onChange(next);
          }}
        />
      ))}

      <button
        type="button"
        className="text-sm text-accent-bright/70 hover:text-accent-bright"
        onClick={() => setShowAdvanced((s) => !s)}
      >
        {showAdvanced ? "Hide the rarely-touched ones" : "Show the rarely-touched ones"}
      </button>

      {/* --- the app writing expression the script did not ------------------ */}
      <div className="border-t border-accent/15 pt-4 space-y-3">
        <p className="label-etched text-sm">Let the app add expression</p>
        <Toggle
          label="Lift flat lines"
          checked={!!expression.liftFlatLines}
          onChange={(liftFlatLines) => onExpressionChange({ ...expression, liftFlatLines })}
        />
        {expression.liftFlatLines && (
          <label className="block">
            <span className="label-etched text-sm">Lift them to</span>
            <input
              type="text"
              className="w-full mt-1 bg-black/30 border border-accent/20 rounded px-2 py-1 text-sm"
              placeholder="speaks warmly"
              value={expression.defaultVerb ?? ""}
              onChange={(e) =>
                onExpressionChange({ ...expression, defaultVerb: e.target.value })
              }
            />
          </label>
        )}
        <Toggle
          label="Spell out laughs and hums"
          checked={!!expression.spellNoises}
          onChange={(spellNoises) => onExpressionChange({ ...expression, spellNoises })}
        />
        <p className="text-sm text-neutral-500">
          A direction on its own shapes delivery but makes no noise — a laugh is
          only heard if it is spelled inside the speech. These two write that in
          when the script forgot. Every change is listed before anything is
          generated, so nothing is altered behind your back.
        </p>
      </div>
    </div>
  );
}

function KnobControl({
  knob,
  value,
  isDefault,
  onChange,
  onReset,
}: {
  knob: KnobSpec;
  value: number | boolean | null;
  isDefault: boolean;
  onChange: (v: number | boolean | null) => void;
  onReset: () => void;
}) {
  const label = isDefault ? knob.label : `${knob.label} ·`;

  if (knob.kind === "toggle") {
    return (
      <div>
        <Toggle label={label} checked={!!value} onChange={onChange} />
        <p className="text-sm text-neutral-500 mt-1">{knob.hint}</p>
      </div>
    );
  }

  if (knob.kind === "number") {
    return (
      <div>
        <div className="flex items-center justify-between gap-3">
          <span className="label-etched text-sm">{label}</span>
          <NumberField
            aria-label={knob.label}
            className="w-24"
            value={typeof value === "number" ? value : 0}
            onChange={onChange}
          />
        </div>
        <p className="text-sm text-neutral-500 mt-1">{knob.hint}</p>
      </div>
    );
  }

  // A nullable slider is two controls in one: "let the engine decide", or a
  // number. Showing the slider greyed out and unusable would say less.
  const isAuto = value === null;
  return (
    <div>
      <Slider
        label={label}
        value={typeof value === "number" ? value : (knob.min ?? 0)}
        min={knob.min ?? 0}
        max={knob.max ?? 1}
        step={knob.step ?? 0.01}
        format={(v) => (isAuto ? (knob.nullLabel ?? "Auto") : String(v))}
        onChange={onChange}
      />
      <div className="flex items-center justify-between mt-1">
        <p className="text-sm text-neutral-500">{knob.hint}</p>
        <div className="flex gap-2 shrink-0">
          {knob.nullable && (
            <button
              type="button"
              className="text-sm text-accent-bright/60 hover:text-accent-bright"
              onClick={() => onChange(isAuto ? (knob.min ?? 0) : null)}
            >
              {isAuto ? "Set a value" : knob.nullLabel ?? "Auto"}
            </button>
          )}
          {!isDefault && (
            <button
              type="button"
              className="text-sm text-accent-bright/60 hover:text-accent-bright"
              onClick={onReset}
            >
              Reset
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
