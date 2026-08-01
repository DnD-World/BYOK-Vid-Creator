# Making Viseme Sprite Sheets

Everything needed to produce the three character sheets, including
copy-paste prompts. No code required.

---

## 1. What the app expects

One PNG per character, **3072 × 3072**, containing a **3 × 3 grid** of nine
**1024 × 1024** cells. Cell order is fixed — the app calculates the cell from
the viseme index as `column = index % 3`, `row = floor(index / 3)`:

| | Column 1 | Column 2 | Column 3 |
|---|---|---|---|
| **Row 1** | `0` NEUTRAL | `1` AH | `2` EE |
| **Row 2** | `3` OH | `4` OO | `5` MBP |
| **Row 3** | `6` FV | `7` L | `8` CH_SH |

Getting the order wrong makes the mouth move confidently to the wrong shapes,
which looks worse than no lip-sync at all. Double-check row 2 in particular.

### The three rules that matter more than art quality

1. **The head must not move between cells.** Same size, same position, same
   angle in all nine. The app swaps cells every few frames — any drift reads as
   the head jerking around. This is the single most common way these fail.
2. **Same framing in all nine:** head, neck, a little shoulder, head centred.
3. **Flat, solid background.** Simplest option: ask for a solid very dark
   charcoal background and it blends invisibly into the video's own `#0b0b0d`
   backdrop — no keying, no cutout, no transparency work. (A white background
   also works but then you have to cut it out.)

---

## 2. Workflow

### Best: inpaint the mouth, don't regenerate the head

Every other method here makes head drift *less likely*. This one makes it
impossible, because the head is never redrawn — the same pixels are reused and
only the mouth region is replaced.

If you have Midjourney, **Vary (Region)** is exactly this tool: mask the mouth
on your NEUTRAL image, describe the new shape, and it returns the same frame
with only that area regenerated. Photoshop's Generative Fill does the same job,
as does any ComfyUI inpaint workflow. (Check your Midjourney version's syntax —
`--sref` for locking one art style across all your characters and `--cref` for
character reference are worth knowing, but for mouth shapes, regional inpaint
beats both.)

Then run each variation through:

```bash
node tools/merge-mouth.mjs kaiti_NEUTRAL.png kaiti_AH_inpaint.png viseme-v2/kaiti_1_AH.png
```

That composites the changed region back onto NEUTRAL with a feathered edge, so
the output is byte-identical to NEUTRAL everywhere outside the mouth. It
auto-detects the region by diffing the two images, and **refuses** if the
changed area spans more than a quarter of the frame — which is how it tells you
a variant came from a fresh generation rather than an inpaint. Pass `--box
x,y,w,h` to override.

This also rescues art you already have: two independently generated cells with
real drift can be merged with a manual box, and the result has one head.

### Faster: one image containing every mouth shape

Ask for a **single strip** with the shapes side by side, then slice it:

```bash
node tools/slice-grid.mjs kaiti-strip.png kaiti --cols 5 --order 0,1,2,3,7
node tools/build-viseme-sheet.mjs ./viseme-v2 ./viseme-sheets-v2
```

One generation instead of five, and — the real benefit — the model composes
the panels *against each other* on one canvas rather than redrawing the
character from scratch each time, which holds the head far steadier. Rule 1
below is the most common way these fail, and this is the best defence against
it.

`--order` maps panels (left to right, then top to bottom) to viseme indices, so
`0,1,2,3,7` means the strip contains NEUTRAL, AH, EE, OH, L. Cells can be any
square size — they don't have to be 1024px.

Check the result: if the head has drifted between panels, fall back to the
one-at-a-time method below for the cells that moved.

### Reliable: one image at a time

Image models will not always keep a character consistent across independent
generations. So:

1. **Generate the NEUTRAL cell first.** Re-roll until you genuinely like the
   character. This becomes your canonical reference.
2. **Lock it in as a reference image** (in Flow: add it as an *ingredient*; in
   ImageFX/Whisk: use it as the reference/subject image).
3. **Generate the remaining eight** one at a time, reusing that reference every
   time, changing *only* the mouth-shape sentence.
4. Expect to re-roll. Image models are unreliable at precise mouth shapes on
   command — budget a few attempts per cell, especially `FV` and `L`, which are
   the two hardest because they need teeth and tongue placement.
5. Send me the nine files per character and I'll assemble the 3072 × 3072 sheet
   with the cells in the correct order.

> Fidelity target for this system is ~85%, so a cell that's *close* is fine.
> A cell where the head has moved is not.

---

## 3. Base prompts — one per character

Paste the base prompt, generate NEUTRAL, then reuse it as reference and append
one mouth line from §4 for each remaining cell.

### Character 1 — Zoe (21-year-old woman)

```
Pixar-style 3D animated character portrait, high detail, cinematic soft
lighting. A 21-year-old woman: bright and perky, joyful, playful and a little
sassy, with lively expressive eyes and an energetic charm. Stylised
appealing cartoon proportions with slightly large expressive eyes, smooth
subsurface-scattering skin, detailed individual hair strands.

Framing: head, neck and the very top of the shoulders only. The head is
centred in the frame and fills most of it. Straight-on front view, camera at
eye level, absolutely no head tilt or rotation.

Background: completely flat solid very dark charcoal, no gradient, no
texture, no shadows cast on it.

Square 1:1 image. Mouth closed and relaxed with a soft natural smile.
```

### Character 2 — Professor Schnauzer (serious dog)

