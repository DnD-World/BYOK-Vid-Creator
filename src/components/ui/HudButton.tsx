import { motion } from "framer-motion";
import { ReactNode } from "react";
import { useClickFlash } from "../../lib/motion/useClickFlash";

/**
 * The app's button IS the identity system's illuminated key.
 *
 * It used to be `.hud-btn`, a hand-rolled copy of the same look kept in
 * index.css. That copy stopped matching the library — it was written against
 * an older version and never updated — which is why the bezels looked flat
 * next to the rest of the theme. There is one implementation now, in
 * deco-noir.css, and this only picks the variant.
 *
 * Colour is NOT set here. The key sets its own: `--k` is the lamp behind the
 * glass and every glow is theme brass. Adding a text colour on top is what
 * washed the legends out.
 */
export function HudButton({
  children, active, onClick, disabled, title, tone,
}: {
  children: ReactNode;
  /** Lit — the selected item in a group. */
  active?: boolean;
  onClick?: () => void;
  /** A button that isn't ready yet — greyed, unclickable, and no click flash,
   *  since flashing on a press that does nothing reads as a broken control. */
  disabled?: boolean;
  title?: string;
  /** The lamp colour. Structure stays brass whatever this is. */
  tone?: "good" | "crit";
}) {
  const { ref, fire } = useClickFlash<HTMLButtonElement>();

  return (
    <motion.button
      ref={ref}
      disabled={disabled}
      title={title}
      aria-pressed={active}
      onClick={() => {
        if (disabled) return;
        fire();
        onClick?.();
      }}
      whileTap={disabled ? undefined : { y: 1, scale: 0.98 }}
      className={[
        "btn cut-sm",
        active ? "btn-primary" : "",
        tone === "good" ? "btn-good" : tone === "crit" ? "btn-crit" : "",
        disabled ? "opacity-40 cursor-not-allowed" : "",
      ].filter(Boolean).join(" ")}
    >
      {children}
    </motion.button>
  );
}
