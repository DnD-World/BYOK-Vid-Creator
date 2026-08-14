export type AspectRatio = "9:16" | "16:9";
export type Engine = "remotion" | "ffmpeg";
export type Fps = 10 | 24 | 30;

export interface RenderSettings {
  format: AspectRatio;
  width: number;
  height: number;
  durationSec: number;   // max 600 (10 min)
  engine: Engine;
}

/** One waveform belonging to one sound source — a speaker, or the music.
 *
 *  This replaces the old single global WaveformConfig plus its `behavior` enum
 *  ("single" / "dual" / "dual-plus-music" / "triple"). Those combinations are
 *  now emergent: which tracks exist and which are enabled IS the behaviour, so
 *  the enum stopped describing anything the data didn't already say.
 *
 *  Colour deliberately lives on the owner, not here — a speaker's waveform is
 *  their outline colour, so the two cannot drift apart. */
export interface TrackWaveform {
  enabled: boolean;
  style: "bars" | "lines" | "wave" | "mirror" | "dots" | "rings";
  /** "speaker" rings the owning speaker's own face rather than the frame —
   *  the halo look. Music has no face, so it falls back to "circular". */
  position: "circular" | "speaker" | "top" | "bottom" | "left" | "right";
  scale: number;       // 0.2–2.5, amplitude-extension multiplier
  density: number;     // sample/bar count, 8–160
  thickness: number;   // 0.2–3, bar/stroke width multiplier
  dotSize: number;     // dots-style only
  edgeFlush: boolean;
  smoothing: number;   // 0–1, how much neighbouring bars influence each other
  ringInnerRadius: number;
  ringSize: number;
  ringX: number;
  ringY: number;
  /** Lateral offset so simultaneous tracks read as separate lanes. */
  lane: number;
  /** Glitter thrown off the loud tips, 0–1. Amplitude-gated rather than
   *  scattered evenly, so it reads as a second view of the audio instead of
   *  decoration laid over it. */
  sparkle: number;
}

export type OutlineShape = "circle" | "rounded" | "square" | "none";

/** How a thing sitting on top of the video treats what is behind it.
 *
 *  One shape for every backdrop — the panel behind subtitles, the disc behind
 *  an avatar — so there is one control to learn and one implementation to get
 *  wrong. Before this there was no blur anywhere in the app, and a speaker's
 *  backdrop was a flat colour with an opacity and nothing else. */
export interface Surface {
  style: SurfaceStyle;
  /** Blur radius as a fraction of frame WIDTH, so a look authored against the
   *  preview survives a 1080p render. Same convention as speaker size and
   *  subtitle font size, and for the same reason. 0.008 ≈ 15px at 1920. */
  blur: number;
  color: string;
  opacity: number;
  /** The hairline edge. Glass reads as glass because its edge catches the
   *  light; without this it is a smudge. */
  borderOpacity: number;
  /** Corner rounding as a fraction of the panel's own height. */
  radius: number;
}

export type SurfaceStyle =
  /** Nothing drawn. */
  | "none"
  /** Flat colour at `opacity` — what bgColor + bgOpacity used to do alone. */
  | "solid"
  /** The video behind is blurred, untinted. The footage stays readable. */
  | "blur"
  /** Blur, tint and edge together. Frosted. */
  | "glass";

export function defaultSurface(): Surface {
  return {
    style: "none",
    blur: 0.008,
    color: "#000000",
    opacity: 0.35,
    borderOpacity: 0.25,
    radius: 0.25,
  };
}

/** How one sentence of subtitle gives way to the next.
 *
 *  Per-sentence, driven by the cue boundaries wordTiming.ts already produces —
 *  nothing new has to be timed. */
export interface SubtitleTransition {
  style: "none" | "pop" | "crossBlur";
  durationMs: number;
  /** `pop` only: overshoot before settling. 1.05 = out to 105%, back to 100%. */
  overshoot: number;
  /** Motion blur through the movement, 0–1. */
  blur: number;
}

export function defaultSubtitleTransition(): SubtitleTransition {
  return { style: "pop", durationMs: 220, overshoot: 1.05, blur: 0.4 };
}

