// ---------------------------------------------------------------------------
// The music bed, during a render.
//
// Two things that look like details and are not:
//
// 1. LOOPING IS DONE BY HAND, as a row of Sequences, rather than with <Loop>.
//    Inside a <Loop> the frame counter restarts at every repeat, so a volume
//    callback — which is how the ducking gets applied — would be handed the
//    loop-relative frame and would duck to the wrong words after the first
//    pass. Each Sequence knows its own offset, so absolute time is recoverable.
//
// 2. The gain is a FUNCTION of the frame, not a value. Remotion samples it per
//    frame while muxing, which is what makes a real fade possible at all; a
//    single number would be a flat mix.
// ---------------------------------------------------------------------------

import { Audio, Sequence, staticFile, useVideoConfig } from "remotion";
import { musicGainAt } from "../src/lib/audio/ducking";
import type { AudioAnalysis } from "../src/store/types";

/** A guard against a pathological input — a half-second sting under a ten
 *  minute video — rather than a real limit. Past this the bed simply stops. */
const MAX_REPEATS = 400;

export function MusicTrack({
  fileName,
  musicAnalysis,
  narrationAnalysis,
  volume,
  duck,
  durationInFrames,
}: {
  fileName: string | null;
  musicAnalysis: AudioAnalysis | null;
  /** The NARRATION's analysis — this is what decides when to get out of the
   *  way. The music's own analysis has nothing to do with ducking. */
  narrationAnalysis: AudioAnalysis | null;
  volume: number;
  duck: number;
  durationInFrames: number;
}) {
  const { fps } = useVideoConfig();
  if (!fileName || volume <= 0) return null;

  const gainAt = (absoluteFrame: number) =>
    musicGainAt(narrationAnalysis, (absoluteFrame / fps) * 1000, volume, duck);

  // Without a usable duration we cannot know when the file runs out, so it is
  // played once from the top: a track that stops early is obvious and fixable,
  // a wrongly guessed loop point is neither.
  const musicFrames =
    musicAnalysis && musicAnalysis.durationMs > 0
      ? Math.max(1, Math.floor((musicAnalysis.durationMs / 1000) * fps))
      : 0;

  if (musicFrames === 0 || musicFrames >= durationInFrames) {
    return (
      <Audio
        src={staticFile(fileName)}
        volume={(f) => gainAt(f)}
        onError={(err) => {
          // eslint-disable-next-line no-console
          console.log(`[byok] Music track ${fileName} failed: ${err.message}`);
        }}
      />
    );
  }

  const repeats = Math.min(MAX_REPEATS, Math.ceil(durationInFrames / musicFrames));
  return (
    <>
      {Array.from({ length: repeats }, (_, i) => {
        const from = i * musicFrames;
        return (
          <Sequence
            key={i}
            from={from}
            durationInFrames={Math.min(musicFrames, durationInFrames - from)}
            name={`Music ${i + 1}`}
            layout="none"
          >
            {/* `f` is relative to this repeat; the duck needs the real clock. */}
            <Audio src={staticFile(fileName)} volume={(f) => gainAt(from + f)} />
          </Sequence>
        );
      })}
    </>
  );
}
