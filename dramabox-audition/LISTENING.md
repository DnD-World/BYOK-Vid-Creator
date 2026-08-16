# The audition — what to listen for

29 generations from `tools/dramabox-ambiguity-test.py`, plus the three older
files the "Greek works" claim rested on. All on the L4, no voice reference, so
the model chose each voice from the description alone.

**I cannot judge any of this.** Every answer below is yours. What I can say is
that nothing crashed, and that every duration is auto-estimated from the quoted
text — so the file lengths tell you almost nothing about what is inside them.

Listen in the order below. Stop after group 1 if the answer there is no.

---

## 1. Does Greek work at all — everything depends on this

| File | |
|---|---|
| `01-greek.wav` | The lesson sentence in Greek |
| `02-english-control.wav` | The same sentence in English |
| `00-prev-greek-lesson.wav` | The older file the repo's claim was based on |
| `00-prev-greek-drama.wav` | The older two-character emotional test |

Judge γ, χ, ντ, τζ; stress placement; and whether it holds for a whole
sentence rather than a word. **The control is there so you are comparing Greek
against this model at its best**, not against an idea of it.

If this fails, nothing else in this folder matters and Piper is the answer.

## 2. How to make a laugh happen

| File | |
|---|---|
| `03-laugh-greek.wav` | `"Χαχαχα! …"` — what the Gem currently tells the writer to do |
| `04-laugh-latin.wav` | `"Hahaha! …"` — what the guide's own examples use |
| `05-laugh-direction-only.wav` | Direction says she laughs; nothing is spelled |

If 04 laughs and 03 recites letters, the Gem's rule changes to Latin spellings
inside Greek speech. If 05 laughs as well as either, the Gem stops spelling
laughs at all and every script gets cleaner.

`06-named-noise-greek.wav` — the word «Γελάει» sits inside the speech. The
guide warns the English word "Sigh" is read aloud. Is the Greek one?

## 3. Does the speaker description leak into the audio

| File | |
|---|---|
| `07-role-noun.wav` | "A warm female teacher…" — **this repo's own test prompt** |
| `08-generic-noun.wav` | "A warm woman…" — what the guide requires |
| `09-stacked-adjectives.wav` | A full paragraph description |

**Listen for the word "teacher".** If it is audible in 07, the Greek smoke test
was never as clean as it looked, and every character brief in
`docs/CHARACTER-VOICES.md` has the same fault.

Then ask which of the three sounds most like a person you would learn from.

## 4. Shape

- `10-two-segment-beat.wav` — does the second half actually turn, or are both
  halves level?
- `11-trailing-description.wav` — "She smiles and walks away" sits after the
  final quote. **Is it spoken?** The estimator gave this the same length as
  `01`, which suggests it was not counted, but not that it was not said.

## 5. Speed — Tsika's whole trick

- `12-gabble-fast.wav` against `13-slow-deliberate.wav`.

**The estimator gave these the same length**, which is worth knowing before you
listen: if the model fills the time it is given, "far too fast" and "slows right
down" may come out closer than the words suggest. If they do sound the same,
Tsika's trick needs rethinking.

## 6. Can it be a dog — the one with real consequences

| File | |
|---|---|
| `14-bark-greek.wav` | `"Γαβ! Γαβ!"` |
| `15-bark-latin.wav` | `"Woof! Woof!"` |
| `16-bark-direction-only.wav` | Barks twice, then speaks |
| `17-whine-phonetic.wav` | A spelled whine |
| `18-whine-direction-only.wav` | Whines, nothing spelled |
| `19-growl.wav` | `"Γρρρρ."` |
| `20-happy-pant.wav` | Panting |

**If the dogs can bark in their own voices, barks stop being recordings.** A
library clip is the same bark every time and belongs to no one; a barked line
belongs to Σερίφης. That would change how the scripts are written.

## 7. Things that are probably not voice at all

- `21-doorbell.wav`, `23-bell-only.wav` — **no quoted text at all**, and the
  model produced 5.5s and 7.4s of something anyway. Whether that is a doorbell
  or a voice describing one is the question.
- `22-whistle.wav` — `"Φιουυυ!"` as speech.

These three are why `sfx/library` exists. If any of them genuinely works, that
is a real saving.

## 8. The registers the course actually needs

| File | For |
|---|---|
| `24-delighted.wav` | Καίτη |
| `25-grave-urgent.wav` | Σερίφης |
| `26-tiny-joy.wav` | Τσίκα |
| `27-frustrated-flat.wav` | Exasperation — the hardest to fake |
| `28-whisper.wav` | A confidence |
| `29-shout.wav` | Across a field, written in capitals |

None of these will be the finished voices — that needs your three reference
clips. What they show is how much of the character survives from the
description alone.
