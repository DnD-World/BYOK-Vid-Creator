# BYOK-Vid-Creator — Handoff 3 (Comprehensive)

Self-contained: this document is written so a new session can pick up the
project without needing to read `handoff 1.md` or `handoff 2.md` first,
though those remain as the detailed turn-by-turn history if deeper context
on *why* a specific decision happened is ever needed. This one answers
three questions: what was the original plan, what's the plan now, and
exactly where do things stand today.

Repo: https://github.com/DnD-World/BYOK-Vid-Creator (Ak / Lambros
Stravelakis, org DnD-World). Real git workflow — Ak provides a
session-scoped fine-grained GitHub PAT when direct pushes are wanted;
never persisted anywhere.

---

## 1. What this app is

A desktop app (Electron) for producing narrated, subtitled,
viseme-lip-synced short-form videos in Greek and English, aimed partly at
Ak's own Greek dog-owner community project and partly as a showcase piece
— he's evaluating a paid subscription purchase contingent on this turning
out stable and good-looking, and plans to show it on LinkedIn as an
example of a custom solution he can build for clients. That commercial
intent has directly driven at least one major technical decision (see
§3). He's a non-traditional developer — designs and directs, delegates
implementation to AI coding agents ("Ak architects, agent executes").

## 2. The original plan (as of `handoff 1.md`)

- Stack: Electron + electron-vite + React + TypeScript + Tailwind
  (dark-only) + Zustand + framer-motion. Render via Remotion + FFmpeg.
- TTS: Coqui XTTS-v2 as the main local engine, Azure Speech as a quality
  fallback, Piper for quick testing.
- Scene-chunking LLM: GLM-5.2 via NVIDIA.
- Media providers: Pixabay, Pexels, Jamendo, Freesound.
- Visual direction: thick clear-acrylic plastic buttons, industrial matte
  dark metal, brushed-metal texture panels, amber glow accents.
- Priority order: stability > functionality > output quality > UI wow.

## 3. What changed, and why (two real pivots, both deliberate)

