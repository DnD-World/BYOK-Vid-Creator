// Deco Noir's `.tabs` / `.tab`, rather than a lookalike.
//
// What the library's version does that the hand-rolled one didn't: the active
// tab is marked by a brass rule that fades out at both ends and sits ON the
// strip's bottom border, not by a box drawn around the label. That is the
// system's whole idea of selection — a lit edge, not a container — and drawing
// a bordered pill instead is what made this strip read as a different design
// from the panels around it.
//
// Selection state is `aria-selected`, which is what the library's CSS keys off
// and also what a screen reader needs, so the two cannot drift apart.

interface Props<T extends string> {
  tabs: { id: T; label: string }[];
  active: T;
  onChange: (id: T) => void;
  "aria-label"?: string;
}

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
  "aria-label": ariaLabel,
}: Props<T>) {
  return (
    // Wraps rather than scrolls: a speaker's name can be any length, and a tab
    // hidden off the end of a strip is worse than a strip two rows tall.
    <div className="tabs flex-wrap mb-4" role="tablist" aria-label={ariaLabel}>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={active === t.id}
          onClick={() => onChange(t.id)}
          className="tab"
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
