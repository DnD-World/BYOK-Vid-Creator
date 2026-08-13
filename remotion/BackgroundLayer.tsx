// ---------------------------------------------------------------------------
// Background clips, during a render.
//
// Bottom of the stack: everything else — waveform, avatars, subtitles — draws
// over this. Which is also why the scrim is here and not optional. Stock
// footage at full brightness takes the frame over: the waveform disappears into
// it and white subtitles land on whatever the clip happens to be doing.
//
// OffthreadVideo rather than Video, because this is a render: it extracts the
// exact frame with FFmpeg instead of seeking a <video> element and hoping it
// settled. `muted` because a background clip's own audio is never wanted — the
// narration is the only sound in this video.
//
// The timing is not computed here. See src/lib/background/backgroundTiming.ts.
// ---------------------------------------------------------------------------

import { useMemo, type ReactNode } from "react";
import { AbsoluteFill, Loop, OffthreadVideo, Sequence, staticFile } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { backgroundTiming } from "../src/lib/background/backgroundTiming";
import type { RenderBackground } from "./types";

function Clip({ fileName, loopInFrames }: { fileName: string; loopInFrames: number }) {
  const video = (
    <OffthreadVideo
      src={staticFile(fileName)}
      muted
      // cover, not contain: a 16:9 clip behind a 9:16 frame has to fill it, and
      // letterboxing a background is worse than losing its edges.
      style={{ width: "100%", height: "100%", objectFit: "cover" }}
      // A clip that can't be decoded must not kill a render that is otherwise
      // twenty minutes of good frames. It reports itself and leaves black.
      onError={(err) => {
        // eslint-disable-next-line no-console
        console.log(`[byok] Background clip ${fileName} failed to decode: ${err.message}`);
      }}
    />
  );
  return loopInFrames > 0 ? <Loop durationInFrames={loopInFrames}>{video}</Loop> : video;
}

export function BackgroundLayer({
  backgrounds,
  fps,
  crossfadeMs,
  dim,
  blur,
  width,
}: {
  backgrounds: RenderBackground[];
  fps: number;
  crossfadeMs: number;
  dim: number;
  /** Blur radius as a fraction of frame WIDTH. Kept as a fraction all the way
   *  here rather than converted upstream, so the preview and the render each
   *  multiply by their own width and agree by construction — the same rule
   *  speaker size and subtitle size already follow. */
  blur: number;
  width: number;
}) {
  const timing = useMemo(
    () => backgroundTiming(backgrounds, crossfadeMs, fps),
    [backgrounds, crossfadeMs, fps]
  );

  if (timing.slots.length === 0) return null;

  // A flat array, not fragments: TransitionSeries inspects its children and a
  // <Fragment> wrapping a sequence is not one of the types it accepts.
  const children: ReactNode[] = [];
  timing.slots.forEach((slot, i) => {
    if (i > 0 && timing.transitionInFrames > 0) {
      children.push(
        <TransitionSeries.Transition
          key={`t${i}`}
          presentation={fade()}
          timing={linearTiming({ durationInFrames: timing.transitionInFrames })}
        />
      );
    }
    children.push(
      <TransitionSeries.Sequence key={`s${i}`} durationInFrames={slot.durationInFrames}>
        <Clip
          fileName={backgrounds[slot.index].fileName}
          loopInFrames={slot.loopInFrames}
        />
      </TransitionSeries.Sequence>
    );
  });

  const first = timing.slots[0];
  const last = timing.slots[timing.slots.length - 1];
  const span = last.startFrame + last.durationInFrames - first.startFrame;

  return (
    // The scrim lives inside the same span as the clips. Backgrounds don't have
    // to cover the whole video, and dimming a stretch that has nothing behind it
    // would darken the plain frames for no reason.
    <Sequence from={first.startFrame} durationInFrames={span} name="Backgrounds">
      <AbsoluteFill
        style={
          blur > 0
            ? {
                filter: `blur(${blur * width}px)`,
                // Blur samples beyond the edge and leaves a soft transparent
                // border where there is nothing to sample. Scaling up pushes
                // that band off-frame; 1.1 covers the widest blur the UI
                // allows without visibly cropping the clip.
                transform: "scale(1.1)",
              }
            : undefined
        }
      >
        <TransitionSeries>{children}</TransitionSeries>
      </AbsoluteFill>
      {dim > 0 && (
        <AbsoluteFill style={{ backgroundColor: `rgba(0, 0, 0, ${Math.min(1, dim)})` }} />
      )}
    </Sequence>
  );
}
