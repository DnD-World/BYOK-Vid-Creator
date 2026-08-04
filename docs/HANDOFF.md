# Handoff — state, decisions, and what not to revisit

> Written 3 Aug 2026, at the end of a long session, to survive a context reset.
> Read this plus `PLAN.md` and you have everything.
>
> Branch `phase-0-1-audio-subtitles-lipsync`. Nothing pushed, `main` untouched.

---

## 1. What works today

Script → per-speaker TTS → one WAV with turn pauses → 60Hz analysis (envelope,
active speaker, 24-band FFT) → Remotion render → MP4 with burned-in subtitles,
lip-sync, reactive waveforms.

**The whole pipeline has been driven through the real UI and rendered.**

## 2. The avatar system — current focus

Characters are **layered puppets**, not sprite sheets. A base body with a blank
face plus independent layers: eye whites, per-eye pupils, per-eye lids, per-side
brows, nose, one mouth per viseme.

**Everything is positioned relative to the HEAD**, in head-width units from the
head's centre. This is what makes South-Park-style tilt/shake possible later:
one transform on the head group moves every feature correctly.

### What the avatars can and cannot do

| Can | Cannot |
|---|---|
| 9 mouth shapes (visemes), lip-synced to real audio | Speak without a viseme sheet/puppet assigned |
| Blink — **while** speaking, any mouth shape | Move eyes/mouth as separate *sprites* (that was the old sheet) |
| Half-lids (sleepy/tired) | Look up or down (no vertical gaze assets) |
| **Wink** — each eye independent | Turn the head to a 3/4 view (needs a second drawn pose) |
| 4 brow moods, **independently per side** (sceptical raised brow) | Move mouth corners independently of the mouth shape |
| Gaze left/right (pupils are per-eye, offsets exist) | Show teeth/tongue beyond what the mouth art has |
| Recolour any layer (tint, saturation, hue, lightness) | Change body pose — head and shoulders only |
| Non-uniform scale per layer (bushy brows) | Animate hair, ears or clothing |
| Idle motion: breathing, drift, speaker sits larger | Head tilt/shake — **designed for, not built yet** |

**Combinations: 9 mouths × 3² lids × 4² brows = 1,296 static faces per
character.** That is before head motion, which is continuous and multiplies
nothing — it makes all of them move.

> **Yes, a viseme mouth combines freely with a wink or closed eyes.** The axes
> are fully independent; that is the entire point of the layer split. Any mouth
> × any left lid × any right lid × any left brow × any right brow.

### Honest caveat on 1,296

Many combinations differ only subtly. The number of genuinely *distinct
expressions* is far smaller. What matters is that it includes things a sprite
sheet structurally cannot do at all: blinking mid-sentence, one raised brow,
a wink.

### Files

- `puppet/*.spec.json` — author-facing, hand-tuned
- `puppet/*.puppet.json` — runtime, generated, has layer pixel dims stamped in
- `tools/make-puppet.mjs` — spec → runtime, validates
- `tools/render-puppet.mjs` — offline render; `--contact`, `--one`, `--cells`
- `src/components/canvas/PuppetAvatar.tsx` — live renderer, used by **both** the
  preview and the render
- `src/store/puppetTypes.ts` — the spec type
- `src/lib/puppets/puppetAssets.ts` — puppet → files on disk. Dependency-free on
  purpose: the browser, Electron main and the tools all need this arithmetic and
  share no runtime
- `src/lib/puppets/usePuppets.ts` — preview loading. `usePuppetDefs` is the
  JSON-only half, for panels that need validity but not art

A speaker carries `puppetPath` **and** `sheetPath`; the puppet wins wherever
both are set. They are not interchangeable — a sheet is nine baked faces — so
the sheet stays rather than being migrated away, and old projects still open
with their face on.

**The geometry is specified once, in the puppet JSON.** The offline tool and
the component both only apply it. If they ever disagree, that is the bug.

## 3. The cast

Three characters, flat cel-shaded 2D, chibi proportions, head+shoulders,
transparent background. Art lives in `viseme/` (gitignored — large).

| | Set | Head cx | Notes |
|---|---|---|---|
| Καίτη | B (female) | 0.500 | Mouth scale 0.78 |
| Σερίφης | A (dog) + B lids | 0.501 | Schnauzer. Bushy brows: scaleX 1.45, scaleY 2.6, tint `#6b6a5e`, bottom-anchored |
| Τσίκα | B (female) | 0.501 | Chihuahua. Mouth small — her muzzle only has ~55px between nose and collar |

Component layers are Photoshop exports with **"Trim Layers" ON**, so every
layer lost its position and the PSD is gone. Worked around by placing one
anchor per category. **If art is ever re-exported, untick Trim Layers.**

## 4. Decisions made — do not revisit

- **Layered puppet, not sprite sheets.** Sheets bake mouth+eyes+brows together;
  nine faces is the ceiling and blinking-while-speaking is inexpressible.
- **Head-relative anchoring**, not canvas pixels. Required for head tilt.
- **Layer dimensions stamped into the runtime JSON**, not measured on load — a
  render worker must not wait on an onload to know how big to draw something.
