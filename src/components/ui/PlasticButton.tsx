import { motion } from "framer-motion";
import { ReactNode } from "react";

export function PlasticButton({
  children, active, onClick,
}: { children: ReactNode; active?: boolean; onClick?: () => void }) {
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ y: 2, scale: 0.98 }}
      className={`plastic px-4 py-2 font-display uppercase tracking-widest
        text-xs transition-shadow
        ${active ? "text-accent-bright shadow-glow" : "text-neutral-400"}`}
    >
      {children}
    </motion.button>
  );
}
