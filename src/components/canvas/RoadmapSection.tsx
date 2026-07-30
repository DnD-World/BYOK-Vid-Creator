// ---------------------------------------------------------------------------
// Features that are planned but not wired up yet, shown greyed out rather than
// hidden — so the app reads as "this is coming" instead of "this doesn't do
// that". Each entry is deliberately inert: no handlers, nothing to click.
//
// When one of these ships, delete its row here and build the real control in
// its place. This list should only ever shrink.
// ---------------------------------------------------------------------------

interface Upcoming {
  label: string;
  note: string;
  /** Rendered as a switch-shaped or button-shaped placeholder, matching what
   *  the real control will be, so the layout doesn't jump when it lands. */
  kind: "toggle" | "button";
}

const UPCOMING: Upcoming[] = [
  { label: "Intro card", note: "Title card before the narration", kind: "toggle" },
  { label: "Outro card", note: "Sign-off card after the narration", kind: "toggle" },
  { label: "Background video", note: "Pixabay / Pexels by keyword", kind: "button" },
  { label: "Background music", note: "Jamendo, auto-ducked under speech", kind: "button" },
  { label: "Media library", note: "Your own downloaded clips and sounds", kind: "button" },
];

export function RoadmapSection() {
  return (
    <section className="flex flex-col gap-3 opacity-50">
      <h2 className="label-etched">Coming Soon</h2>
      <p className="text-sm text-neutral-500">
        Planned and greyed out until they're wired up.
      </p>

      <div className="flex flex-col gap-2" aria-hidden="true">
        {UPCOMING.map((item) => (
          <div
            key={item.label}
            className="flex items-center justify-between gap-3 border border-neutral-800 bg-metal-800/30 px-3 py-2 cursor-not-allowed select-none"
            title="Not built yet"
          >
            <div className="min-w-0">
              <div className="text-base text-neutral-400 truncate">{item.label}</div>
              <div className="text-sm text-neutral-600 truncate">{item.note}</div>
            </div>

            {item.kind === "toggle" ? (
              <span className="shrink-0 h-6 w-11 rounded-full border border-neutral-700 bg-metal-900 relative">
                <span className="absolute left-0.5 top-0.5 h-4 w-5 rounded-full bg-neutral-700" />
              </span>
            ) : (
              <span className="shrink-0 border border-neutral-700 px-3 py-1 label-etched text-neutral-600">
                Pick
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
