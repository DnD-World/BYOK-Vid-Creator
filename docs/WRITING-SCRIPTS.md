# How to write a script for BYOK-Vid-Creator

Written for whoever is filling in scripts — including someone who never opens
the app, because bulk work happens in a spreadsheet.

---

## The one rule that matters

**One line per piece of speech, in the form `Name: text`.**

```
Καίτη: Καλημέρα! Σήμερα θα μιλήσουμε για τη σοκολάτα και τα σκυλιά.
Καίτη: Η σοκολάτα είναι δηλητήριο για τον σκύλο σου.
Σερίφης: Ακόμα και σε μικρή ποσότητα;
Καίτη: Ακόμα και σε μικρή ποσότητα.
```

Everything else in this document is detail. If you get this right, you have a
working script.

### The name has to match, exactly

The name before the colon must be the **same** as the speaker's name in the app's
Cast panel. Not similar — the same. Capital letters don't matter, but spelling
and accents do.

- Cast says `Καίτη`, script says `Καιτη` → **won't match** (missing accent)
- Cast says `Καίτη`, script says `ΚΑΊΤΗ` → matches (case is ignored)
- Cast says `Καίτη`, script says `Kaiti` → **won't match** (Latin letters)

A line whose name doesn't match a speaker has no voice to say it. Check the Cast
panel and copy the name from there rather than typing it.

---

## What each line becomes

One line is one **segment**, and a segment is the unit everything else is built
from:

- it becomes a piece of **spoken audio**, in that speaker's voice
- it becomes one or more **subtitles**, wrapped to fit the screen
- it becomes a **scene**, which is what a background clip is chosen for
- it decides **which character's mouth moves**, and when

So the length of your lines is a real editing decision, not just formatting.

**Short lines cut faster.** A line is one scene, and a scene gets one background
clip. Six short lines gives six background changes; two long ones gives two.

---

## Pauses and pacing

You do not write pauses. The app inserts them:

- a gap between two lines by the **same** speaker (default 120ms — a breath)
- a longer gap when the **speaker changes** (default 340ms — a beat)

Both are adjustable in the Narration panel, and they apply the next time you
generate. Blank lines in your script do nothing, so don't use them to space
things out.

To make a pause **inside** a line, use punctuation — a comma, a full stop, an
ellipsis. The voice engine responds to those.

---

## Punctuation does more than you'd think

Punctuation is the only expressive control you have, so use it deliberately.
There is no way to mark up emphasis, speed or emotion — the engines don't
support it, and that was decided rather than overlooked.

Punctuation drives three separate things:

1. **How the voice reads the line** — pauses, and rising pitch on a question.
2. **The character's eyebrows.** A `?` raises them. A `!` sharpens them.
3. **The character's head.** A question tilts it. An exclamation gives a small
   shake. A `...` lets it droop.

So `Ακόμα και σε μικρή ποσότητα;` and `Ακόμα και σε μικρή ποσότητα.` are not the
same line — the first one visibly asks.

**Write the punctuation you want performed.** If a line should land as a
warning, end it with a full stop, not an exclamation mark; if it should sound
alarmed, use the exclamation mark and expect the face to follow.

---

## Length and timing

There is no hard limit, but two soft ones are worth knowing:

- **Subtitles wrap at about 42 characters** per line by default. A very long
  sentence becomes a stack of subtitle lines that changes several times while
  one background clip plays.
- **Roughly 15 characters of Greek ≈ 1 second** of speech, as a rough planning
  figure. A 60-second video is somewhere near 900 characters of script. Use this
  to plan, not to be precise — the real timing comes from generating.

---

## Language

Set the **Language** in the Narration panel to match your script. It is one
setting for the whole script — you cannot mix Greek and English lines in one
video and have both read correctly.

Each speaker has their own voice, and a Greek voice reading English (or the
reverse) produces something that sounds wrong rather than something that fails
loudly. If a video needs both languages, make it twice.

---

## Writing for a spreadsheet

