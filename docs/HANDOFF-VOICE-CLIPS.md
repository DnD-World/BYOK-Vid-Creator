# Handoff — making the three voice reference clips

**Self-contained on purpose.** You should be able to work from this alone, in
any tool, with no knowledge of the video app it feeds.

---

## What these clips are for

A text-to-speech model called **DramaBox** (Resemble AI, open weights) will
narrate a Greek dog-training course — 23 lessons, roughly 5 minutes each, plus
short promos. Three recurring characters speak in every lesson.

DramaBox clones a voice from a **single short reference clip**. It then makes
that voice say anything, with the emotion and pacing controlled separately by a
written stage direction. So each character needs exactly one good clip, made
once, used for the whole course.

**Why cloning rather than describing:** a described voice is re-imagined for
every line and drifts — the same character sounds different in lesson 1 and
lesson 40. A cloned voice is fixed. Over a course that runs for months, viewers
notice drift.

---

## THE RULE THAT MATTERS MOST

**Record the voice, not the mood.**

The clip supplies **timbre** — the physical identity of the voice: pitch, grain,
resonance, accent. The written prompt supplies the **performance** — excitement,
urgency, baby talk, whatever the line needs.

If you record Καίτη already shrieking with delight, that shriek is baked into
every line she ever speaks, including the calm ones. You cannot subtract it
later.

So: record each character **speaking normally**, in their own voice, at a
conversational energy. Neutral. The acting is added afterwards by the model.

If a character's *identity* includes something structural — Τσίκα is genuinely
tiny and high-pitched, that is not a mood — that belongs in the clip. The test
is: would this still be true if the character were reading a shopping list? If
yes it is timbre, put it in the clip. If no it is performance, leave it out.

---

## The three characters

All three speak **standard Greek**. Not Cretan, not regional.

### 1. Καίτη — human woman

The trainer and host. A young woman, warm, likeable, the person explaining
things. In the finished lessons she is bubbly and over-the-top enthusiastic —
**but do not perform that in the clip.** Record her as a pleasant, natural young
woman's speaking voice.

- Adult female, youthful, mid-range pitch
- Clear, unstrained, friendly
- No shouting, no giggling, no sing-song

### 2. Σερίφης — male dog

A serious, dignified dog. In the lessons he speaks quickly and urgently, because
the premise is that he is astonished humans can understand him and expects it to
stop working any moment. **Do not perform the urgency.**

- Adult male, lower pitch, some weight and gravel to it
- Measured, grounded, believable as an authority
- Not a cartoon growl, not a "movie trailer" voice — a real male voice

### 3. Τσίκα — female chihuahua

A tiny dog. In the lessons she is relentlessly, excessively cheerful and
sometimes speed-talks. **Do not perform the cheerfulness or the speed.**

- Female, **noticeably high-pitched and small-sounding** — this IS timbre, keep it
- Light, thin, bright — a small voice, not a shouted one
- High, but not a screech, and not distorted. She has to be listenable for five
  minutes at a time.

The pitch is the one place where processing is expected — pitch-shifting a
natural voice up is fine as long as it stays clean and doesn't turn robotic or
chipmunk-artefacted.

---

## Technical specification

| | |
|---|---|
| **Length** | 12–20 seconds of *continuous speech*. Only the first ~10s is read, so anything under 12s risks being partly silence. |
| **Format** | WAV, uncompressed. Not MP3 — it will be re-encoded downstream and MP3 artefacts compound. |
| **Sample rate** | 44.1 kHz or 48 kHz, mono |
| **Speakers** | **Exactly one.** Two voices in a clip average into a voice that is neither. |
| **Content** | Ordinary connected Greek sentences. Not word lists, not counting. |

### What ruins a clip

- **Any second voice**, even faintly in the background
- **Music or effects** under the speech
- Long silences, breaths at the start, or a fade-in — the first 10 seconds are
  all that is read, so wasting three of them on silence throws away a third of
  the reference
- Heavy room echo, or obvious noise-reduction artefacts (a bit of clean room
  tone is far better than aggressive denoising)
- Clipping or distortion — record with headroom, peaks around -6 dB
- Reading in an unnatural "announcer" rhythm

### Suggested content to record

Anything ordinary works. Something like:

> Καλησπέρα, με λένε [όνομα] και σήμερα θα μιλήσουμε για τους σκύλους.
> Είναι κάτι που με απασχολεί πολύ, γιατί κάθε σκύλος μαθαίνει με τον δικό του
> τρόπο. Θα δούμε μαζί τι λειτουργεί και τι όχι.

Natural, connected, no strong emotion. Roughly 15 seconds when read normally.

---

## Delivery

Three files, named exactly:

```
kaiti.wav
serifis.wav
tsika.wav
```

## How they will be checked

Each clip gets used to generate the same test line. What we listen for:

1. **Is it the right voice** — does it sound like the character?
2. **Is it stable** — generate the same line twice and it should be recognisably
   the same person.
3. **Does the acting land on top** — a bubbly stage direction should make Καίτη
   bubbly *without* changing who she is.

If a clip fails, it is almost always length (too much silence in the first 10s),
a second voice, or a performance baked in that fights the stage direction.

---

## Context, if useful

The course structure these will narrate:

- **100 series** — how a dog thinks, learns, and is socialised (3 lessons)
- **200 series** — the training toolkit: clicker, timing, luring, shaping (5)
- **300 series** — obedience, walking, manners, social life (4)
- **400 series** — problems: toilet, chewing, barking, humping, fear, alone-time (6)
- **500 series** — breed groups and why genes matter (5)

Twenty-three lessons, then a second course on professional soft skills using the
same three voices.
