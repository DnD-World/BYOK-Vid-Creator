"""Generate one WAV per script block, on the L4.

Reads /opt/dramabox/work/blocks.json, written by tools/make-blocks.mjs:

    [{"id": "000", "prompt": "A grave man speaks evenly, \"…\"",
      "voice_ref": "serifis.wav",
      "params": {"stg_scale": 1.8, "duration_multiplier": 0.95}}, ...]

and writes /opt/dramabox/work/out/<id>.wav for each.

`params` is optional and partial. Whatever it does not name falls back to
DEFAULTS below, so a block with no params generates exactly what every block
generated before this existed.

ONE GENERATION PER BLOCK, not per line. A block is one character's turn, and
the whole point of this engine is that it acts across a turn — calm setup, then
the emotional payoff. Splitting a turn into separate generations throws that
away and glues the pieces back together with a fixed pause, which is what the
previous engine did because it had nothing to lose.

The voice reference is passed on every call and the seed is fixed, so the same
character sounds like the same character in lesson 1 and lesson 40. That is the
whole reason the clips exist.
"""
import json
import os
import subprocess
import sys
import time

APP = "/opt/dramabox/DramaBox"
WORK = "/opt/dramabox/work"


def require_empty_gpu(max_used_mib: int = 500) -> None:
    try:
        used = int(subprocess.run(
            ["nvidia-smi", "--query-gpu=memory.used", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=30,
        ).stdout.strip().splitlines()[0])
    except Exception as e:
        print(f"[gpu] could not read nvidia-smi ({e}) — continuing", flush=True)
        return
    if used > max_used_mib:
        raise SystemExit(
            f"[gpu] REFUSING TO START: {used} MiB already held by another process. "
            "This is NOT the model being too large — kill it, or reboot if kill -9 "
            "does not free it."
        )
    print(f"[gpu] {used} MiB in use — clear", flush=True)


require_empty_gpu()
sys.path.insert(0, APP)

from src.model_downloader import get_model_path, get_gemma_path  # noqa: E402

gemma = get_gemma_path()
os.environ["GEMMA_DIR"] = gemma
dit = get_model_path("transformer")
components = get_model_path("audio_components")

from src.inference_server import TTSServer  # noqa: E402

t0 = time.time()
server = TTSServer(checkpoint=dit, full_checkpoint=components,
                   gemma_root=gemma, device="cuda", dtype="bf16",
                   compile_model=False, bnb_4bit=True)
print(f"[load] {time.time()-t0:.0f}s", flush=True)

# Every one of these was a literal in the call below, which meant one setting
# for the whole cast. They are the same numbers; what changed is that a block
# can now override any of them, per character, from the job file.
DEFAULTS = {
    "cfg_scale": 2.5,           # prompt adherence
    "stg_scale": 1.5,           # expressiveness — the nearest thing to a
                                # "how much acting" dial
    # 1.1 is the documented default and it is what puts holes in the audio: the
    # duration is ESTIMATED from the text and then given ten per cent headroom,
    # and the surplus comes back as dead air. Below 1.0 is the only real speed
    # control the engine has — the model fills the time it is given.
    "duration_multiplier": 1.0,
    "seed": 42,                 # fixes the noise, not the speaker
    "ref_duration": 20.0,       # 10 is the default; these clips are long
    "denoise_ref": True,
    "max_chunk_duration": 45.0,
    "target_chunk_duration": 37.0,
    "crossfade_ms": 50.0,
    # OFF, decided 18 Aug 2026. Resemble Perth is inaudible and marks the audio
    # as machine-made to anyone with the detector, but carries no custom
    # payload — it cannot say the audio is OURS. The engine default is on, so
    # this is a deliberate departure.
    "watermark": False,
}

# Settings the engine is happy to decide for itself. Passing these AT ALL is a
# choice, so they are absent from DEFAULTS and only forwarded when a block
# actually names one: rescale_scale defaults to "auto" and gen_duration to the
# estimate from the text, and neither has any business being pinned by us.
OPTIONAL = {"rescale_scale", "gen_duration"}

# WHICH OF THESE THE FUNCTION ACTUALLY TAKES IS CHECKED, NOT ASSUMED.
#
# The names come from the README and the model card, and some of them are
# documented as command-line flags rather than arguments to this function —
# `steps` and `watermark` in particular. An unsupported keyword is a TypeError
# on the FIRST block, which on a rented GPU means paying for a model load and
# getting nothing. So the signature is read once and anything it does not
# accept is reported and dropped, loudly, before the run starts.
import inspect  # noqa: E402

# EVERY function the call passes through, not just the first one.
#
# Checking generate_to_file alone was worse than not checking: it takes
# **kwargs and hands them down, so the check saw "accepts anything", passed
# `steps` through, and generate() rejected it — fifteen generations failed
# after the model had loaded. `steps` is a command-line flag in the README and
# not a parameter of this API at all, which is exactly the kind of thing this
# is supposed to catch.
ACCEPTED = set()
for fn in (server.generate_to_file, server.generate_long, server.generate):
    try:
        ACCEPTED |= set(inspect.signature(fn).parameters)
    except (TypeError, ValueError):
        pass
TAKES_KWARGS = False

blocks = json.load(open(f"{WORK}/blocks.json", encoding="utf-8"))

unknown = {k for b in blocks for k in b.get("params", {})} - set(DEFAULTS) - OPTIONAL
if unknown:
    raise SystemExit(
        f"[params] unknown setting(s) in blocks.json: {sorted(unknown)}. "
        "A misspelled setting would otherwise be dropped silently and the "
        "generation would look fine and sound like the default."
    )

out_dir = f"{WORK}/out"
os.makedirs(out_dir, exist_ok=True)

done = failed = 0
t_all = time.time()

for b in blocks:
    target = f"{out_dir}/{b['id']}.wav"
    if os.path.exists(target):        # resume after a disconnect
        done += 1
        continue
    t = time.time()
    params = {**DEFAULTS, **b.get("params", {})}
    if not TAKES_KWARGS:
        dropped = sorted(set(params) - ACCEPTED)
        if dropped:
            print(
                f"[params] generate_to_file does not accept {dropped} — "
                "dropping them. THEY WILL HAVE NO EFFECT ON THIS RUN.",
                flush=True,
            )
            params = {k: v for k, v in params.items() if k in ACCEPTED}
    try:
        server.generate_to_file(
            prompt=b["prompt"],
            output=target,
            voice_ref=f"{WORK}/refs/{b['voice_ref']}",
            **params,
        )
        # Say what was actually applied. A setting that travelled from the job
        # file and then quietly did not arrive is exactly the kind of silent
        # success that has cost this project four days.
        changed = {k: v for k, v in params.items() if v != DEFAULTS.get(k)}
        note = f" {changed}" if changed else ""
        print(f"[{b['id']}] {time.time()-t:.1f}s OK{note}", flush=True)
        done += 1
    except Exception as e:
        print(f"[{b['id']}] FAILED {type(e).__name__}: {e}", flush=True)
        failed += 1

print(f"\n{done} generated, {failed} failed, {time.time()-t_all:.0f}s", flush=True)
