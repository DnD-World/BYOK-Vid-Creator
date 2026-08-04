// ---------------------------------------------------------------------------
// A layered character puppet: a base body with a blank face, plus independent
// feature layers stacked on top.
//
// This replaces the flattened nine-cell sprite sheet, and the reason is
// combinatorial. A sheet bakes one mouth, one pair of eyes and one pair of
// brows into each of nine images, so nine is all you ever get. Keeping the
// layers separate multiplies instead: 9 mouths x 4 eye states x 4 brow sets is
// 144 faces from the same art, and blinking becomes independent of speaking
// rather than something a sheet cannot express at all.
//
// EVERY coordinate here is relative to the HEAD, not to the image. That is
// what makes a head tilt or shake possible later: the features are positioned
// inside the head's own space, so one transform on the head group moves all of
// them together and correctly. Absolute image coordinates would have to be
// recomputed per frame and would drift apart under rotation.
// ---------------------------------------------------------------------------

/** Where the head sits on the base image, as fractions of the base image. */
export interface PuppetHead {
  /** Centre of the head, 0–1 across the base image. */
  cx: number;
  cy: number;
  /** Head width as a fraction of the base image width. The unit everything
   *  else is measured in. */
  w: number;
}

export type PuppetAnchor =
  | "center"
  | "top-center"
  | "bottom-center";

/** One image stacked on the face. */
export interface PuppetLayer {
  /** Filename inside the puppet's asset folder. */
  file: string;
  /** The source PNG's own pixel dimensions, stamped in by tools/make-puppet.mjs.
   *  Carried in the definition rather than measured from the loaded image so
   *  layout is correct on the very first frame and identical in the preview and
   *  the render — a render worker must not have to wait on an onload to know
   *  how big something is. */
  w: number;
  h: number;
  /** Offset from the head's centre, in HEAD WIDTHS. x positive is right,
   *  y positive is down. */
  x: number;
  y: number;
  /** Which point of the layer lands on (x, y). Mouths use "top-center",
   *  because the upper lip stays put while the jaw drops — anchoring an open
   *  and a closed mouth by their centres makes the closed one ride up. */
  anchor?: PuppetAnchor;
  /** Per-layer size override, multiplying the puppet's shared scale. */
  scale?: number;
  /** Non-uniform overrides, on top of `scale`. Thickening a brow without
   *  lengthening it needs scaleY alone. */
  scaleX?: number;
  scaleY?: number;
  /** Recolour the layer to a flat colour, keeping its alpha. Drawn as a mask
   *  rather than an image, so it is exact — right for solid shapes like brows,
   *  wrong for anything with internal detail. */
  tint?: string;
  /** Two or more colours banded across the silhouette instead of one flat
   *  `tint`. A schnauzer's beard is not one grey, and a brow recoloured to a
   *  single value next to it reads as a sticker rather than as fur.
   *
   *  Bands are hard-edged, not blended: the art is cel-shaded, and a smooth
   *  gradient is the one thing that would look foreign against it. */
  tintBands?: string[];
  /** Direction of the banding, in degrees. 180 = light at the top, which is
   *  where fur catches light. */
  tintAngle?: number;
  /** Use only half of the source image, and place it where that half sat.
   *
   *  Eye lids are drawn as a PAIR in one file, so without this the two eyes
   *  can only ever do the same thing — no wink, no raised single lid. Cutting
   *  the pair down the middle turns one asset into two independent ones. */
  split?: "left" | "right";
  /** HSL tweaks, so one mouth library can serve several characters — the
   *  human mouths desaturate into a grey dog's mouth. */
  saturation?: number;
  hue?: number;
  lightness?: number;
}

/** Named alternatives for one slot — lids open/half/closed, brows happy/angry. */
export type PuppetVariants = Record<string, PuppetLayer>;

/**
 * The eye stack, in draw order: whites, then pupils, then a lid state on top.
 *
 * Separating them is what keeps the eye white visible when the lids come down.
 * Treating "closed eyes" as a whole-eye replacement — which is how the source
 * art is organised — makes the white vanish the moment a character blinks, and
 * makes every character's blink look like a different drawing style.
 */
