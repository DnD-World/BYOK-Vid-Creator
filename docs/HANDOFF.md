# Handoff — state, decisions, and what not to revisit

> Rewritten 4 Aug 2026. Read this plus `PLAN.md` and you have everything.
>
> `main` is at "Waveform glitter, and Poiret One for decorative type only".
> One branch is open and unmerged: **`feat/media-fetch`**.

---

## 1. What the app is

A Windows desktop app (Electron) that turns a written script into a narrated,
subtitled, lip-synced short video in Greek and English. Built for Ak's Greek
dog-owner community project, and as a showcase piece for client work.

Priority order: **(1) stability** — no crashes, clear seams, bundle rather than
depend; **(2) engaging output**, to compensate for not using generative video;
**(3) UI**, as CSS only.

## 2. What works end to end

Script → per-speaker TTS → one WAV with turn pauses → 60Hz analysis (envelope,
active speaker, 24-band FFT) → Remotion render → MP4 with burned-in subtitles,
lip-sync, blinking, brows, head lean, and reactive waveforms.

**This whole pipeline has been driven through the real UI and rendered.**

## 3. The avatar system

Characters are **layered puppets**, not sprite sheets. A base body plus
independent layers: eye whites, per-eye pupils, per-eye lids, per-side brows,
nose, one mouth per viseme. Everything is positioned in **head-width units from
the head's centre**.

