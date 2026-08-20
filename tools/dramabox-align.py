"""When was each word actually said.

Forced alignment, not transcription. We already KNOW the Greek — it is the
script — so the job is only to find where each word landed in the audio. That is
a far easier and far more reliable problem than working out what was said, and
it cannot invent a word that was never spoken.

WHY THIS EXISTS. Everything downstream — subtitles, mouths, whose waveform
lights up — needs to know when each word happens, and until now that was
ESTIMATED by counting letters. An estimate drifts: one slow word early on pushes
everything after it, and by the end of a long line the subtitle runs a phrase
ahead of the voice. Ak saw that immediately and I spent an afternoon fixing the
wrong layers of it.

WHY MMS_FA. torchaudio's aligner covers 1100+ languages and reaches non-Latin
scripts through uroman, a universal romaniser. Greek is not called out by name
in the tutorial, which is exactly why this script prints what it found for the
first block — so the claim is checked rather than assumed.

Reads /opt/dramabox/work/align.json:

    [{"id": "000", "text": "Ουφ, ειλικρινά δεν την καταλαβαίνω."}, ...]

and writes /opt/dramabox/work/words.json:

    {"000": [{"w": "Ουφ,", "start": 0.31, "end": 0.68}, ...], ...}

Times are seconds from the start of that block's own WAV.
"""
import json
import os
import sys

import torch
import torchaudio

# One lesson's folder, given on the command line, or the shared one when it is
# not. A batch of seventy-two keeps each lesson's audio and word times apart.
WORK = sys.argv[1] if len(sys.argv) > 1 else "/opt/dramabox/work"
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

bundle = torchaudio.pipelines.MMS_FA
model = bundle.get_model().to(DEVICE)
tokenizer = bundle.get_tokenizer()
aligner = bundle.get_aligner()

try:
    from uroman import Uroman           # pip install uroman
    _uroman = Uroman()
    def romanize(text: str) -> str:
        return _uroman.romanize_string(text)
except Exception:                        # older releases ship a CLI only
    import subprocess
    def romanize(text: str) -> str:
        return subprocess.run(
            ["uroman.pl"], input=text, capture_output=True, text=True
        ).stdout


def normalize(word: str) -> str:
    """Romanized, lower case, letters only — what the tokenizer expects."""
    return "".join(c for c in romanize(word).lower() if c.isalpha() or c == "'")


blocks = json.load(open(f"{WORK}/align.json", encoding="utf-8"))
out = {}
skipped = []

for b in blocks:
    wav_path = f"{WORK}/out/{b['id']}.wav"
    waveform, sr = torchaudio.load(wav_path)
    # The aligner has one sample rate and one channel; the narration is stereo
    # at 48k, so it is converted here rather than anywhere the video can see.
    if waveform.shape[0] > 1:
        waveform = waveform.mean(dim=0, keepdim=True)
    if sr != bundle.sample_rate:
        waveform = torchaudio.functional.resample(waveform, sr, bundle.sample_rate)

    words = b["text"].split()
    normed = [normalize(w) for w in words]
    keep = [i for i, w in enumerate(normed) if w]
    if not keep:
        skipped.append(b["id"])
        continue

    with torch.inference_mode():
        emission, _ = model(waveform.to(DEVICE))
        tokens = tokenizer([normed[i] for i in keep])
        spans = aligner(emission[0], tokens)

    # One frame of the emission covers this much audio.
    ratio = waveform.shape[1] / bundle.sample_rate / emission.shape[1]
    timed = []
    for n, i in enumerate(keep):
        span = spans[n]
        timed.append({
            "w": words[i],
            "start": round(span[0].start * ratio, 3),
            "end": round(span[-1].end * ratio, 3),
        })
    out[b["id"]] = timed

    if b["id"] == blocks[0]["id"]:
        # THE CHECK. If Greek is not really supported this comes out as
        # nonsense — every word at 0.0, or timings that ignore the audio — and
        # it is visible here rather than three hours later in a video.
        print("[check] first block, first six words:", flush=True)
        for t in timed[:6]:
            print(f"    {t['start']:6.2f}s  {t['end']:6.2f}s  {t['w']}", flush=True)
        print(f"[check] audio is {waveform.shape[1]/bundle.sample_rate:.2f}s, "
              f"last word ends at {timed[-1]['end']:.2f}s", flush=True)

json.dump(out, open(f"{WORK}/words.json", "w", encoding="utf-8"), ensure_ascii=False)
print(f"\naligned {len(out)} blocks, skipped {len(skipped)}", flush=True)
if skipped:
    print("skipped (nothing romanizable):", ", ".join(skipped), flush=True)