export interface PuppetEyes {
  whites: PuppetLayer;
  /** One pupil per eye, each split out of the same pair image.
   *
   *  They are separate because the pupil pair is drawn narrower than the eye
   *  whites — measured at 160 source px per side on this art — so a single
   *  pair layer leaves both pupils hard against the inner edge of their eye.
   *  You do not notice that while both eyes are open and symmetric. You notice
   *  it immediately in a wink, where the one visible pupil is plainly not
   *  centred. Per-eye pupils also give gaze direction for free later. */
  pupilLeft?: PuppetLayer;
  pupilRight?: PuppetLayer;
  /** "open" is required. Any others ("half", "closed") become blink and
   *  expression states, and each eye picks its own — that is the wink. */
  lids: PuppetVariants;
}

export interface Puppet {
  name: string;
  /** Base body image, with a blank face. Path relative to `dir`. */
  base: string;

  /**
   * Cut the head out of the base so it can move independently of the body.
   *
   * Without this the base is ONE drawing of a whole (short, South-Park-ish)
   * body, so any rotation leans the entire character. With it the base is
   * drawn twice: once with an ellipse over the head masked AWAY, and once
   * masked to that ellipse ALONE, and only the second copy rotates. The
   * features ride with it, as they always have.
   *
   * The cut is a HORIZONTAL LINE across the neck, not a shape around the head.
   * An ellipse was tried and it fails on exactly the thing that matters: a head
   * silhouette is not an ellipse. It sliced through Καίτη's ponytail and
   * Σερίφης' muzzle, because those stick well outside any ellipse that doesn't
   * also swallow the shoulders. A neck, by contrast, really is a narrow
   * horizontal band — which is where a paper puppet is cut, for the same reason.
   *
   * `y` is that line as a fraction of the base image's height. The head keeps
   * everything above it plus `overlap`, the body everything below it, so the
   * two share a band that hides the join when the head turns.
   *
   * Omit the whole thing and the puppet leans as one piece, which is the right
   * answer for art where the head genuinely cannot be separated.
   */
  neck?: {
    /** The cut line, 0–1 down the base image. */
    y: number;
    /** How far below the line the head's copy continues, 0–1 of image height.
     *  This overlap is what covers the seam; without it a turn opens a gap. */
    overlap: number;
    /** Softness of the cut edge, 0–1 of image height. */
    feather?: number;
  };
  /** Folder holding the base and every layer. Absolute on disk. */
  dir: string;
  head: PuppetHead;

  /** How many pixels of SOURCE artwork correspond to one head width. All the
   *  layers were drawn on one canvas, so they share a single scale, and this
   *  is the one measurement that sets it. */
  sourceHeadWidth: number;

  /** Framing override. The base image is scaled by this before anything is
   *  drawn, so the character can be pushed in or pulled back within the disk.
   *
   *  Omit it and the renderer auto-fits, so a puppet lands at roughly the same
   *  apparent size as the sprite sheet it replaces — a sheet's cells are
   *  cropped to the head, while a puppet's base carries the artwork's own
   *  transparent margins. Set it only for a character that wants different
   *  framing from the rest of the cast. */
  zoom?: number;

  /** Always-on layers drawn under the features, in order. */
  base_layers?: PuppetLayer[];

  eyes: PuppetEyes;
  /** Brow sets, keyed by mood — "serious", "happy", "angry", "sad". Left and
   *  right are separate layers on purpose: picking a different mood for each
   *  gives the sceptical single raised brow for free. */
  brows: Record<string, { left: PuppetLayer; right: PuppetLayer }>;
  /** Optional static features (nose, mustache). */
  extras?: PuppetLayer[];

  /** One entry per viseme index 0–8. */
  mouths: Record<string, PuppetLayer>;
}

/** Every file a puppet needs, for preloading and for copying into a render. */
export function puppetFiles(p: Puppet): string[] {
  const out = new Set<string>([p.base]);
  const add = (l?: PuppetLayer) => l && out.add(l.file);
  p.base_layers?.forEach(add);
  add(p.eyes.whites);
  add(p.eyes.pupilLeft);
  add(p.eyes.pupilRight);
  Object.values(p.eyes.lids).forEach(add);
  Object.values(p.brows).forEach((b) => {
    add(b.left);
    add(b.right);
  });
  p.extras?.forEach(add);
  Object.values(p.mouths).forEach(add);
  return [...out];
}
