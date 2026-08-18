# Handoff — 18 Aug 2026

Everything a fresh session needs. `PLAN.md` holds the long history; this is the
working state.

---

## What this project is

Two LMS courses of lesson videos, Greek, 3–8 minutes each. Dog training first
(**23 lessons → 72 sub-lesson videos**, plus 18 handouts that are not video),
professional soft skills second. Same material also cut for social, so a project
must come out in more than one orientation.

Three characters: **Καίτη** (human), **Σερίφης** (serious dog), **Τσίκα**
(chihuahua). Voice briefs in `docs/CHARACTER-VOICES.md`.

---

## The pipeline, end to end

Script → narration → background clips → render → MP4. All of it works.

```bash
npm run job -- jobs/smoke.json          # 27s, no backgrounds, ~30 seconds
npm run job -- jobs/glass-test.json     # with stock footage
npm run job -- jobs/ribbon-test.json    # one waveform style, judged alone
```

A job can set `waveformStyle` and `outlineShape` for the whole cast, and both
**throw on an unknown name**. Comparing looks used to mean editing a preset in
source, which is how four "different" renders came out identical.

`electron/batch/runJob.ts` is the headless runner. It calls the same functions
the UI calls, in the same order — if a headless render and a clicked render ever
disagree, that is a bug, not a variant.

### Measured, not estimated

| | |
|---|---|
| 8m50s render, end to end | **21 min** (narration 3.1, planning 1.5, clips 1.2, render 14.5) |
| Production cost | ~2.5× the finished video's runtime |
| Whole dog course (~3.6 h of video) | **~8.6 h of rendering**, ~1 h of narration |
| CRF 23 | 668 MB → about a sixth |

**Rendering is the bottleneck by a factor of ten.** Narration is the cheap part.

---

## Voices — DramaBox

**Decided and proven.** Chatterbox was tried, rejected, and removed from the
code on 18 Aug 2026 — two engines, not three.

- Open weights, Resemble AI. **Prompt-driven**: stage directions control the
  acting and never appear in the audio.
- **Will not run locally** — ~24 GB VRAM against an 8 GB laptop 3070.
- Runs on a **GCP L4** (24 GB, the cheapest card that clears it).
  Measured: **8.5 s per generation**, ~3.4× slower than the documented H100.
- **Greek is not a documented language** — the official docs say English only —
  **and it works.** Auditioned by ear, then used for the whole of lesson 101.1.
  Piper remains the fallback: correct and flat.
- **Noises must be spelled the English way.** `Χαχαχα` produced no laugh at all
  in a finished lesson; `Hahaha` does. The subtitle shows the Greek.

### The instance

`dramabox-smoke`, `us-east1-c`, `g2-standard-8`. **Currently TERMINATED.**
us-central1 was stocked out in all three zones; L4 capacity fluctuates.

```bash
gcloud compute instances list --project=tier-1-ak      # TERMINATED = not billing
powershell -ExecutionPolicy Bypass -File tools/gpu-light.ps1   # red/green widget
```

**Ak's standing rule: turn it off as the last step of the work, every time.**
Set `sudo shutdown -h +N` on the box before anything long, so it dies even if the
session ends.

Setup is `tools/dramabox-vm-setup.sh`; the Greek test is
`tools/dramabox-greek-test.py`. **The repo's own README example cannot work** —
it falls back to filenames from Resemble's machine. The real mapping:

```
checkpoint      → dramabox-dit-v1.safetensors
full_checkpoint → dramabox-audio-components.safetensors
gemma_root      → unsloth/gemma-3-12b-it-bnb-4bit, read from $GEMMA_DIR
```

### The clips exist — unblocked 17 Aug 2026

`voice-refs/` holds `kaiti.wav`, `serifis.wav`, `tsika.wav` and a fourth,
`kaiti-babytalk.wav`, for the voice she uses on Τσίκα. Spec in
`docs/HANDOFF-VOICE-CLIPS.md`. Rule: **record the voice, not the mood** — timbre
comes from the clip, acting from the prompt.

Lesson 101.1 was narrated with them end to end: 24 blocks generated, forced
aligned, word times remapped through the silence cuts, rendered.

### Every knob is reachable — 18 Aug 2026

The engine's settings used to be literals inside `tools/dramabox-render-blocks.py`,
which meant one setting for the whole cast. They are now **per character and per
block**:

| Where | How |
|---|---|
| `src/lib/narration/dramaboxParams.ts` | The one list. The Cast panel builds its controls from it, so a knob added here appears in the app. |
| Cast panel → "DramaBox — this voice" | Thirteen controls, plus the reference clip and opening phrase. |
| `[VOICE: acting=2.4 pace=0.9]` in a script | That block only. Beats the character's setting. |
| Narration panel → "Write DramaBox files…" | Writes `blocks.json` and `align.json` from the current project. |
| `tools/make-blocks.mjs job.json` | The same, from a job file. Shares `buildBlocks.ts` with the button. |

**Watermark is OFF** (18 Aug 2026). Resemble Perth is inaudible and carries no
custom payload — it cannot say the audio is ours, so it has nothing to do for us.

**Said in English, shown in Greek.** Laughs only fire from English spellings
(`Hahaha`), so the script carries those and the subtitle shows «Χαχαχα».
`src/lib/narration/displayText.ts`; the aligner is given the spoken form.

**The app may add expression a script was written without** — a flat "speaks"
lifted, a promised laugh spelled so it is actually heard. Off unless asked for,
and every change is printed before anything is generated.