**TTS engine: XTTS-v2 → Chatterbox Multilingual v3.** Found before any
integration code was written, via web search rather than assumption:
XTTS-v2 has never supported Greek (its fixed 17-language list doesn't
include it — one of this app's two core languages), and its CPML license
requires a paid commercial license for revenue-generating use, which
conflicts directly with Ak's stated plan to showcase/sell this to clients.
**Chatterbox Multilingual v3** (Resemble AI) replaced it: MIT licensed (no
commercial restriction), confirmed Greek support, ~5s zero-shot voice
cloning, benchmarked by the vendor as preferred over ElevenLabs in 63.75%
of blind A/B tests. Served via the existing, actively maintained
`devnen/Chatterbox-TTS-Server` (FastAPI, OpenAI-compatible API) rather
than building a persistent-server sidecar from scratch — Piper already
proved that architecture pattern works, so Chatterbox didn't need to
re-prove it, just reuse it.

**Visual direction: thick-plastic industrial metal → amber cyberpunk.**
The plastic/metal direction (see reference photos still in `inspiration
looks/`) turned out to need photoreal-material CSS rendering that's
genuinely hard to nail well. Ak's own words: "switching instead of
fighting it." Amber sci-fi cyberpunk — angular clip-path corners, thin
glowing lines, corner-bracket HUD details, scanline overlay — plays to
CSS's actual strengths (glow, transparency, angular cuts) instead of
fighting them. Confirmed via an iterative HTML mockup (two rounds — a
tilting rocker-switch toggle didn't read well and was replaced with a
two-position slide switch) before porting into real components.

## 4. The plan now

- Stack: unchanged from original except the TTS engine (see above).
- TTS: **Chatterbox Multilingual v3** (production/quality tier, voice
  cloning) + **Piper** (fast local test tier, no cloning) coexist as two
  separate engines — a speaker can be assigned a voice on either.
- Scene-chunking: narrowed in scope from the original idea. Rather than a
  separate "scenes" data structure (background/music cues per scene, not
  built), GLM-5.2 is used as a **script draft assistant** — give it a
  topic and the current speaker list, it drafts directly into the same
  "Label: text" script format the narration pipeline already consumes.
  This can be extended into a real per-scene structure later if that
  becomes necessary; it wasn't invented speculatively.
- Visual direction: amber cyberpunk (see §3), fully implemented, not just
  planned.
- Control-type preference for anything new, going forward: **toggles
  first, sliders second, knobs third, buttons last.**
- Standing UI rule: **no small font sizes anywhere** — Ak has a stated
  preference for larger, more readable text throughout this app
  specifically.
- Priority order, refined: (1) stability — no crashes, modularity, clear
  interconnections, futureproofed by bundling dependencies where possible
  rather than depending on things that update/collide; (2)
  engaging/wow-factor video output to compensate for not using generative
  video (Veo/Sora); (3) UI, as CSS/UI styling only, explicitly not a 3D
  game/engine.

## 5. Where things actually are — feature by feature

### Built and verified on Ak's real machine
- **App shell**: runs via `npm run dev`, real window opens. Confirmed
  working.
- **Piper TTS pipeline**: persistent `python -m piper.http_server`
  process per voice, Electron-managed. Confirmed working on Ak's machine
  — his `python` resolves into a shared "hermes-agent" venv (not a
  dedicated one; flagged as a bundling-priority tension, not yet fixed).
  Working Python path on his machine:
  `C:\Users\strav\AppData\Local\hermes\hermes-agent\venv\Scripts\python.exe`.
  He has 3 Greek voices + all English UK/US Piper voices installed.

### Built, NOT yet tested on Ak's real machine (his explicit choice — "we have confidence it will work, continue please")
- **Chatterbox Multilingual v3 integration** — Electron auto-starts
  `devnen/Chatterbox-TTS-Server` (Ak's explicit choice over running it as
  a standalone background app), health-checks with a multi-minute
  timeout (model load/first-run download is genuinely slow), synthesizes
  via `POST /tts`, releases GPU memory via `POST /api/unload` before
  killing the process on app quit. Default port 8004.
  - **One-time manual setup still required on Ak's machine**, not yet
    done as of this writing: clone `devnen/Chatterbox-TTS-Server`, run
    `start.bat` once (**Portable Mode recommended** — embeds its own
    Python 3.10, avoiding the exact multi-environment confusion Piper
    hit), select "Chatterbox Multilingual" once in its own Web UI so
    `config.yaml` saves it as the active engine. Ak has an RTX 3070 8GB
    laptop GPU — solid for this.
  - Voice modes: predefined voice, or clone from a reference audio file
    (~5s sample).
  - Test panel: `ChatterboxTestPanel.tsx` (in Backend Settings) — start
    server, pick/scan voices, two tuning knobs (Exaggeration, CFG
    Weight), synthesize + play test text.
- **Narration generation (the actual Phase 2 goal)** — not just a test
  preview. New "Narration" view (header: Canvas / Narration / Backend
  Settings). Write a script as `Label: text` per line, assign each
  speaker a Chatterbox voice (predefined or clone) right there, hit
  Generate — synthesizes each line with its speaker's voice and
  concatenates them into **one combined WAV file**
  (`electron/audio/concatWav.ts`), with each segment's start/end
  millisecond offset in the combined file preserved and displayed (needed
  later for viseme/subtitle sync against the combined track, not
  per-segment files).
- **GLM-5.2 script draft assistant** — "Draft Script with GLM-5.2" section
  at the top of the Narration panel. Give it a topic (+ optional tone),
  it drafts a script in the exact `Label: text` format, using the real
  current speaker labels. Confirms before overwriting existing script
  content. Needs an NVIDIA key pasted into Backend Settings first — Ak has
  the key but hadn't pasted it in as of this writing. Model:
  `z-ai/glm-5.2` via NVIDIA NIM, OpenAI-compatible endpoint, MIT licensed
  — confirmed via web search before any code was written, not assumed.

### Built, self-contained, no external dependency to verify
- **Amber cyberpunk visual system** — fully implemented in real
  components, not just the confirmation mockup:
  - Fonts: Rajdhani (display) + Share Tech Mono (labels), loaded via
    Google Fonts in `index.html` — note Rajdhani was referenced in
    `tailwind.config.js` from very early on but the actual font link was
    never added until this pass, so it silently fell back to system-ui
    the whole time before.
  - `.panel-hud` — angular `clip-path`-cut panels (corner size controlled
    by the `--cut` CSS variable), replacing the old rounded
    `.panel-metal`.
  - `HudCorners` — corner-bracket accents, dropped into any `.panel-hud`.
  - `.scanlines` — fixed full-viewport texture overlay.
  - `HudButton.tsx` (renamed from `PlasticButton.tsx` — old name would
    mislead now).
  - `Toggle.tsx` — two-position slide switch (oval cap, same visual
    language as the slider). An earlier tilting-rocker-switch version was
    built, rejected by Ak, and replaced — not the first thing tried.
  - `Slider.tsx` — a real native `<input type="range">` reskinned via
    `::-webkit-slider-thumb`/`::-moz-range-thumb` for an oval fader-cap
    look, deliberately keeping native drag/keyboard behavior instead of
    reimplementing pointer tracking.
  - `Knob.tsx` — rotary knob, 270° sweep, vertical-drag interaction
    (click-and-rotate is fiddly with a mouse). Wired to real values
    (Chatterbox exaggeration/cfg_weight), not built in isolation.
  - Base font size set explicitly to 16px; every previously-small text
    size bumped up app-wide.
  - All of the above read color from `--accent-*-rgb` CSS variables,
    derived from one picked hex via HSL math
    (`src/lib/color/deriveShades.ts`) — the switchable accent-color
    picker (Backend Settings → Appearance) was untouched by the visual
    pivot, just the shapes built on top of it.
  - **Not yet built**: the dotted 3D wave-plane waveform style
    (nice-to-have). Everything else from the confirmed direction is done.
- **Waveform renderer** — 6 styles (bars, lines, wave, mirror, dots,
  rings — rings added specifically to match the "chaotic glowing planet
  rings" reference photo), 5 positions, 5 behavior modes (single/
  single-colorshift/dual/dual-plus-music/triple). Controls: Size
  (scale), Density (sample count), Flush-to-edge toggle, Dot Size,
  and for rings specifically: Ring Size, Center Opening (space reserved
  for an avatar), Position X/Y. Uses deterministic placeholder sine-wave
  amplitude data, clearly marked in code, until Phase 2's real audio
  exists to drive it — this is the next natural thing to fix now that
  narration produces real audio (waveform doesn't yet read from it).
  Two real bugs were found and fixed along the way, not just features
  added: multi-track separation used to be a tiny fixed-pixel nudge that
  visually merged tracks together (now proportional to frame size), and
  the amplitude generator jumped too far in phase between adjacent
  samples, which is what made early versions look jagged/angular rather
  than like a flowing wave.
- **Accent color system** — genuinely runtime-switchable, not faked.
- **Saved templates** — captures render + waveform + speaker setup
  (deliberately not script, language, backend defaults, or per-speaker
  Chatterbox voice assignment — worth revisiting whether that scope is
  still right now that narration exists).
- **Key vault** — `electron/keyStore.ts` is the only place API keys are
  read/written, encrypted via Electron's `safeStorage`, graceful
  plaintext fallback (flagged to the user) if no OS keychain exists.

### Explicitly not started yet
- Actually feeding the generated narration audio into a video
  render/export — this needs Remotion touched for the first time (it's
  in `package.json` intentions but no Remotion composition exists yet).
  This is the next real milestone once narration is confirmed working on
  Ak's actual machine.
- Background video/music auto-fetch (Pixabay/Pexels/Jamendo/Freesound) —
  not started.
- Viseme/subtitle alignment against the real narration timing — not
  started, but the per-segment timing data narration already returns is
  specifically there to support this later.
- Bundling/packaging into an installer — deliberately deferred; when it
  happens, Piper should probably move from the Python package to the
  standalone compiled binary specifically to avoid shipping a Python
  runtime at all, which is a live tension with the current architecture,
  not yet resolved.

## 6. Reference materials — all in `inspiration looks/`, never re-uploaded

- Three original + five follow-up AI-generated concept renders
  establishing the (superseded) plastic/metal mood.
- `look just at the waveforms.jpeg` — source of the rings waveform style
  and the still-unbuilt dotted 3D wave-plane idea.
- `Metal_Texture_09.jpg` / `Metal_Texture_11.jpg` — real photo textures
  from Envato Elements, sourced for the plastic/metal direction,
  **currently unused** since the visual pivot to cyberpunk — kept for
  history, not the active look.
- `upload-button-material-study-v2.html`,
  `machined-upload-button-v2.html`, `upload-button-material-study.css` —
  real working CSS studies for the (superseded) acrylic-plastic look.
- Viseme grid references for the speaker avatar lip-sync system — not
  yet directly used in a build step.
- A standalone `cyberpunk-mockup.html` was used to confirm the current
  visual direction live with Ak before porting into real components —
  shared via chat, **not committed to the repo**, so don't look for it
  here; the finalized result is what's actually in the app now.

## 7. Practical environment notes worth remembering

- Ak is on Windows, uses GitHub Desktop for cloning + opening a terminal,
  not comfortable with raw git commands.
- He has at least 3 separate Python environments on his machine from
  unrelated tools (a "hermes-agent" venv, an "SDGUI" venv, plus whatever
  the project's own unused `piper-env` folder is) — always point at a
  full python.exe path in this app's settings, never bare `python`.
- `venv\Scripts\activate.bat` run from PowerShell does not persist
  (PowerShell runs `.bat` as a subprocess) — use plain Command Prompt for
  venv activation, or just reference the venv's `python.exe` by full path
  directly without "activating" anything.
- The repo had no `.gitignore` until this workflow started — `node_modules`
  got accidentally committed once early on (173MB `electron` binary
  exceeded GitHub's 100MB limit and the push was rejected outright). Fixed
  with a proper `.gitignore`; worth being aware every earlier commit in
  the repo's history predates that fix.
- GitHub push tokens are always session-scoped fine-grained PATs, single
  repo, Contents read/write only, short expiry, never stored anywhere
  persistent, scrubbed from git remote URLs immediately after each push.
