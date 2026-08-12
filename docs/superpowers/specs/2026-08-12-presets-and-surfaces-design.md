# Presets that carry the whole look

*Design, 12 Aug 2026.*

## Why

The first watched render exposed three problems that are all the same problem.

Καίτη sat off-centre with nothing beside her, because her `x: 0.28` is a
*three-character* position and nothing in the app knows the cast has shrunk to
one. A waveform ringed the middle of the frame instead of her face, because the
built-in that was applied sets `position: "circular"` and no built-in has ever
touched where a speaker stands. And there is no way to say "text on its own
surface" at all, because no blur or panel exists anywhere in the codebase.

Presets already exist and already claim to be "a complete saved look". They are
not. They restyle waveforms, outlines and subtitles, and stop there. Everything
about **layout** and **surface** falls through to whatever the project happened
to have.

So this is one change, not three: **a preset carries everything you can see.**

## What a preset gains

Three additions to `ProjectPreset`.

### 1. Slots — layout, without touching identity

```ts
/** One speaker's place in the frame, and how they are dressed. Applied by
 *  position in the cast, never by name: a preset must be able to restyle a
 *  cast it has never met. */
export interface SpeakerSlot {
  x: number;      // 0–1 of frame width
  y: number;      // 0–1 of frame height
  size: number;   // diameter as a fraction of frame width
  outlineShape: OutlineShape;
  waveform: TrackWaveform;
  surface: Surface;
}
```

`ProjectPreset.slots?: SpeakerSlot[]`, plus `speakerCount?: 1 | 2 | 3`.

The existing rule survives intact and is the reason slots exist as a separate
shape from `SpeakerConfig`: **applying a preset never replaces faces, names,
voices or viseme sheets.** Slot *n* dresses cast member *n* and nothing else.

If the cast is larger than the preset's slots, the surplus speakers keep their
current placement and the panel says so. That is a preset chosen for the wrong
cast size, and silently inventing positions for the extras would hide it.

### 2. Surface — one shape for every backdrop

Every "thing sitting on top of the video" gets the same four-option treatment,
so there is one control to learn and one implementation to debug.

```ts
export type SurfaceStyle = "none" | "solid" | "blur" | "glass";

export interface Surface {
  style: SurfaceStyle;
  /** Backdrop blur radius as a fraction of frame WIDTH, so a look authored on
   *  the preview survives a 1080p render. Same convention as speaker size. */
  blur: number;
  color: string;
  opacity: number;
  /** The hairline edge. Glass reads as glass because of its edge catching the
   *  light, not because of the blur — without this it is just a smudge. */
  borderOpacity: number;
  /** Corner rounding, as a fraction of the panel's own height. */
  radius: number;
}
```

- `none` — nothing drawn. What exists today.
- `solid` — flat colour at `opacity`. What `bgColor` + `bgOpacity` do now.
- `blur` — the video behind is blurred, no tint. Footage stays visible.
- `glass` — blur, plus tint, plus edge. Frosted.

It lands in two places: `SubtitleConfig.surface` (the panel behind the text) and
`SpeakerConfig.surface` (the disc behind an avatar).

**`SpeakerConfig.bgColor` and `bgOpacity` are absorbed, not kept alongside.** A
migration maps them to `{ style: "solid", color: bgColor, opacity: bgOpacity }`.
Keeping both would be a second `WaveformConfig` — a legacy field that outlives
its migration and drifts. The store already migrates on rehydrate; this uses the
same path.

### 3. Background blur, and the toggle you asked for

`backgroundBlur: number` joins `backgroundDim`. It is deliberately **not** a
`Surface`: it blurs the source footage rather than laying a panel over it.

Together these are the toggle from the review — darken the background, *or*
give the avatars and text their own surfaces and leave the footage bright. Both
at once is allowed, because at 3–8 minutes over busy stock footage it may well
be needed.

Presets also already carry `render`, which holds the aspect ratio. That means a
preset can be a 9:16 social look or a 16:9 lesson look. Applying one that
changes orientation asks first, since it reflows everything.

## Subtitle transitions

```ts
export interface SubtitleTransition {
  style: "none" | "pop" | "crossBlur";
  durationMs: number;
  /** pop only. 1.05 = overshoot to 105% before settling. */
  overshoot: number;
  /** Motion blur through the movement, 0–1. */
  blur: number;
}
```

- **pop** — in at 90%, overshoot to `overshoot`, settle at 100%, motion blur
  through the movement.
- **crossBlur** — outgoing sentence blurs out as the incoming blurs in.

Both are per-sentence, driven by the cue boundaries `wordTiming.ts` already
produces. Nothing new has to be timed.

*Assumption, flag it if wrong:* these are two styles you choose between, not two
effects stacked. `pop` already carries its own motion blur.

## Built-ins stop being code

`BUILT_INS` is a hardcoded array inside `PresetsPanel.tsx`, which is why it
cannot be edited. It moves to `src/store/builtinPresets.ts` as ordinary
`ProjectPreset` objects and is seeded into `useTemplatesStore` on first run.

After that there is exactly one kind of preset. Editing a built-in edits a
stored preset; "Reset to default" copies the code version back over it. Adding
one is what saving already does.

**Nine of them**: Halo, Broadcast, Orbit × solo, duo, trio. The dropdown groups
by `speakerCount` and marks the group matching the current cast.

Nine is not three styles × a layout knob, because a preset is more than avatar
placement — subtitle size, background dim and orientation all want different
answers for one talking head than for three. Nesting them would mean editing a
layout inside a style; nine flat rows means editing one row.

## Where each piece is built

| Piece | File |
|---|---|
| `Surface`, `SpeakerSlot`, `SubtitleTransition` types | `src/store/types.ts` |
| `slots`, `speakerCount`, `backgroundBlur` on the preset | `src/store/templatesTypes.ts` |
| The nine built-ins | `src/store/builtinPresets.ts` *(new)* |
| Seeding, editing, reset | `src/store/useTemplatesStore.ts` |
| `bgColor`/`bgOpacity` → `surface` migration | `src/store/useProjectStore.ts` |
| Grouped dropdown, edit, reset | `src/components/panels/PresetsPanel.tsx` |
| Surface + transition rendering | `remotion/VideoComposition.tsx`, `remotion/BackgroundLayer.tsx` |
| The same, for the live preview | `src/components/canvas/` |

## The one real risk

**Preview and render draw everything twice, from the same data, in different
code.** Surfaces and transitions are the first features to touch both since the
background layer, and a blur that looks right in the preview and wrong in the
render is the failure mode that already cost a day when the spectrum silently
404'd. Every new value is a fraction of frame width for that reason, and the
check is a rendered frame compared against the preview at the same timestamp —
not a screenshot of the preview alone.

## Deliberately not in this change

- Fixing lip-sync (`wordTiming.ts` → Piper phoneme alignments). Separate, larger,
  and it lands in the render's timing rather than its look.
- Background relevance. Next in the agreed order.
- Choppy idle motion. After that.
- Chatterbox's first words. After that.