```
Pixar-style 3D animated character portrait, high detail, cinematic soft
lighting. An anthropomorphic schnauzer dog character: serious, stern and
scholarly, a strict but fair teacher. Distinctive bushy schnauzer eyebrows and
beard. He wears round teacher's spectacles perched low down his snout, and a
brown tweed jacket with a collared shirt, the jacket shoulders just visible at
the bottom of the frame. He stands upright on two legs like a cartoon
character, though only his head and shoulders are in view.

Framing: head, neck and the very top of the shoulders only. The head is
centred in the frame and fills most of it. Straight-on front view, camera at
eye level, absolutely no head tilt or rotation.

Background: completely flat solid very dark charcoal, no gradient, no
texture, no shadows cast on it.

Square 1:1 image. Mouth closed and relaxed, dignified neutral expression.
```

### Character 3 — Pepper (energetic chihuahua)

```
Pixar-style 3D animated character portrait, high detail, cinematic soft
lighting. An anthropomorphic female chihuahua character: bursting with energy,
joyful and excitable, huge bright sparkling eyes, enormous expressive ears
standing up alert. She stands upright on two legs like a cartoon character,
though only her head and shoulders are in view.

Framing: head, neck and the very top of the shoulders only. The head is
centred in the frame and fills most of it. Straight-on front view, camera at
eye level, absolutely no head tilt or rotation.

Background: completely flat solid very dark charcoal, no gradient, no
texture, no shadows cast on it.

Square 1:1 image. Mouth closed and relaxed, happy alert expression.
```

---

## 3b. You can draw five instead of nine — but not the obvious five

`tools/build-viseme-sheet.mjs` fills any cell you didn't draw from the shape it
most resembles, so a partial set still produces a valid sheet. It prints every
substitution it makes, so this stays a decision you made rather than a bug you
inherit.

**Which five to draw depends on the language, and for Greek the intuitive
answer is wrong.** Run the numbers yourself:

```bash
node --experimental-strip-types tools/viseme-coverage.mjs
```

It maps a script to visemes, then reports which cell to draw next for the most
gain. On a Greek sample:

| Draw | Adding | Mouth movement retained |
|---|---|---|
| 2 | EE | 52% |
| 3 | OH | 74% |
| 4 | L | 87% |
| **5** | **AH** | **94%** |
| 6 | CH_SH | 96% |
| 7 | MBP | 98% |
| 8 | FV | 100% |
| 9 | OO | 100% |

**So the five to draw are `0` NEUTRAL, `1` AH, `2` EE, `3` OH and `7` L.**

The counter-intuitive part is `OO`, which is worth *nothing* in Greek — it
appears in about 1% of graphemes, and `CH_SH` borrowing from it works out fine
anyway. `L` is the opposite: 17% of Greek graphemes, and substituting it costs
eleven points on its own. Drawing OO instead of L is the same amount of work
for a materially worse result.

The measure is mouth **changes**, not frames: `buildVisemeTrack` drops a
keyframe that repeats the previous viseme, so merging two shapes doesn't just
make them look alike — it deletes the transition between them and the mouth
holds still. That is why fewer cells costs more than it first appears.

For a different language, re-run the tool against a real script. English will
rank these differently — `OO` and `FV` both matter far more there.

### Is lip-sync worth it at all at this size?

Yes, and it was worth checking. Rendering the same project twice — once
normally, once with every cell replaced by NEUTRAL so the mouth cannot move —
and diffing matched frames shows **5% of the face's pixels differ on average,
22% on the busiest frame**, with 68% of frames differing by more than 1%. Small
numbers, but plainly visible in motion. Don't skip the mouth.

---

## 4. The nine mouth shapes

For cells 1–8, reuse your NEUTRAL image as the reference and add:

```
Exactly the same character, same head size, same head position, same angle,
same lighting, same background. The ONLY difference is the mouth shape.
```

…then one of these:

| # | Name | Mouth line to append |
|---|---|---|
| 0 | NEUTRAL | `Mouth closed and relaxed, lips gently together.` |
| 1 | AH | `Mouth wide open, jaw dropped low, as when saying "ah" in "father".` |
| 2 | EE | `Lips stretched wide and flat, corners pulled back toward the ears, upper teeth slightly visible, as when saying "ee" in "see".` |
| 3 | OH | `Lips rounded into a clear open O shape, medium opening, as when saying "oh" in "go".` |
| 4 | OO | `Lips pursed and pushed forward into a small tight circle, as when saying "oo" in "boot".` |
| 5 | MBP | `Lips pressed firmly together and slightly compressed, mouth completely closed, as when saying "m", "b" or "p".` |
| 6 | FV | `Upper front teeth resting lightly on the lower lip, mouth slightly open, as when saying "f" or "v".` |
| 7 | L | `Mouth partly open with the tip of the tongue raised up and visible, touching behind the upper front teeth, as when saying "l".` |
| 8 | CH_SH | `Lips pushed slightly forward and rounded into a soft square, teeth close together, as when saying "sh" or "ch".` |

For the two dogs, the shapes apply to the snout — say **"the snout and muzzle
form this shape"** if a cell comes back looking human.

---

## 5. Assigning a finished sheet

The app reads a speaker's sheet from `SpeakerConfig.sheetUrl`. There is no
file picker for it yet — that's the remaining piece of lip-sync work, along
with making the sheet reachable from inside the Remotion render bundle (see
`PLAN.md` item 10). The sheets can be made now, in parallel; they'll be
loadable when that lands.
