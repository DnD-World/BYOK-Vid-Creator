/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Charcoal metal body
        metal: {
          900: "#0d0d0f",
          800: "#141417",
          700: "#1c1c20",
          600: "#26262b",
          500: "#33333a",
        },
        // Accent glow — reads live CSS variables (set in index.css / by the
        // Appearance color picker) instead of a fixed hex, so switching the
        // color at runtime actually recolors every accent-* utility class.
        accent: {
          DEFAULT: "rgb(var(--accent-rgb) / <alpha-value>)",
          bright: "rgb(var(--accent-bright-rgb) / <alpha-value>)",
          deep: "rgb(var(--accent-deep-rgb) / <alpha-value>)",
        },
        speaker1: "#e8a24a",
        speaker2: "#4ac2e8",
      },
      fontFamily: {
        // Tech/industrial display + clean body
        display: ["'Rajdhani'", "system-ui", "sans-serif"],
        body: ["'Inter'", "system-ui", "sans-serif"],
      },
      boxShadow: {
        // Recessed metal socket
        socket:
          "inset 0 2px 4px rgba(0,0,0,0.8), inset 0 -1px 1px rgba(255,255,255,0.04)",
        // Raised plastic key
        plastic:
          "0 2px 3px rgba(0,0,0,0.6), inset 0 1px 1px rgba(255,255,255,0.15), inset 0 -2px 4px rgba(0,0,0,0.4)",
        // Also CSS-var-driven so the glow recolors with the chosen accent
        glow: "0 0 12px rgb(var(--accent-rgb) / 0.55), 0 0 2px rgb(var(--accent-bright-rgb) / 0.9)",
      },
    },
  },
  plugins: [],
};