---

## Waveforms — done this session

All six chosen from `tools/waveform-lab.html` now render, and all six are in
the picker:

| Style | What it is |
|---|---|
| `boil` | Bubbles swelling where they start, gradient per slice |
| `particles` | Bars plus a corona thrown on consonants |
| `sparks` | No bars, scattered embers, random headings |
| `bloomBars` | Bar ring with a glow that scales with the moment |
| `ribbon` | Wide two-sided band, a colour per face, twisting on the boil |

`WAVEFORM_STYLES` in `src/store/types.ts` is the one list — the union, the
picker and the headless runner all read it. Four styles rendered correctly for
a week and none appeared in the picker, because the union was extended and
`WaveformControls` was not.

The ribbon's twist is its **width**: the offset from the spine is the signed
cosine of the twist phase, so at a pinch it crosses zero, the edges swap sides
and the visible face flips. Use the absolute value and you get a waist, not a
turn. Its width does not follow the superellipse even though its spine does — a
ribbon's width belongs to the ribbon, not to where it happens to be.

**All shape-aware.** `src/lib/waveform/superellipse.ts` gives circle, rounded
square and square from one exponent, taken from the speaker's `outlineShape`.

**The rule that shapes all of it:** Remotion renders frames out of order and in
parallel, so nothing may accumulate. Every particle is computed from its birth
time (`src/lib/waveform/emitters.ts`). Randomness is a hash of the particle's
index, never `Math.random()`.

Two things learned the hard way: `moment` is the whole mix and the same object
for every track, so `active` is the only thing that knows whose turn it is — and
it must gate the **swell**, not just the colour. And SVG arcs are circles by
definition, so a superellipse drawn with arcs stays round.

---

## Open, in the order I would take them

1. **Audition the voice settings by ear.** The presets — "Bigger performance",
   "Fast and bright" — are plausible numbers nobody has listened to. One GPU
   session settles all three characters. **Ak only; I cannot judge audio.**
2. **Re-run four blocks of lesson 101.1.** Blocks 000, 003, 008 and 022 still
   say `Ουφ`, `Χεχε`, `Χαχαχα` and `Μμμμ` in Greek letters, which make no sound.
   The script is fixed; the audio is one revision behind it.
3. **Batch spreadsheet** — CSV → queue on the existing runner. One row per
   lesson; a row carries a finished script, a topic, or a URL.
4. **Render a series in one process.** 72 short videos pay bundle+browser startup
   72 times — about 50 minutes of pure setup.
5. **The GPU round trip is still by hand** — files up, run the script, WAVs
   back, run the aligner. The app writes the files now; nothing drives the box.
6. Narration-cache eviction; preview has no audio at all.

**Done 18 Aug 2026:** every engine knob reachable per character and per block;
the app writes `blocks.json` and `align.json` itself; English spellings shown as
Greek in subtitles; Chatterbox removed; and the render now names any setting it
was given but could not apply.

**Done before that:** the blink is a crossfade (it was a three-state step
function inside 3½ frames, which is what "a bit choppy" was); the `ribbon`
style; the four lab styles that had no way to be selected; generation per
speaker turn rather than per line; and forced alignment for word-level timing.

---

## Traps that have each cost a day

**Antivirus HTTPS scanning.** Avast re-signs every response with its own root,
which only Windows and Chromium trust. Python, gcloud and every engine fail with
`CERTIFICATE_VERIFY_FAILED`. Fix: `tools/windows-ca-bundle.pem` via
`SSL_CERT_FILE` / `REQUESTS_CA_BUNDLE`, already applied in
`electron/net/childEnv.ts` and in gcloud's config. **Any provider-specific
network failure on this machine should be checked against this first.**

**Same-ish name, different quantity.** GlassSurface's `backgroundOpacity: 0.1` is
an alpha; it was read into a `frost` field that is a blur as a fraction of frame
width — a **108 pixel blur** that hid every other effect for several rounds.

**Judge an effect in isolation.** The glass was judged over a frame of the
finished video (discs on discs) and over footage a preset had already blurred.
Both wasted more time than any bug. `tools/glass-lab.py` and
`tools/waveform-lab.html` exist for this — seconds per iteration, not 20 minutes.

**Silent success.** The spectrum 404, `backgroundBlur`, subtitle surfaces,
transitions — four times a render has reported success while quietly leaving
something out. `onBrowserLog` carries exactly one message today.

**A regex that matches nothing fails silently.** Four "different" waveform styles
were rendered and all four were bars.

---

## Glass — called as a failure

**Avatar disc works** (a magnifier: the scene redrawn larger and clipped).
**Caption pill failed** and is turned off. Full account in `docs/GLASS.md`.
Do not reopen without reading it; the next move is either giving the caption the
disc's magnifier or bringing in WebGL `FluidGlass`.

---

## How Ak wants to be worked with

In `CLAUDE.md`, and worth reading before the first reply:

- **Answer in the first line or two.** Everything else in skippable sections.
- **Cut filler.** No preamble, no summarising what you just did.
- **Plain language.** Define any unavoidable term in the same sentence.
- **Prepare, then ask.** Bring a recommendation, not a menu.
- **Never overclaim.** Saying something works when the picture shows otherwise is
  the one thing he has called unacceptable. If you cannot judge it — audio,
  subtle motion — say so and hand it over.
- Everything stays inside this folder. Never kill a process by name; other agents
  own `python.exe` and `node.exe` on this machine.
