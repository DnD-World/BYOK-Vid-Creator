// A number field whose steppers belong to this app.
//
// Chromium draws `input[type=number]`'s spin arrows itself, in its own grey,
// and no stylesheet can reach them — the same problem a native <select> has.
// On a brass-and-black panel a pair of Windows arrows is the one part of the
// control that is visibly from somewhere else.
//
// So the native pair is removed (in index.css, globally, because a stray
// unstyled one is worse than none) and replaced here by two real buttons
// carrying the library's metal. They also behave better than the originals:
// press-and-hold repeats, which the native control does too but only after a
// long delay that makes it feel broken on a value like a port number.

import { useEffect, useRef } from "react";

interface Props {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}

export function NumberField({
  value,
  onChange,
  min,
  max,
  step = 1,
  disabled,
  className = "",
  "aria-label": ariaLabel,
}: Props) {
  const held = useRef<number | null>(null);

  const clamp = (n: number) => {
    if (min !== undefined && n < min) return min;
    if (max !== undefined && n > max) return max;
    return n;
  };

  // Press-and-hold to repeat. Cleared on pointerup ANYWHERE, not just on the
  // button — releasing after the pointer has slid off must still stop it, or
  // the number runs away on its own.
  useEffect(() => {
    const stop = () => {
      if (held.current !== null) {
        window.clearInterval(held.current);
        held.current = null;
      }
    };
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      stop();
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, []);

  // The repeat needs the CURRENT value on every tick, and the interval's
  // closure only ever sees the one it was created with — so it would add the
  // same step to the same starting number forever and the field would stick
  // one step away from where it began. A ref is the value that keeps up.
  const latest = useRef(value);
  latest.current = value;

  const startRepeat = (dir: 1 | -1) => {
    const bump = () => {
      const next = clamp(latest.current + dir * step);
      latest.current = next;
      onChange(next);
    };
    bump();
    held.current = window.setInterval(bump, 120);
  };

  return (
    <div className={`flex items-stretch ${className}`}>
      <input
        type="number"
        value={value}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!Number.isNaN(n)) onChange(clamp(n));
        }}
        className="min-w-0 flex-1 px-3 py-2 text-base text-[color:var(--ink)] outline-none cut-sm"
        style={{
          background: "#0a0907",
          boxShadow: "inset 0 2px 5px rgba(0,0,0,.75), inset 0 0 0 1px rgb(var(--accent-rgb) / .25)",
        }}
      />
      <div className="flex flex-col ml-1 gap-[2px]">
        {([1, -1] as const).map((dir) => (
          <button
            key={dir}
            type="button"
            disabled={disabled}
            aria-label={dir === 1 ? "Increase" : "Decrease"}
            onPointerDown={() => startRepeat(dir)}
            className="btn btn-sm cut-sm flex-1 !px-2 !py-0 leading-none"
            style={{ minHeight: 0 }}
          >
            <span aria-hidden style={{ fontSize: "0.6em", letterSpacing: 0 }}>
              {dir === 1 ? "▲" : "▼"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
