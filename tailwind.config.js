/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        metal: {
          900: "#0d0d0f",   // deepest charcoal
          800: "#151518",
          700: "#1d1d21",
          600: "#26262b",   // panel face
          500: "#33333a",   // raised edge
        },
        amber: {
          glow: "#ff9a3c",
          core: "#ffb35c",
          dim:  "#7a4a1f",
        },
        plastic: "rgba(255,255,255,0.06)", // clear-plastic overlay
      },
      boxShadow: {
        // raised charcoal-metal panel
        panel:
          "inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -2px 4px rgba(0,0,0,0.6), 0 4px 12px rgba(0,0,0,0.5)",
        // pressed / recessed slot
        recess:
          "inset 0 2px 6px rgba(0,0,0,0.8), inset 0 -1px 0 rgba(255,255,255,0.04)",
        // clear-plastic button
        plastic:
          "inset 0 1px 1px rgba(255,255,255,0.5), inset 0 -6px 10px rgba(0,0,0,0.4), 0 2px 6px rgba(0,0,0,0.6)",
        // amber glow (waveform / active)
        glow: "0 0 8px rgba(255,154,60,0.7), 0 0 20px rgba(255,154,60,0.35)",
      },
      backdropBlur: { plastic: "6px" },
      fontFamily: {
        display: ["'Rajdhani'", "system-ui", "sans-serif"], // techy display
        mono: ["'JetBrains Mono'", "monospace"],
      },
    },
  },
  plugins: [],
};
