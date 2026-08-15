# Glass — what works, what failed, and why

Written 15 Aug 2026, after roughly a day on it. Recorded so nobody spends
another one rediscovering the same walls.

## Where it landed

| | |
|---|---|
| **Avatar disc** | **Works.** Kept. |
| **Caption pill** | **Failed.** Turned off in the built-in presets. |

## The disc works, and not by the reference's method

It is a **magnifier**, not an SVG filter. The scene is drawn a second time,
larger, about the disc's own centre, and clipped to the circle
(`GlassPanel`, `magnify`). Lines crossing the rim break, which is what the eye
reads as thickness.

Every SVG-filter version produced a *bevel* — an edge treatment — and never a
lens. The magnifier was the thing that worked, and it worked by not using the
reactbits approach at all.

## The caption pill failed, and here is the honest sequence

1. **Filter inside `SubtitleScene`** — a tinted blur. That component has no
   access to the background or the waveform, and a pane cannot refract what it
   cannot redraw. Structural, not tuning.
2. **Pane moved to the composition**, where the scene is available, with the
   magnifier. Result: an opaque grey slab, because the pane stacked a scene
   copy *plus* a tint *plus* four inset shadows over the picture. An overlay
   where the reference is a lens.
3. **Stripped to the filter alone** — no copy, no tint, no shadows. Still grey,
   because `SubtitleScene` was *also* painting its own blur-and-tint on top:
   turning off `isGlass` fell through to `surfaceStyle`, which for a glass
   surface still paints one.
4. **Fixed that too** — and the render then failed outright with
   `EncodingError: The source image cannot be decoded`, from the `feImage` data
   URI. Survived clearing the media cache and forcing a fresh plan, so it is the
   change and not the footage.

Stopped there, by agreement. Left off rather than shipped looking wrong.

## What I would try next, if it is ever worth another day

- **Give the caption the magnifier**, exactly as the disc has it. Step 4 broke
  before this was reached, and it is the only approach in this file with a
  proven result.
- **Or `FluidGlass`** — the other reactbits component, which is WebGL:
  `three` + `MeshTransmissionMaterial`, real refraction through real geometry.
  It is a different technique, not a tuning of this one, and it is the one that
  would actually match the reference. It is also a real dependency and has to
  survive Remotion's renderer.

## Lessons worth more than the feature

**I kept tuning the thing that was not working instead of noticing the thing
that was.** The disc had been working for hours via magnification while filter
parameters were still being adjusted on the pill.

**"Same-ish name, different quantity" cost the most single time.** GlassSurface's
`backgroundOpacity: 0.1` is an alpha; it was read into a `frost` field that is a
blur as a fraction of frame width. On a 1080px frame that is a **108 pixel
blur**, and it hid every other effect underneath it for several rounds.

**The lab is the reusable part.** `tools/glass-lab.py` renders variants side by
side over hard stripes and heavy letterforms — seconds per iteration instead of
a twenty-minute render. Judging an effect over a frame of the finished video, or
over footage a preset had already blurred, wasted more time than any single bug.
