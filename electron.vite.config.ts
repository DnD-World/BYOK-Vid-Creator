import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  main: {
    // Everything in package.json `dependencies` stays external and is
    // require()d at runtime instead of being inlined. @remotion/bundler and
    // @remotion/renderer ship native binaries and spawn their own child
    // processes, so bundling them into main.js breaks them outright.
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: "out/main",
      lib: { entry: resolve(__dirname, "electron/main.ts") },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
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
