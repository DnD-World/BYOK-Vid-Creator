// ---------------------------------------------------------------------------
// Everything already on this machine, browsable.
//
// 177 clips had accumulated in the download cache and nothing could look at
// them. Every render went back to the stock providers and fetched again — API
// quota spent on files already on the disk, and no way to reuse a clip you
// liked in an earlier lesson except by remembering its name.
//
// Deliberately plain: a list, a filter, and a preview on hover. The picture is
// the point, so each row shows the actual first frame rather than an icon.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useState } from "react";
import { HudButton } from "../ui/HudButton";

interface MediaItem {
  fileName: string;
  filePath: string;
  kind: "video" | "audio";
  bytes: number;
  modifiedMs: number;
  source?: string;
}

interface Props {
  /** What to do with the one that was chosen. Given the absolute path. */
  onPick?: (filePath: string, kind: "video" | "audio") => void;
  /** Narrow the list before it is shown. */
  only?: "video" | "audio";
}

export function MediaLibrary({ onPick, only }: Props) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [filter, setFilter] = useState("");
  const [kind, setKind] = useState<"all" | "video" | "audio">(only ?? "all");
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    window.byok?.media
      ?.library()
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return items.filter(
      (i) =>
        (kind === "all" || i.kind === kind) &&
        (!q || i.fileName.toLowerCase().includes(q))
    );
  }, [items, filter, kind]);

  const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="label-etched">Media library</div>
        <button
          onClick={load}
          className="text-sm text-accent-bright/70 hover:text-accent-bright"
        >
          Refresh
        </button>
      </div>

      <p className="text-sm text-neutral-500">
        Everything already downloaded to this machine, newest first. Using one
        of these costs no search quota and no waiting.
      </p>

      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Filter by name…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="flex-1 min-w-0 bg-metal-900 border border-accent/25 px-3 py-1.5 text-sm text-neutral-100 outline-none focus:border-accent"
        />
        {!only &&
          (["all", "video", "audio"] as const).map((k) => (
            <HudButton key={k} active={kind === k} onClick={() => setKind(k)}>
              {k}
            </HudButton>
          ))}
      </div>

      <div className="text-sm text-neutral-500">
        {loading
          ? "Reading…"
          : `${shown.length} of ${items.length} file(s)`}
      </div>

      <div className="max-h-[420px] overflow-y-auto space-y-1 pr-1">
        {shown.map((item) => (
          <div
            key={item.filePath}
            className="flex items-center gap-3 border border-accent/15 bg-metal-900/50 px-2 py-1.5"
          >
            {/* The actual frame, not an icon. Which clip this is cannot be told
                from "pexels-10117444.mp4". */}
            {item.kind === "video" ? (
              <video
                src={`file://${item.filePath.replace(/\\/g, "/")}`}
                className="w-16 h-10 object-cover bg-black shrink-0"
                muted
                preload="metadata"
                onMouseEnter={(e) => void e.currentTarget.play().catch(() => {})}
                onMouseLeave={(e) => {
                  e.currentTarget.pause();
                  e.currentTarget.currentTime = 0;
                }}
              />
            ) : (
              <div className="w-16 h-10 shrink-0 bg-black/60 flex items-center justify-center text-accent-bright/70 text-sm">
                ♪
              </div>
            )}

            <div className="min-w-0 flex-1">
              <div className="text-sm text-neutral-200 truncate">{item.fileName}</div>
              <div className="text-sm text-neutral-500">
                {mb(item.bytes)}
                {item.source ? ` · ${item.source}` : ""}
              </div>
            </div>

            {onPick && (
              <HudButton onClick={() => onPick(item.filePath, item.kind)}>
                Use
              </HudButton>
            )}
          </div>
        ))}

        {!loading && shown.length === 0 && (
          <p className="text-sm text-neutral-500">
            {items.length === 0
              ? "Nothing downloaded yet. Clips arrive here when a render fetches backgrounds."
              : "Nothing matches that filter."}
          </p>
        )}
      </div>
    </div>
  );
}
