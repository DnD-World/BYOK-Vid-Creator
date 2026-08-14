#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Bring a GCP L4 box up with DramaBox on it, and answer the one question that
# decides whether any of this is worth doing.
#
# THE QUESTION IS GREEK, NOT "DOES IT INSTALL". The repo says English only. Ak
# heard it speak Greek and heard it well, but that was one sample from one
# place, and the entire plan — a hundred lessons, two courses — rests on
# whether the open weights do Greek reliably or whether that clip was a fluke.
# Everything else here is plumbing. If the Greek is bad, the plumbing does not
# matter and we want to know inside an hour, not after a batch.
#
# Runs as a startup-script, so its output lands in the serial console and in
# /var/log/dramabox-setup.log. It is idempotent: re-running skips what is done.
# ---------------------------------------------------------------------------
set -euo pipefail
exec > >(tee -a /var/log/dramabox-setup.log) 2>&1
echo "=== dramabox setup $(date -Is) ==="

MARKER=/opt/dramabox/.setup-complete
if [[ -f "$MARKER" ]]; then echo "already set up"; exit 0; fi

# --- driver ---------------------------------------------------------------
# The Deep Learning VM images ship the NVIDIA driver and CUDA already. Installing
# them by hand on a stock Ubuntu is the single biggest time sink in a setup like
# this, which is why the image matters more than the script.
if ! command -v nvidia-smi >/dev/null; then
  echo "!! no nvidia-smi — wrong image. Use a Deep Learning VM image."
  exit 1
fi
nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv

# --- code -----------------------------------------------------------------
apt-get update -qq && apt-get install -y -qq git ffmpeg python3-venv >/dev/null
mkdir -p /opt/dramabox && cd /opt/dramabox
[[ -d DramaBox ]] || git clone --depth 1 https://github.com/resemble-ai/DramaBox.git
cd DramaBox

python3 -m venv .venv
. .venv/bin/activate
pip install -q --upgrade pip
# The base requirements deliberately skip the RE-USE denoiser, which needs a
# Linux CUDA build and is optional. Left out on purpose: it is not on the path
# to answering the Greek question.
pip install -q -r requirements.txt

# --- weights --------------------------------------------------------------
# ~8.5 GB of DramaBox plus the Gemma-3-12B text encoder. Pulled once, cached in
# ~/.cache/huggingface, and the slowest step by far.
echo "=== fetching weights $(date -Is) ==="
python3 - <<'PY'
from huggingface_hub import snapshot_download
snapshot_download("ResembleAI/Dramabox")
print("weights ready")
PY

touch "$MARKER"
echo "=== setup complete $(date -Is) ==="