| Can | Cannot |
|---|---|
| 9 visemes, lip-synced to real audio | Speak without a puppet assigned |
| Blink **while** speaking, any mouth shape | Look up or down (no vertical gaze art) |
| Wink — each eye independent | Turn to a 3/4 view (needs a second drawn pose) |
| Half-lids, 4 brow moods, independently per side | Animate hair, ears or clothing |
| Recolour any layer; **multi-tone bands** (Σερίφης' brows) | Change body pose |
| **Head tilt / shake / droop / laugh-bob**, head moving on its own | Anything needing art that doesn't exist |

### The head really does move independently

The base is one drawing of a whole short body. It is drawn **twice from the same
file**: once keeping everything below the neck, once everything above, and only
the second copy rotates.

The cut is a **horizontal line** at the neck. An ellipse around the head was
tried first and fails on the thing that matters — a head silhouette is not an
ellipse, and it sliced through Καίτη's ponytail and Σερίφης' muzzle. A neck
really is a narrow horizontal band, which is where a paper puppet is cut. The
head's copy continues past the line so the two overlap, and that overlap hides
the join. Per-character geometry is `neck: { y, overlap, feather }` in the spec.

### Files

- `puppet/*.spec.json` — author-facing, hand-tuned
- `puppet/*.puppet.json` — runtime, generated, layer pixel dims stamped in
- `tools/make-puppet.mjs` — spec → runtime, validates
- `tools/render-puppet.mjs` — offline contact sheets; `--contact`, `--one`, `--cells`
- `src/components/canvas/PuppetAvatar.tsx` — the live renderer, used by preview AND render
- `src/lib/motion/facePerformance.ts` — blink, brows, head pose
- `src/store/builtinCast.ts` — the three characters, offered in the Cast panel

**Geometry is specified once, in the puppet JSON.** The offline tool and the
component only apply it. If they ever disagree, that is the bug — and a feature
added to one and not the other (as `tintBands` briefly was) is how that starts.

## 4. The cast

Art lives in `viseme/` — **gitignored, 45MB, and only on Ak's machine.** A fresh
clone gets the characters with no layers; they degrade to a faceless disk.
**Treat this as a backup problem.** The PSD is already gone.

| | Set | Notes |
|---|---|---|
| Καίτη | B (female) | Human presenter. Mouth scale 0.78 |
| Σερίφης | A (dog) + B lids | Schnauzer. Bushy brows: scaleX 1.45, scaleY 2.6, **three tone bands** |
| Τσίκα | B (female) | Chihuahua. Mouth small — ~55px between nose and collar |

Component layers were exported with **"Trim Layers" ON**, so every layer lost
its position. Worked around with one anchor per category. **If art is ever
re-exported, untick Trim Layers.**

## 5. The look — Deco Noir

The app wears the identity system at
**https://github.com/Stravelakis/deco-noir-template** (v1.2.0), vendored into
`src/styles/` rather than installed: this ships as an offline Electron build.

That repo's `AGENTS.md` is the authority on the design rules. The short version:
chamfer on top-left and bottom-right only, dressed with a double brass rule;
bezels are always the theme accent and only the lamp changes colour; status
colour is never the accent; a switch shows exactly one state word.

App-specific notes:
- `.panel-hud` is a **one-element approximation** of the library's three-div
  `.frame` — background is the trim, `::before` the face, `::after` the corner
  rules. Rewriting every panel into three wrappers was not worth the diff.
- The Appearance colour picker drives the whole identity. It writes
  `--accent-rgb` (space-separated channels) **and** `--accent`/`-hi`/`-lo`
  (hex) from the same source in the same effect, so they cannot drift.
- **Poiret One is decorative only** — app name and panel titles. Never a control.

## 6. Decisions — do not revisit

- **Layered puppet, not sprite sheets.** Sheets bake mouth+eyes+brows together.
- **Head-relative anchoring.** It is what made the head separation possible.
- **Layer dimensions stamped into the runtime JSON**, not measured on load.
- **Piper for drafts, Chatterbox for finals.** Per-speaker engine choice.
- **Greek viseme priority is NEUTRAL, AH, EE, OH, L** — not OO (~1% of Greek
  graphemes). `tools/viseme-coverage.mjs` re-derives this for any script.
- **Spectrum travels to renders as a file** in the public dir, not inputProps.
- **Assets for a render must be written BEFORE `bundle()`** — the bundler copies
  the public dir; anything written after silently 404s.
- **Everything on the render path is PURE.** No clock, no `Math.random()`.
  Remotion renders frames out of order across workers.
- **Gestures don't scale with the idle-motion setting** the way ambient sway
  does. At the default 0.5 they were being halved into illegibility.
- **The LLM plans backgrounds; code picks them.** See §8.
- **Presets = the look. Project = everything.** Kept separate deliberately.

## 7. Rejected — do not re-propose

- **Fish Audio / OpenAudio S1** — CC-BY-NC weights, collides with client work
- **LivePortrait** — needs a driving performance on camera
- **JoyVASA** — tested; long ears break, output is "wavy"
- **Cloud avatar APIs** (Hedra, HeyGen, D-ID) — per-render cost, licence problems
- **Combinatorial sprite sheets** — 54+ cells, models drift between them
- **Jamendo, Freesound (unfiltered), Mixkit, Orange Free Sounds** — non-commercial
  licences. Freesound is acceptable **only** filtered to CC0
- **Envato Elements as the pipeline's source** — per-project registration is
  unworkable at hundreds of videos
- **Openverse** — does not verify licence data per work
- **Azure Speech, Edge TTS, ElevenLabs** — every extra engine multiplies breakage
- **Responsive / mobile layout** — Windows desktop, min width 1280
- **SSML** — neither engine supports it
- **Waveform style library frozen at six styles**
- **Auto-fitting a puppet's zoom** — scaling doesn't recentre; it clipped chins
  and threw shoulders out of frame. `zoom` exists, defaults to 1, opt-in

## 8. Where things stand — `feat/media-fetch`

Open branch, not merged. Background video from **Pixabay and Pexels** — both
first-party licences, commercial use, no attribution, **no per-project
registration**, which is the whole reason they were chosen.

**Built:**
- `electron/net/mediaSearch.ts` — search both, normalise, **interleave** results
  (concatenating makes the first screenful one library). Missing key = a note,
  not a failure. Downloads cache by provider+id.
- `electron/llm/backgroundPlanner.ts` — **two stages, deliberately apart.** The
  LLM reads the narration and returns a search query per scene plus one shared
  `look`; ordinary code then searches and picks. The model never sees the
  results — it cannot watch video, so choosing between thumbnails would be
  guessing, while writing "dog looking at chocolate on table" from a Greek line
  is exactly what it is good at. Coordination comes from the shared look
  appended to every query.
- `src/components/panels/BackgroundPanel.tsx` — Scene → Background. Shows each
  scene's query and the model's reason, so a bad pick is diagnosable. Manual
  search maximizes.

**NOT done, and the branch is not shippable without it:**
1. **Nothing renders the clips.** The composition ignores `backgrounds`
   entirely. `@remotion/transitions` is installed and unused.
2. **Never verified against live APIs.** Keys live in Electron `safeStorage`, so
   this needs the running app. The Pixabay video thumbnail field is the known
   uncertainty — it reads the API's value first and falls back to a CDN path.
3. **No asset ledger.** Deferred by Ak. Author and page URL are already captured
   on every hit, so the data exists when it is wanted.

## 9. Next, in order

1. **Render the backgrounds** — feed `backgrounds` into the composition behind
   the waveform, with `@remotion/transitions` between clips. This is what makes
   the branch worth merging.
2. **Verify Pixabay/Pexels/NVIDIA live**, in the app.
3. **Music and SFX from Pixabay** — same key, same licence, one fetcher. This
   also wakes up the music waveform, which exists and has nothing to animate to.
4. **Freesound, CC0-filtered** (`filter=license:"Creative Commons 0"`) for dog
   barks, whines, whistles, clickers.
5. Fonts for subtitles (Google Fonts, Greek subset, download-and-cache).
6. Packaging. `puppet/` must be in the build's `files` or the built-in cast
   resolves to nothing.

## 10. Gotchas learned the hard way

- **A measurement that barely responds to a large input is measuring the wrong
  thing.** Pupil offsets looked immobile because lashes are as dark as pupils.
- **Guard on the thing you act on.** A "% of pixels changed" threshold passed
  two different images at 8%, whose bounding box was 91% of the frame.
- **Sample the art before choosing a colour.** Σερίφης' brow bands were picked
  around the tint they replaced; his forehead samples `#908981`, so the lightest
  band vanished into his coat and the rest read as a bar across his head.
- **`@import` must precede every other CSS statement**, including `@tailwind`.
- **`.cut-sm` carries its own clip-path.** Setting only `--c` renders a plain
  rectangle — the commonest way to think the look is applied when it is not.
- **`electron-vite dev` needs `--watch`** or main is never rebuilt.
- **zustand `persist` merges shallowly.** Both persisted stores deep-merge now.
- **Node's global HTTP agent keeps sockets alive since v19**; Piper drops idle
  ones → `ECONNRESET`. Fixed with `agent: false` + one retry.
- **Downscaling must be alpha-premultiplied**, or every antialiased edge gets a
  dark fringe at ~10x reductions.
- **The app cannot be driven outside Electron.** `window.byok` is absent, so a
  browser-served build renders but breaks on any IPC. Screenshots of the built
  renderer are fine; interaction is not.

## 11. Environment

- Windows 11. Ak uses GitHub Desktop, not raw git.
- **At least three unrelated Python environments** on the machine. Always point
  at a full `python.exe` path, never bare `python`. Piper currently resolves
  into a shared `hermes-agent` venv, which is a live fragility: anything that
  upgrades that venv breaks narration here. `piper-venv/` exists for exactly
  this isolation and is unused.
- Chatterbox is a separate cloned repo (`devnen/Chatterbox-TTS-Server`) that
  Electron auto-starts. Not vendored, not pinned.
- Renders need ~150MB of headless Chromium on first run, into Remotion's cache.
