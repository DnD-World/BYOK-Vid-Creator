# BYOK-Vid-Creator — Plan & Inventory

> Living document. Supersedes the status sections of `handoff 1–3.md`, which
> went stale once the render landed. Those remain the record of *why* early
> decisions were made.
>
> Audited against the code on 30 Jul 2026 — every "not built" below was checked
> by grep, not remembered. Updated 31 Jul 2026 after the app was driven end to
> end through its real UI for the first time.

---

## The North Star

**One finished 60-second Greek dog video, rendered end to end, good enough to
post on LinkedIn.**

Everything gets judged against that. If it doesn't move that video closer to
existing, it goes in the Cut List — not a backlog.

## Priority order

1. **Stability** — no crashes, clear seams, bundled deps over ambient ones.
2. **Engaging output** — the video has to look good, since we're not using
   generative video.
3. **UI** — CSS/UX only. Explicitly not a 3D engine.

**Visual polish is last.** Usability is not polish and is in scope now.

---

## 1. Built and verified

> "Verified" from here on means it was run and the output looked at — a render
> inspected, a number measured — not that it typechecks.


- **App shell**, amber-cyberpunk system, runtime accent colour, motion toggle.
- **Piper TTS** — dedicated `piper-venv/`, `piper-tts 1.6.0`, voices in
  `piper-voices/` (2 Greek + 1 English). Real Greek synthesis confirmed.
- **Narration** — script → per-speaker voices → one combined WAV + per-segment
  timings. Piper path verified end to end.
- **Audio analysis** — RMS envelope at a fixed 60Hz (`analyzeNarration.ts`),
  independent of render fps so preview and export read identical data.
- **Audio-driven waveform** — a **per-band FFT**: 24 log-spaced bands at 60Hz,
  so bars move independently rather than all scaling with one number. Only the
  active speaker animates. Attached (non-narration) audio also drives it.
  Peak-hold caps and rise/fall asymmetry are baked into the analysis, because
  Remotion renders frames out of order and nothing downstream can hold state.
- **Subtitles** — burned in, active-word glow, per-word timing estimated by
  character weight. Verified in Greek and English.
- **Viseme lip-sync** — sheets copied into the render's public dir, tracks built
  per segment so each speaker rests while the other talks.
- **Remotion render** — script → narration → frames → MP4.
- **Viseme sheet tooling** — `tools/build-viseme-sheet.mjs`, 3 characters built
  and verified pixel-exact (Καίτη, Σερίφης, Τσίκα).
- **Cast | Scene panels**, per-speaker waveforms, frame shapes, presets.
- **Backend Settings** — per-key connectivity tests, help text, signup links.

## 2. First run through the real UI — done, 31 Jul 2026

The app has now produced a video from its own UI: two speakers, viseme sheets,
Piper Greek voices, a pasted Greek script, narration, render. Clicked, not
scripted against the store. What that flushed out:

- **Persisted settings shadowed every new default.** zustand's `persist` merges
  shallowly, so the whole `defaults` object came from localStorage and anything
  added or changed since it was written never arrived. On this machine that
  meant an empty `piperVoicesDir` — leaving "Scan for Voices" disabled forever
  with nothing on screen saying why — and a bare `python3`. Fixed: deep merge
  plus a v1 migration. **Any future field added to `BackendDefaults` needs no
  further ceremony; this was the trap.**
- **Piper synthesis was flaky in a way nothing but a real multi-speaker run
  shows.** Node's global HTTP agent has kept sockets alive by default since v19;
  Piper's server drops idle ones. Alternating two voices leaves each connection
  idle for the length of the other's line, and the reused socket dies:
  `read ECONNRESET`, mid-narration, non-deterministically. Fixed with
  `agent: false` plus one retry.
- **Preview sizing** used 80% of one axis, so a 9:16 preview was 267px wide at
  the 1280px minimum. It now fits the frame to the space actually available
  (334×593 there, 430×764 at full size).
- **Cast and Scene rails collapse** to a labelled spine. Precisely: this buys a
  9:16 preview nothing, because it is height-bound. A 16:9 preview goes
  398×223 → 746×419 with one rail folded, → 1056×594 with both.
- **GLM-5.2 took 274s** against a real key — inside the 5 minute timeout, but a
  button reading "Drafting…" that long is indistinguishable from a hang. It
  counts seconds now.

