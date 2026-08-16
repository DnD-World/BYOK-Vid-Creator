"""Every unsettled question about DramaBox, in one run.

Each pair below changes ONE thing and holds everything else fixed, so the
difference in the output is the answer. Listening is the whole point — nothing
here can be judged from the console, which prints only whether generation
crashed.

Run on the L4 after tools/dramabox-vm-setup.sh, same as the Greek smoke test:

    python3 tools/dramabox-ambiguity-test.py

Then pull the WAVs down and listen to them in pairs.

WHY THESE ELEVEN. Every one of them is a rule currently written into
docs/SCRIPT-GEM.md that was taken from the prompting guide and has never been
heard. If a pair comes out the same, the rule it defends is not earning its
place. If it comes out worse, the rule is wrong.
"""

import os
import time

# --- the same bootstrap as tools/dramabox-greek-test.py --------------------
from pathlib import Path
import sys

sys.path.insert(0, "/opt/dramabox")
from dramabox_paths import get_model_path, get_gemma_path  # noqa: E402

dit = get_model_path("dit")
components = get_model_path("audio_components")
os.environ["GEMMA_DIR"] = get_gemma_path()

from src.inference_server import TTSServer  # noqa: E402

t0 = time.time()
server = TTSServer(
    checkpoint=dit,
    full_checkpoint=components,
    gemma_root=get_gemma_path(),
    device="cuda",
)
print(f"[load] {time.time()-t0:.0f}s", flush=True)

GREEK = "Το κλίκερ δεν είναι μαγικό. Είναι απλώς ένας ήχος που σημαίνει κάτι."

TESTS = [
    # 1-2. THE ONE THAT DECIDES EVERYTHING. Is Greek usable at all? The model
    # is documented English-only. The control is the same sentence in English,
    # so the Greek can be judged against what the voice sounds like at its best
    # rather than against an idea of it.
    ("01-greek-plain",
     f'A young woman explains carefully, "{GREEK}"'),
    ("02-english-control",
     'A young woman explains carefully, "The clicker is not magic. '
     'It is just a sound that means something."'),

    # 3-4. THE LAUGH. docs/SCRIPT-GEM.md tells the Gem to spell noises in Greek
    # letters. Every example in the prompting guide is Latin. If 04 laughs and
    # 03 spells out letters, the instruction has to change.
    ("03-laugh-greek-letters",
     f'A young woman laughs as she says it, "Χαχαχα! {GREEK}"'),
    ("04-laugh-latin-letters",
     f'A young woman laughs as she says it, "Hahaha! {GREEK}"'),

    # 5. A DIRECTION WITH NO PHONETIC CONTENT. The guide says a direction alone
    # does not reliably make a sound. If this laughs anyway, the Gem can stop
    # spelling laughs and the scripts get much cleaner.
    ("05-laugh-direction-only",
     f'A young woman laughs warmly, "{GREEK}"'),

    # 6. THE NAMED NOISE. Ak's scripts are Greek, and the guide's warning that
    # "Sigh" gets read aloud is about English. Does the GREEK word for laughing
    # get read out too?
    ("06-named-noise-greek",
     f'A young woman speaks, "Γελάει. {GREEK}"'),

    # 7-8. THE ROLE NOUN. The guide says a profession is spoken literally, and
    # this repo's own working test prompt says "A warm female teacher". If 07
    # says the word "teacher", that test was never as clean as it looked — and
    # every character paragraph in docs/CHARACTER-VOICES.md has the same fault.
    ("07-role-noun",
     f'A warm female teacher explains clearly and patiently, "{GREEK}"'),
    ("08-generic-noun",
     f'A warm woman explains clearly, "{GREEK}"'),

    # 9. STACKED ADJECTIVES, the guide's other named mistake, against 08.
    ("09-stacked-adjectives",
     'A bubbly, bright, delighted young woman who cannot contain her '
     f'enthusiasm explains, "{GREEK}"'),

    # 10. THE TWO-SEGMENT BEAT the guide recommends, which is what a
    # two-line speaker run assembles into. Judge whether the second segment
    # actually turns, or whether both come out level.
    ("10-two-segment-beat",
     'A young woman explains carefully, "Το κλίκερ δεν είναι μαγικό." '
     'She leans in, suddenly serious, "Είναι απλώς ένας ήχος που σημαίνει κάτι."'),

    # 11. TRAILING DESCRIPTION. The guide says anything after the last closing
    # quote is ignored or read. Our assembler must never append — this is how
    # we find out which of the two it does.
    ("11-trailing-description",
     f'A young woman explains carefully, "{GREEK}" She smiles and walks away.'),
]

out_dir = Path("/opt/dramabox/ambiguity")
out_dir.mkdir(exist_ok=True)

for name, prompt in TESTS:
    t = time.time()
    try:
        server.generate_to_file(prompt=prompt, output=str(out_dir / f"{name}.wav"))
        print(f"[{name}] {time.time()-t:.1f}s OK", flush=True)
    except Exception as e:
        print(f"[{name}] FAILED after {time.time()-t:.1f}s: {type(e).__name__}: {e}",
              flush=True)

print(f"\nWAVs in {out_dir}. OK means a file exists, nothing more.", flush=True)
print("Listen to them in pairs: 01/02, 03/04/05, 07/08/09.", flush=True)