/** Read a speaker's backdrop, whichever era it was written in.
 *
 *  One function so the fallback rule lives in one place. A project saved before
 *  surfaces existed has bgColor and bgOpacity and nothing else; the flat disc
 *  those describe is exactly a `solid` surface, so the translation is total and
 *  nothing is guessed. */
export function migrateSurface(sp: {
  surface?: Surface;
  bgColor?: string;
  bgOpacity?: number;
}): Surface {
  if (sp.surface) return sp.surface;
  const opacity = sp.bgOpacity ?? 0;
  return {
    ...defaultSurface(),
    // An invisible disk stays invisible. Turning every old project's speakers
    // into visible slabs because a new field defaulted to something is the
    // migration failure that would be noticed last and trusted least.
    style: opacity > 0 ? "solid" : "none",
    color: sp.bgColor ?? "#000000",
    opacity,
  };
}

/** Legacy global waveform config. Kept only so old saved templates can be
 *  read and migrated; nothing new should reference it. */
export interface WaveformConfig {
  position: "circular" | "top" | "bottom" | "left" | "right";
  behavior: "single" | "single-colorshift" | "dual" | "dual-plus-music" | "triple";
  style: "bars" | "lines" | "wave" | "mirror" | "dots" | "rings";
  colorA: string;
  colorB: string;
  colorMusic: string;
  scale: number;       // 0.5–1.8, overall amplitude-extension multiplier
  density: number;      // sample/bar count, 16–96
  dotSize: number;      // dots-style-only radius multiplier, 0.4–2.5
  edgeFlush: boolean;   // true = hug the true edge, false = inset margin
  ringInnerRadius: number; // 0–0.8, how much open space in the middle (for an avatar)
  ringSize: number;     // 0.5–1.5, overall ring cluster scale
  ringX: number;        // 0–1, ring cluster center (fraction of frame)
  ringY: number;        // 0–1
}

export interface SubtitleConfig {
  enabled: boolean;
  position: "bottom" | "center" | "top";
  /** Font size as a fraction of frame WIDTH — resolution-independent, same
   *  convention as speaker size/position. */
  fontSize: number;
  color: string;
  /** Colour of the word currently being spoken. */
  activeColor: string;
  strokeColor: string;
  /** Stroke width as a fraction of the font size. */
  strokeWidth: number;
  /** Glow strength on the active word, 0 = off. */
  activeGlow: number;
  /** Take the active word's colour and glow from whoever is speaking, instead
   *  of `activeColor`. Ties the caption to the speaker without a second set of
   *  controls to keep in sync — the same rule the waveform already follows. */
  activeFromSpeaker: boolean;
  uppercase: boolean;
  /** Characters per cue before the text wraps to a new cue. */
  maxChars: number;
  /** Google Fonts family name, downloaded and cached locally, or null/absent
   *  for the system stack. Only the NAME is project data — the files are a
   *  cache, re-fetchable on any machine. */
  fontFamily?: string | null;
  fontWeight?: number;
  /** Replace a word with an emoji when the picture is unmistakable — 🍫 for
   *  σοκολάτα, ⚕️ for κτηνίατρος, ❗ for a bare "!". Off by default: it is a
   *  strong stylistic choice and a lesson may not want it. See
   *  src/lib/subtitles/emoji.ts for what qualifies. */
  emoji?: boolean;
  /** The panel behind the text. Optional so every project and preset written
   *  before surfaces existed still loads; absent means `none`, which is what
   *  those projects looked like. */
  surface?: Surface;
  /** How one sentence gives way to the next. Absent means `none` — again, what
   *  older projects already did. */
  transition?: SubtitleTransition;
}

