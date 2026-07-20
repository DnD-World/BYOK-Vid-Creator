import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  main: {
    build: {
      outDir: "out/main",
      lib: { entry: resolve(__dirname, "electron/main.ts") },
    },
  },
  preload: {
    build: {
      outDir: "out/preload",
      lib: { entry: resolve(__dirname, "electron/preload.ts") },
    },
  },
  renderer: {
    root: ".",
    plugins: [react()],
    build: {
      outDir: "out/renderer",
      rollupOptions: {
        input: { index: resolve(__dirname, "index.html") },
      },
    },
    resolve: {
      alias: { "@": resolve(__dirname, "src") },
    },
  },
});
