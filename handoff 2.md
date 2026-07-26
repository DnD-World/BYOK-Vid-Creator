# BYOK-Vid-Creator — Handoff 2

Written to preserve full context if this conversation ends or a new session
picks up the work. Supersedes nothing in `handoff 1.md` — read that first for
original planning history — this covers everything since.

## Where things stand

Phase 1g (app shell, canvas preview, waveform renderer, saved templates) is
complete. Phase 2 (TTS) is well underway: Piper's pipeline architecture is
built and confirmed working on Ak's actual machine (see "Piper setup"
below), and the real quality/cloning engine — **Chatterbox Multilingual
v3**, not XTTS-v2 — is now implemented too (see "TTS engine switch:
XTTS-v2 → Chatterbox Multilingual v3" below for why).

**The visual direction pivoted and is now finalized and implemented.** The
original thick-clear-plastic/industrial-matte-metal direction (see the old
"Immediate next step" content, now superseded, kept further down for
history) proved too hard to nail well with the tools at hand. Ak explicitly
decided to switch rather than keep fighting it: **amber sci-fi cyberpunk**
— angular clip-path corners, thin glowing lines instead of thick material
mass, corner-bracket HUD details, a scanline overlay. This is genuinely
easier to build well than the plastic direction (CSS is naturally good at
glow/transparency/angular cuts; faking photoreal material depth is not).
The full component system for this is built — see "Visual system"
below — and confirmed by Ak via an iterative HTML mockup before being
ported into the real app (two rounds: the toggle went through a rocker-
switch attempt that didn't land, then a two-position slide-switch that
did).

Repo uses a real git workflow now — Ak provides a session-scoped fine-grained
GitHub PAT (Contents: read/write, single repo, short expiry) when he wants
direct pushes; nothing is ever persisted. If no token is available, fall
back to giving Ak full files to paste via the GitHub web editor.

## Architecture decisions made

- **Store**: single flat `useProjectStore.ts` (Zustand) is the one source of
  truth for project state (render settings, fps, waveform config, speakers).
  A previous "sliced store" scaffold (`store/index.ts` + `store/slices/`)
  was dead code — referenced files that didn't exist — and was deleted.
- **Keys vault**: `electron/keyStore.ts` is the *only* place API keys are
  read/written — encrypted via Electron's `safeStorage`, with a graceful
  plaintext fallback (flagged to the user) if no OS keychain is available.
  Renderer never persists raw keys; `useSettingsStore` holds only non-secret
  backend defaults (TTS engine choice, Azure region, Piper paths, accent
  color, etc.), persisted to localStorage.
- **Piper TTS**: uses the `piper-tts` Python package's persistent HTTP
  server (`python -m piper.http_server -m <model.onnx> --port <port>`), NOT
  the one-shot standalone binary. `electron/tts/piperEngine.ts` spawns one
  server process per voice model (lazily, kept warm), health-checks it, and
  proxies synthesis requests over localhost HTTP. Assumes the documented
  `GET /?text=...` contract (confirmed correct — see Piper setup below).
  Voice discovery scans a folder for `.onnx` files
  (`tts:listPiperVoices`), surfaced via a non-persisted `useVoicesStore` so
  both the Backend Settings test panel and the per-speaker voice picker
  share one scanned list.
- **Accent color**: fully runtime-switchable via CSS custom properties
  (`--accent-rgb`, `--accent-bright-rgb`, `--accent-deep-rgb` on `:root`),
  derived from one picked hex via HSL math
  (`src/lib/color/deriveShades.ts`). Tailwind's `accent-*` color reads
  `rgb(var(--accent-rgb) / <alpha-value>)` so opacity modifiers still work.
  Picker lives in Backend Settings → Appearance. Default is amber
  `#e8a24a`. All ~19 previously-hardcoded `amber-*` Tailwind classes across
  4 files were converted to `accent-*`.
- **Waveform**: `WaveformConfig` now has `style` (bars/lines/wave/mirror/
  dots/rings), `position` (circular/top/bottom/left/right), `behavior`
  (single/single-colorshift/dual/dual-plus-music/triple), plus `scale`
  (size), `density` (sample count), `dotSize`, `edgeFlush` (toggle, not
  free-drag — that's all that was actually needed), and ring-specific
  `ringInnerRadius`/`ringSize`/`ringX`/`ringY`. Amplitude data is
  deterministic fake sine data (`src/lib/waveform/fakeAmplitude.ts`) until
  Phase 2's real audio pipeline exists — clearly marked as placeholder in
  code. Multi-track lane separation is proportional to frame size, not a
  fixed px nudge (fixed a real bug where dual/triple modes visually merged).
- **New reusable UI primitives**: `src/components/ui/Toggle.tsx` and
  `Slider.tsx` — stated preference is toggles first, sliders second, knobs
  third, before plain buttons, for any new control going forward. A metal
  **Knob** component has not been built yet.

## Visual system — amber cyberpunk (finalized, implemented)

Fonts: **Rajdhani** (display/headings) + **Share Tech Mono** (labels/mono
text) via Google Fonts — loaded in `index.html`. Note: Rajdhani was
referenced in `tailwind.config.js` since early on but the actual font link
was never added, so it silently fell back to system-ui the whole time
until this pass fixed it.

Base font size is explicitly set to 16px on `body`, and every previously-
small text size (`text-xs`, `text-[10px]`, `text-[11px]`) across the app
was bumped to `text-sm`/`text-base` — **Ak has a standing preference for
larger, more readable text throughout this app's UI. Do not introduce
small text sizes going forward.**

Key CSS classes (all in `src/index.css`):
- `.scanlines` — fixed, full-viewport repeating-gradient overlay, applied
  once at the app root in `App.tsx`.
- `.panel-hud` — the angular replacement for the old rounded `.panel-metal`.
  Corners cut via `clip-path` (controlled by the `--cut` CSS var, currently
  14px), amber-tinted border, diagonal gradient overlay via `::before`.
- `.hud-corner.tl` / `.hud-corner.br` — corner-bracket accents, dropped as
  two child `<span>`s (see the `HudCorners` helper component in `App.tsx`)
  inside any `.panel-hud`.
- `.hud-btn` / `.hud-btn-active` — angular button, used by `HudButton.tsx`
  (renamed from `PlasticButton.tsx` — the old name would mislead now).
- `.hud-slider` — targets a **real native `<input type="range">`**'s
  `::-webkit-slider-thumb`/`::-moz-range-thumb` and
  `::-webkit-slider-runnable-track`/`::-moz-range-track` to get the oval
  fader-cap look, deliberately keeping native drag/keyboard behavior
  instead of reimplementing pointer tracking in JS. Used by `Slider.tsx`.
- `Toggle.tsx` — hand-built two-position slide switch (not a CSS class,
  inline-styled since it needs per-instance on/off state) using the same
  oval-cap visual language as the slider, snapping between two end
  positions rather than moving freely. This replaced an earlier tilting-
  rocker-switch attempt that didn't read well in the mockup round.
- All of the above read color from the existing `--accent-*-rgb` CSS
  variables, so the Appearance color picker still recolors everything live
  — the pivot didn't touch that system, just the shapes built on top of it.

Still not built: a metal rotary **Knob** component. Control-type
preference remains toggles first, sliders second, knobs third, buttons
last, for anything new.

A standalone HTML mockup (`cyberpunk-mockup.html`, iterated live with Ak
before porting into real components) was used to confirm this direction
cheaply — it was shared via chat, not committed to the repo, so it won't
be found here if searched for; the finalized result is what's actually in
the app now.

## Piper setup — confirmed working configuration

Ak is on Windows. Working Python executable path (do NOT use bare `python`
in the app's config field — his machine has 3+ separate Python
environments from unrelated tools and bare `python` resolves inconsistently):

```
C:\Users\strav\AppData\Local\hermes\hermes-agent\venv\Scripts\python.exe
```

That environment has `piper-tts[http]` (includes Flask) installed and
confirmed working via `python -m piper.http_server --help`. A dedicated
`piper-env` venv was created in the repo folder but activation via
`piper-env\Scripts\activate.bat` from PowerShell does NOT persist (PowerShell
runs `.bat` as a subprocess) — if revisiting environment isolation, do it
from plain Command Prompt instead, or use the venv's python.exe by full path
directly without "activating" anything.

Ak has 3 Greek voices + all English UK/US Piper voices installed already.
Voice cloning is a Chatterbox Multilingual v3 capability now (was
originally scoped as XTTS-v2 — see the TTS engine switch section above),
not something Piper can do.

## TTS engine switch: XTTS-v2 → Chatterbox Multilingual v3

The original plan (locked in `handoff 1.md`) was Coqui XTTS-v2. Before
writing any integration code, two blocking problems were found and
verified via web search, not assumed from training data:

1. **XTTS-v2 has never supported Greek.** Its fixed 17-language list
   (English, Spanish, French, German, Italian, Portuguese, Polish,
   Turkish, Russian, Dutch, Czech, Arabic, Chinese, Japanese, Hungarian,
   Korean, Hindi) does not include Greek — one of this app's two core
   languages. This alone made it a non-starter regardless of anything
   else.
2. **XTTS-v2's license (CPML) requires a paid commercial license for
   revenue-generating use.** Conflicts directly with Ak's stated plan to
   showcase/sell this as a client solution.

**Replacement: Chatterbox Multilingual v3** (Resemble AI). MIT licensed
(no commercial restriction), confirmed Greek support (23-language list
includes Greek explicitly), zero-shot voice cloning from ~5s of reference
audio, benchmarked by Resemble AI as preferred over ElevenLabs in 63.75%
of blind A/B comparisons (a vendor claim, but a specific checkable number).
0.5B parameters (smaller/lighter than XTTS), runs on NVIDIA/AMD/CPU. Ak
has an RTX 3070 8GB laptop GPU — solid for this, not a CPU-crawl scenario.

**Serving it:** rather than building a persistent-server sidecar from
scratch (like Piper needed), this uses an existing, actively maintained,
MIT-licensed self-host wrapper: **devnen/Chatterbox-TTS-Server**
(FastAPI, OpenAI-compatible API, Web UI, voice management, hot-swappable
Original/Multilingual/Turbo engines). Default port **8004**.

**Architecture decision — confirmed with Ak, not assumed:** unlike the
natural inclination (run Chatterbox as its own standalone background app,
like Ollama or similar local-AI tools), **Ak explicitly chose to have
Electron auto-start and manage this server's lifecycle** rather than
running it standalone. `electron/tts/chatterboxEngine.ts` owns this:
spawns `server.py` from the configured install folder, health-checks
`/api/model-info` with a generous timeout (model load, including first-run
multi-GB download, can genuinely take minutes — Piper's tight timeout
would be wrong here), and on app quit calls `POST /api/unload` to release
GPU memory cleanly *before* killing the process (via a `will-quit` handler
that pauses Electron's quit sequence to await this).

**One-time manual setup still required on Ak's machine** before this can
work (same shape as the Piper/Python-environment lesson): clone
`devnen/Chatterbox-TTS-Server`, run `start.bat` once (**Portable Mode
recommended** — it embeds its own Python 3.10 runtime, sidestepping the
exact multi-environment confusion that caused the Piper Flask/hermes-agent
mixup), then in the server's own Web UI select "Chatterbox Multilingual"
once from the engine dropdown so `config.yaml` saves that as the active
model (`model.repo_id: chatterbox-multilingual`). After that one-time
step, `BYOK-Vid-Creator` just needs the install folder path (Backend
Settings → Chatterbox Multilingual panel) and starts the server itself
from then on.

**API shape used:** `POST /tts` with `{ text, language, voice_mode:
"predefined"|"clone", predefined_voice_id, reference_audio_filename,
seed, output_format: "wav", split_text: true }`. Voice/reference file
listing via `GET /get_predefined_voices` and `GET /get_reference_files`
(response shapes normalized defensively in `chatterboxEngine.ts` since
it's a third-party API).

**Shared code note:** WAV duration parsing was pulled out of
`piperEngine.ts` into `electron/tts/wavUtils.ts` so both engines use one
implementation — Piper was updated to use it too, not just Chatterbox.

**Not yet done:** actually feeding real script text through this to
produce output, wiring the 2 assigned speaker voices together into one
combined file, and updating `BackendDefaults.ttsPrimary` usage anywhere
else that might still assume the old `"coqui-xtts-v2"` value (it's now
typed as `"chatterbox-multilingual" | "azure"` — check for stale
references if anything else touches this type).

## Reference materials — all in `inspiration looks/`

These were re-uploaded once already after being lost between sessions —
they now live in the repo itself specifically so that never has to happen
again. Read them directly from this folder; don't ask Ak to re-upload.

**Mood/concept renders** (AI-generated, establish the target vibe, not
literal specs):
- `Brutalist_Precision_desktop_UI_202607201947.jpeg`,
  `Brutalist_desktop_app_interface_202607201947.jpeg`,
  `Monolithic_Brutalist_application_UI_202607201947.jpeg` — original 3
  concept renders: dark charcoal monolithic panel slabs, amber glow,
  chunky sliders/knobs, curved-monitor framing device (ignore the monitor
  framing, that's just presentation).
- `Brutalist_Precision_desktop_UI_202607231130.jpeg`,
  `Brutalist_Precision_desktop_UI_202607231132.jpeg`,
  `Brutalist_desktop_app_interface_202607231128.jpeg`,
  `Brutalist_desktop_app_interface_202607231129.jpeg`,
  `Monolithic_Brutalist_application_UI_202607231134.jpeg` — second batch of
  the same concept family, same direction.
- `look just at the waveforms.jpeg` — the important one for the waveform
  renderer. Shows a "PROJECT: SYNAPSE" panel with (a) three overlapping
  tilted glowing orbital rings, amber + one blue, on a glass slab — this is
  what the "rings" waveform style targets ("chaotic planet rings", already
  attempted, may need another pass), and (b) a dotted wireframe 3D
  terrain/mesh "audio topography" visualization — a nice-to-have, not yet
  built.
- `Thanos_viseme_grid_animation_202607202009.jpeg`,
  `Viseme_grid_for_Sloane_202607202009.jpeg` — viseme sprite-sheet
  reference for the speaker avatar lip-sync system (not yet directly used
  in a build step).

**Exact-target component references** (specific, buildable-against, not
just mood) — **NOTE: these describe the thick-clear-plastic/industrial-
matte-metal direction, which was superseded by the amber cyberpunk pivot.
Kept for history/provenance, not the active target.**:
- `Metal_Texture_09.jpg`, `Metal_Texture_11.jpg` — real seamless-ish dark
  grunge/brushed-metal photo textures from Envato Elements, meant to be
  used as actual background-image assets (not CSS-gradient approximations)
  for panel surfaces. 09 is near-black and very subtle/low-contrast, 11 is
  a lighter gunmetal grey with more visible patina/streaking and a bright
  patch top-left — likely better for a "hero" lit panel area.
- `upload-button-material-study-v2.html`,
  `machined-upload-button-v2.html`, `upload-button-material-study.css` —
  **working, real, pure-CSS/HTML mockups** (no exotic tech, no PNG
  fallback needed) of the exact thick-clear-acrylic backlit button look Ak
  wants: layered gradients, `backdrop-filter: blur()`, inset shadows,
  gradient-border mask trick for the acrylic edge highlight, SVG
  `feTurbulence` for a subtle noise/grain texture, radial highlight
  overlays, amber text-shadow glow. This is directly portable into a real
  React component — confirmed feasible, not a "cheat"/image-fallback
  situation. **This was mid-integration when this handoff was written —
  see "Immediate next step" below.**
- The five images shared inline earlier in chat (not files, so not in this
  folder — described here instead so nothing is lost): (1) a "PIXO" panel
  with 2 rotary knobs (dark pitted metal, thin amber indicator line) above
  2 vertical fader sliders (amber glow fill) above a VU-meter grille with
  screws; (2) an "OPTIONS" toggle switch — thick clear/frosted plastic
  capsule housing, black ribbed toggle knob sliding along an amber glow
  track; (3) a dropdown/list menu inside a thick beveled clear plastic
  slab, amber-highlighted selected row, up/down triangle carets, thick
  scrollbar track; (4) a "VOLUME" slider — dark matte embossed panel,
  recessed track with amber glow fill up to a frosted glassy knob; (5)
  three "UPLOAD" button variants — dark thick beveled plastic keys with
  amber backlit text, one showing a subtle glass-reflection duplicate of
  the text below it.

**Feedback on corners/shape — resolved.** Ak wanted sharper, more
strictly-angled corners than the original rounded CSS (12–14px
border-radius). This is what the amber-cyberpunk pivot's `clip-path`
angular-cut approach directly delivers — implemented, not just noted.

## Stated priorities (in order)

1. **Stability** — no crashes, modularity, clear interconnections between
   parts, futureproofed by bundling dependencies where possible rather
   than depending on things that update/collide. (Flagged tension: Piper
   currently depends on Ak's manually-installed Python + pip package,
   which is exactly this kind of risk — acceptable for now/testing, but
   the standalone compiled Piper binary is the better long-term choice
   before any real packaging happens.)
2. **Engaging/wow-factor video output** to compensate for not using
   generative video (Veo/Sora) — the waveform work matters a lot here.
3. **UI** — as CSS/UI styling only, explicitly not a 3D game/engine.
   Direction is amber sci-fi cyberpunk (see "Visual system" above), nothing
   generic. Larger, readable text throughout — no small font sizes.
4. Control-type preference for anything new: **toggles first, sliders
   second, knobs third, buttons last.**

Ak is evaluating a 1-year subscription purchase contingent on this project
turning out stable, functional, and good-looking, and plans to showcase it
on LinkedIn as a custom-solution example for clients. He's explicitly fine
with delays in exchange for quality — don't rush the visual pass just to
show progress.

## Immediate next step (superseded — kept for history)

*The section below described porting the thick-clear-plastic material
study into a real component. That whole direction was abandoned in favor
of the amber cyberpunk pivot — see "Visual system" above for what actually
got built instead. Original text kept here only so the reasoning trail
isn't lost:*

> Port `upload-button-material-study-v2.html`'s CSS technique into a real
> `AcrylicButton` (or similar) React component, apply the real metal
> texture photos as backgrounds, sharpen corners, build a metal knob.

## Other open items (not urgent, just tracked)

- A metal rotary **Knob** component, in the amber-cyberpunk visual
  language — not built yet.

- "Saved templates" feature exists (render + waveform + speakers), but
  doesn't yet cover backend defaults, script, language, or per-speaker
  Chatterbox voice assignment. Worth revisiting what "a template" should
  mean now that narration exists — right now it's still scoped to visual
  "look" only, deliberately.
- Dotted 3D wave-plane waveform style — nice-to-have, not started.
- **Chatterbox Multilingual v3** — implemented (see dedicated section
  above), but not yet tested on Ak's actual machine. The one-time manual
  server setup + Greek synthesis + voice cloning all still need real-world
  verification, same checkpoint pattern as Piper. Ak explicitly accepted
  this risk ("we have confidence it will work") and asked to keep building
  rather than pause for that verification first — flagged, not silently
  assumed.
- GLM-5.2 scene-chunking via NVIDIA — Ak has a key ready to add in Backend
  Settings; the actual API call isn't wired up yet.
- **Narration generation — built.** New third view (Canvas / Narration /
  Backend Settings toggle in the header). `NarrationPanel.tsx`: per-speaker
  Chatterbox voice assignment (predefined or clone, reusing the shared
  `useChatterboxVoicesStore`), a simple "Label: text" per-line script
  format (`src/lib/narration/parseScript.ts`, case-insensitive label
  matching, unmatched lines surfaced as warnings rather than silently
  dropped or thrown), and a "Generate Narration" action that resolves each
  line to its speaker's assigned voice, synthesizes each segment via
  Chatterbox, and concatenates them into ONE combined WAV
  (`electron/audio/concatWav.ts` — requires matching sample rate/channels/
  bit depth across segments, which holds for consecutive same-engine
  calls). Per-segment start/end timing within the combined file is
  returned and displayed — this is deliberately preserved now because
  Phase 3 (viseme/subtitle alignment) will need it against the combined
  track, not per-segment files.
  - `SpeakerConfig` gained `chatterboxVoiceMode` / `chatterboxVoiceRef`
    (separate from the existing Piper `voiceId` — the two engines address
    voices completely differently, so these coexist rather than one
    replacing the other).
  - `ProjectState` gained `script` and `language` (project-level, not
    per-speaker — one narration language at a time).
  - **Not yet tested on Ak's machine** — same unverified status as the
    Chatterbox engine it depends on.
  - Still not done: this produces a standalone narration audio file, but
    it isn't fed into the actual video render/export pipeline yet (Phase
    6 territory) — that wiring is the next real milestone once narration
    itself is confirmed working end-to-end.
