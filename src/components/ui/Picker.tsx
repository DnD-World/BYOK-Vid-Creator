// ---------------------------------------------------------------------------
// The app's dropdown. Deco Noir's `.picker` / `.picktrigger` / `.picklist` /
// `.pickopt`, wired up — not an approximation of them.
//
// WHY THIS REPLACES `<select>`. A native select's popup is drawn by WINDOWS,
// not by the page. No stylesheet reaches it, so on this theme it opened as a
// white menu with a blue highlight — light-on-light, unreadable, and visibly
// from another application. That is not a styling nitpick: it is the one
// control in the app that could not be themed at all.
//
// WHY THE LIST IS PORTALLED. Panels are chamfered with clip-path, and a
// clip-path clips EVERY descendant, including position:fixed ones. An
// absolutely-positioned list inside a panel gets sliced to the panel's edge —
// which is exactly how the background search box ended up half-hidden and
// untypeable. Rendering into document.body is the only way out of an
// ancestor's clip, so the list is positioned from the trigger's rect instead
// of by the normal flow.
// ---------------------------------------------------------------------------

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

export interface PickerOption<T extends string> {
  value: T;
  label: string;
  /** Shown dimmed on the right — a reason, not a second label. */
  note?: string;
  /** Per-option typeface, for a list that previews what it offers. */
  fontFamily?: string;
}

interface Props<T extends string> {
  value: T;
  options: PickerOption<T>[];
  onChange: (value: T) => void;
  /** Shown when `value` matches no option. */
  placeholder?: string;
  disabled?: boolean;
  /** Applied to the trigger, for callers that need a width or a font. */
  className?: string;
  triggerStyle?: CSSProperties;
  "aria-label"?: string;
  /** Fires when the list opens or closes. The font picker uses it to start
   *  fetching previews only once someone actually looks at the list — there is
   *  no reason to pull twenty typefaces off the network for a control nobody
   *  opened. */
  onOpenChange?: (open: boolean) => void;
}

export function Picker<T extends string>({
  value,
  options,
  onChange,
  placeholder = "Choose…",
  disabled,
  className = "",
  triggerStyle,
  "aria-label": ariaLabel,
  onOpenChange,
}: Props<T>) {
  const [open, setOpenState] = useState(false);
  const setOpen = (next: boolean | ((v: boolean) => boolean)) =>
    setOpenState((v) => {
      const value = typeof next === "function" ? next(v) : next;
      if (value !== v) onOpenChange?.(value);
      return value;
    });
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [active, setActive] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  // Measured on open and kept in step with scrolling, because the list is no
  // longer a child of the thing it belongs to.
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const el = triggerRef.current;
      if (el) setRect(el.getBoundingClientRect());
    };
    measure();
    setActive(selectedIndex >= 0 ? selectedIndex : 0);
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [open, selectedIndex]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || listRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  // Keep the highlighted row on screen when arrowing past the fold.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({
      block: "nearest",
    });
  }, [active, open]);

  function commit(i: number) {
    const o = options[i];
    if (!o) return;
    onChange(o.value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(options.length - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      commit(active);
    }
  }

  // Flip above the trigger when there isn't room below, so a picker near the
  // bottom of a rail doesn't open off-screen.
  const listStyle: CSSProperties | undefined = rect
    ? (() => {
        const gap = 6;
        const maxH = 288;
        const below = window.innerHeight - rect.bottom - gap;
        const flip = below < Math.min(maxH, options.length * 38) && rect.top > below;
        return {
          position: "fixed",
          left: rect.left,
          width: rect.width,
          maxHeight: Math.min(maxH, flip ? rect.top - gap : below),
          ...(flip ? { bottom: window.innerHeight - rect.top + gap } : { top: rect.bottom + gap }),
        };
      })()
    : undefined;

  return (
    <div className={`picker ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className="picktrigger cut-sm disabled:opacity-50"
        style={triggerStyle}
      >
        <span className="flex-1 truncate text-left" style={{ fontFamily: selected?.fontFamily }}>
          {selected ? selected.label : placeholder}
        </span>
        <span className="chev" aria-hidden />
      </button>

      {open &&
        rect &&
        createPortal(
          <div
            ref={listRef}
            role="listbox"
            className="picklist cut-sm overflow-y-auto"
            style={listStyle}
            onKeyDown={onKeyDown}
          >
            {options.map((o, i) => (
              <button
                key={o.value}
                type="button"
                data-i={i}
                role="option"
                aria-selected={o.value === value}
                onPointerEnter={() => setActive(i)}
                onClick={() => commit(i)}
                className="pickopt flex items-center gap-2"
                style={{ fontFamily: o.fontFamily, ...(i === active ? { color: "var(--accent)" } : null) }}
              >
                <span className="flex-1 truncate text-left">{o.label}</span>
                {o.note && (
                  <span className="text-[color:var(--ink-3)] text-sm flex-none">{o.note}</span>
                )}
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}
