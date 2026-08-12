# BYOK-Vid-Creator — Plan & Inventory

> Living document. Supersedes the status sections of `handoff 1–3.md`, which
> went stale once the render landed. Those remain the record of *why* early
> decisions were made.
>
> Audited against the code on 30 Jul 2026 — every "not built" below was checked
> by grep, not remembered. Updated 31 Jul 2026 after the app was driven end to
> end through its real UI for the first time.
>
> **Re-audited 8 Aug 2026**, after clicking through every panel of
> `feat/media-fetch` in the running app and rendering a finished video from it.
> Several rows below said "missing" for things that had shipped days earlier —
> those are corrected in place. A plan that lies about what exists is how work
> gets done twice.

---

## The North Star

**Lesson videos for two LMS courses, 3–8 minutes each.** Dog training first —
the three built characters were made for it. Professional soft skills second,
which will need a few more characters. The same material is also cut for social,
so a project has to come out in more than one orientation.

Everything gets judged against that. If it doesn't move those lessons closer to
existing, it goes in the Cut List — not a backlog.

> Corrected 12 Aug 2026. This document previously said "one finished 60-second
> Greek dog video, good enough to post on LinkedIn". That showcase video is
> **secondary**. The mistake mattered: 3–8 minutes is five to eight times the
> render length everything below was measured against, so render time, viseme
> sheet memory, and drift in the estimated word timings all matter more than the
> numbers here suggest. Nothing longer than about a minute has ever been
> rendered.

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
| **Chatterbox** | Full integration, test panel, voice modes | Server INSTALLED 8 Aug (portable, NVIDIA cu121, in `../Chatterbox-TTS-Server`). Still needs its engine picked once in its own web UI, and has never synthesised here |
| **Music** | ~~Colour + waveform track~~ **BUILT** — Cast > ♪ Music loads a file, mixes under narration, auto-ducks (260ms look-ahead) | Not audible in the preview, which has no audio at all |
| **Subtitles** | Full styling, burned in, **SRT export BUILT** (Scene > Subtitles) | — |
| **Speaker voices** | Works | UI is **duplicated** — engine/voice appear in both Cast and Narration panels |
| **Narration view** | Works | Still a full-screen view, not folded into the panel system |

## 4. Not started

**Audio**
- ~~Background music loading and auto-ducking~~ — **BUILT**
- ~~Freesound~~ — **BUILT and live** (CC0-only). Jamendo dropped: licence.
- SFX **generation** — moved off LocalAI, which never loaded a model on
  Windows. Now Stable Audio Open, locally, via `tools/make-sfx.py` +
  `sfx/wanted.csv`. Licence checked: free commercial use under $1M revenue,
  outputs owned, and trained only on CC0/CC-BY audio.
- Local media library folder — still not built. Loading one file from disk is
  not a folder the app indexes.
- Preview has **no audio at all**. Music, ducking and effects are only ever
  heard in a render.

**Visual**
- ~~Background video from Pixabay / Pexels~~ — **BUILT and live**, both
  providers, interleaved, verified in the app and in a render.
- Intro / outro cards
- Transition library — `defaultTransition` was a dead setting and has been
  deleted. Build the feature and the setting together, or neither.
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
- ~~**Piper's server re-execs itself under a different Python.**~~ **THIS WAS
  WRONG** and was repeated for a week before anyone checked. The second
  `python.exe` under the venv one is not a reloader and not a leak: it is how a
  Windows venv works — `Scripts\python.exe` launches the base interpreter, and
  `sys.prefix` and site-packages still resolve into `piper-venv`. Verified by
  importing piper inside it. What IS real: ports are fixed (5501+) with no
  check that whatever answers on one is ours.
- **The first narration after launching the app used to fail every time**
  (`ECONNRESET`), and a retry always worked — a cold-start race, fixed by
  requiring two consecutive good pings before writing and backing off between
  retries. Matters most for unattended batch runs, which would otherwise fail
  on their first row every time. **Not yet verified end to end.**
- **`onBrowserLog` is the only channel the composition has to report a problem.**
  Currently one message uses it (spectrum failed to load). Worth remembering
  that anything going wrong inside a render is otherwise completely silent —
  which is exactly how a render that had quietly stopped using the spectrum
  still looked like a success.

- ~~**Dead settings**~~ — **DELETED 8 Aug**: `defaultTransition`,
  `storageTarget`, `ttsPrimary`, `ttsFallback`, `llmScenePlanner`,
  `azureRegion`, `bgRelevancy`.
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

## The agreed order — 12 Aug 2026

Set after watching `render-1786118738784.mp4` (7 Aug) end to end. Each item is
something that render actually showed, in the order Ak chose.

