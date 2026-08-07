// ---------------------------------------------------------------------------
// Subtitle typeface.
//
// The list is short and curated rather than the whole of Google Fonts, and each
// entry says whether it has GREEK. That flag is the reason this control exists
// in this shape: Montserrat, Oswald, Lato, Rubik and Nunito are the obvious
// choices for a subtitle and none of them ship Greek. Choosing one and typing
// Greek gets a silent per-glyph fallback to another typeface — the kind of
// thing that looks like a rendering bug and is actually a licensing boundary.
//
// So the fonts without Greek are still offered — they are good faces for an
// English video — but the warning appears the moment the project is Greek.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { useFontPreviews } from "../../lib/assets/useFontPreviews";
import { useProjectStore } from "../../store/useProjectStore";

interface FontOption {
  family: string;
  weights: number[];
  greek: boolean;
}


/** One row. The name is set in the face it names — that is the whole point of
 *  the control, and a list of names in the UI font answers nothing. */
function FontRow({
  label, note, fontFamily, selected, onSelect,
}: {
  label: string;
  note?: string;
  fontFamily?: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className="w-full flex items-baseline gap-2 px-3 py-2 text-left transition-colors"
      style={{
        fontFamily,
        fontSize: "1.05rem",
        color: selected ? "var(--accent-hi)" : "var(--ink)",
        background: selected ? "rgb(var(--accent-rgb) / .16)" : "transparent",
      }}
      onMouseEnter={(e) => {
        if (!selected) e.currentTarget.style.background = "rgb(var(--accent-rgb) / .09)";
      }}
      onMouseLeave={(e) => {
        if (!selected) e.currentTarget.style.background = "transparent";
      }}
    >
      <span className="flex-1 truncate">{label}</span>
      {note && (
        <span className="text-xs shrink-0" style={{ color: "var(--ink-3)", fontFamily: "var(--data)" }}>
          {note}
        </span>
      )}
    </button>
  );
}

export function SubtitleFontPicker() {
  const subtitles = useProjectStore((s) => s.subtitles);
  const setSubtitles = useProjectStore((s) => s.setSubtitles);
  const language = useProjectStore((s) => s.language);

  const [options, setOptions] = useState<FontOption[]>([]);
  const [open, setOpen] = useState(false);
  // Previews load only once the list is opened — see the hook.
  const previewed = useFontPreviews(options, open);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Optional-chained: `window.byok` exists only inside Electron. An unguarded
    // call here throws during mount and takes the WHOLE app down, which is a
    // blank window that looks like a styling fault rather than a missing bridge.
    window.byok?.fonts
      ?.list()
      .then((list: FontOption[]) => {
        if (!cancelled) setOptions(list);
      })
      .catch(() => {
        /* the picker just stays on System */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const current = options.find((o) => o.family === subtitles.fontFamily) ?? null;
  const weight = subtitles.fontWeight ?? 800;

  /** Fetching here rather than only at render time is deliberate: the download
   *  is what proves the font exists, and finding that out while the preview is
   *  in front of you beats finding out at the end of a render. */
  const choose = async (family: string | null, nextWeight: number) => {
    setNote(null);
    if (!family) {
      setSubtitles({ fontFamily: null });
      return;
    }
    setBusy(true);
    try {
      const font = await window.byok.fonts.ensure(family, nextWeight);
      setSubtitles({ fontFamily: family, fontWeight: nextWeight });
      if (!font.hasGreek && language === "el") {
        setNote(
          `${family} has no Greek. Greek letters will be drawn in the fallback typeface — ` +
            "fine for an English video, visibly wrong for this one."
        );
      }
    } catch (e) {
      setNote(
        `Couldn't fetch ${family}: ${e instanceof Error ? e.message : String(e)}. ` +
          "It needs the internet once; after that it's cached."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="label-etched">Typeface</div>
      {/* A native <select> was replaced here for two reasons that are not
          preferences. Its popup is drawn by the OS, so it ignored the theme
          entirely and came out light-on-light — unreadable. And an <option>
          cannot be reliably set in its own typeface, which is the one thing
          this control needs to show: the name of a face, in that face. */}
      <div className="relative">
        <button
          type="button"
          disabled={busy}
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="w-full flex items-center gap-2 px-3 py-2 text-left cut-sm
            bg-[color-mix(in_srgb,var(--accent)_10%,#000)]
            hover:bg-[color-mix(in_srgb,var(--accent)_18%,#000)]
            text-[color:var(--ink)] transition-colors disabled:opacity-50"
          style={{
            fontFamily: subtitles.fontFamily
              ? `"dnprev-${subtitles.fontFamily}", "${subtitles.fontFamily}", var(--body)`
              : undefined,
            boxShadow: "inset 0 0 0 1px rgb(var(--accent-rgb) / .35)",
          }}
        >
          <span className="flex-1 truncate">
            {subtitles.fontFamily ?? "System (Segoe UI)"}
          </span>
          <span className="text-[color:var(--ink-3)]">{open ? "▲" : "▼"}</span>
        </button>

        {open && (
          <div
            role="listbox"
            className="absolute z-40 mt-1 left-0 right-0 max-h-72 overflow-y-auto cut-sm"
            style={{
              background: "#0b0b0a",
              boxShadow: "inset 0 0 0 1px rgb(var(--accent-rgb) / .4), 0 12px 28px rgba(0,0,0,.7)",
            }}
          >
            <FontRow
              label="System (Segoe UI)"
              selected={!subtitles.fontFamily}
              onSelect={() => { setOpen(false); void choose(null, weight); }}
            />
            {options.map((o) => (
              <FontRow
                key={o.family}
                label={o.family}
                note={o.greek ? undefined : "no Greek"}
                // Falls back to the UI font until the preview has loaded, so a
                // slow family shows its name rather than nothing.
                fontFamily={
                  previewed.has(o.family)
                    ? `"dnprev-${o.family}", var(--body)`
                    : undefined
                }
                selected={subtitles.fontFamily === o.family}
                onSelect={() => {
                  setOpen(false);
                  // Snap to a weight the family actually has — asking Google for
                  // a weight that doesn't exist is a 400, not a substitution.
                  const w = o.weights.includes(weight) ? weight : o.weights.at(-1)!;
                  void choose(o.family, w);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {current && (
        <div className="flex flex-wrap gap-2">
          {current.weights.map((w) => (
            <button
              key={w}
              disabled={busy}
              onClick={() => void choose(current.family, w)}
              className={`px-2 py-1 text-sm border ${
                w === weight
                  ? "border-accent text-accent-bright"
                  : "border-accent/25 text-neutral-400 hover:text-accent-bright"
              }`}
            >
              {w}
            </button>
          ))}
        </div>
      )}

      {busy && <p className="text-sm text-accent-bright">Fetching the font…</p>}
      {note && <p className="text-sm text-amber-400">{note}</p>}
      {!busy && !note && subtitles.fontFamily && (
        <p className="text-sm text-neutral-500">
          Downloaded once and cached — later renders and offline runs use the local copy.
        </p>
      )}
    </div>
  );
}
