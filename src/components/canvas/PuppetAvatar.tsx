// ---------------------------------------------------------------------------
// Draws a layered puppet: base body, then eyes, pupils, brows and a mouth,
// each an independent layer.
//
// The whole point is that these are independent. The mouth follows the viseme
// track, the eyes follow a blink track, the brows follow the mood — all at
// once, from the same art, without any of them being baked together. The
// flattened sprite sheet this replaces could only ever offer nine faces.
//
// Positioning is entirely in HEAD units (see puppetTypes.ts), converted to
// percentages of the container here. Nothing reads a pixel coordinate, so the
// same component is correct in a 200px preview and a 1080p render, and a
// future head tilt is one transform on the head group rather than a
// recalculation of every layer.
//
// Same purity contract as the rest of the canvas: no clock, no randomness.
// ---------------------------------------------------------------------------

import type { CSSProperties } from "react";
import type { Puppet, PuppetLayer } from "../../store/puppetTypes";
import type { OutlineShape } from "../../store/types";
import { BROW_REST, HEAD_STILL, type HeadPose } from "../../lib/motion/facePerformance";

interface Props {
  puppet: Puppet;
  /** file path -> loadable URL (blob: in the preview, staticFile() in a render). */
  urls: Record<string, string>;
  /** Viseme index 0–8. */
  viseme: number;
  /** The mouth being faded out of, and how far through the fade we are
   *  (1 = done). Omit for a hard cut. */
  prevViseme?: number;
  mix?: number;
  /** Lid state per eye, from `puppet.eyes.lids`. Different values wink. */
  lidLeft?: string;
  lidRight?: string;
  /** The lid image being faded TO, and how far through, so a blink is a
   *  crossfade rather than a hard swap. Absent means no fade — the old
   *  behaviour, kept so a caller that has not been updated still works. */
  lidLeftTo?: string;
  lidRightTo?: string;
  lidMix?: number;
  /** Brow set per side, from `puppet.brows`. Different values raise one brow. */
  browLeft?: string;
  browRight?: string;
  /** Rotation and offset of the head group. One transform carries every
   *  feature, which is the whole point of anchoring them to the head. */
  head?: HeadPose;
  /** Disk diameter in px. */
  size: number;
  bgOpacity: number;
  borderOpacity: number;
  bgColor?: string;
  borderColor?: string;
  outlineShape?: OutlineShape;
}

const SHAPE_RADIUS: Record<OutlineShape, string> = {
  circle: "50%",
  rounded: "18%",
  square: "0%",
  none: "50%",
};

function filterFor(l: PuppetLayer): string | undefined {
  const parts: string[] = [];
  if (l.saturation !== undefined && l.saturation !== 1) parts.push(`saturate(${l.saturation})`);
  if (l.hue) parts.push(`hue-rotate(${l.hue}deg)`);
  if (l.lightness !== undefined && l.lightness !== 1) parts.push(`brightness(${l.lightness})`);
  return parts.length ? parts.join(" ") : undefined;
}

