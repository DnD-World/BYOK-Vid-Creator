import { motion } from "framer-motion";
import { ReactNode } from "react";
import { useClickFlash } from "../../lib/motion/useClickFlash";

/**
 * Renamed from PlasticButton — the visual direction pivoted from thick
 * plastic to amber cyberpunk (angular clip-path corners, glowing outline)
 * after the material-study approach proved too hard to nail well. Keeping
 * the old name around would mislead anyone reading this file later.
 *
 * Every button gets the chamfered click flash for free via useClickFlash —
 * it reuses .hud-btn's own clip-path/--cut, so it can never visually drift
 * out of sync with the button shape.
 */
export function HudButton({
  children, active, onClick, disabled, title,
}: {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
  /** A button that isn't ready yet — greyed, unclickable, and no click flash,
   *  since flashing on a press that does nothing reads as a broken control. */
  disabled?: boolean;
  title?: string;
}) {
  const { ref, fire } = useClickFlash<HTMLButtonElement>();

  return (
    <motion.button
      ref={ref}
      disabled={disabled}
      title={title}
      onClick={() => {
        if (disabled) return;
        fire();
        onClick?.();
      }}
      whileTap={disabled ? undefined : { y: 1, scale: 0.98 }}
      className={`hud-btn px-4 py-2.5 font-display font-semibold uppercase tracking-[0.14em]
        text-sm transition-shadow relative
        ${disabled ? "opacity-40 cursor-not-allowed" : ""}
        ${active ? "hud-btn-active text-accent-bright" : "text-neutral-400"}`}
    >
      {children}
    </motion.button>
  );
}
