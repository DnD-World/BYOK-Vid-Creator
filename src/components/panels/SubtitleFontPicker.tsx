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

import { Picker } from "../ui/Picker";
import { useEffect, useState } from "react";
import { useFontPreviews } from "../../lib/assets/useFontPreviews";
import { useProjectStore } from "../../store/useProjectStore";

interface FontOption {
  family: string;
  weights: number[];
  greek: boolean;
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
      {/* Deco Noir's own picker. A native <select> cannot do the one thing
          this control exists to do — show the name of a typeface IN that
          typeface — and its popup is drawn by the OS, so it ignored the theme
          entirely and came out light-on-light. */}
      <Picker
        aria-label="Subtitle typeface"
        className="w-full"
        disabled={busy}
        value={subtitles.fontFamily ?? ""}
        // Previews are fetched only once the list is opened, four at a time.
        onOpenChange={setOpen}
        triggerStyle={{
          fontFamily: subtitles.fontFamily
            ? `"dnprev-${subtitles.fontFamily}", "${subtitles.fontFamily}", var(--body)`
            : undefined,
        }}
        options={[
          { value: "", label: "System (Segoe UI)" },
          ...options.map((o) => ({
            value: o.family,
            label: o.family,
            note: o.greek ? undefined : "no Greek",
            // Falls back to the UI font until the preview has loaded, so a slow
            // family shows its name rather than nothing.
            fontFamily: previewed.has(o.family) ? `"dnprev-${o.family}", var(--body)` : undefined,
          })),
        ]}
        onChange={(family) => {
          if (!family) {
            void choose(null, weight);
            return;
          }
          const o = options.find((x) => x.family === family);
          if (!o) return;
          // Snap to a weight the family actually has — asking Google for a
          // weight that doesn't exist is a 400, not a substitution.
          const w = o.weights.includes(weight) ? weight : o.weights.at(-1)!;
          void choose(family, w);
        }}
      />

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