export interface SpeakerConfig {
  id: string;
  label: string;         // "Male Dog" / "Female"
  /** Absolute path on disk to the 3072x3072 viseme sheet — the source of truth,
   *  and what templates save. Deliberately NOT directly loadable by either
   *  renderer: the preview turns it into a blob URL over IPC, and the render
   *  copies the file into Remotion's public dir. */
  sheetPath?: string;
  /** Absolute path on disk to a `*.puppet.json` — a layered character rather
   *  than a flattened sheet. Travels the same two roads as `sheetPath` for the
   *  same reasons, except a puppet is a JSON file plus ~20 PNGs beside it
   *  rather than one image.
   *
   *  When both are set the PUPPET WINS. They are kept side by side rather than
   *  as one "face" field because they are not interchangeable: a sheet is nine
   *  baked faces, a puppet blinks and winks and raises one brow. Someone
   *  halfway through building a puppet should not lose the working sheet, and
   *  every project saved before puppets existed still opens with its face on. */
  puppetPath?: string;
  /** The disc behind this speaker.
   *
   *  SUCCESSOR TO bgColor + bgOpacity, which described a flat colour and could
   *  not describe a blur. Those two are kept only until the migration in
   *  useProjectStore has rewritten every autosave and preset on disk, and are
   *  then deleted — the legacy WaveformConfig sitting three fields below is the
   *  cautionary tale for what happens when a superseded field is allowed to
   *  stay. Absent means "not migrated yet"; read through migrateSurface(). */
  surface?: Surface;
  /** @deprecated Read via migrateSurface(). Absorbed into `surface`. */
  bgOpacity: number;     // default 0 (invisible disk)
  borderOpacity: number; // default 1
  /** @deprecated Read via migrateSurface(). Absorbed into `surface`. */
  bgColor: string;
  /** Outline colour — and, by construction, this speaker's waveform colour. */
  borderColor: string;
  outlineShape: OutlineShape;
  /** This speaker's own waveform. Animates only while they are speaking. */
  waveform: TrackWaveform;
  x: number;
  y: number;
  // Diameter as a 0–1 fraction of frame WIDTH — same convention as x/y above,
  // and for the same reason. Storing it in pixels meant a size authored on the
  // small preview canvas rendered at that literal pixel count on a 1080-wide
  // frame, so avatars came out several times too small. A fraction is
  // resolution-independent: preview and render each multiply by their own
  // width and agree by construction.
  size: number;
  /** Which engine speaks this speaker's lines. Per-speaker, not global, so a
   *  fast Piper voice and a cloned Chatterbox voice can share one script. */
  ttsEngine?: "chatterbox" | "piper";
  voiceId?: string;      // assigned Piper voice's onnxPath, if any (test-tier engine)
  chatterboxVoiceMode?: "predefined" | "clone"; // production-tier engine voice assignment
  chatterboxVoiceRef?: string; // predefined_voice_id or reference_audio_filename, depending on mode above
}

/** Per-band spectrum for every analysis frame — the data that lets bars move
 *  independently instead of all scaling with one loudness number.
 *
 *  Frame-major and quantised: frame `f`, band `b` is byte `f * bandCount + b`,
 *  0–255. Packed as base64 rather than a number[][] because at 60Hz and 24
 *  bands a ten-minute narration is 864k values per array — as JSON that is
 *  megabytes of "0.42," and it has to cross an IPC boundary and then a render
 *  boundary. A byte per value is all the precision a bar height can show. */
export interface AudioSpectrum {
  bandCount: number;
  /** base64 Uint8Array — the band's current level. */
  bands: string;
  /** base64 Uint8Array — the peak-hold cap above that level. */
  peaks: string;
}

/** Precomputed loudness + who's-talking data for the narration audio, sampled
 *  at a fixed `hz` so one analysis serves the preview and any render fps.
 *  Produced by electron/audio/analyzeNarration.ts. */
export interface AudioAnalysis {
  hz: number;
  durationMs: number;
  /** 0–1 smoothed RMS envelope, one entry per analysis frame. */
  amp: number[];
  /** Index into the speakers array, or -1 for silence. Same length as `amp`. */
  speaker: number[];
  /** Absent when the spectrum travels out of band — during a render it is
   *  written into the public dir and fetched by the composition instead of
   *  riding along in inputProps. The waveform falls back to the shape function
   *  when it is missing, so this staying null is a degradation, not a break. */
  spectrum?: AudioSpectrum | null;
}

export interface NarrationSegment {
  speakerId: string;
  speakerLabel: string;
  text: string;
  startMs: number;   // offset within the combined file
  endMs: number;
}

/** The last successfully generated narration. Held in the project store
 *  rather than in NarrationPanel's local state so the render bar can attach
 *  it and match its length automatically, and so the waveform and subtitles
 *  have a single source of truth for timing later. */
export interface NarrationResult {
  filePath: string;
  segments: NarrationSegment[];
  /** null if the WAV couldn't be analysed (unexpected encoding). */
  analysis: AudioAnalysis | null;
}

