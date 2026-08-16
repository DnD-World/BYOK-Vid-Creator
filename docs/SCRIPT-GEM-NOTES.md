# Notes on the script Gem

`docs/SCRIPT-GEM.md` is the Gem's instructions and nothing else — it is meant to
be pasted whole. This is everything around it.

---

## Where the facts come from

Each sub-lesson row in the sheet names its own sources. The Gem is told to use
those and only those, and to write a gap below the `---` line rather than fill
it from general knowledge.

**No brief is written by hand.** If the Gem can read the notebook directly, that
is the whole mechanism. Worth checking in the product whether a Gem can be
pointed at a NotebookLM notebook — if it cannot, the fallback is to ask the
notebook for the facts on one sub-lesson and paste its answer, and that is a
step worth avoiding if the direct link exists.

The reason the rule is written so hard: **a confident wrong instruction about a
dog is the worst thing this project can produce.** It goes to owners with real
dogs. A thin lesson is recoverable; a wrong one is not.

## Length, from measured scripts

Two real scripts in this repo, timed against their own renders:

| Script | Words | Finished | Rate |
|---|---|---|---|
| `smoke.txt` | 61 | 26 s | 141 wpm |
| `swedish-vallhund.txt` | 1194 | 8 m 50 s | 135 wpm |

**135 words per minute**, pauses included. The Gem is given a word count rather
than a running time, because it cannot judge minutes and it can count words.

## Sound

Two different problems that are easy to confuse:

- **Laughs, gasps, sighs, sniffs are ACTING.** DramaBox performs them from a
  stage direction. No asset, no timing, nothing to place.
- **Barks, whistles, clickers are RECORDINGS.** They cannot come out of a voice
  — a line reading "Γαβ!" makes a synthetic human say the word.

So sounds are cued on their own line, `[ΗΧΟΣ: dog-bark-small]`, and the names
are the file stems in `sfx/library`. The cue carries a segment position rather
than a timestamp, because when a script is written nobody knows how long a line
will take to say; `runJob` turns it into a time once narration exists.

An unknown sound name **throws**. A cue is three words in a script and a silent
skip means finding the missing bark by watching ten minutes of video.

## What is still missing

The repo knows the shape of the course and not its content:

| Known | Not known |
|---|---|
| 5 series, 23 lessons, 72 videos | The 23 lesson titles |
| Series subjects | The 72 sub-lesson titles |
| 18 handouts exist and are not video | Which sub-lesson teaches what |

**The sub-lesson list is the input to all of this.**

## Which model

Not testable from inside this repo, so this is the durable rule rather than a
benchmark:

- **Pro-tier for the voices.** Character consistency and comic timing across
  hundreds of lines is what the larger model is for, and the cast paragraphs are
  the highest-leverage text in the project.
- **Flash-tier for volume**, if 72 scripts through a Pro model proves slow or
  costly.

The cheap experiment beats the opinion: write the same sub-lesson with both,
render both, and **listen**. One evening settles it for all 72. Judge voices out
loud, never on the page — this project's worst time sinks have all come from
judging something in the wrong medium.

## The script format survives, the assembly does not

Ak asked why synthesis happens in the app rather than in DramaBox. It does not
— the app never makes audio. It resolves which voice a line belongs to, calls
the engine, and stitches what comes back.

But it calls the engine **once per line**, and that is wrong for DramaBox. The
repo's own working test prompt is a whole scene: two characters, the acting
carried by prose around the quoted speech, one generation. Given one short line
and a three-word direction, a drama model has nothing to act across.

**The script format is unaffected.** A line's `[direction]` is exactly the prose
DramaBox wants around the speech, and consecutive lines join into one prompt:

```
Kaiti [laughing as she says it]: Κυριολεκτικά.
Serifis [flatly, already impatient]: Πόσο κυριολεκτικά;
```

becomes one prompt in which Kaiti laughs as she says her line and Serifis
answers flatly — with the pause between them chosen by the model, which is what
acting is, rather than by our fixed `pauseTurnMs`.

What that costs is per-line timings, which visemes and subtitles need and
line-by-line generation gives away for free. They have to be recovered by
aligning the audio against the script. That was always the plan — whisperX is
in the earliest handoff — and it upgrades subtitles from per-line to per-word
on the way. Tracked as open item 2 in `docs/HANDOFF.md`.

## Untested: laughs spelled in Greek letters

The Gem is told to spell noises phonetically inside the Greek speech —
`Χαχαχα`, `Μμμμ` — because the prompting guide is explicit that only phonetic
content inside the quotes produces an actual sound, and that a direction alone
does not.

**The guide's examples are all Latin** (`"Hahaha"`, `"Mmmmm"`), and DramaBox is
documented as English only. Whether `Χαχαχα` triggers a laugh, or gets read as
letters, is unknown and cannot be settled on paper.

Test it in the same session that auditions Greek at all — one generation with
`Χαχαχα` and one with `Hahaha` inside otherwise identical Greek lines. If the
Latin spelling wins, the Gem's rule changes to Latin noise-spellings inside
Greek speech, which is ugly on the page and invisible to the audience.

## Two formats, and why the brackets are not in the prompting guide

They are not supposed to be. There are **two different formats**, one layer
apart, and confusing them is easy.

**What the Gem writes** is our script file, which our parser reads:

```
Kaiti [laughs as she says it]: Χαχαχα! Ναι, το έκανε πάλι.
Serifis [sighs heavily first]: Το περίμενα.
```

**What DramaBox receives** is built from that by the app, in the guide's own
shape — speaker noun, verb, dialogue in double quotes, directions as plain
prose outside them:

```
A young woman laughs as she says it, "Χαχαχα! Ναι, το έκανε πάλι."
```

The name before the colon never reaches DramaBox at all; it is how a line finds
its voice. The bracket is stripped and becomes the verb phrase. Only the Greek
inside the quotes is spoken.

**The brackets exist because our file is line-based.** `Name: text` needs an
unambiguous place to put a direction, and after the colon is impossible —
everything there is spoken. That is a constraint of our format, not a claim
about DramaBox.

**This is also why directions must be present-tense verb phrases.** They are
about to be pasted into an English sentence. `[laughs as she says it]` becomes
a sentence; `[quietly, like a secret]` does not.

### The one thing the format cannot express

The guide's recommended beat puts a direction BETWEEN two pieces of speech:

```
"<dialogue>" <pronoun> <verb>, "<dialogue>"
```

A single bracket sits before one line and cannot go between two. **Two
consecutive lines by the same speaker assemble into exactly that shape**, which
is why `docs/SCRIPT-GEM.md` tells the Gem to let a speaker keep the floor for
two lines more often than one. It is not a stylistic preference; it is how the
recommended prompt gets built.
