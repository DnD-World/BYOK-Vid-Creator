// Remotion bundle entry point. Kept separate from the Electron renderer's
// src/main.tsx — this tree is compiled by Remotion's own webpack config and
// must not pull in Electron APIs, Tailwind, or anything from window.byok.
import { registerRoot } from "remotion";
import { RemotionRoot } from "./Root";

registerRoot(RemotionRoot);
