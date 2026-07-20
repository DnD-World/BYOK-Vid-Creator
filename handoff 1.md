2

📄 HANDOFF DOC (paste this into a fresh chat to continue without the image load)
PROJECT: BYOK-Vid-Creator — desktop-only video machine. Site: BYOK-Vid-Creator.stravelakis.com. README already live on GitHub. Built with You.com + Opus 4.8 (+ Hermes agent, Google Flow, credited in README).
GOAL: Deterministic (non-generative) video creation. Script → local TTS → auto-fetched stock B-roll + music/SFX → animated waveforms + viseme-synced speaker disks + subtitles → rendered MP4. Max 10min, must handle 8min+. Priorities in order: stability > functionality > output quality > UI wow.
STACK (locked):
Electron + React(Vite) + TypeScript + Tailwind (dark-only) + Zustand + framer-motion + Remotion (render engine).
TTS: Coqui XTTS v2 (main, local), Azure Speech (quality fallback), Piper (test fallback). Greek + some English. No SSML/phoneme accents — expressiveness via audio post-processing only, deferred until quality local model runs.
Scene chunking / script AI: GLM 5.2 via NVIDIA provider.
Media: Pixabay (video+music), Jamendo (music), Freesound (SFX). One MediaProvider interface.
Storage: local disk day 1; Google Drive = UI-present but disabled ("future feature").
BYOK backend dashboard: enter API keys, defaults, saved templates/presets.
RENDER: aspect 9:16 & 16:9. FPS choice 10/24/30, default 30. Machine: rec. spec 8GB NVIDIA / 32GB RAM. ~1hr/10min render is acceptable.
VISEMES: 9-set = neutral, ah, ee, oh, oo, mbp, fv, l, chsh. Each = 1024×1024 transparent PNG, head centered w/ ~12% padding, scales to 90% of speaker disk. Sync driven from text→phoneme timing (no user audio provided; no diarization needed). <95% sync fidelity acceptable.
UI AESTHETIC: Charcoal brushed metal + thick clear plastic controls + amber/copper backlit glow (achieved in pure CSS — layered gradients + backdrop-blur + inset/outset shadows; NO WebGL). Tactile knobs/sliders/plastic buttons. Left rail = accordions/icon-rail. Bottom = drag-edit timeline. Native <select>/file inputs must be hidden behind styled proxies.
FEATURES: speaker disks (bg + border opacity sliders, incl. invisible), subtitle engine (active-word glow+stroke, fonts/colors/sizes/word-count, SRT export), waveform (5 shapes: bars/line/wave/blocks/mirror; positions circular/top/bottom/L/R; modes single-all/single-colorshift/two-speaker/two+music/three-track; only active speakers animate), AI background auto-fetch (relevancy↔frequency slider w/ min-clip strobe guard), transitions, audio ducking, uploadable logo (4 corners or watermark), draggable/resizable canvas w/ snap-to-grid, presets, "Dogs & Butterflies" sample project.
DONE (Phase 1b): package.json, vite/tailwind/postcss config, index.css theme, store (types/defaults/useProjectStore), PlasticButton, electron main. Root files confirmed in project root. NEXT (Phase 1c): AppShell panel layout + wire FPS/aspect controls to store.


1
📄 HANDOFF DOC (paste this into your new clean chat)
PROJECT: BYOK-Vid-Creator — Handoff v1 URL: https://BYOK-Vid-Creator.stravelakis.com · GitHub live · README live. What it is: Desktop app (Electron) that turns a script into a polished 8–10 min video with TTS narration, lip-synced avatar disks, glowing waveforms, highlighted subtitles, and auto-fetched stock backgrounds. Deterministic (Remotion render), NOT generative video.
Target machine (RECOMMENDED spec): 8GB NVIDIA GPU, 32GB RAM, AMD CPU. ~1hr render for 10min acceptable. Render at 10fps.
LOCKED STACK:
Electron + React + Vite + TypeScript + Tailwind (dark only)
Zustand sliced store (src/store/slices/*) = source of truth
framer-motion for canvas drag/resize
Remotion (native, GPU) = video renderer (deterministic)
FFmpeg (native bundled binary) = audio mix + ducking + final mux
TTS: Coqui XTTS v2 (MAIN, Python sidecar, GPU, Greek+English, voice cloning) · Azure Neural (quality fallback, SSML prosody only) · Piper (test fallback). Edge/ElevenLabs/Voxtral = DROPPED.
Chunking/scene AI: GLM-5.2 via NVIDIA provider (BYOK)
Media: Pixabay + Pexels (video, music, SFX)
Alignment: whisperX (word timestamps) + G2P → 9-viseme map
Audio FX: pedalboard (Python) for character voices + warmth
KEY DECISIONS:
Accents come from XTTS reference clips + audio post-FX (pitch/formant), NOT SSML. Azure uses SSML prosody/break only, never per-phoneme surgery.
Visemes: 9 slots (neutral, ah, ee, oh, oo, mbp, fv, l, chsh). PNG 1024×1024, transparent, head LOCKED position across all frames. Named char_<viseme>.png.
Avatar = round disk, face fills 90%, independent bg-opacity + border-opacity sliders (0 = invisible disk).
UI theme: charcoal-metal panels + clear-plastic amber-glow controls, pure CSS (tokens in tailwind.config). Stability > wow, but wow is the goal.
PRIORITY ORDER: Stability > Functionality > Output quality > UI wow.
UI FUTURE-STUB (must appear in UI Day 1, disabled): Google Drive export. Local disk export = active.
PHASE PLAN:
✅ Phase 1: scaffold (package.json, tailwind theme, store index + speaker slice, electron main) — DONE / committing.
⬜ Phase 1b: remaining 6 store slices + App shell (left accordion rail, center canvas, bottom timeline) + tactile components (PlasticButton, MetalSlider, Panel).
⬜ Phase 2: script→SSML maker + TTS sidecar + XTTS integration + audio FX chain.
⬜ Phase 3: alignment → viseme + subtitle word-highlight timing.
⬜ Phase 4: waveform engine (5 styles, positional configs, behavioral modes).
⬜ Phase 5: Pixabay/Pexels background automation + relevancy/frequency slider (min-duration constraint).
⬜ Phase 6: Remotion composition + FFmpeg mux + ducking + export (local + GDrive stub).
⬜ Phase 7: presets, sample "Dogs & Butterflies" project, polish.
CREDITS (in README): You.com, Claude Opus 4.8, Hermes agent, Google Flow.
