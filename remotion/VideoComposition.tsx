// ---------------------------------------------------------------------------
// The video itself.
//
// Intentionally plain: background, waveform, speaker placeholders, audio.
// This exists to prove the pipeline end to end — script -> narration ->
// frames -> MP4 — not to look good yet. Visual work belongs on top of a
// pipeline that is already known to work.
//
// Note the styling here is all inline. The Remotion bundle is built by
// Remotion's own webpack config and does NOT run Tailwind, so any Tailwind
// class names in shared components are inert during a render. Anything
// layout-critical has to be an inline style.
// ---------------------------------------------------------------------------

import { useMemo } from "react";
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { WaveformScene } from "../src/components/canvas/WaveformScene";
import { SubtitleScene } from "../src/components/canvas/SubtitleScene";
import { SpeakerAvatar } from "../src/components/canvas/SpeakerAvatar";
import { PuppetAvatar } from "../src/components/canvas/PuppetAvatar";
import { BackgroundLayer } from "./BackgroundLayer";
import { MusicTrack } from "./MusicTrack";
import { SubtitleFont } from "./SubtitleFont";
import { buildCues } from "../src/lib/subtitles/wordTiming";
import { buildTracks } from "../src/lib/waveform/buildTracks";
import { buildSpeakerVisemeTracks } from "../src/lib/visemes/speakerTracks";
import { visemeBlendAt } from "../src/lib/visemes/timeline";
import { VISEME } from "../src/lib/visemes/visemeMap";
import { useWaitForImages } from "./useWaitForImages";
import { useSpectrumFile } from "./useSpectrumFile";
import { headMotion, motionTransform } from "../src/lib/motion/idleMotion";
import {
  blinkAt, browAt, buildSpeakerBrowTracks,
  buildSpeakerHeadTracks, headPoseAt,
} from "../src/lib/motion/facePerformance";
import { sampleAnalysis } from "../src/lib/waveform/audioAnalysis";
import type { RenderProps } from "./types";

/** Apply an alpha to a #rgb/#rrggbb color. Speakers carry their fill and
 *  border opacity separately, and the default speaker is a deliberately
 *  invisible disk (bgOpacity 0) with only its border showing — so these two
 *  cannot collapse into a single element-level `opacity`. */
function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  if (full.length !== 6 || Number.isNaN(n)) return hex;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