0. ~~**Save the work.**~~ **DONE 12 Aug.** `feat/media-fetch` was 22 commits
   ahead of `main` with 14 unpushed, plus the uncommitted process-tree fix. All
   merged to `main` and pushed. This is why a reader of GitHub saw an empty
   project: `main` was six weeks stale.
1. **Presets that carry the whole look** — nine of them, 3 styles × 1/2/3
   speakers, editable, covering layout, subtitles, background and surfaces.
   Absorbs two review findings at once: the frame-centred waveform and Καίτη
   standing off-centre alone. Spec:
   `docs/superpowers/specs/2026-08-12-presets-and-surfaces-design.md`.
2. **Background relevance**, including the **Relevancy ↔ Frequency dial**
   uncut from the Cut List on 12 Aug. The planner exists and is wired up; the
   clips it chose were ambient ("dogs in a park") where the script wanted
   situational ("dog refusing a treat", "vet examining a dog"). *Relevancy* is
   how tightly each clip has to match the line being spoken; *frequency* is how
   often the picture changes. They pull against each other — insisting on a
   close match for every sentence means either cutting constantly or failing to
   find clips — which is why one dial with two ends is the honest control.
2b. **Image intro / outro cards** — see Parked, below. Small, and it rides
   along with the background work since both place a visual over a stretch of
   time.
3. **Choppy idle motion.** Cause unknown — investigate before proposing a fix.
4. **Chatterbox's first words.** Installed 8 Aug, has never synthesised. The
   voice being monotonous and slow is the single loudest complaint, and Piper
   cannot fix it. Takes the card: ask before running.
5. **Lip-sync.** `wordTiming.ts` estimates from character weight. Piper 1.6
   serves real phoneme alignments — that fixes mouths *and* subtitle timing from
   one source. Not in Ak's stated order; placed here, flagged, not assumed.
6. **Batch production.** One row per lesson. A row carries a finished script, a
   topic, **or a URL the characters discuss**. Spreadsheet-driven and inside the
   app, not n8n. Needs `docs/WRITING-SCRIPTS.md` to be good enough for someone
   filling a spreadsheet without the app in front of them.

Verified good in the same review, do not regress: subtitle look, speed and sync;
brow, head and eye movement; the darkened background.

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

**To be clear about what "frozen" means below** — the Cut List freezes the
*count* at six styles, so no seventh named style gets invented. Improving the
six is explicitly in scope and always was: fills, gradients, better ring
behaviour, and where a waveform sits relative to the speaker. The dotted 3D
wave-plane is the one exception, kept because it is a rework of the existing
`dots` rather than an addition to the list.

### 2a. The sound library is not good enough — measured, 12 Aug 2026

Ak listened to the 26 generated sounds and rejected them: clickers inaudible,
the growl "more like a dark monster", the squeaky toy not the two-part
press-and-release it should be. Measuring all 26 turns that into two separate
problems, only one of which is the model's fault.

**Problem one: peak normalisation was the wrong call, and the numbers say so.**

| sound | peak | RMS | share of clip that is audible |
|---|---|---|---|
| clicker-training | −4.1 | **−39.8** | **1%** |
| clicker-double | −3.0 | **−39.5** | **2%** |
| dog-happy-pant | −3.0 | −41.7 | 13% |
| dog-bark-double | −3.0 | −16.1 | 48% |
| dog-whine | −3.0 | −17.5 | 78% |

Every file peaks at −3 dBFS exactly as intended, and that is precisely the
problem. A clicker is one transient in a second of silence: matching its *peak*
to a bark's peak leaves it **24 dB quieter in perceived loudness**, which is
inaudible under narration. The commit that introduced peak normalisation argued
it preserved dynamics. It does — and the measurement now shows that choice
produced a library nobody can mix. Replace with loudness normalisation against a
target, with a peak ceiling to stop clipping.

**Problem two: Stable Audio Open is weak at short, specific, real-world foley.**
No amount of levelling fixes a growl that sounds like a monster or a squeaky toy
that misses its two-part shape. The model is decent at texture and abstraction
and poor at "one recognisable everyday object doing one specific thing".

**The fix, and it needs no new dependency:** Freesound CC0 search is already
built, live and licence-cleared inside the app. Real recorded foley — barks,
clickers, collars, squeaky toys — comes from there. Generation keeps the work it
is actually good at: whooshes, drones, tension beds, anything abstract with no
real-world referent to be judged against.

### 2b. ~~SFX via LocalAI~~ — ABANDONED, and nothing needs port 8080

**Deleted 12 Aug 2026 because this section was actively misleading.** It
described `POST http://localhost:8080/tts` as the route to sound effects, and
led to time spent wondering why LocalAI wasn't running. It doesn't need to be.

