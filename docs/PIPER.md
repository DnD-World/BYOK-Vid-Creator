# Piper — Setup & Writing for It

Piper is the **fast local voice engine**. No API key, no internet, no GPU
needed. It runs entirely on your machine.

---

## Status on this machine: ready

Already set up, nothing for you to do:

| What | Where |
|---|---|
| Dedicated Python | `piper-venv/Scripts/python.exe` (in the project folder) |
| Piper version | `piper-tts 1.6.0` |
| Voices | `piper-voices/` |

Installed voices:

- **`el_GR-joy-medium`** — Greek, female
- **`el_GR-rapunzelina-medium`** — Greek, female
- **`en_US-lessac-medium`** — English, US

Verified working: real Greek synthesis at 22050 Hz, mono, 16-bit.

### Why Piper has its own Python

Your `python` on PATH resolves to the **hermes-agent virtualenv**. Piper runs a
*long-lived server process* per voice, which held that environment's files open
and blocked hermes from updating until you killed it by hand.

The app now uses `piper-venv` exclusively and never touches any other
environment. **Don't point the Piper setting at a shared Python again** — that's
what caused it. If the field is ever blank, the value is:

```
./piper-venv/Scripts/python.exe
```

### Adding more voices

146 voices are available. To list Greek ones:

```bash
./piper-venv/Scripts/python.exe -m piper.download_voices 2>&1 | tr ' ' '\n' | grep el_GR
```

To install one into the app's voice folder:

```bash
./piper-venv/Scripts/python.exe -m piper.download_voices el_GR-rapunzelina-low --data-dir ./piper-voices
```

Then press **Scan** in Backend Settings. `-medium` is the quality/speed sweet
spot; `-low` is faster and rougher; `-high` files are large (130 MB+) and slower.

---

## Writing scripts for Piper

### SSML does not work. Neither do tags.

Being direct about this, because it changes how you write: **Piper has no SSML
support.** No `<speak>`, no `<break>`, no `<prosody>`, no `<emphasis>`. It takes
plain text. If you paste SSML in, the tags are read as literal characters or
mangled — you'll hear the angle brackets.

Same for bracket tags like `[laugh]` or `[pause]`. Piper has none.

**Punctuation is your entire toolkit.** That's not a limitation to work around
so much as the actual control surface.

### What genuinely changes the delivery

| You write | What you hear |
|---|---|
| `.` full stop | Longest pause, falling pitch. Your main pacing tool. |
| `,` comma | Short pause, pitch stays up |
| `...` ellipsis | Hesitant trailing pause — good for comic timing |
| `?` | Rising question intonation. Works well. |
| `!` | Slightly more energy. Subtler than you'd expect. |
| `—` em dash | Reads like a comma; use for an interruption feel |
| Line break | Treated as a sentence boundary |
| `ΚΕΦΑΛΑΙΑ` / `CAPS` | **Avoid.** Often spelled out letter by letter. |

### Rules of thumb

1. **Short sentences.** Piper's prosody degrades over long clauses. Two short
   sentences beat one long one, every time.
2. **Write pauses as punctuation, not as blank space.** Extra spaces and blank
   lines do nothing.
3. **Spell out numbers, symbols and abbreviations.** Write `25%` as
   `είκοσι πέντε τοις εκατό`, `€` as `ευρώ`, `Dr.` as `Doctor`. Piper's
   normalisation is basic and inconsistent across languages.
4. **Don't mix languages inside one line.** Each voice is single-language — a
   Greek voice reading an English word applies Greek phonetics. Put English
   lines on an English-voiced speaker instead.
5. **Read it aloud yourself first.** If you run out of breath, Piper will sound
   like it did too.

### Before / after

Too long, unreadable numbers, mixed language:

```
Νίκος: Τα σκυλιά χρειάζονται 2-3 ώρες άσκησης την ημέρα και αν δεν τις
πάρουν τότε γίνονται destructive και αρχίζουν να καταστρέφουν το σπίτι.
```

Rewritten for Piper:

```
Νίκος: Τα σκυλιά χρειάζονται δύο με τρεις ώρες άσκησης κάθε μέρα.
Νίκος: Και αν δεν τις πάρουν... αρχίζουν να καταστρέφουν το σπίτι.
```

Three changes, each doing real work: numerals spelled out, one long sentence
split in two, the English word replaced, and an ellipsis added for timing.

---

## When to use Piper vs Chatterbox

Use **Piper** when you want the video finished today: drafting, checking pacing,
testing timing, or any render where a clean neutral read is enough. It's fast
and completely reliable.

Use **Chatterbox** when the voice itself has to carry the video — more emotion,
more character, or a cloned voice. See [CHATTERBOX.md](CHATTERBOX.md).

You do **not** have to choose globally. The engine is set **per speaker**, so a
Piper narrator and a Chatterbox character can appear in the same script.
