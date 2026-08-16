"""Every unsettled question about DramaBox, in one run.

Each group changes ONE thing and holds the rest fixed, so the difference between
two files IS the answer. Nothing here can be judged from the console — it prints
only whether generation crashed. The point is to listen.

WHY THESE. Every rule currently written into docs/SCRIPT-GEM.md was taken from
the prompting guide and has never been heard. If a pair sounds the same, the
rule it defends is not earning its place. If it sounds worse, the rule is wrong.

NO VOICE REFERENCE IS PASSED. The reference clips do not exist yet, so the model
picks a voice from the description — which makes this a fair test of how much
work the DESCRIPTION does, and an unfair test of what the finished characters
will sound like. Timbre comes later, from the clips.

Run on the L4 after tools/dramabox-vm-setup.sh:

    python3 dramabox-ambiguity-test.py
"""
import os, subprocess, sys, time

APP = "/opt/dramabox/DramaBox"
OUT = "/opt/dramabox/ambiguity"


def require_empty_gpu(max_used_mib: int = 500) -> None:
    """Refuse to start if something else still holds the card. See the same
    guard in dramabox-greek-test.py for the day this cost."""
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
    raise SystemExit(
        f"[gpu] REFUSING TO START: {used} MiB already held. "
        f"{smi('compute-apps=pid,used_memory')}  "
        "This is NOT the model being too large. Kill it, or reboot — a wedged "
        "CUDA context outlives the process that created it."
    )


require_empty_gpu()
sys.path.insert(0, APP)

from src.model_downloader import get_model_path, get_gemma_path

print("[fetch] weights…", flush=True)
t0 = time.time()
dit = get_model_path("transformer")
components = get_model_path("audio_components")
gemma = get_gemma_path()
os.environ["GEMMA_DIR"] = gemma
print(f"[fetch] {time.time()-t0:.0f}s", flush=True)

from src.inference_server import TTSServer

t0 = time.time()
server = TTSServer(checkpoint=dit, full_checkpoint=components,
                   gemma_root=gemma, device="cuda")
print(f"[load] {time.time()-t0:.0f}s", flush=True)

G = "Το κλίκερ δεν είναι μαγικό. Είναι απλώς ένας ήχος που σημαίνει κάτι."

