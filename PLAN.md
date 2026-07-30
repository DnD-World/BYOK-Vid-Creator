# BYOK-Vid-Creator — Plan to Finish

> Supersedes the "where things stand" sections of `handoff 3.md`, which went
> stale the moment the Remotion render landed. Handoff 1–3 remain the record
> of *why* decisions were made. This file is the record of *what's left*.

---

## The North Star

**One finished 60-second Greek dog video, rendered end to end, good enough to
post on LinkedIn.**

Every item below gets judged against that one sentence. If a feature doesn't
move that video closer to existing, it goes in the Cut List — not the backlog,
the Cut List. Backlogs are where scatter focus hides.

---

## Where the app actually is (verified in code, July 2026)

**Works, proven on the real machine**
- App shell, amber-cyberpunk UI system, runtime accent color, motion identity
- Piper TTS (persistent server per voice)

**Built, not yet exercised on the real machine**
- Chatterbox Multilingual v3 (needs the one-time `start.bat` Portable Mode setup)
- Narration: script → per-speaker voices → one combined WAV + per-segment timings
- GLM-5.2 script drafting (has a real bug — see P0)

**Built and complete**
- Remotion render pipeline, end to end: script → narration → frames → MP4.
  Deliberately plain. It exists to prove the pipeline, not to look good.

**The gap that matters:** the pipeline works, but *the video is empty*. The
README promises lip-sync, subtitles, audio-reactive waveforms, backgrounds and
ducked music. None of that is in a rendered frame today. The waveform still
animates from `fakeAmplitude.ts` — a sine wave, not your audio.

That gap is the whole project now. Not the settings panel.

---

## Phase 0 — Unblock (small, uncontroversial, do first)

Cheap fixes and the things that are simply missing. None of these are risky.

1. **Fix "Generate Draft does nothing."** Confirmed root cause:
   `NarrationPanel.tsx:50` returns silently when there are no speakers or no
   topic — and the button is disabled under the same condition, so with zero
   speakers the click is a genuine no-op with no explanation. Fix: state the
   reason on screen ("Add a speaker on the Canvas tab first").
   Second, likely, latent cause: GLM-5.2 is a reasoning model. Handle
   `reasoning_content` and strip `<think>` blocks, and raise `max_tokens` —
   otherwise reasoning eats the budget and `content` comes back empty.
2. **Add the missing Pexels key field** (`api.pexels.com`, free key, instant).
3. **Test button next to every key.** Each one does a real minimal authenticated
   call to that provider and reports OK / bad key / no network. This is the
   single highest-value non-coder feature in the app — it replaces guessing.
4. **Non-coder help for every field.** One plain sentence on what it's for, a
   "Get a key →" link, and an honest status badge: `Instant` (Pixabay, Pexels,
   NVIDIA), `Approval needed` (Freesound, Jamendo), `Not a key` (Piper,
   Chatterbox — these are local folder paths, not API keys, which is exactly
   why they were confusing).
5. **Move Saved Templates out of Backend Settings → Canvas.** Correct call:
   templates capture render + waveform + speaker setup, which are all Canvas
   concerns. They were never backend settings.

---

## Phase 1 — Make the video stop looking empty (the real work)

This is the phase that produces the LinkedIn video. Nothing in Phase 2 or 3
matters if this doesn't land.

6. ~~**Real audio-driven waveform.**~~ **DONE.** `electron/audio/analyzeNarration.ts`
   measures an RMS envelope at a fixed 60Hz (deliberately not the render fps, so
   one analysis serves the preview and any fps). `fakeAmplitude.ts` is deleted;
   `amplitude.ts` replaces it with real and placeholder modes. Verified against a
   synthetic WAV: loud speech → full bars, pause → bars collapse to nothing.
   *Upgrade path: per-band FFT instead of a single envelope, if bars moving
   together ever looks too uniform.*
7. ~~**Only the active speaker animates.**~~ **DONE.** Falls out of #6.
8. ~~**Auto-attach narration to the render.**~~ **DONE.** The render bar picks up
   the narration automatically and can match the video length to it.
9. ~~**Subtitles, burned in, with active-word glow.**~~ **DONE.**
   `lib/subtitles/wordTiming.ts` estimates word timing by character weight,
   with extra weight on trailing punctuation (a voice slows at a comma; without
   that the highlight drifts ahead across a long sentence). Long lines split
   into multiple cues. Full styling controls in the left rail. Verified in
   Greek and English with 7 timing assertions.
   *Known limitation, by design: word timings are estimated, not force-aligned.
   `wordTiming.ts` is the single function to replace if that ever matters.*