export function PuppetAvatar({
  puppet, urls, viseme, prevViseme, mix = 1,
  lidLeft = "open", lidRight = "open",
  lidLeftTo, lidRightTo, lidMix = 1,
  // Defaulted, not optional-and-absent, for the reason in `browSet` below.
  browLeft = BROW_REST, browRight = BROW_REST, head: pose = HEAD_STILL, size,
  bgOpacity, borderOpacity,
  bgColor = "#1a1a1a", borderColor = "#d98a3d",
  outlineShape = "circle",
}: Props) {
  const fill = outlineShape === "circle" || outlineShape === "none" ? 0.9 : 0.97;

  // `zoom` is opt-in and defaults to no change.
  //
  // An automatic fit was tried — scale the base until the head occupies a set
  // fraction of the disk, so a puppet matches the sprite sheet it replaces.
  // It made things worse, and the reason is worth recording: scaling alone
  // does not RECENTRE. The head sits below the middle of the base image
  // (cy ≈ 0.61), so enlarging about the element's centre pushes the head
  // further down, clips the chin against the disk, and throws the shoulders
  // out of frame entirely. A real fit has to translate by the head's offset as
  // well as scale, and that is a framing decision per character rather than a
  // formula. The knob is here for when someone makes that call with eyes on it.
  const zoom = puppet.zoom ?? 1;
  const head = size * fill * zoom;

  // The base image is square and drawn at the full disk size; the head is a
  // named box inside it. Everything else is measured against that box.
  const headPx = puppet.head.w * head;
  const headCx = puppet.head.cx * head;
  const headCy = puppet.head.cy * head;
  const pxPerSource = headPx / puppet.sourceHeadWidth;

  /** A layer, positioned by its anchor at (head centre + offset).
   *
   *  A split layer draws half the source but stays where that half sat in the
   *  pair: the element is half as wide, shifted a quarter-width off centre,
   *  and the background is scaled to the full pair width so only the intended
   *  half shows through. */
  const layerStyle = (l: PuppetLayer): CSSProperties => {
    const mul = pxPerSource * (l.scale ?? 1);
    const fullW = l.w * mul * (l.scaleX ?? 1);
    const h = l.h * mul * (l.scaleY ?? 1);
    const w = l.split ? fullW / 2 : fullW;
    const cx = headCx + l.x * headPx;
    const cy = headCy + l.y * headPx;
    const anchor = l.anchor ?? "center";
    const top = anchor === "top-center" ? cy : anchor === "bottom-center" ? cy - h : cy - h / 2;
    // Centre of this piece, relative to the pair's centre.
    const pieceCx = cx + (l.split === "left" ? -fullW / 4 : l.split === "right" ? fullW / 4 : 0);
    const url = urls[l.file] ?? "";
    const size = `${fullW}px ${h}px`;
    const pos = l.split === "right" ? `-${fullW / 2}px 0` : "0 0";
    const box: CSSProperties = {
      position: "absolute",
      left: pieceCx - w / 2,
      top,
      width: w,
      height: h,
    };
    // A tinted layer is a silhouette FILLED, so it is drawn as a mask rather
    // than an image: the mask supplies the shape, the fill supplies the colour.
    // The fill is either one flat colour or hard-edged bands.
    if (l.tint || l.tintBands) {
      const bands = l.tintBands;
      const fill = bands
        ? {
            // Hard stops, not a blend. Each colour occupies an equal share and
            // ends exactly where the next begins, which is what keeps it
            // reading as cel-shaded fur rather than as an airbrushed gradient.
            backgroundImage: `linear-gradient(${l.tintAngle ?? 180}deg, ${bands
              .map((c, i) => {
                const from = (i / bands.length) * 100;
                const to = ((i + 1) / bands.length) * 100;
                return `${c} ${from}%, ${c} ${to}%`;
              })
              .join(", ")})`,
          }
        : { backgroundColor: l.tint };
      return {
        ...box,
        ...fill,
        maskImage: `url(${url})`,
        WebkitMaskImage: `url(${url})`,
        maskSize: size,
        WebkitMaskSize: size,
        maskPosition: pos,
        WebkitMaskPosition: pos,
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
      };
    }
    return {
      ...box,
      backgroundImage: `url(${url})`,
      backgroundSize: size,
      backgroundPosition: pos,
      backgroundRepeat: "no-repeat",
      filter: filterFor(l),
    };
  };

  const draw = (l: PuppetLayer | undefined, key: string, opacity?: number) =>
    l && urls[l.file] ? (
      <div key={key} style={opacity === undefined ? layerStyle(l) : { ...layerStyle(l), opacity }} />
    ) : null;

  const lids = puppet.eyes.lids;
  const lidL = lids[lidLeft] ?? lids.open;
  const lidR = lids[lidRight] ?? lids.open;
  // The image being faded to, and its share. A blink lasts under four frames,
  // so without this the eyelid snaps between three drawings in a face where
  // everything else moves continuously — which is what read as choppy.
  const lidLNext = lidLeftTo ? lids[lidLeftTo] ?? lidL : undefined;
  const lidRNext = lidRightTo ? lids[lidRightTo] ?? lidR : undefined;
  const fade = Math.max(0, Math.min(1, lidMix));
  // A puppet asked for a brow set it doesn't have must not end up drawing NO
  // brows: a browless face reads as missing artwork, not as a neutral
  // expression, and it is the exact thing that shipped in the first render
  // that used this component. Fall back to the resting set, then to whatever
  // the puppet does have.
  const browSet = (name: string | undefined) => {
    if (!name) return undefined;
    const sets = puppet.brows;
    return sets[name] ?? sets[BROW_REST] ?? Object.values(sets)[0];
  };
  const browL = browSet(browLeft)?.left;
  const browR = browSet(browRight)?.right;
  const mouth = puppet.mouths[String(viseme)] ?? puppet.mouths["0"];
  const prevMouth =
    prevViseme !== undefined && prevViseme !== viseme
      ? puppet.mouths[String(prevViseme)] ?? puppet.mouths["0"]
      : undefined;
  // A TRUE crossfade, unlike the sprite sheet's, which stacks the outgoing cell
  // opaque underneath the incoming one. That was necessary there because each
  // cell is a whole face and fading both would let the background show through
  // the middle of the transition. Here the face underneath is blank — the mouth
  // is its own layer over solid skin — so there is nothing to show through, and
  // fading both out and in is what actually reads as a mouth changing shape.
  // Stacking would instead hold the old mouth at full strength until the last
  // instant and then pop.
  const fading = prevMouth !== undefined && mix < 1;

  // ---- head / body separation -------------------------------------------
  // A horizontal cut at the neck. The head's copy keeps everything above the
  // line plus an overlap band; the body's keeps everything below the line.
  // They share that band, and since the head draws on top it hides the join.
  const neck = puppet.neck;
  const cutPct = neck ? neck.y * 100 : 0;
  const overlapPct = neck ? neck.overlap * 100 : 0;
  const featherPct = neck ? (neck.feather ?? 0.008) * 100 : 0;
  const headMask = neck
    ? `linear-gradient(to bottom, #000 ${cutPct + overlapPct}%, ` +
      `transparent ${cutPct + overlapPct + featherPct}%)`
    : undefined;
  const bodyMask = neck
    ? `linear-gradient(to bottom, transparent ${Math.max(0, cutPct - featherPct)}%, #000 ${cutPct}%)`
    : undefined;
  // The head turns about the neck line, not about its own centre.
  const pivotYPct = neck ? cutPct : (puppet.head.cy + puppet.head.w * 0.55) * 100;

  return (
    <div style={{
      width: size, height: size,
      borderRadius: SHAPE_RADIUS[outlineShape],
      display: "grid", placeItems: "center",
      background: hexA(bgColor, bgOpacity),
      border: outlineShape === "none" ? "none" : `${Math.max(1, size * 0.015)}px solid ${hexA(borderColor, borderOpacity)}`,
      boxShadow:
        outlineShape !== "none" && borderOpacity > 0
          ? `0 0 ${size * 0.06}px ${hexA(borderColor, borderOpacity * 0.6)}`
          : "none",
      overflow: "hidden",
    }}>
      {/* THE BODY. Only drawn separately when the puppet declares a neck: the
          base is masked so the head's ellipse is punched OUT of it, leaving a
          hole the rotating head covers. Without a neck this element isn't
          rendered at all and the whole character leans as one piece. */}
      {neck && (
        <div style={{
          position: "absolute", width: head, height: head,
          backgroundImage: `url(${urls[puppet.base] ?? ""})`,
          backgroundSize: "100% 100%",
          maskImage: bodyMask,
          WebkitMaskImage: bodyMask,
        }} />
      )}

      {/* The head group. The tilt, shake and bob live on THIS element — every
          feature is positioned inside it, so one transform moves the lot, and
          that is exactly what anchoring the layers to the head bought.

          The origin is the NECK, not the head's centre. Rotating about the
          centre swings the chin and the crown in opposite directions, which
          reads as a floating mask rather than as a head turning on a body. */}
      <div style={{
        position: "relative", width: head, height: head,
        borderRadius: SHAPE_RADIUS[outlineShape],
        transformOrigin: `${puppet.head.cx * 100}% ${pivotYPct}%`,
        transform:
          `translate(${(pose.dx * puppet.head.w * head).toFixed(2)}px, ` +
          `${(pose.dy * puppet.head.w * head).toFixed(2)}px) ` +
          `rotate(${pose.rotateDeg.toFixed(3)}deg)`,
      }}>
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: `url(${urls[puppet.base] ?? ""})`,
          backgroundSize: "100% 100%",
          // Masked to the head alone when a neck is declared, so the body
          // below is NOT carried along by the rotation.
          maskImage: neck ? headMask : undefined,
          WebkitMaskImage: neck ? headMask : undefined,
        }} />
        {puppet.base_layers?.map((l, i) => draw(l, `bl${i}`))}
        {/* Whites first, then pupils, then a lid per eye on top — so the eye
            white stays visible behind a closed or half-closed lid. */}
        {draw(puppet.eyes.whites, "whites")}
        {draw(puppet.eyes.pupilLeft, "pupilL")}
        {draw(puppet.eyes.pupilRight, "pupilR")}
        {/* Crossfaded exactly the way the mouth below is. Two lid images, the
            outgoing one fading out under the incoming one — a blink is under
            four frames long, so a hard swap between three drawings is visible
            as a stutter in a face that is otherwise moving continuously. */}
        {lidLNext && fade < 1 && draw({ ...lidL, split: "left" }, "lidLPrev", 1 - fade)}
        {draw({ ...(lidLNext ?? lidL), split: "left" }, "lidL", lidLNext ? fade : undefined)}
        {lidRNext && fade < 1 && draw({ ...lidR, split: "right" }, "lidRPrev", 1 - fade)}
        {draw({ ...(lidRNext ?? lidR), split: "right" }, "lidR", lidRNext ? fade : undefined)}
        {draw(browL, "browL")}
        {draw(browR, "browR")}
        {puppet.extras?.map((l, i) => draw(l, `ex${i}`))}
        {fading && draw(prevMouth, "mouthPrev", 1 - mix)}
        {draw(mouth, "mouth", fading ? mix : undefined)}
      </div>
    </div>
  );
}

function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
