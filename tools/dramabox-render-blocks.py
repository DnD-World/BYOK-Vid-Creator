"""Generate one WAV per script block, on the L4.

Reads /opt/dramabox/work/blocks.json:

    [{"id": "000", "prompt": "A grave man speaks evenly, \"…\"",
      "voice_ref": "serifis.wav"}, ...]

and writes /opt/dramabox/work/out/<id>.wav for each.

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

blocks = json.load(open(f"{WORK}/blocks.json", encoding="utf-8"))
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
    try:
        server.generate_to_file(
            prompt=b["prompt"],
            output=target,
            voice_ref=f"{WORK}/refs/{b['voice_ref']}",
            cfg_scale=2.5,
            stg_scale=1.5,
            # 1.1 is the documented default and it is what puts holes in the
            # audio: the duration is ESTIMATED from the text and then given ten
            # per cent headroom, and the surplus comes back as dead air. The
            # local squeeze cleans up what is left; this stops most of it being
            # generated in the first place.
            duration_multiplier=1.0,
            seed=42,
            ref_duration=20.0,        # 10 is the default; these clips are long
            denoise_ref=True,
            max_chunk_duration=45.0,
            target_chunk_duration=37.0,
            crossfade_ms=50.0,
        )
        print(f"[{b['id']}] {time.time()-t:.1f}s OK", flush=True)
        done += 1
    except Exception as e:
        print(f"[{b['id']}] FAILED {type(e).__name__}: {e}", flush=True)
        failed += 1

print(f"\n{done} generated, {failed} failed, {time.time()-t_all:.0f}s", flush=True)
