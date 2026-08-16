# DramaBox, checked against the official documentation

Read 16 Aug 2026 from the [GitHub README](https://github.com/resemble-ai/DramaBox)
and the [Hugging Face model card](https://huggingface.co/ResembleAI/Dramabox).

Everything below is what the documentation says, and what it means for what we
have already built. Four things contradict our design.

---

## 1. It is documented as English only — and our course is Greek

> "English." DramaBox is currently designed for English-language generation only.

**This is the biggest open risk in the project and it is not a small one.**
Greek is not a supported language, is not on the model's tag list, and is
almost certainly thin in training data.

The repo's own note says Greek "works and costs the same as English", from
`tools/dramabox-greek-test.py`. But that test **produced a file** — the script
only reports `OK` or `FAILED`. Producing audio is not the same as producing
Greek that a paying student will accept, and nothing in the repo records anyone
listening to it.

**What to do, before any of the 72:** put on `greek-drama.wav` and
`greek-lesson.wav` and listen, as a Greek speaker. Judge pronunciation of
Greek-specific sounds (γ, χ, ντ, τζ), stress placement, and whether it holds up
across a whole minute rather than one sentence. That is Ak's call and nobody
else's — I cannot judge it.

If Greek is not good enough, the fallback is Piper, which already runs, already
speaks Greek, and cannot act. The course would be correct and flat rather than
wrong and charming.

## 2. One speaker per prompt — so a scene is not one generation

> The documentation structures prompts around one primary character.

The model card is explicit that generations are single-speaker scenes.

**This corrects what I wrote yesterday.** I proposed "scene in, one performance
out" on the strength of `tools/dramabox-greek-test.py`, whose test prompt has a
mother-in-law and a daughter-in-law in one string. That test only reported that
it did not crash. Two characters in one prompt, against this documentation, most
likely comes back in one voice.

**The correct unit is a SPEAKER RUN**: consecutive lines by the same character,
joined into one prompt. That still buys most of what per-line generation throws
away — a performance built across a turn instead of four disconnected reads —
without asking the model to do something it does not claim to do.

The turn-to-turn pause stays ours (`pauseTurnMs`), because the turn boundary is
now a boundary between generations.

## 3. Length is capped, and lower than a lesson

- Base LTX-2.3 audio was trained on clips **≤ ~20 seconds**.
- Up to **~45 seconds** stays usable; quality degrades past that.
- Long text is auto-chunked at sentence and quote boundaries, targeting
  **~37 seconds**, hard cap 45.

At our measured 135 words per minute, **37 seconds is about 85 spoken words**.
So a speaker run must be capped near 85 words, and chunked at a sentence
boundary above it. A five-minute lesson is dozens of generations however it is
sliced — the question was only ever whether they are per line or per run.

## 4. Laughs go INSIDE the quotes; sighs go outside

This is the one place our Gem instructions were actively wrong.

> Sounds inside quotes become actual audio: `"Hahaha"`, `"Hehehe"`, `"Mmmmm"`,
> `"Ugh"`, `"Argh"`, `"Ahhh"`, `"Hmm"`
>
> Stage directions outside quotes shape delivery: `She sighs deeply.`
> `A long pause.` `Her voice cracks.`

And the trap, stated outright in the model card:

> Avoid using words like "Sigh," "Gasp," or "Cough" within quotes — the model
> will speak the word literally.

So there are **three** categories, not two:

| Thing | Where it goes |
|---|---|
| A laugh, a hum, an "ugh" | **In the spoken text**, spelled phonetically |
| A sigh, a breath, a pause, a crack in the voice | **In the direction**, as English prose |
| The WORD "sigh" or "gasp" in the speech | Never — it gets read aloud |

Our instructions said "no written-out laughs in the speech", which is exactly
backwards for laughs. Fixed in `docs/SCRIPT-GEM.md`.

---

## Everything else the docs settle

**No timestamps.** Nothing in the API returns word or line alignments, so the
per-line timings visemes and subtitles need must be recovered by aligning the
audio against the script we already have. Confirms the whisperX plan.

**No documented seed.** `docs/CHARACTER-VOICES.md` claims `generate(...,
seed=42)` is byte-identical; the official documentation specifies no seed or
determinism control at all. Do not build anything on re-generating identical
audio. The narration cache already keyed on script and voice is the real
protection: a re-render reuses the WAV rather than making a new one.

**Watermarking is ON by default.** Every output is neurally watermarked with
Resemble Perth unless `watermark=False` / `--no-watermark` is passed. **Ak's
decision, not mine** — it is his course and his name on it. It is left on until
he says otherwise.

**Licence: LTX-2 Community.** Commercial use is free while the business is
under **$10M annual revenue**; above that it needs a commercial licence. That
clears our use comfortably. Worth recording because commercial terms are what
killed XTTS-v2 for this project — this is a far more generous version of the
same shape, not an absence of terms.

**Parameters worth setting deliberately:**

| | Default | Note |
|---|---|---|
| `cfg_scale` | 2.5 | Prompt adherence |
| `stg_scale` | 1.5 | Expressiveness |
| `duration_multiplier` | 1.1 | Breathing-room headroom |
| `ref_duration` | 10.0 | Range 3–30s; our clip spec asks for 10+, which fits |
| `gen_duration` | auto | 20–60s can be set for long scenes |

**Match the speaker description to the reference clip.** The docs say to match
gender and age. Our character paragraphs describe animals — Σερίφης is "a male
dog", Τσίκα "a tiny dog". The reference clips are human recordings, so the
paragraphs should also carry the human voice qualities the clip actually has,
or the description and the timbre pull against each other.

**Hardware.** ~24 GB VRAM, ~2.5 s per generation warmed on an H100. Our measured
8.5 s on a GCP L4 is 3.4× that, which is consistent and not a misconfiguration.

---

## What changes, in order

1. **Audition Greek by ear.** Everything else is wasted if this fails. Ak only.
2. **Fix the Gem's laugh rule** — done, `docs/SCRIPT-GEM.md`.
3. **Assemble by speaker run, capped at ~85 words**, not per line and not per
   scene. Open item 2 in `docs/HANDOFF.md`.
4. **Align the returned audio** to recover per-line timings; word-level
   subtitles come free.
5. **Decide on the watermark.**
