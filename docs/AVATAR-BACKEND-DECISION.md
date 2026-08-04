# Research Brief — How Should Talking Avatars Be Produced?

> **Status: open decision.** Nothing here is settled. This document exists to be
> handed to a researcher (human or AI) with no prior context, and to come back
> with a recommendation. It deliberately does not contain a conclusion.
>
> Written 31 Jul 2026. Everything marked *unverified* is a lead, not a finding.

---

## 1. The question

**How should a speaking character's face be produced and animated in this app?**

That is the whole question. Not "which model is best" — which *approach*, given
the constraints in §3 and §4, evaluated against the axes in §5.

The answer determines a large part of the app's architecture, its per-video
cost in time, its asset pipeline, and what the finished videos can look like.
It is worth days of research before any of it is built.

**What is explicitly NOT being asked here:** text-to-speech (settled — Piper for
drafts, Chatterbox for finals), video rendering (settled — Remotion), waveforms,
subtitles, or backgrounds. Only the face.

---

## 2. What the app is, in enough detail to judge an option

BYOK-Vid-Creator is a **Windows desktop app** (Electron + React + Remotion) that
turns a written script into a finished MP4. It is aimed at short social videos —
a 60-second two-person dialogue is the reference case.

The current pipeline, all of it working today:

1. User writes a script as `Speaker: line` per line.
2. Local TTS synthesises each line; lines are concatenated into one WAV with
   deliberate pauses between turns. Per-line start/end times in ms are kept.
3. The WAV is analysed into a 60Hz loudness envelope, an active-speaker index
   per frame, and a 24-band FFT spectrum.
4. Remotion renders frames: background, per-speaker waveform, avatars, burned-in
   subtitles with the active word highlighted in the speaker's colour.
5. Output is 1080×1920 (or 1920×1080) H.264 with audio.

**How the avatar works today.** Each speaker has one 3072×3072 PNG sprite sheet:
a 3×3 grid of nine 1024×1024 cells, one per viseme (mouth shape). Lip-sync
picks a cell per frame from estimated word timings, with a short crossfade
between cells. A small deterministic transform adds breathing and drift. The
avatar is drawn as a circular crop at `size × frameWidth`.

**The characters.** Three exist, generated as Pixar-style 3D-render portraits:
a young woman (Καίτη), an anthropomorphic schnauzer in spectacles and tweed
(Σερίφης), and an anthropomorphic chihuahua. A fourth may be added. Framing is
head, neck and the top of the shoulders, straight-on, on flat dark charcoal.

**Integration facts a candidate approach has to fit:**

- Remotion renders frames **out of order across parallel worker processes**.
  Anything non-deterministic must be resolved to a file *before* the render
  starts. A cached clip on disk is fine; a live generative call per frame is not.
- Assets reach the render by being copied into a per-render public directory
  **before** the Remotion bundler runs, then referenced by filename.
- `<OffthreadVideo>` is available, so compositing a pre-generated clip into the
  scene is a solved problem.
- The app already runs **local HTTP sidecars** it starts and stops itself
  (Piper, Chatterbox). A third sidecar is an established pattern, not a new one.
- ComfyUI is already installed on the target machine.
- The avatar is composited into a live scene: a reactive waveform halo rings
  each face, subtitles sit below, a background may sit behind. Whatever the face
  layer produces has to sit inside that, not replace it.

---

## 3. Hard limits

These are not negotiable. An option that fails any of them is out, however good
it looks.