Verified by clicking: face picker, avatar drag with grid snap, all three
built-in presets, preset save/load/export/import, the legacy template migration
path, and all four backend Test buttons against real APIs (NVIDIA, Pixabay,
Pexels pass; Azure correctly asks for its region first).

**Still never run: Chatterbox.** One-time setup in `docs/CHATTERBOX.md`.

## 3. Partially built — honest status

| Feature | What exists | What's missing |
|---|---|---|
| **AI script assistant** | GLM-5.2 "Draft Script" in the **Narration** tab | Buried below the voice list; users can't find it. Needs surfacing. Timeout raised to 5 min; still unverified against a real key. |
| **Azure Speech** | Key field + connectivity test | **No synthesis code at all.** It cannot speak. Either build it or drop the field. |
| **Chatterbox** | Full integration, test panel, voice modes | Never started; no unified engine manager |
| **Music** | Colour + waveform track | No music *file* can be loaded. The track animates to the narration. |
| **Subtitles** | Full styling, burned in | **No SRT export**, which the README promises |
| **Speaker voices** | Works | UI is **duplicated** — engine/voice appear in both Cast and Narration panels |
| **Narration view** | Works | Still a full-screen view, not folded into the panel system |

## 4. Not started

**Audio**
- Background music loading, and **auto-ducking** under speech
- SFX generation via LocalAI, and an SFX library
- Freesound / Jamendo integration (keys pending approval)
- Local media library folder (the legal answer to Mixkit / Orange Free Sounds)

**Visual**
- Background video from Pixabay / Pexels (keys saved, nothing consumes them)
- Intro / outro cards
- Transition library (`defaultTransition` exists in settings but nothing reads it)
- The dotted 3D wave-plane waveform style

**Workflow**
- **AI setup assistant** ("grill me" → proposes a whole setup). Not built at all.
  Presets are already JSON with import/export, so this needs *no app changes* —
  a skill interviews the user and emits a preset file.
- MCP server exposing project state (for hermes / Claude to drive the app)
- Tone checkboxes in Narration (playful, sassy, casual, formal…)
- Text-polish pass — rewrite raw text with expressive punctuation for TTS
- Unified TTS manager (start/stop/status for Piper + Chatterbox)
- SRT export
- Google Drive export, ElevenLabs (both stubbed "coming soon")

**Ship**
- **Packaging to a Windows `.exe`.** Nothing done. Piper should move to the
  standalone binary so no Python runtime ships — a live tension with the current
  venv approach.

## 5. Technical debt found in audit

- **The project is not saved anywhere.** `useProjectStore` has no `persist`, so
  closing the app loses the cast, the script, the narration and every setting on
  the Scene panel. Presets cover the *look*, deliberately, but they are a manual
  export and they don't carry the script or the narration. Decide whether that
  is the design (presets are the save format, say so in the UI) or a gap.
- **Piper's server re-execs itself under a different Python.** `piper.http_server`
  is a Flask app with the reloader on, so the process that actually binds the
  port is a *grandchild* launched with the system interpreter
  (`Programs\Python\Python312\python.exe`), not the venv the app carefully
  points at. `shutdownAllPiperServers` kills the parent only. Nothing has piled
  up in practice, but the venv isolation the settings comment argues for is not
  actually holding, and ports are fixed (5501+) with no check that whatever
  answers on one is ours.
- **`onBrowserLog` is the only channel the composition has to report a problem.**
  Currently one message uses it (spectrum failed to load). Worth remembering
  that anything going wrong inside a render is otherwise completely silent —
  which is exactly how a render that had quietly stopped using the spectrum
  still looked like a success.

- **Dead settings**, in the store but read by nothing: `defaultTransition`,
  `storageTarget`, `ttsPrimary`, `ttsFallback`, `llmScenePlanner`.
  `bgRelevancy` has a setter and no UI and no consumer. Either wire or delete —
  they currently imply features that don't exist.
- **Duplicate voice UI** between Cast and Narration panels. Two places to set
  the same thing is how they drift.
- **Legacy `WaveformConfig`** is retained only so old templates migrate. Delete
  once no saved templates predate the change.
- **Viseme sheets are 12–15MB PNGs**, decoded per render worker. If long renders
  get slow, shrink the cells or move to JPEG.