TESTS = [
    # ---- 1. Is Greek usable at all -------------------------------------
    # The documentation says English only. Everything else here is wasted if
    # this fails. The control is the same sentence in English so the Greek is
    # judged against this voice at its best, not against an idea of it.
    ("01-greek", f'A young woman explains carefully, "{G}"'),
    ("02-english-control",
     'A young woman explains carefully, "The clicker is not magic. '
     'It is just a sound that means something."'),

    # ---- 2. Laughter ----------------------------------------------------
    # SCRIPT-GEM tells the Gem to spell noises in Greek letters. Every example
    # in the guide is Latin. 05 asks whether spelling is needed at all.
    ("03-laugh-greek", f'A young woman laughs as she says it, "Χαχαχα! {G}"'),
    ("04-laugh-latin", f'A young woman laughs as she says it, "Hahaha! {G}"'),
    ("05-laugh-direction-only", f'A young woman laughs warmly, "{G}"'),
    # The guide warns the English word "Sigh" is read aloud. Is the Greek one?
    ("06-named-noise-greek", f'A young woman speaks, "Γελάει. {G}"'),

    # ---- 3. Who the speaker is -----------------------------------------
    # 07 is THIS REPO'S OWN working test prompt. The guide says a profession is
    # spoken literally. If "teacher" is audible, that smoke test was never as
    # clean as it looked, and every brief in CHARACTER-VOICES.md shares the fault.
    ("07-role-noun", f'A warm female teacher explains clearly and patiently, "{G}"'),
    ("08-generic-noun", f'A warm woman explains clearly, "{G}"'),
    ("09-stacked-adjectives",
     'A bubbly, bright, delighted young woman who cannot contain her '
     f'enthusiasm explains, "{G}"'),

    # ---- 4. Shape of the prompt ----------------------------------------
    # The beat the guide recommends, which is what two consecutive lines by one
    # speaker assemble into. Does the second half actually turn?
    ("10-two-segment-beat",
     'A young woman explains carefully, "Το κλίκερ δεν είναι μαγικό." '
     'She leans in, suddenly serious, "Είναι απλώς ένας ήχος που σημαίνει κάτι."'),
    # The guide says anything after the last quote is ignored or read. Which?
    ("11-trailing-description", f'A young woman explains carefully, "{G}" She smiles and walks away.'),

    # ---- 5. Speed, which is Tsika's whole trick ------------------------
    ("12-gabble-fast",
     'A small woman gabbles it far too fast, all in one breath, '
     '"Μην τρώτε σοκολάτα! Μην τρώτε σταφύλια!"'),
    ("13-slow-deliberate",
     'A small woman slows right down, sheepish, '
     '"Συγγνώμη. Μην τρώτε σοκολάτα. Μην τρώτε σταφύλια."'),

    # ---- 6. Can it BARK? ------------------------------------------------
    # This decides whether barks are voice or sound effect. If the model barks
    # convincingly, the SFX library stops being needed for dog noises and the
    # dogs can bark IN CHARACTER, which no recording can do.
    ("14-bark-greek", 'A dog barks sharply, "Γαβ! Γαβ!"'),
    ("15-bark-latin", 'A dog barks sharply, "Woof! Woof!"'),
    ("16-bark-direction-only", f'A dog barks twice and then says, "{G}"'),
    ("17-whine-phonetic", 'A small dog whines, "Ίιιιι... μμμμ..."'),
    ("18-whine-direction-only", 'A small dog whines pitifully, "Θέλω να βγω έξω."'),
    ("19-growl", 'A large dog growls low, "Γρρρρ."'),
    ("20-happy-pant", 'An excited dog pants happily, "Χα χα χα χα."'),

    # ---- 7. Things that are probably NOT voice -------------------------
    # Expected to fail, and worth confirming rather than assuming: these are
    # why sfx/library exists. If any of them works, that is a real saving.
    ("21-doorbell", 'A doorbell rings twice.'),
    ("22-whistle", 'A man whistles sharply for his dog, "Φιουυυ!"'),
    ("23-bell-only", 'A small bell on a dog collar jingles.'),

    # ---- 8. Emotional range, which is the whole reason for this engine --
    ("24-delighted", f'A bright woman bursts out, delighted, "{G}"'),
    ("25-grave-urgent",
     'A serious man speaks fast and low, pressed for time, '
     '"Δεν έχουμε χρόνο. Άκου με μια φορά και κάν\' το σωστά."'),
    ("26-tiny-joy",
     'A tiny woman squeaks with joy, "Ααααα! Το λατρεύω αυτό!"'),
    # Exasperation — the hardest register to fake and the easiest to overdo,
    # and today the most honestly motivated line in the file.
    ("27-frustrated-flat",
     'A tired man, out of patience, says flatly, '
     '"Το εξήγησα ήδη τρεις φορές. Δεν άλλαξε τίποτα."'),
    ("28-whisper", f'A woman drops to a whisper, "{G}"'),
    ("29-shout", 'A woman shouts across a field, "Έλα εδώ! Τώρα!"'),
]

os.makedirs(OUT, exist_ok=True)
ok = fail = 0
t_all = time.time()

for name, prompt in TESTS:
    t = time.time()
    try:
        server.generate_to_file(prompt=prompt, output=f"{OUT}/{name}.wav")
        print(f"[{name}] {time.time()-t:.1f}s OK", flush=True)
        ok += 1
    except Exception as e:
        print(f"[{name}] FAILED after {time.time()-t:.1f}s: {type(e).__name__}: {e}",
              flush=True)
        fail += 1

print(f"\n{ok} generated, {fail} failed, {time.time()-t_all:.0f}s total.", flush=True)
print(f"WAVs in {OUT}. OK means a file exists and nothing more.", flush=True)
print("Listen in groups: 01/02, 03/04/05, 07/08/09, 14/15/16, 21/22/23.", flush=True)
