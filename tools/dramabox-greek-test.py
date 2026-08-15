"""The one test that decides whether DramaBox is usable for these courses.

The repo says English only. Ak heard it speak Greek and heard it well, once. A
hundred lessons across two courses rest on which of those is true, so Greek goes
first and an English control goes second — without the control, bad Greek could
just as easily mean a bad prompt or a broken install.

Timing is logged per generation because the entire cost plan rests on one
documented figure (2.5s on an H100) and a guess at how much slower an L4 is.

THE PATHS ARE PASSED EXPLICITLY, AND THIS IS THE PART THE README GETS WRONG.
Its example calls TTSServer() with no arguments, which falls back to filenames
from Resemble's own machine — models/ltx-2.3-22b-dev.safetensors and friends —
that exist in no download and are in no manifest. A clean install fails with
FileNotFoundError on a file nobody ever shipped.

What the loader actually wants, mapped to what model_downloader.py actually
fetches:

  checkpoint      -> dramabox-dit-v1.safetensors        (the DiT transformer)
  full_checkpoint -> dramabox-audio-components.safetensors
                     (embeddings connector + text projection + audio VAE +
                      vocoder — which is what PromptEncoder, AudioConditioner
                      and the decoder all read from)
  gemma_root      -> unsloth/gemma-3-12b-it-bnb-4bit, pre-quantised to 4-bit

The 22B in that stray filename is also worth not panicking about: nothing
downloads a 22-billion-parameter model. DramaBox is the audio-only branch, and
the pieces above are ~8.5 GB in total.
"""
import os, subprocess, sys, time

APP = "/opt/dramabox/DramaBox"


def require_empty_gpu(max_used_mib: int = 500) -> None:
    """Refuse to start if something else is still holding the card.

    A crashed run left 18 GB occupied and kill -9 would not release it; only a
    reboot did. The next attempt then failed with "CUDA out of memory", which
    reads as THE MODEL IS TOO BIG FOR THIS CARD — a conclusion that would have
    sent the whole plan back to pricing a bigger GPU. It fit fine. The card was
    simply still full.

    So the check runs before anything loads, and names the real problem in the
    words of the real problem. On an unattended batch that is the difference
    between one clear line in a log and a wrong architectural decision.
    """
    def smi(query: str) -> str:
        return subprocess.run(
            ["nvidia-smi", f"--query-{query}", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=30,
        ).stdout.strip()

    try:
        used = int(smi("gpu=memory.used").splitlines()[0])
    except Exception as e:
        print(f"[gpu] could not read nvidia-smi ({e}) — continuing", flush=True)
        return

    if used <= max_used_mib:
        print(f"[gpu] {used} MiB in use — clear", flush=True)
        return

    apps = smi("compute-apps=pid,used_memory") or "no compute apps listed"
    raise SystemExit(
        "  ".join([
            f"[gpu] REFUSING TO START: {used} MiB already held by another process.",
            apps,
            "This is NOT the model being too large. Kill that process, and if",
            "kill -9 does not free the memory, reboot the instance — a wedged",
            "CUDA context outlives the process that created it.",
        ])
    )


require_empty_gpu()
sys.path.insert(0, APP)

from src.model_downloader import get_model_path, get_gemma_path

print("[fetch] weights…", flush=True)
t0 = time.time()
dit = get_model_path("transformer")
components = get_model_path("audio_components")
gemma = get_gemma_path()
print(f"[fetch] {time.time()-t0:.0f}s\n  dit={dit}\n  components={components}\n  gemma={gemma}", flush=True)

# PromptEncoder reads it from the environment rather than taking it as an
# argument, so it has to be set before TTSServer is constructed.
os.environ["GEMMA_DIR"] = gemma

from src.inference_server import TTSServer

t0 = time.time()
server = TTSServer(checkpoint=dit, full_checkpoint=components, gemma_root=gemma, device="cuda")
print(f"[load] {time.time()-t0:.0f}s", flush=True)

TESTS = [
    ("greek-drama",
     'A furious mother-in-law slams a wooden spoon onto the counter and shouts, '
     '"Ίντα πράμα είναι δαύτο που μας έφκιαξες;" '
     'Her daughter-in-law inhales shakily, fighting tears, and answers quietly, '
     '"Έκανα ό,τι καλύτερο μπορούσα... Δεν είναι τόσο χάλια."'),
    ("greek-lesson",
     'A warm female teacher explains clearly and patiently, '
     '"Το Swedish Vallhund είναι ένας σκύλος που ταξίδεψε με τους Βίκινγκς. '
     'Χίλια χρόνια πριν, πάνω στα ίδια πλοία."'),
    ("english-control",
     'A warm female teacher explains clearly and patiently, '
     '"The Swedish Vallhund sailed with the Vikings a thousand years ago."'),
]

for name, prompt in TESTS:
    t = time.time()
    try:
        server.generate_to_file(prompt=prompt, output=f"/opt/dramabox/{name}.wav")
        print(f"[{name}] {time.time()-t:.1f}s OK", flush=True)
    except Exception as e:
        print(f"[{name}] FAILED after {time.time()-t:.1f}s: {type(e).__name__}: {e}", flush=True)

print("[done]", flush=True)
