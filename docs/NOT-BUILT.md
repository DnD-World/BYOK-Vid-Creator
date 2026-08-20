# Everything considered and not built — 19 Aug 2026

A full account, from every conversation and every planning document, of what
was proposed for this app and is not in it. Each entry says what it was, why it
is not there, and whether that is settled or still open.

Four categories: **abandoned after trying**, **decided against**, **replaced by
something better**, and **simply not built yet**.

---

## 1. Tried, and abandoned

These were built or half-built and then taken out. They cost real time, which
is exactly why they are written down.

### Chatterbox — a third voice engine

Built, shipped, used, and removed on 18 Aug 2026. It was the "quality" voice
before DramaBox existed, and once DramaBox worked it was doing nothing that
DramaBox or Piper did not do better. Every extra engine multiplies what can
break: three engines meant three sets of settings, three failure modes and
three things to keep working. The engine, its store, its test panel, its
settings and its pickers are all gone.

### The rings waveform

Glowing tilted ellipses around each face. It was in the app for weeks and never
looked like the reference picture — it read as flat ovals rather than loops in
space. Removed 19 Aug 2026.

### The orbits waveform, all four versions

The second attempt at that same picture, built in a lab first, judged, tuned,
rendered — and called a failure the same day. Two attempts at one image is
enough before the course is made. Removed the same day they were added.

### The caption glass pill

A frosted pane behind the subtitles. Attempted for a full day. The avatar disc
version works and is kept; the caption version never got past a grey slab and
the final attempt broke rendering outright. Turned off in every preset. The
full account is in `docs/GLASS.md`, which is worth reading before anyone
reopens it.

### The "lines" waveform

Not a failure so much as a duplicate. It and "wave" ran the same drawing code
and differed by one setting — whether points were joined with straight segments
or a smooth curve. That is one look and a worse version of it. Removed.

### Coqui XTTS-v2

A voice-cloning engine considered early. Its commercial licence terms made it
unusable for paid client work. This is the reason DramaBox's licence was
checked so carefully — it is free below $10M of revenue, which clears us.

---

## 2. Decided against, and settled

Nobody should spend time on these again without a new reason.

### Azure Speech, Edge TTS, ElevenLabs

Cloud voice services. Cut as roadmap items. The project already has an
expressive voice and a fast one; each additional service is another account,
another key, another rate limit and another thing to break. ElevenLabs got as
far as a stub and was explicitly marked "don't build".

### Google Drive export

Same: a stub, marked "don't build". Videos are files on a disk; getting them
somewhere else is a solved problem that does not need to live in this app.

### Mixkit and Orange Free Sounds as in-app libraries

Sound effect sources. Neither has a public interface a program can use, and
Orange's files are licensed for non-commercial use only, which collides
directly with paid client work. Their terms also forbid the kind of linking the
app would have had to do.

### Responsive and mobile layout

The app is a Windows desktop program with a locked minimum window width. Making
its interface work at phone sizes would be work for a case that cannot happen.

### SSML

A markup language for controlling speech — pitch, rate, pauses. No engine here
supports it. The equivalent for DramaBox is the stage direction outside the
quotes, which is more expressive than SSML would have been.

### The Perth watermark

An inaudible mark inside every generated voice file, on by default. Turned OFF
on 18 Aug 2026: it identifies audio as machine-made to anyone with the detector
but carries no custom payload, so it cannot say the audio is ours. A mark that
cannot be ours has nothing to do for us.

### A "steps" setting for the voice engine

Documented in the engine's README as a command-line flag. It is not a parameter
of the function this app calls, and passing it killed fifteen generations on a
rented GPU. Not a decision so much as a fact, recorded so nobody adds it back.

### Making a voice faster by asking it to

There is no instruction that reliably speeds a voice up. Slowing down works;
speeding up does not. The pace setting does it properly instead, and Τσίκα's
fast-talking is written into the script — words run together, then repeated —
rather than requested.

---

## 3. Replaced by something better

### The title card and the image card

Three different things were once hiding under "intro/outro": text the app draws
itself, a finished picture held on screen, and a short video with its own
sound. The plan chose the picture and parked the video, because a video carries
audio and everything after it would have to shift by its length — and a
two-frame error there breaks lip-sync for a whole lesson.

Built on 19 Aug 2026 as the **video** version anyway, and the timing problem
went away entirely: the cards are joined onto the finished file afterwards
rather than placed inside it, so nothing inside the lesson moves at all. The
picture version is now unnecessary — a still image can be made into a
three-second video in seconds, and the app handles it the same way.

### whisperX

The original plan for recovering word timings from generated audio. Replaced by
torchaudio's forced aligner, which is a better fit: it is given the script it
already knows rather than asked to work out what was said, so it cannot invent
a word that was never spoken.

---

## 4. Not built yet — still open

Nothing here was rejected. It has not been reached.

### The batch spreadsheet

One row per lesson, feeding the existing runner. **This is the biggest single
gap between here and 72 finished videos**, and it is blocked on something
outside the code: the list of 72 sub-lessons does not exist in the repo. There
is nothing to build the spreadsheet against.

### Rendering a series in one process

Each video currently starts a browser and rebuilds the same bundle. Across 72
lessons that is roughly fifty minutes spent on nothing but starting up. Worth
half a day, and it is the only item on this list that meaningfully changes how
long the course takes to produce.

### Automating the GPU round trip

The app writes the two files the rented machine reads, and a person copies them
up, runs a script, brings the audio back and runs the aligner. It works and it
is entirely manual.

### The local media library

A folder of your own clips and sounds that the app indexes and lets you browse.
The folder exists and downloads land in it; nothing browses it. Loading one file
from a dialog is not the same feature.

### Sound in the preview

The preview window has no audio at all. Music, ducking and narration can only
be judged by rendering. Long-standing and never a priority, because the render
is the thing that ships.

### Narration cache eviction

Generated narration is cached by script and voice so a re-render reuses it.
Nothing ever deletes old entries, so the folder grows forever.

### Amplitude-driven jaw movement

Lip-sync for audio that has no script — driven by loudness rather than by
words. Would make it possible to attach any recording and get an approximate
mouth. Parked, and only useful for a case this course does not have.

### The "Dogs & Butterflies" sample project

A demonstration project that ships with the app so a new user has something to
open. Never built. It mattered when this was a product for other people; it
matters less now that it is a tool for one course.

### The second course

The soft-skills course, and the 18 written handouts that are not videos. Real
scope, not started, and correctly so — the dog course has to work first.

### Two orientations from one lesson

A job can be told to render tall or wide, but nothing renders both from one
run. Doing the same lesson for the LMS and for social currently means running
it twice.

### The mesh waveform

Built on 19 Aug 2026, judged promising, and deliberately used by nothing. It is
the one thing from the reference picture that landed near enough to be worth
returning to — after the 72 lessons, not before.
