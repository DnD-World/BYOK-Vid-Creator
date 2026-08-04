// Minimal tab strip. Wraps rather than scrolls, because a speaker's name can
// be any length and a hidden tab is worse than a two-row strip.

interface Props<T extends string> {
  tabs: { id: T; label: string }[];
  active: T;
  onChange: (id: T) => void;
}

export function Tabs<T extends string>({ tabs, active, onChange }: Props<T>) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-accent/20 pb-2 mb-4">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`label-etched px-3 py-1.5 border ${
            active === t.id
              ? "border-accent text-accent-bright bg-accent/10"
              : "border-transparent text-neutral-400 hover:text-accent-bright hover:border-accent/40"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