LocalAI never loaded a model on Windows — `audio-cpp` was not a real backend,
and the vllm-based one doesn't run here at all. So sound effects moved to
**Stable Audio Open, run locally by `tools/make-sfx.py`** from `sfx/wanted.csv`.
No server, no port, no daemon: a script you run when you want more sounds.

`grep -rn "8080\|localai" src/ electron/` returns nothing. **Nothing in this app
has ever talked to port 8080.** If something is listening there on this machine,
it belongs to another program — leave it alone.

### 3. Surface the AI assistant, then extend it

It exists but nobody can find it. Move it somewhere obvious, add the tone
checkboxes and the text-polish pass, then build the preset-writing skill.

---

## Two traps that cost most of 7–8 Aug

### Antivirus HTTPS scanning breaks everything that isn't Chromium

This machine has **Avast Web/Mail Shield Root** in the Windows certificate
store (Kaspersky's is there too). Avast terminates TLS itself and re-signs
every response with that root. Windows and every browser trust it.

**Nothing else does**, because nothing else reads the Windows store:

| What broke | Error | Fix |
|---|---|---|
| Freesound search in the app | `unable to verify the first certificate` | all outbound calls moved to electron's `net` (Chromium's stack) |
| `uv pip install torch` | `invalid peer certificate: UnknownIssuer` | `--system-certs` |
| `hf auth whoami`, model downloads | `CERTIFICATE_VERIFY_FAILED` | `SSL_CERT_FILE` → `tools/windows-ca-bundle.pem` |
| Chatterbox's own installer | would have hit the same | same env vars, passed in |

**It is intermittent**, which is what makes it expensive: Avast skips
connections by reputation, so Pixabay and Pexels passed their tests while
Freesound failed, minutes apart, on identical code. **Any "provider-specific"
network failure on Windows should be checked against this first.**

`tools/make-ca-bundle.ps1` regenerates the bundle. It is gitignored — it
describes one machine.

### A vendored CSS library can collide with Tailwind by class name

Deco Noir defines `.grid`. So does Tailwind. Tailwind's sets `display` only;
the library's also sets `align-items:start`. The centre panel used Tailwind's,
silently inherited the library's alignment, and the preview stage — which is
MEASURED to size the canvas — collapsed to 2px and stayed there. The whole
preview drew nothing, and it read as a rendering bug for hours.

Renamed to `.dn-grid` when vendoring. **Re-apply on any re-vendor**, and check
new library classes against Tailwind utility names.

---

## Cut list — decided, don't revisit

- **Mixkit / Orange Free Sounds as in-app libraries.** No public API; Orange's
  MP3s are CC BY-NC (non-commercial), which collides with client work, and their
  terms forbid redirecting downloads. Replaced by the local Media Library.
- **Responsive / mobile layout.** Windows desktop `.exe`, locked minimum width.
- **Azure Speech and Edge TTS as roadmap items.** Chatterbox (quality) + Piper
  (fast) cover every real need. Every extra engine multiplies what can break.
- **ElevenLabs, Google Drive** — stubs only, don't build.
- ~~**The AI background "Relevancy ↔ Frequency dial"**~~ — **UNCUT 12 Aug 2026.**
  It was cut only until keyword search shipped, and keyword search shipped on
  8 Aug. Moved into the plan, folded into item 2 (background relevance), which
  is the same problem seen from the other end.
- **Waveform style library is frozen** at six styles. Improve what exists.
- **SSML** — neither Piper nor Chatterbox supports it. Target expressive
  punctuation instead. (Chatterbox Turbo's `[laugh]` tags are worth one test.)

## Parked

**Intro / outro cards.** Three different features were hiding under one name.
Plain English, because the old wording assumed too much:

1. *Title card* — the app draws **text** over the background. No file needed.
2. *Image card* — you supply a **finished picture** and the app holds it on
   screen for a few seconds. Where it comes from is your business — Midjourney
   or anything else.
3. *Video sting* — a short **animated clip with its own sound**, like a logo
   animation with a whoosh.

**Decided 12 Aug 2026: build #2, and only #2.** Ak makes the artwork elsewhere
and hands the app a finished image; all the app owes it is a transition in and
out. That is the cheap one — the render bundle already copies background clips
and viseme sheets in, so an image is the same solved pattern again.

#3 stays parked and is the expensive one for a non-obvious reason: it carries
its own audio, so everything after it has to shift by the sting's length. Get
that offset wrong and the subtitles and lip-sync drift for the entire video.
Not worth it for a logo.

**Amplitude-driven jaw-flap** for attached audio with no script — would let
lip-sync work on any audio, approximately.
