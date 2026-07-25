/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        metal: {
          900: "#07080a",
          800: "#0c0e12",
          700: "#141519",
          600: "#1c1e22",
          500: "#26282d",
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
        display: ["'Rajdhani'", "system-ui", "sans-serif"],
        mono: ["'Share Tech Mono'", "monospace"],
        body: ["'Inter'", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 12px rgb(var(--accent-rgb) / 0.55), 0 0 2px rgb(var(--accent-bright-rgb) / 0.9)",
        "glow-lg": "0 0 20px rgb(var(--accent-rgb) / 0.45), 0 0 4px rgb(var(--accent-bright-rgb) / 0.8)",
      },
    },
  },
  plugins: [],
};
