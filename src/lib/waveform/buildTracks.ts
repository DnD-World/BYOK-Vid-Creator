// ---------------------------------------------------------------------------
// Turns speakers + the music track into the flat list the waveform draws.
//
// One place builds this list, and both the preview and the render call it — so
// "which waveforms are on screen" cannot be answered differently in the two.
//
// Colour is resolved here rather than stored on the track: a speaker's waveform
// IS their outline colour. Keeping it derived means the two can never drift,
// which is the whole reason the waveform moved onto the speaker.
// ---------------------------------------------------------------------------

import type { SpeakerConfig, TrackWaveform } from "../../store/types";

export interface RenderTrack {
  cfg: TrackWaveform;
  color: string;
  /**
   * Index into the speakers array, or null for music. Music ignores the
   * active-speaker gate; a speaker's waveform only animates on their own lines.
   */
  speakerIndex: number | null;
  /** Where the owning face sits, as 0–1 fractions, for the "speaker" position.
   *  null for music, which has no face to ring. */
  anchor: { x: number; y: number; size: number } | null;
}

type TrackSpeaker = Pick<SpeakerConfig, "borderColor" | "waveform" | "x" | "y" | "size">;

export function buildTracks(
  speakers: TrackSpeaker[],
  musicWaveform: TrackWaveform,
  musicColor: string
): RenderTrack[] {
  const tracks: RenderTrack[] = [];

  speakers.forEach((sp, i) => {
    if (sp.waveform?.enabled) {
      tracks.push({
        cfg: sp.waveform,
        color: sp.borderColor,
        speakerIndex: i,
        anchor: { x: sp.x, y: sp.y, size: sp.size },
      });
    }
  });

  if (musicWaveform?.enabled) {
    tracks.push({ cfg: musicWaveform, color: musicColor, speakerIndex: null, anchor: null });
  }

  return tracks;
}

/** Sensible starting waveform for a newly added speaker. `lane` is spread so
 *  two speakers don't draw exactly on top of each other. */
export function defaultTrackWaveform(lane = 0): TrackWaveform {
  return {
    enabled: true,
    style: "bars",
    position: "circular",
    scale: 1,
    density: 56,
    thickness: 1,
    dotSize: 1,
    edgeFlush: false,
    // Was 0.35, which cost nothing when every bar was a sample of one smooth
    // sine. Now that neighbouring bars carry different frequency bands, the
    // difference between them is the signal, and blending it away is the one
    // setting that can make a real spectrum look like the old fake one again.
    smoothing: 0.2,
    ringInnerRadius: 0.2,
    ringSize: 1,
    ringX: 0.5,
    ringY: 0.5,
    lane,
  };
}