| # | Limit | Why it is hard |
|---|---|---|
| H1 | **Runs locally on an RTX 3070, 8 GB VRAM**, Windows 11 | This is the machine. Not "8GB with offloading if you're patient" — 8GB is the ceiling. |
| H2 | **No per-render cloud cost and no mandatory subscription** | The app's entire premise is bring-your-own-key, local-first. A face backend billing per second of video contradicts the product. |
| H3 | **Licence permits commercial and client work** | This has already eliminated one otherwise-good option (Fish Audio's speech weights are CC-BY-NC-SA). MIT/Apache preferred; any non-commercial clause is disqualifying. |
| H4 | **The final render must be reproducible** | Remotion renders frames out of order in parallel. Non-deterministic generation is allowed *only* if its output is resolved to a cached file before rendering starts. |
| H5 | **No driving video, no performance capture, no user on camera** | The operator will not perform to camera. Audio-driven or parametric only. This rules out LivePortrait's normal mode and anything needing a reference performance. |
| H6 | **Must work from Greek audio** | Speech is Greek, synthesised by Piper or Chatterbox. Lip-sync trained only on English phonemes is a real risk that needs checking, not assuming. |
| H7 | **Output composites into an existing Remotion scene** | The face is one layer among several. It cannot demand ownership of the whole frame. |

---

## 4. Soft limits

Real preferences with real weight, all of them tradeable against a large enough
payoff. **Say explicitly what a recommendation is trading away.**

- **Speed is a factor, not a gate.** The app already has a draft/final split
  (fast Piper voices for iteration, slow Chatterbox for the final). A face
  backend costing minutes per line at final-render time is acceptable if the
  quality justifies it. An hour for a 60-second video is a genuine cost that
  must be *stated and weighed*, not used to dismiss an option. Report time per
  second of output at a stated resolution and quantisation, and say what the
  iteration loop looks like.
- **Art style is tradeable.** The current Pixar-style renders are liked but not
  sacred. A different style is acceptable if the animation is much better.
  A *worse-looking* style is not.
- **Per-character setup cost is acceptable; per-video cost is not.** There will
  only ever be three or four characters. Hours of one-time work per character —
  modelling, rigging, layer separation, generating extra poses — is fine.
  Work that recurs every video is not.
- **Output resolution needs are unusually low.** Faces are drawn at roughly
  16% of frame width — about 170px in a 1080p frame. A 480×480 clip is already
  ~3× more than needed. This is a large lever in favour of expensive methods and
  should be used, not overlooked.
- **Head-and-shoulders framing is the current design, not a requirement.**
- **A per-character one-time generation step is fine.** Building a library of
  clips per character once, then sequencing them, is a legitimate architecture.

---

## 5. Evaluation axes

Score every candidate on all of these. Several are deliberately framed as
**variables, not obstacles** — an approach that handles them is worth more; one
that doesn't isn't automatically out.

**Fidelity**
1. **Quality** — does the output look good enough to post? Judged on the
   characters in `viseme-sheets/`, not on the model's demo reel.
2. **Lip-sync accuracy** — do mouth shapes match the phonemes, in Greek?
3. **Character consistency** — same face within one video, between videos made
   weeks apart, and across a whole series. This is the axis most likely to be
   quietly bad and it matters more than a good single frame.

**Motion**
4. **Face movement** — blinks, brow motion, micro-expression, head turn and nod.
   Where does motion happen: the whole head, or only the middle of the face?
5. **Body movement** — shoulders, torso, hands, gesture. Upside, not a
   requirement, but weigh it: it is the difference between a portrait and a
   character.
6. **Pose range** — head-and-shoulders only, or seated, standing, walking,
   *dancing*? An approach that can eventually do a character dancing is worth
   materially more than one permanently locked to a headshot.
7. **Directability** — can a shot be specified? Specifically: **can two
   characters be made to face each other**, which is a wanted feature. Can gaze,
   head angle, or expression be set per line?

**Subject support** — *variables, not obstacles*
8. **Animal / anthropomorphic characters.** Two of three existing characters are
   dogs. Handling them well is worth real weight. Failing at them is a cost to
   be priced, not an automatic rejection — the human-only fallback is
   acceptable, and losing the dogs is a decision already provisionally accepted.
   **Report the specific failure mode**, not just pass/fail: long ears, snouts
   and non-human proportions each break differently.
9. **Cartoon / stylised subjects.** The characters are stylised 3D renders, not
   photographs. Many methods are trained on real human faces and degrade on
   stylised input. Again: characterise the degradation.

**Practicalities**
10. **Speed** — see §4. Time per second of output, at what resolution and
    quantisation, on 8GB.
11. **VRAM headroom** at the quality actually needed (which is low — see §4).
12. **Determinism / seed control** — can the same inputs be reproduced?
13. **Failure mode** — when it goes wrong, is it an obvious re-roll, or a subtle
    drift that ships unnoticed?
14. **Integration surface** — HTTP API, CLI, Python library, node graph? How
    would Electron drive it? Can it be started and stopped programmatically?
15. **Maintenance risk** — actively maintained project, or a research repo
    abandoned after the paper?
16. **Asset cost per character** — hours, skills and software needed, once.

---

## 6. Candidate approaches

Six families. Research all six; do not assume the newest wins.

### A. Sprite sheets (the status quo, extended)
More cells: additional head angles, expression variants. Deterministic, instant,
zero VRAM, works on anything including dogs.
Known weakness: combinatorial. Pose × expression × viseme grows fast, image
models drift between cells, and motion remains discrete swaps rather than
movement. A *linear* extension (one extra sheet per character in a 3/4 pose
turned inward) is cheap and gets "facing each other"; the combinatorial version
is not worth it.

### B. 2D layered puppet rig
Cut existing artwork into layers — head, jaw, eyes, pupils, brows, shoulders —
and animate with transforms. The Live2D / Character Animator approach. Adobe
Character Animator 2026 and Photoshop 2026 are both installed on the machine.
Deterministic, no VRAM, keeps the current art style exactly, parametric blinks
and brows. Head turn beyond a modest angle needs a second base pose.
Asset cost: one layer-separation pass per character.

### C. 3D rigged heads rendered in the browser
A GLB with ARKit/Oculus viseme morph targets, rendered by three.js inside the
Remotion frame. Ready Player Me avatars ship viseme blendshapes; VRM is another
source. Fully parametric — head yaw becomes a number, so "look at each other" is
trivial — plus blinks, gaze, brows, smooth interpolation, deterministic, fast,
no Python.
Known weakness: the assets. Free avatar systems are human-oriented; an
anthropomorphic schnauzer in tweed with usable blendshapes is a commissioned
model. Also a style shift toward a game-engine look.

### D. Audio-driven warping models
SadTalker, JoyVASA, EchoMimic, Sonic, Hallo and relatives. Drive a decoupled
facial representation from audio; warp a still image.
**Already partially evaluated — JoyVASA was tested and rejected**, with three
observed failures: long ears break, motion is confined to the centre of the
face, and the result is "wavy". Those are consistent with the architecture: the
model warps a face region against a static identity, so anything outside the
face model (ears, hair, shoulders) is dragged as texture, and warping fields
wobble. Treat the whole family as suspect for these characters, but confirm
whether any member solves it.

### E. Audio-driven video diffusion — *the current lead, unverified*
InfiniteTalk (from the MultiTalk team), Wan 2.2 S2V, HunyuanVideo-Avatar,
OmniHuman and relatives. These generate actual frames rather than warping, so
the whole head, hair, ears and shoulders move together — which is exactly the
JoyVASA failure mode inverted.
Leads to check:
- InfiniteTalk claims unlimited output length, improved stability over MultiTalk,
  and **multi-speaker support with a separate audio track and reference mask per
  person** — which is the dialogue case directly.
- An 8GB path is documented via Q4_K_M GGUF quantisation with block swap.
- Runs in ComfyUI, which is already installed. ComfyUI has an HTTP API, so the
  Electron app could drive it as a third sidecar.
- Trained on large video corpora including animation, so stylised and non-human
  subjects may fare much better than under family D. **This is a guess and is
  the single most valuable thing to test.**
Costs to establish: generation time on this GPU, VRAM headroom, whether Greek
audio syncs correctly, and whether character identity holds across separate
generations.

### F. Pre-generated clip library
Generate a set of clips per character once — idle, talking, nodding, gesturing,
sitting, dancing — then sequence and loop them against the audio, with lip-sync
either baked in or overlaid. Turns an expensive per-video cost into a one-time
per-character cost, which is exactly the trade §4 prefers. Can be built on top
of any generative option in D or E.
Worth serious consideration; it is the least obvious of the six.

### G. Commercial APIs (Hedra, HeyGen, D-ID, Synthesia)
Named here so they are explicitly rejected rather than forgotten. They fail H2
and usually H3. Include only if something has changed — e.g. a genuinely
unlimited local licence.

---

## 7. Questions the research must answer

Ordered by how much they change the decision.

1. **Does audio-driven video diffusion (family E) actually work on these
   characters?** Run one generation on `viseme-sheets/kaiti.png` and one on
   `viseme-sheets/serifis.png`, using an existing Greek narration WAV from the
   app's `renders/` folder. This one test collapses most of the uncertainty.
2. **What does it cost in time**, on a 3070 8GB, at the resolution actually
   needed (~480px, not 1080p)?
3. **Does character identity hold** across separate generations from the same
   reference image, days apart?
4. **Does Greek audio lip-sync correctly**, or is the model English-phoneme
   bound?
5. **Can two characters be made to face each other** in any of these approaches
   without hand-animating it?
6. **What is the ceiling on body motion** — is seated, gesturing or dancing
   reachable in the next year, and by which family?
7. **What is the realistic asset cost per character** for families B and C, from
   someone who has actually done it?
8. **Is there a family-F architecture** — generate a clip library once, sequence
   forever — that gets most of the quality at a fraction of the per-video cost?

---

## 8. What a finished answer looks like

Not a survey. A recommendation, with:

1. **A primary approach and a named fallback**, each mapped against every hard
   limit in §3 and scored on every axis in §5.
2. **What it trades away**, stated plainly. Every option here loses something.
3. **Evidence, not marketing.** Output generated from *these* characters, or a
   clear statement that it was not tested and why.
4. **The integration shape** — where it plugs into §2, what runs where, what is
   cached, what the user has to install once.
5. **The per-character asset pipeline** — what has to be made, by whom, in what
   software, and roughly how long.
6. **The cheapest next experiment** if the answer is still uncertain. A path to
   deciding beats a confident guess.

### Reference material in this repo

- `PLAN.md` — full project inventory, what is built and what is not.
- `docs/VISEME-SHEETS.md` — how the current sprite sheets are made, including
  the character prompts.
- `viseme-sheets/` — the three existing character sheets.
- `src/components/canvas/SpeakerAvatar.tsx` — where a face is drawn today; the
  seam any new backend would replace.
- `remotion/VideoComposition.tsx` — how the frame is assembled.
- `%APPDATA%/byok-vid-creator/renders/` — real Greek narration WAVs to test with.