- **Word timings are estimated**, not force-aligned. `wordTiming.ts` is the one
  function to replace. Piper 1.6's server exposes real **phoneme alignments** —
  that would give true viseme and word timing for free.
- **README overstates the app**: claims Google Chirp 3 HD, Edge TTS, auto-ducking,
  SRT export, AI background automation with a Relevancy↔Frequency dial, and a
  transition library. None exist. Update it before anyone else reads it.

---

## Next chapter — start here

### 1. Waveforms — done, and what the numbers actually say

The old model spread **one loudness number per frame** across the bars with a
sine shape function, so every bar moved together. Replaced with a per-band FFT
(`electron/audio/fft.ts`, 24 log-spaced bands, 60Hz), `bandAmplitude()` indexing
a band instead of multiplying a shape, peak-hold caps and per-band rise/fall
asymmetry.

Measured off rendered frames rather than asserted (see the notes below on why
that mattered):

| | old | new |
|---|---|---|
| adjacent-bar difference / mean | 0.02–0.07 | 0.16–0.27 |
| shortest:longest bar in one frame | ~1.8 : 1 | ~7 : 1 |
| peak-hold caps drawn | 0 | 13–27 |

Two honest caveats. About half the ring's shape is the voice's own persistent
spectral signature rather than the moment — per-band normalisation removes the
average tilt, but not the difference in peak-to-average ratio between bands.
And bars are **mirrored** around a circular path, so a ring shows 24 bands twice
rather than 48 distinct ones; the alternative is a visible seam where treble
meets bass.

Two traps that cost real time here, both worth remembering:

- **Everything for the public dir must be written before `bundle()` runs.** The
  bundler copies the directory into the served output. Writing `spectrum.bin`
  after it meant a 404, a silent fallback to the loudness envelope, and a render
  that looked exactly like the version this change replaced — with no error
  anywhere. Caught only by measuring bar lengths in the output PNG.
- **`electron-vite dev` does not rebuild the main process without `--watch`.**
  `npm run dev` now passes it. Before that, every edit under `electron/` was
  being tested against a stale main process.

Still on the table now that real band data exists: mirrored fills, gradients,
and the dotted 3D wave-plane style.

### 2. SFX via LocalAI — blocked on a backend

Endpoint confirmed: `POST http://localhost:8080/tts` with
`{"model": "...", "input": "a dog barking twice"}`.

**Neither model loads today:**
- `audio-cpp-stable-audio-sfx` → *"backend not found: audio-cpp"*
- `stable-audio-3-small-SFX` → *"grpc service not ready"* (vllm doesn't run on Windows)

Install the `audio-cpp` backend from LocalAI's gallery first. Nothing to build
until a model actually loads. Then: generate → SFX library folder → browse → place.

### 3. Surface the AI assistant, then extend it

It exists but nobody can find it. Move it somewhere obvious, add the tone
checkboxes and the text-polish pass, then build the preset-writing skill.

---

## Cut list — decided, don't revisit

- **Mixkit / Orange Free Sounds as in-app libraries.** No public API; Orange's
  MP3s are CC BY-NC (non-commercial), which collides with client work, and their
  terms forbid redirecting downloads. Replaced by the local Media Library.
- **Responsive / mobile layout.** Windows desktop `.exe`, locked minimum width.
- **Azure Speech and Edge TTS as roadmap items.** Chatterbox (quality) + Piper
  (fast) cover every real need. Every extra engine multiplies what can break.
- **ElevenLabs, Google Drive** — stubs only, don't build.
- **The AI background "Relevancy ↔ Frequency dial"** — ship keyword search first.
- **Waveform style library is frozen** at six styles. Improve what exists.
- **SSML** — neither Piper nor Chatterbox supports it. Target expressive
  punctuation instead. (Chatterbox Turbo's `[laugh]` tags are worth one test.)

## Parked

**Intro / outro cards.** Three different features under one name:
1. *Title card* — text on the HUD background. ~1 hour, fits any phase.
2. *Image card* — needs the asset in the render bundle (solved pattern now).
3. *Video sting* — hardest: needs `<OffthreadVideo>`, a second audio track, and
   the narration offset by the intro's length or subtitles and lip-sync drift
   for the whole video.

Recommendation: build #1, consider #3 only after the dog video exists.

**Amplitude-driven jaw-flap** for attached audio with no script — would let
lip-sync work on any audio, approximately.
