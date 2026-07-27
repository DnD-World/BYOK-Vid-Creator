import { useRef, useState } from "react";

interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}

// Rotary knob sweeps 270° (-135deg at min to +135deg at max) — the
// standard mixing-board convention. Dragging vertically adjusts the value
// (click-and-rotate-around-a-circle is fiddly with a mouse; vertical drag
// is the common, more usable pattern real audio software uses too).
const SWEEP_DEG = 270;
const START_DEG = -135;

export function Knob({ label, value, min, max, onChange, format }: Props) {
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ y: number; value: number } | null>(null);

  const pct = (value - min) / (max - min);
  const angle = START_DEG + pct * SWEEP_DEG;

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragStart.current = { y: e.clientY, value };
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragStart.current) return;
    const deltaY = dragStart.current.y - e.clientY; // up = increase
    const range = max - min;
    const sensitivity = range / 140; // px of drag to cover the full range
    const next = Math.min(max, Math.max(min, dragStart.current.value + deltaY * sensitivity));
    onChange(next);
  };

  const onPointerUp = () => {
    dragStart.current = null;
    setDragging(false);
  };

  return (
    <div className="flex flex-col items-center gap-2 select-none">
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="relative w-16 h-16 rounded-full cursor-ns-resize"
        style={{
          background: "radial-gradient(circle at 35% 30%, #1c1e22, #0a0b0d 70%)",
          border: "1px solid rgb(var(--accent-rgb) / 0.35)",
          boxShadow: dragging
            ? "0 0 18px rgb(var(--accent-rgb) / 0.5), inset 0 2px 4px rgba(255,255,255,.06), inset 0 -3px 6px rgba(0,0,0,.7)"
            : "0 0 10px rgb(var(--accent-rgb) / 0.15), inset 0 2px 4px rgba(255,255,255,.05), inset 0 -3px 6px rgba(0,0,0,.7)",
        }}
      >
        <span
          className="absolute top-[6px] left-1/2 w-[2px] h-4"
          style={{
            background: "rgb(var(--accent-rgb))",
            boxShadow: "0 0 8px rgb(var(--accent-rgb) / 0.8)",
            transformOrigin: "50% 26px",
            transform: `translateX(-50%) rotate(${angle}deg)`,
          }}
        />
      </div>
      <span className="label-etched text-sm">{label}</span>
      <span className="text-sm text-accent-bright/80 font-mono">{format ? format(value) : value.toFixed(2)}</span>
    </div>
  );
}
