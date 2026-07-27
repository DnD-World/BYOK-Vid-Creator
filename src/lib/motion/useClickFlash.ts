import { useCallback, useRef } from "react";

/**
 * Mounts a .hud-flash overlay (reuses .panel-hud's exact clip-path via the
 * shared --cut variable) inside an element on click, then removes it once
 * the animation finishes. The host element must be position: relative —
 * .panel-hud and .hud-btn already are.
 */
export function useClickFlash<T extends HTMLElement = HTMLElement>() {
  const ref = useRef<T | null>(null);

  const fire = useCallback(() => {
    const host = ref.current;
    if (!host) return;
    if (document.documentElement.getAttribute("data-hud-motion") === "off") return;

    const flash = document.createElement("span");
    flash.className = "hud-flash";
    host.appendChild(flash);

    const cleanup = () => flash.remove();
    flash.addEventListener("animationend", cleanup, { once: true });
    window.setTimeout(cleanup, 800); // fallback in case the event never fires
  }, []);

  return { ref, fire };
}
