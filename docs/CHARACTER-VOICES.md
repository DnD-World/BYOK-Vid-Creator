# The cast, as DramaBox hears them

> **⚠ THIS FILE IS FOR THE WRITER, NOT THE ENGINE. Nothing here is sent
> anywhere.** What the engine actually receives is settled and lives in two
> places: the opening phrases in `docs/SCRIPT-GEM.md`, and the per-character
> settings in the app's Cast panel.
>
> | Character | Opening phrase | Reference clip |
> |---|---|---|
> | Καίτη | `A bright woman` | `kaiti.wav` (and `kaiti-babytalk.wav`) |
> | Σερίφης | `A grave man` | `serifis.wav` |
> | Τσίκα | `A tiny woman` | `tsika.wav` |
>
> **THE PARAGRAPHS BELOW CONTRADICT THE OFFICIAL PROMPTING GUIDE. Never paste
> one into a script.** Read `docs/DRAMABOX.md` first.
>
> The guide requires a **generic noun with at most one adjective** — "A man",
> "A weary woman" — and names two of the things below as its most common
> mistakes: **stacking adjectives**, and **using a profession as the speaker
> description**, because a profession is *spoken literally*. "The human
> teacher" would be read out.
>
> The personality belongs in the **verb attached to the speech**, not in the
> speaker noun. What survives below is the CHARACTERISATION — who these three
> are, how they relate, what each is for. What must be rewritten is the shape
> of the prompt itself.
>
> Rewriting these is the first job once the Greek audition passes, and it must
> be done by ear against real generations, not on paper.

DramaBox has no voice settings. There is no dial for "enthusiastic" and no
dropdown of speakers — **the prompt is the whole interface.** Everything about
who is speaking and how travels as prose, and none of that prose appears in the
audio.

So a character here is not a config object. It is a paragraph, and the paragraph
below is prepended to every line that character speaks. Getting these right is
the single highest-leverage text in the project: change one word here and a
hundred lessons change with it.

Written 15 Aug 2026 from Ak's description. **Not yet auditioned** — these are
the starting drafts to test, not settled voices.

---

## Καίτη — the human

> A bubbly young woman speaks with bright, infectious enthusiasm, her voice
> lifting and tumbling over the words as though she cannot wait to get them out.
> She is delighted by what she is explaining and it shows in every sentence —
> she gasps, she laughs, she stresses words far more than she needs to.

**When she talks to Τσίκα**, she drops into open baby talk — softer, higher,
sing-song, the way anyone sensible talks to a small dog:

> She softens into a warm sing-song, the voice people use for a very small dog,
> stretching her vowels and cooing between words.

**Why over-the-top is safe here.** Ak asked for it explicitly, and the risk it
usually carries — grating over a long runtime — is offset by her sharing every
lesson with two other voices. She is the top of the dynamic range, not the whole
of it.

## Σερίφης — the serious dog

> A male dog speaks with grave, careful authority, and underneath it a barely
> contained astonishment that he is being understood at all. He talks quickly,
> pressing on with what matters, like a man who knows the line is about to drop.
> He does not joke. He is not unkind — he simply has very little time.

**The premise is doing real work.** He is amazed humans can understand him and
in a hurry before the translator wears off. That is why he is fast without being
panicked, and why he never wastes a sentence — the urgency has a reason, so it
reads as character rather than as a rushed read.

## Τσίκα — the chihuahua

> A tiny female dog speaks in a high, bright, almost squeaking voice, radiating
> a joy that is slightly too much for whatever is being discussed. She is
> delighted by everything, including bad news. Her cheerfulness never drops,
> even when the subject is serious.

**Her one trick, and it is a device rather than a voice.** She sometimes says
something far too fast, catches herself, and repeats it at a normal pace. That
is the app's emphasis mechanism, and it is written into the SCRIPT rather than
the voice:

```
Τσίκα: ΜηντρώτεσοκολάταΜηντρώτεσταφύλια!
Τσίκα: ...Συγγνώμη. Μην τρώτε σοκολάτα. Μην τρώτε σταφύλια.
```

Reserve it for the two or three things per lesson that genuinely deserve saying
twice — chocolate, grapes, letting a dog stop and sniff instead of being marched
round the block. Used on everything it stops meaning anything.

**She fronts the promos.** Shortest, brightest, most quotable voice of the three.

---

## The house tone

From skilitsa.com: **sassy, casual, funny.** Real information delivered by
someone enjoying themselves. Not a textbook read aloud, and not a lecture — the
site's own breed pages are the reference for how far the humour goes and where
it stops.

The line that matters: the joke never costs the fact. A lesson about grapes is
allowed to be funny and is not allowed to be unclear.

---

## Settled, 15 Aug 2026

**Standard Greek**, not Cretan. The dialect in the test clip was incidental to
that script. Neutral travels further for a paying LMS audience.

**Baby talk is one-directional.** Καίτη coos at Τσίκα; Τσίκα answers in her own
voice and does not appear to notice she is being talked down to. That is the
joke, and it only works if she never plays along.

**Voices are CLONED, not prompted.** This was a real question and the code
answers it:

- `generate(..., seed=42)` — generation is seeded, so the same prompt with the
  same seed is byte-identical. Auditioning two versions of a character paragraph
  is therefore a fair test.
- But the seed fixes the NOISE, not the speaker. Every line of dialogue is
  different text, so a prompted voice is re-imagined line by line and drifts
  across a course.
- The repo settles it itself: `generate_long` passes "same voice reference +
  seed for every chunk". If a seed alone held a voice steady, the reference
  would be redundant.

### What a reference clip needs

- **10+ seconds.** `ref_duration` defaults to 10.0 and only that much is read.
- **One speaker. Nothing else.** No music, no second voice, no overlap — two
  people in a clip averages into a voice that is neither.
- **Neutral delivery is fine, and probably better.** The reference supplies
  TIMBRE; the prompt supplies the acting. Recording Καίτη already shrieking with
  delight bakes a performance into every line she ever speaks, including the
  calm ones. Record the voice, not the mood.
- Clean and close. There is a denoiser (`_denoise_voice_ref`, via nvidia/RE-USE)
  but a clean clip beats a repaired one.

Three clips needed: Καίτη, Σερίφης, Τσίκα. Ak is making them in Voicemod.
