import { useCallback, useRef } from "react";

/** Briefly adds .is-flaring to a .hud-flare-target element on click,
 *  brightening + nudging its .hud-corner brackets, then removing the
 *  class so the transition already on .hud-corner settles it back. */
export function useCornerFlare<T extends HTMLElement = HTMLElement>() {
  const ref = useRef<T | null>(null);

  const fire = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.classList.add("is-flaring");
    window.setTimeout(() => el.classList.remove("is-flaring"), 300);
  }, []);

  return { ref, fire };
}