- **Piper for drafts, Chatterbox for finals.** Per-speaker engine choice.
- **Greek viseme priority is NEUTRAL, AH, EE, OH, L** — *not* OO, which appears
  in ~1% of Greek graphemes. `tools/viseme-coverage.mjs` re-derives this for any
  script. Five cells retains 94% of mouth movement, nine gets 100%.
- **Lip-sync is worth doing** at ~170px: 5% of face pixels differ on average,
  22% on the busiest frame. Measured, not assumed.
- **Spectrum travels to renders as a file** in the public dir, not inputProps.
- **Assets for a render must be written BEFORE `bundle()`** — the bundler copies
  the public dir; anything written after silently 404s.
- **Project autosaves** to localStorage minus the analysis, which is re-derived
  from the WAV on startup (~1s, keeps the save at ~3KB).
- **Presets = the look. Project = everything.** Kept separate deliberately.
- **Speaker library saves face/voice/colours/waveform but NOT position** —
  position belongs to a shot, not a character.

## 5. Explicitly rejected — do not re-propose

- **Fish Audio / OpenAudio S1** — weights are CC-BY-NC-SA, non-commercial.
  Collides with client work. Chatterbox is MIT.
- **LivePortrait** — video-driven, needs a driving performance on camera.
- **JoyVASA** — tested. Long ears break, motion confined to the centre of the
  face, output is "wavy". It warps a face region against a static identity, so
  ears/hair get dragged as texture.
- **Cloud avatar APIs** (Hedra, HeyGen, D-ID, Synthesia) — per-render cost and
  usually licence problems. Contradicts the local-first premise.
- **Combinatorial sprite sheets** (pose × expression × viseme) — 54+ cells per
  character, image models drift between them, and still no *smooth* motion.
- **n8n for the art pipeline** — automates the cheap part (file shuffling), not
  the bottleneck (re-rolling until the art is right).
- **Envato 3D floating-head assets** — the one examined was a static sculpt
  (tongue modelled out, OBJ), not a rig. Style mismatch too.
- **Mixkit / Orange Free Sounds** — no API; CC BY-NC collides with client work.
- **Azure Speech, Edge TTS as roadmap items** — every extra engine multiplies
  what can break. Azure has a key field and *no synthesis code*.
- **ElevenLabs, Google Drive** — stubs only, don't build.
- **Responsive / mobile layout** — Windows desktop `.exe`, min width 1280.
- **SSML** — neither engine supports it. Target expressive punctuation.
- **Waveform style library frozen at six styles.**

## 6. Open decision

**`docs/AVATAR-BACKEND-DECISION.md`** — whether the face layer should stay 2D
layers or move to audio-driven video diffusion (InfiniteTalk / Wan S2V in
ComfyUI, which is installed). Written as a standalone research brief with hard
vs soft constraints. **Not settled.** The 2D puppet is the working answer now.

## 7. Next steps, in order

1. ~~Wire `PuppetAvatar` into the app.~~ **Done.** Cast → Choose puppet, and a
   real MP4 has been rendered from `kaiti.puppet.json` end to end. Two things
   left over from it: a puppet reads **smaller** than a
   sheet at the same `size`, because a sheet's cells are cropped to the head
   while a puppet's base image carries the artwork's own margins. Decide
   whether that is a per-puppet scale or just a bigger `size`.
2. ~~Blink track.~~ **Done** — `src/lib/motion/facePerformance.ts`. Seeded per
   speaker so two avatars never blink in unison, ~16/min, with paired double
   blinks. Gated on `idleMotion`: 0 means a genuinely still face.
3. **Head tilt/shake** — one transform on the head group; the anchoring is done.
4. ~~Punctuation-driven brows.~~ **Done**, same module. `;`/`?` → raised,
   `!` → furrowed, `…` → sad, else resting. Brows lead the voice by 220ms and
   hold 320ms after. The mapping is one table, and giving the two sides
   different sets is where the sceptical single raised brow comes from.
5. Fonts (Google Fonts, Greek subset, download-and-cache — decided).
6. Background video (Pixabay/Pexels keys saved and tested, nothing consumes them).

## 8. Gotchas learned the hard way

- **A measurement that barely responds to a large input is measuring the wrong
  thing.** Pupil offsets looked immobile because lashes are as dark as pupils
  and far more numerous.
- **Guard on the thing you act on.** A "% of pixels changed" threshold passed
  two independently generated images at 8%, whose bounding box was 91% of the
  frame.
- **`electron-vite dev` needs `--watch`** or the main process is never rebuilt.
  `npm run dev` now passes it.
- **zustand `persist` merges shallowly.** A stale blob silently shadows every
  new default. Both persisted stores now deep-merge and have migrations.
- **Node's global HTTP agent keeps sockets alive since v19**; Piper drops idle
  ones → `ECONNRESET` mid-narration. Fixed with `agent: false` + one retry.
- **Windows file dialogs can zombie** and silently absorb later automated file
  picks. Check for stray "Open" windows if a picker misbehaves.
- **Downscaling must be alpha-premultiplied**, or every antialiased edge gets a
  dark fringe at these reductions (~10x).
