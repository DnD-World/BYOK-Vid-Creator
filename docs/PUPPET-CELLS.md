# Building Viseme Sheets From a Layered Puppet

The characters are drawn as a **layered puppet**, not as nine finished faces: a
base body with a blank face, plus separate PNGs for eyes, pupils, eyebrows,
nose and one mouth per phoneme. `tools/build-puppet-cells.mjs` composites those
into the nine cells `build-viseme-sheet.mjs` expects, so the app's existing
sprite pipeline is unchanged.

```bash
node tools/build-puppet-cells.mjs puppet/kaiti.json --preview /tmp/preview.png
node tools/build-viseme-sheet.mjs viseme-v2 viseme-sheets-v2
```

---

## The problem this works around

The layer PNGs were exported from Photoshop with **"Trim Layers" ON**, which
crops each one to its own bounding box and discards where it sat on the canvas.
The PSD is gone, so those offsets cannot be recovered.

They don't need to be. Every mouth was drawn in the same place on the same
face, so **one placement per category** — mouth, eyes, brows, nose — puts all
of them right. That is four numbers per character instead of thirty.

The catch is choosing an anchor that is stable across a set. For mouths that
is **top-centre**: the upper lip barely moves while the jaw drops, so the top
of the bounding box stays put where the centre does not. Anchoring an open
mouth and a closed mouth by their centres would leave the closed one floating
halfway up the face.

**If you ever re-export, untick "Trim Layers"** and every PNG comes out
full-canvas in its correct position, making all of this unnecessary.

---

## Config

```jsonc
{
  "character": "kaiti",
  "base":  "viseme/kaiti.png",   // body with a blank face
  "parts": "viseme",             // folder the layer files live in
  "out":   "viseme-v2",

  // Drawn in order, under the mouth.
  "layers": [
    { "file": "_0002_eyes.png",   "scale": 0.13,  "x": 532, "y": 558, "anchor": "center" },
    { "file": "_0000_pupils.png", "scale": 0.13,  "x": 532, "y": 570, "anchor": "center" }
  ],

  // Shared by all nine mouths; only `file` changes.
  "mouth": { "scale": 0.105, "x": 532, "y": 655, "anchor": "top-center" },

  // Viseme index -> which mouth PNG. Indices are the app's own order.
  "visemes": { "0": "_0007_Happy-M.png", "1": "_0026_Happy-A.png", "...": "..." }
}
```

`anchor` is `center`, or any combination of `top`/`bottom` and `left`/`right`.

**Tinting.** `saturation`, `hue` and `lightness` may be set on any layer. This
is how one mouth library serves three characters: the human mouths are pink,
and `"saturation": 0.3` turns them into a grey dog's mouth. It lands almost
entirely on the lips and tongue, because the teeth and gums are already close
to neutral.

---

## Tuning a new character

Render with `--preview` and look. Two rounds is usually enough.

Where a mouth may sit is often constrained by the base art — a beard, a short
muzzle, a collar. `zone-check` answers that concretely rather than by eye:
sample the base underneath the widest mouth's footprint and confirm it lands on
one flat region without crossing an outline.

Measured for the current cast, on the widest open mouth:

| | outline pixels underneath | verdict |
|---|---|---|
| Serifis (schnauzer, beard) | 0.0% | clear of the mustache, sits on the chin tuft |
| Tsika (chihuahua, short muzzle) | 0.0% | fits between nose and collar |

Tsika's muzzle leaves only ~55px between the nose and the collar line, which is
why her mouth is scaled smaller than the others. That is a property of the base
art, not a placement error — if she needs a bigger mouth, the base needs a
longer muzzle.