When scripts are written in bulk, one row is one video. Put the whole script in
a single cell, with a real line break between each line of speech
(<kbd>Alt</kbd>+<kbd>Enter</kbd> in Excel and Google Sheets — a plain
<kbd>Enter</kbd> moves to the next row and will split your video in two).

Keep the speaker names identical across every row. They are matched by text, so
one typo in one cell costs one silent line in one video, and that is exactly the
kind of mistake nobody notices until the render is done.

---

## A worked example

A 30-second warning video, two speakers:

```
Καίτη: Ξέρεις τι είναι πιο επικίνδυνο από ό,τι νομίζεις;
Σερίφης: Τι;
Καίτη: Η σοκολάτα. Είναι δηλητήριο για τα σκυλιά.
Σερίφης: Ακόμα και λίγη;
Καίτη: Ακόμα και λίγη. Εξαρτάται από το βάρος του σκύλου.
Καίτη: Αν φάει σοκολάτα, μην περιμένεις. Πάρε τον κτηνίατρο αμέσως.
```

Why it is written that way:

- **Six lines, so six scenes** — six chances for the background to change in
  thirty seconds, which is what keeps a talking-head video moving.
- **The short questions belong to the second speaker.** They cost almost no time
  but they hand the camera back and forth, and each one moves a different
  character's mouth.
- **The questions end in `;`** (the Greek question mark), so both the voice and
  the eyebrows perform them.
- **The last line is two sentences.** The full stop in the middle is a beat
  before the instruction, without spending a whole scene on it.

---

## Checklist before you generate

- [ ] Every line is `Name: text`
- [ ] Every name matches a speaker in the Cast panel exactly
- [ ] The Language setting matches the script
- [ ] Every speaker has a voice assigned
- [ ] Questions end in `;` (Greek) or `?` (English)
- [ ] No blank lines used as spacing

---

## Stage directions, for one line

A line can carry how it is delivered, in square brackets **before** the colon:

```
Kaiti: Το κόλπο είναι απλό.
Kaiti [quietly, like a secret]: Μην το πεις σε κανέναν.
Serifis [in a hurry]: Δεν έχουμε χρόνο.
```

**Before the colon, never after.** Everything after the colon is spoken exactly
as written, so a direction written there would be read out loud.

The direction is not part of the speech and never appears in the audio. It is
for DramaBox, whose entire interface is prose — the per-character paragraph in
`docs/CHARACTER-VOICES.md` says who someone is, and this says how this one line
goes. Engines without that control ignore it, and the line still says the right
words in the right voice.

Use it when the delivery is not obvious from the words. A script where every
line has one is a script that does not trust its own writing.

## Sounds

A bark is not speech. Writing `Γαβ!` as a line makes a synthetic human say the
word, so sounds are recordings, cued on a line of their own:

```
Kaiti: Πατάς το κλίκερ τη στιγμή ακριβώς που κάθεται.
[SFX: clicker-training]
Serifis: Τη στιγμή. Όχι δύο δευτερόλεπτα μετά.
```

The name is a file stem in `sfx/library` — `dog-bark-small`, `clicker-training`,
`collar-jingle` and so on. **An unknown name stops the render** rather than
being skipped: a cue is three words, and a silent skip means finding the missing
bark by watching ten minutes of video.

The sound plays at the start of the line it sits above. It is placed by segment
position rather than by timestamp, because when a script is written nobody knows
how long a line will take to say.

**A laugh is not a sound effect** — it is acting, and it belongs in a stage
direction (`Καίτη [γελάει]: ...`), where the voice performs it.

## English for machines, Greek for ears

**Only the spoken text is Greek.** The name before the colon, the stage
direction and the sound cue are all English, because all three are read by
machines and none of them reaches the audience.

```
Kaiti [quietly, like a secret]: Μην το πεις σε κανέναν.
[SFX: doorbell]
```

The name is never spoken and never drawn on screen — it is only how a line
finds its voice. A speaker can therefore be called `Καίτη` in the app and
`Kaiti` in the script; put the script's spelling in the cast member's
`aliases` and both match.

The direction goes to DramaBox, whose prompt is English prose. Nothing Greek is
sent to it except the words to be said.