10. ~~**Viseme lip-sync in the render.**~~ **DONE.** Sheets are copied into the
    per-render public dir exactly like the narration WAV (and deduplicated by
    source path). `speakerTracks.ts` builds one viseme track per speaker from
    the *same* word timings the subtitles use, per segment — so each speaker
    returns to a closed mouth between their own lines and sits still while the
    other talks. The preview loads sheets as blob URLs over IPC.
    `VideoComposition` now renders the real `SpeakerAvatar` instead of its own
    copy of the disk markup, which is what let the border width and glow drift
    apart once before.
    **Two traps found by rendering, not by reading:**
    - Remotion does not wait for CSS `background-image`. Frames captured before
      the 12MB sheet decoded, showing a sliver of a half-decoded sprite. Fixed
      with `useWaitForImages` (delayRender + `img.decode()`).
    - `SpeakerAvatar` imported `VisemeId` via the `@/` alias and as a *value*.
      Both are invisible in the preview and fatal in the render bundle.

**Phase 1 is complete.** The remaining known cost: the sheets are 12–15MB PNGs,
decoded per render worker. If long renders get slow, shrinking the cells or
switching to JPEG is the first thing to try.

**Checkpoint: render the dog video here.** Before touching Phase 2. If it looks
good at this point, the app is a success and everything after is upside.

---

## Phase 1.5 — Usability pass (done)

Not in the original plan; came out of real use once there was something to use.

- **Cast | Scene panels.** LEFT: Speakers / Music / Waveforms. RIGHT: Frame /
  Subtitles / Render / Presets. The single rail had become unusable.
- **Waveforms belong to speakers.** Deleted the global config and its `behavior`
  enum. Colour is derived from the speaker's outline, so the two cannot drift.
- **Waveforms are actually tweakable**: thickness and smoothing added (the two
  biggest levers, previously absent), wider ranges, per-track lane offset.
- **Speaker frames**: circle / rounded / square / none, with separate outline
  and fill opacity. The face is clipped to the frame's shape — it was hardcoded
  round, so a square frame still circle-cropped the artwork.
- **Presets**: Halo / Broadcast / Orbit built-ins plus your own, JSON
  export/import. A built-in restyles the existing cast rather than replacing it.
- **Attached audio drives the waveform.** Was narration-only, which was wrong.

---

## Phase 2 — Backgrounds and music

11. **Background video from Pixabay + Pexels**, fetched by keyword.
12. **Local Media Library folder.** A folder you drop files into, browsable
    in-app, usable as background or music. This is the answer to the
    Mixkit / Orange Free Sounds question — see Cut List.
13. **Music track + auto-ducking** under narration segments.

---

## Phase 3 — Control and expressiveness

14. **Per-track waveform config.** Replace the single `WaveformConfig` +
    `behavior` enum with three independent track configs — Speaker A, Speaker B,
    Music — each with its own style, position and size. Plus a **Link Speakers**
    toggle: one shared waveform that color-shifts on speaker change. The old
    `behavior` enum ("single" / "dual" / "dual-plus-music" / "triple") then
    becomes emergent from which tracks are on and whether speakers are linked —
    so this deletes a concept rather than adding one.
15. **Tone checkboxes** in Narration — Playful, Sassy, Casual, Formal/Corporate,
    Warm, Dramatic — multi-select, composed into the GLM prompt alongside the
    free-text tone field.
16. **Text polish pass.** Paste raw text → GLM rewrites it with punctuation,
    pacing and emphasis tuned for TTS delivery. **Important:** target plain text
    with expressive punctuation, *not* SSML. Chatterbox is a neural model that
    takes raw text; the local `devnen` server has no documented SSML support,
    and SSML tags would most likely be read aloud as literal characters. Chatterbox
    Turbo does support paralinguistic tags (`[laugh]`, `[chuckle]`) — worth a
    five-minute empirical test on your own server before we build to it. SSML
    proper only makes sense if Azure stays in scope, which the Cut List questions.
17. **TTS Manager tab.** Start/stop/status for Piper and Chatterbox from the UI,
    next to Narration. Good call — right now Chatterbox lifecycle is buried in
    Backend Settings and Piper's is invisible.

---

## Phase 4 — Ship

18. Package as a Windows `.exe`. Move Piper to the standalone compiled binary so
    no Python runtime ships. This is the point at which the multi-venv mess on
    your machine stops being a problem for anyone else.

---

## The Cut List — things to sacrifice, and why