export function VideoComposition({
  musicWaveform,
  musicColor,
  speakers,
  audioFileName,
  analysis,
  spectrumFileName,
  spectrumBandCount,
  musicFileName,
  musicAnalysis,
  musicSpectrumFileName,
  musicSpectrumBandCount,
  musicVolume,
  musicDuck,
  sfx,
  backgrounds,
  backgroundDim,
  backgroundBlur,
  backgroundCrossfadeMs,
  subtitles,
  subtitleFont,
  visemeFadeMs,
  idleMotion,
  narrationSegments,
}: RenderProps) {
  const frame = useCurrentFrame();
  const { width, height, fps, durationInFrames } = useVideoConfig();

  // Must resolve before any frame is captured — the hook holds the render.
  const spectrum = useSpectrumFile(
    spectrumFileName ? staticFile(spectrumFileName) : null,
    spectrumBandCount
  );
  // The music's own spectrum, by the same road and for the same size reason.
  const musicSpectrum = useSpectrumFile(
    musicSpectrumFileName ? staticFile(musicSpectrumFileName) : null,
    musicSpectrumBandCount
  );

  // Cue layout depends only on the script and the wrap width, so it's computed
  // once per worker rather than on every one of thousands of frames.
  const cues = useMemo(
    () => buildCues(narrationSegments, subtitles.maxChars),
    [narrationSegments, subtitles.maxChars]
  );

  // Also once per worker, not per frame — the tracks are thousands of keyframes.
  const visemeTracks = useMemo(
    () => buildSpeakerVisemeTracks(narrationSegments, fps),
    [narrationSegments, fps]
  );

  // Brows come off the script's punctuation, so they are derived once from the
  // same segments the subtitles and the mouth use.
  const browTracks = useMemo(
    () => buildSpeakerBrowTracks(narrationSegments),
    [narrationSegments]
  );
  const headTracks = useMemo(
    () => buildSpeakerHeadTracks(narrationSegments),
    [narrationSegments]
  );

  // Every image any avatar might draw: a flattened sheet, or every layer of a
  // layered puppet. Resolved to public-dir URLs here, once, and handed to the
  // avatars below rather than recomputed per speaker per frame.
  const puppetUrls = useMemo(
    () =>
      speakers.map((sp) =>
        Object.fromEntries(
          Object.entries(sp.puppetFiles).map(([file, name]) => [file, staticFile(name)])
        )
      ),
    [speakers]
  );

  const faceUrls = useMemo(
    () => [
      ...speakers.map((sp) => (sp.sheetFileName ? staticFile(sp.sheetFileName) : "")).filter(Boolean),
      ...puppetUrls.flatMap((m) => Object.values(m)),
    ],
    [speakers, puppetUrls]
  );
  // Must run before any frame is captured — see the hook for why. A puppet
  // makes this matter more, not less: twenty layers that pop in over the first
  // few frames is twenty chances to ship a frame with half a face.
  useWaitForImages(faceUrls);

  const tracks = useMemo(
    () => buildTracks(speakers, musicWaveform, musicColor),
    [speakers, musicWaveform, musicColor]
  );

  const speakerColors = useMemo(
    () => Object.fromEntries(speakers.map((sp) => [sp.id, sp.borderColor])),
    [speakers]
  );

  // The single line that makes the export deterministic: time comes from the
  // frame index, never from a wall clock. Frame 240 at 30fps is 8000ms on
  // every worker, in any order, on every machine.
  const timeMs = (frame / fps) * 1000;

  // Same source as the waveform's active-speaker gate, so the head that moves
  // more is always the head whose waveform is lit.
  const moment = sampleAnalysis(analysis, timeMs, spectrum);
  const activeSpeakerId =
    moment && moment.speaker >= 0 ? speakers[moment.speaker]?.id ?? null : null;


  return (
    <AbsoluteFill style={{ backgroundColor: "#0b0b0d" }}>
      {audioFileName ? <Audio src={staticFile(audioFileName)} /> : null}

      <MusicTrack
        fileName={musicFileName}
        musicAnalysis={musicAnalysis}
        narrationAnalysis={analysis}
        volume={musicVolume}
        duck={musicDuck}
        durationInFrames={durationInFrames}
      />

      {/* Each effect is its own one-shot sequence. `layout="none"` because
          these draw nothing — a Sequence would otherwise wrap them in an
          AbsoluteFill and stack invisible divs over the picture. */}
      {(sfx ?? []).map((s, i) => (
        <Sequence
          key={`${s.fileName}-${i}`}
          from={Math.max(0, Math.round((s.atMs / 1000) * fps))}
          layout="none"
          name={`SFX ${i + 1}`}
        >
          <Audio src={staticFile(s.fileName)} volume={s.volume} />
        </Sequence>
      ))}

      {/* First, so everything else draws over it. */}
      <BackgroundLayer
        backgrounds={backgrounds ?? []}
        fps={fps}
        crossfadeMs={backgroundCrossfadeMs}
        dim={backgroundDim}
        blur={backgroundBlur ?? 0}
        width={width}
      />

      <div style={{ position: "absolute", inset: 0 }}>
        <WaveformScene
          tracks={tracks}
          width={width}
          height={height}
          timeMs={timeMs}
          analysis={analysis}
          spectrum={spectrum}
          musicAnalysis={musicAnalysis}
          musicSpectrum={musicSpectrum}
        />
      </div>

      {speakers.map((sp, i) => {
        const track = visemeTracks[sp.id];
        const blend = track
          ? visemeBlendAt(track, timeMs / 1000, visemeFadeMs / 1000)
          : { from: VISEME.NEUTRAL, to: VISEME.NEUTRAL, mix: 1 };
        // size is a fraction of frame width, so this resolves identically in
        // the preview and here — no scaling factor to get wrong.
        const size = Math.max(8, sp.size * width);
        const motion = headMotion(
          sp.id,
          timeMs,
          activeSpeakerId === sp.id,
          idleMotion
        );
        return (
          <div
            key={sp.id}
            style={{
              position: "absolute",
              left: `${sp.x * 100}%`,
              top: `${sp.y * 100}%`,
              transform: "translate(-50%, -50%)" + motionTransform(motion, size),
            }}
          >
            {/* The very same components the preview draws. Duplicating the disk
                markup here is what let the border width and glow drift apart
                once already — there is only one implementation now. */}
            {sp.puppet ? (
              <PuppetAvatar
                puppet={sp.puppet}
                urls={puppetUrls[i]}
                viseme={blend.to}
                prevViseme={blend.from}
                mix={blend.mix}
                // Both eyes blink together. Per-eye lids exist for the wink,
                // which is a directed choice rather than something an
                // automatic track should ever produce on its own.
                lidLeft={blinkAt(sp.id, timeMs, idleMotion)}
                lidRight={blinkAt(sp.id, timeMs, idleMotion)}
                browLeft={browAt(browTracks[sp.id], timeMs)}
                browRight={browAt(browTracks[sp.id], timeMs)}
                head={headPoseAt(sp.id, headTracks[sp.id], timeMs, idleMotion)}
                size={size}
                bgOpacity={sp.bgOpacity}
                borderOpacity={sp.borderOpacity}
                bgColor={sp.bgColor}
                borderColor={sp.borderColor}
                outlineShape={sp.outlineShape}
              />
            ) : (
              <SpeakerAvatar
                sheetUrl={sp.sheetFileName ? staticFile(sp.sheetFileName) : ""}
                viseme={blend.to}
                prevViseme={blend.from}
                mix={blend.mix}
                size={size}
                bgOpacity={sp.bgOpacity}
                borderOpacity={sp.borderOpacity}
                bgColor={sp.bgColor}
                borderColor={sp.borderColor}
                outlineShape={sp.outlineShape}
              />
            )}
          </div>
        );
      })}

      <SubtitleFont font={subtitleFont} />

      {/* Last, so subtitles sit above the waveform and the avatars. */}
      <SubtitleScene
        cues={cues}
        config={subtitles}
        width={width}
        height={height}
        timeMs={timeMs}
        speakerColors={speakerColors}
      />
    </AbsoluteFill>
  );
}
