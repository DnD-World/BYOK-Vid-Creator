# Chatterbox — Setup & Writing for It

Chatterbox Multilingual v3 is the **quality voice engine**: more expressive
than Piper, supports Greek, and can clone a voice from about five seconds of
audio. MIT licensed, so it's fine for commercial and client work.

---

## Status on this machine: NOT set up yet

This is the one remaining manual step, and it needs you rather than me: it
downloads several gigabytes of model weights and asks which GPU mode to use.
Your RTX 3070 8 GB is comfortably enough.

### One-time setup

1. Clone the server (use GitHub Desktop, or a terminal in a folder of your
   choice):

```bash
git clone https://github.com/devnen/Chatterbox-TTS-Server.git
```

2. Run `start.bat` from inside that folder. **Choose Portable Mode** when it
   asks. Portable Mode embeds its own Python 3.10 — which is exactly the trap
   Piper fell into, and worth avoiding a second time.

3. First launch downloads the models. This takes a while; it is not stuck.

4. When its web UI opens, **select "Chatterbox Multilingual"** as the engine.
   This must be done once so it saves to `config.yaml` as the active engine —
   the app reads whatever that file says.

5. In BYOK-Vid-Creator → **Backend Settings**, set **Chatterbox install path**
   to the cloned folder (the one containing `server.py`). Leave the port at
   `8004` unless you changed it.

6. Press **Start Server** in the Chatterbox panel. First start is slow — model
   load can take minutes — so the app waits several minutes before giving up.

> These are folder paths, not API keys. Chatterbox is free and local; there is
> nothing to sign up for.

The app starts and stops the server for you after this, and releases GPU memory
on quit.

---

## Voices

**Predefined** — pick from the voices the server ships with. Simplest option.

**Cloned** — drop a reference audio file into the server's reference audio
folder, then pick it as a Clone voice. Guidelines that actually matter:

- **5–15 seconds** is the sweet spot. Longer is not better.
- **Clean audio only.** No music, no background noise, no reverb, one speaker.
- **Match the target language** where possible — a Greek reference gives better
  Greek than an English one.
- **Neutral, well-paced delivery** clones better than a dramatic performance.

Only clone a voice you have the right to use. A real person's voice needs their
permission.

### The two tuning knobs

In Backend Settings, wired to real values:

- **Exaggeration** — expressiveness. Below `0.7` is flatter and calmer; above
  `1.0` gets dramatic. Around `0.5` is a good documentary read; `1.0`+ suits
  character work.
- **CFG Weight** — how tightly it sticks to the reference voice. Higher is more
  faithful but can sound stiff; lower is looser and more natural.

Change one at a time and re-synthesise the same line — moving both at once
makes it impossible to tell which one helped.

---

## Writing scripts for Chatterbox

### SSML: assume no

Same answer as Piper, with one caveat. Chatterbox is a neural model that takes
plain text, and the local `devnen` server has **no documented SSML support**.
Some third-party hosted wrappers advertise SSML, but that is not this server.
Assume `<break>`, `<prosody>` and friends will be read aloud as literal
characters.

**Please verify this yourself once the server is running** — synthesise
`Hello <break time="1s"/> world` and listen. Thirty seconds of testing settles
it permanently. If it turns out the tags *are* honoured, tell me and I'll build
proper SSML support into the script-polish feature.

### What actually creates expression

Unlike Piper, Chatterbox has three real levers:

1. **The Exaggeration knob.** This is the big one — far more effective than
   anything you can do in the text.
2. **Punctuation**, same as Piper (see [PIPER.md](PIPER.md)). Ellipses and
   full stops carry the pacing.
3. **Emotional context in the wording itself.** Because it's a language-model
   backbone, it responds to *what the sentence actually says*. `"Oh no, not
   again."` reads with more resignation than `"Not again."` — the model infers
   delivery from the words. Piper cannot do this at all.

### Possibly supported: paralinguistic tags

Chatterbox **Turbo** documents inline tags like `[laugh]`, `[chuckle]` and
`[cough]`. Whether the Multilingual v3 build you'll be running honours them is
unconfirmed — worth testing alongside the SSML check above. If they work they're
excellent for the perky/sassy character voices.

### Practical differences from Piper

- **Longer sentences are fine.** Chatterbox holds prosody better, so you don't
  need Piper's aggressive sentence-splitting.
- **Still spell out numbers and symbols.** Same reason as Piper.
- **It's slow.** Seconds per line, not milliseconds. Draft and time your script
  with Piper voices, then switch the speakers to Chatterbox for the final
  render. The engine is per-speaker, so this is a dropdown change, not a rewrite.
- **Not bit-identical between runs.** Unlike Piper, regenerating can give a
  slightly different read. Once you have narration you're happy with, keep the
  WAV — don't regenerate casually before a final render.
