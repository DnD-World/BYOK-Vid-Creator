interface Props {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}

/**
 * Two-position slide switch — same oval-cap visual language as Slider,
 * just snapping between two end positions instead of moving freely. This
 * replaced an earlier tilting-rocker attempt that didn't read well.
 */
export function Toggle({ label, checked, onChange }: Props) {
  return (
    <label className="flex items-center justify-between gap-3 cursor-pointer select-none">
      <span className="label-etched text-sm">{label}</span>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="relative w-[52px] h-[22px] shrink-0"
      >
        <span className="absolute top-1/2 left-2 right-2 h-[3px] -translate-y-1/2 bg-accent/15" />
        <span
          className="absolute top-1/2 left-2 h-[3px] -translate-y-1/2 bg-accent/40 transition-[width]"
          style={{ width: checked ? "calc(100% - 16px)" : "0%" }}
        />
        <span className="absolute top-1/2 left-2 w-px h-[7px] -translate-y-1/2 bg-accent/30" />
        <span className="absolute top-1/2 right-2 w-px h-[7px] -translate-y-1/2 bg-accent/30" />
        <span
          className="absolute top-1/2 w-[15px] h-[22px] -translate-y-1/2 rounded-[7px] transition-[left,box-shadow,border-color]"
          style={{
            left: checked ? "44px" : "8px",
            transform: "translate(-50%, -50%)",
            background: "linear-gradient(180deg,#2c2f35,#111318 50%,#0a0b0d)",
            border: `1px solid rgb(var(--accent-rgb) / ${checked ? 1 : 0.35})`,
            boxShadow: checked
              ? "0 0 10px rgb(var(--accent-rgb) / 0.55), inset 0 1px 0 rgb(var(--accent-rgb) / 0.2), inset 0 -3px 5px rgba(0,0,0,.6)"
              : "inset 0 1px 0 rgba(255,255,255,.12), inset 0 -3px 5px rgba(0,0,0,.6)",
          }}
        >
          <span
            className="absolute top-1/2 left-1/2 w-[60%] h-[1.5px] -translate-x-1/2 -translate-y-1/2"
            style={{
              background: checked ? "rgb(var(--accent-rgb))" : "rgb(var(--accent-rgb) / 0.5)",
              boxShadow: checked ? "0 0 6px rgb(var(--accent-rgb) / 0.8)" : "none",
            }}
          />
        </span>
      </button>
    </label>
  );
}