/** One background clip and the stretch of video it covers.
 *
 *  `filePath` is where it was downloaded to; the hit is kept beside it so the
 *  UI can still show a thumbnail and credit the author without re-searching. */
export interface BackgroundScene {
  startMs: number;
  endMs: number;
  query: string;
  reason: string;
  note?: string;
  filePath?: string;
  hit: {
    id: string;
    provider: "pixabay" | "pexels";
    url: string;
    thumbUrl: string;
    width: number;
    height: number;
    durationSec: number;
    author: string;
    pageUrl: string;
  } | null;
}

/** One sound effect, pinned to a moment in the video.
 *
 *  Deliberately just a file and a time. There is no envelope, no fade, no
 *  trimming: a bark is a bark. Anything more and this becomes a DAW, which is
 *  a different app. */
export interface SfxClip {
  id: string;
  filePath: string;
  /** Shown in the list — the file name, or what it was searched for. */
  label: string;
  /** When it fires, in ms from the start of the video. */
  atMs: number;
  /** 0–1. Effects sit on top of the mix rather than under it, so this starts
   *  lower than it looks like it should. */
  volume: number;
}

export interface ProjectState {
  render: RenderSettings;
  /** Background clips, in order. Empty means a plain dark background. */
  backgrounds: BackgroundScene[];
  /** Scrim over the background clips, 0–1. Backgrounds sit under the waveform,
   *  the avatars and the subtitles, and stock footage at full brightness takes
   *  the frame over — the waveform disappears into it and white subtitles land
   *  on whatever the clip happens to be doing. */
  backgroundDim: number;
  /** Blur on the background clips, as a fraction of frame WIDTH. 0 = sharp.
   *
   *  Deliberately NOT a Surface: this blurs the footage itself rather than
   *  laying a panel over it. Together with backgroundDim it is the choice
   *  between pushing the whole background back, and leaving it bright while
   *  the avatars and subtitles carry their own surfaces. Both at once is
   *  allowed — over nine minutes of busy stock footage it may be needed. */
  backgroundBlur: number;
  /** Crossfade between one background clip and the next, in ms. 0 = hard cut.
   *  Capped at half the shortest clip when it is applied. */
  backgroundCrossfadeMs: number;
  /** The music track's waveform, and its colour. Always animating — music
   *  doesn't take turns the way speakers do. */
  musicWaveform: TrackWaveform;
  musicColor: string;
  subtitles: SubtitleConfig;
  /** Silence inserted before a line by the same speaker — a breath. */
  pauseSameMs: number;
  /** Silence inserted when the speaker changes. Two people swapping turns with
   *  no gap at all is the single clearest tell that a conversation was
   *  assembled rather than recorded. */
  pauseTurnMs: number;
  /** Crossfade between viseme cells, in ms. A hard cut between photoreal mouth
   *  shapes reads as a glitch; a short fade reads as movement. 0 = hard cut. */
  visemeFadeMs: number;
  /** How much the heads breathe and drift when nothing else is happening.
   *  0 = perfectly still, which is what made them read as photographs. */
  idleMotion: number;
  fps: Fps;
  speakers: SpeakerConfig[];
  script: string;        // raw "Label: text" per line narration script
  language: string;      // narration language code, e.g. "el", "en"
  narration: NarrationResult | null;
  /** An audio file the user attached by hand, overriding the narration. It has
   *  no speaker segments — nobody said who is talking — so it drives the
   *  waveform but not subtitles or lip-sync. */
  attachedAudio: { filePath: string; analysis: AudioAnalysis | null } | null;
  /** Background music. Mixed under the narration, and — unlike `attachedAudio`,
   *  which replaces it — played alongside. Its analysis is what finally gives
   *  the music waveform something of its own to animate to. */
  music: { filePath: string; analysis: AudioAnalysis | null } | null;
  /** Sound effects, each pinned to its own moment. Order is irrelevant — they
   *  are placed by time, not sequenced. */
  sfx: SfxClip[];
  /** Music level when nobody is speaking, 0–1. */
  musicVolume: number;
  /** How far the music drops while someone speaks, 0–1. 0 = no ducking,
   *  1 = silence under speech. Applied to `musicVolume`, so the two are
   *  independent: a loud bed can duck hard, a quiet one barely at all. */
  musicDuck: number;
}
