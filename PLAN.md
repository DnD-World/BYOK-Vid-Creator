# BYOK-Vid-Creator — Plan & Inventory

> Living document. Supersedes the status sections of `handoff 1–3.md`, which
> went stale once the render landed. Those remain the record of *why* early
> decisions were made.
>
> Audited against the code on 30 Jul 2026 — every "not built" below was checked
> by grep, not remembered.

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

- **App shell**, amber-cyberpunk system, runtime accent colour, motion toggle.
- **Piper TTS** — dedicated `piper-venv/`, `piper-tts 1.6.0`, voices in
  `piper-voices/` (2 Greek + 1 English). Real Greek synthesis confirmed.
- **Narration** — script → per-speaker voices → one combined WAV + per-segment
  timings. Piper path verified end to end.
- **Audio analysis** — RMS envelope at a fixed 60Hz (`analyzeNarration.ts`),
  independent of render fps so preview and export read identical data.
- **Audio-driven waveform** — real loudness, and only the active speaker
  animates. Attached (non-narration) audio also drives it.
- **Subtitles** — burned in, active-word glow, per-word timing estimated by
  character weight. Verified in Greek and English.
- **Viseme lip-sync** — sheets copied into the render's public dir, tracks built
  per segment so each speaker rests while the other talks.
- **Remotion render** — script → narration → frames → MP4.
- **Viseme sheet tooling** — `tools/build-viseme-sheet.mjs`, 3 characters built
  and verified pixel-exact (Καίτη, Σερίφης, Τσίκα).
- **Cast | Scene panels**, per-speaker waveforms, frame shapes, presets.
- **Backend Settings** — per-key connectivity tests, help text, signup links.

## 2. Built but NEVER RUN by a human

This is the single biggest risk in the project. Everything above was verified by
driving the pipeline programmatically — **the app's real UI has never produced a
video.**

- The whole Cast/Scene layout has never been seen on screen. Three columns at
  384px + canvas needs ≥1280px, which is the current minimum window width. If
  it's cramped, panels need to become collapsible.
- **Chatterbox has never run on this machine.** One-time setup in
  `docs/CHATTERBOX.md`.
- Test buttons have never hit a real API.
- Avatar drag, preset apply/save/export, face picker — all typechecked, none clicked.

**First job of any new session: run it and fix what falls over.**

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
- **Per-band FFT waveforms** — see Next Chapter
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

### 1. Waveforms look cheap, and the cause is architectural

They animate from a **single loudness number per frame**, spread across the bars
by a sine shape function. Every bar therefore moves together, scaled by volume.
That is exactly why it reads as generated rather than designed.

Real visualisers use a **per-band FFT** so bass and treble move independently.

- `electron/audio/analyzeNarration.ts` → emit 16–32 frequency bands per frame
  instead of one RMS value.
- `lib/waveform/amplitude.ts` → `shapedAmplitude()` indexes a band instead of
  multiplying a shape function.
- Payload grows (18000 frames × 24 bands ≈ 430k numbers for 10 minutes). It may
  need writing to a JSON file in the render's public dir rather than riding in
  `inputProps`. The narration WAV and viseme sheets already use that road.
- The track model, the controls and the render path already support it.

Cheap wins once real band data exists: **peak-hold caps**, **rise/fall asymmetry**,
mirrored fills, gradients.

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