**Cut: Mixkit and Orange Free Sounds as browsable in-app libraries.**
Neither has a public API. Orange Free Sounds' MP3s are CC BY-NC — *non-commercial
only* — which collides head-on with showing this to paying clients, and their
terms explicitly forbid redirecting their downloads or rehosting their packs.
Mixkit has no developer API at all. Integrating either means scraping, against
their terms, for content you may not be licensed to use commercially.
**Instead:** the Local Media Library (#12). You download from Mixkit or anywhere
else by hand, drop the file in the folder, and browse it in-app. Legal, works
with *every* source forever, and it's about a tenth of the work.

**Cut: responsive / mobile layout.** Agreed — Windows desktop `.exe`. Lock a
sensible minimum window size and design for desktop only.

**Cut: Azure Speech, and Edge TTS.** You have four TTS engines in scope for one
person. Chatterbox is the quality tier and Piper is the fast preview tier — that
covers every real need. Azure is a "fallback" for an engine you haven't stress-
tested yet, and every extra engine multiplies the surface area of what can break.
Your own stated priority is stability first. *(Your key is already saved, so
keeping the field costs nothing — this is about cutting it from the roadmap, not
deleting it.)*

**Cut: ElevenLabs and Google Drive.** Leave as "coming soon" stubs. Don't build.

**Downgrade: the AI background "Relevancy ↔ Frequency dial."** Ship keyword
search plus a simple clip-length control. The dial is a refinement of a feature
that doesn't exist yet.

**Freeze: the waveform style library.** Six styles × five positions is already
generous. The dotted 3D wave-plane stays unbuilt. Phase 3 #14 is about
*controlling* what exists, not adding to it.

---

## Sequencing rule

Phases run in order, and Phase 1 ends with a rendered video before Phase 2
starts. When something new comes up mid-phase, it goes at the bottom of this
file under Parked — not into the current phase.

## Next chapter — start here

**1. Waveforms are mediocre, and the reason is architectural.** They currently
animate from a *single loudness number* per frame, spread across the bars by a
sine-based shape function. Every bar therefore moves together, scaled by volume —
which is exactly why it reads as cheap. Real visualisers use a **per-band FFT**,
so bass and treble move independently and the shape means something.

The fix is in `electron/audio/analyzeNarration.ts`: emit N frequency bands per
frame instead of one RMS value. ~16–32 bands is plenty. The payload grows
(18000 frames x 24 bands ≈ 430k numbers for a 10-minute video), so it may need
writing to a JSON file in the render's public dir rather than riding in
`inputProps`. `shapedAmplitude()` in `lib/waveform/amplitude.ts` then indexes a
band instead of multiplying a shape. Everything else — the track model, the
controls, the render path — already supports it.

Worth doing at the same time: peak-hold caps, a rise/fall asymmetry control, and
mirrored/gradient fills. Those are cheap once real band data exists and are what
make it look designed rather than generated.

**2. SFX via LocalAI.** The endpoint is confirmed: `POST http://localhost:8080/tts`
with `{"model": "...", "input": "a dog barking twice"}`. **But neither SFX model
loads today** — `audio-cpp-stable-audio-sfx` returns *"backend not found:
audio-cpp"* and `stable-audio-3-small-SFX` returns *"grpc service not ready"*
(vllm generally doesn't run on Windows). Install the `audio-cpp` backend from
LocalAI's gallery first; there is nothing to build until a model actually loads.
Then: generate to a local SFX library folder, browse it, drop clips on a timeline.
This folds neatly into the Media Library (#12).

**3. Preset-writing skill.** Presets are already plain JSON with import/export,
so this needs no app changes — a skill interviews the user and emits a preset
file they import.

## Parked

**Intro / outro cards.** Asked for, not yet designed. Three plausible shapes and
they cost very different amounts:
1. *Title card* — text on the accent-colored HUD background, a second or two at
   each end, with the existing corner-bracket styling. Cheap, on-brand, no new
   dependencies. Fits Phase 1.
2. *Image card* — pick a PNG/JPG per end. Slightly more work (asset has to reach
   the render bundle, same problem the viseme sheet has).
3. *Video sting* — an actual clip spliced before/after. Most work by far: needs
   `<OffthreadVideo>`, a second audio track, and the narration offset by the
   intro's length so subtitles and lip-sync don't drift.

Recommendation: build #1 in Phase 1 (it's ~an hour and makes every test render
look finished), and only consider #3 after the dog video exists.

Note the *other* half of that request — auto-detecting video length from the
narration — is already done, and lives in the render bar.
