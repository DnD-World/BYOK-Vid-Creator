// ---------------------------------------------------------------------------
// Every knob DramaBox has, in one place.
//
// This list is the reason the knobs went unused: there was no list. The numbers
// lived as literals inside a Python file on a machine that is switched off most
// of the time, which meant one setting for the whole cast and no way to see
// what was set. Now the UI, the job runner and the GPU script all read from
// here, so a slider, a job file and a generation cannot disagree.
//
// Sources, checked 18 Aug 2026 against the DramaBox README and the Hugging Face
// model card. Where our default differs from the documented one, the reason is
// on the line.
// ---------------------------------------------------------------------------

export interface DramaboxParams {
  /** Classifier-free guidance — how strictly the output follows the prompt.
   *  Lower is more natural, higher more text-faithful. */
  cfgScale: number;
  /** Skip-token guidance. The nearest thing to a "how much acting" dial. */
  stgScale: number;
  /** Latent-side CFG standard-deviation rescale. `null` is the documented
   *  "auto". Never touched before today; exposed so it can be tried. */
  rescaleScale: number | null;
  /** Euler flow-matching steps. Quality against time — the one knob that
   *  changes how long a generation takes. */
  steps: number;
  /** Multiplier on the auto-estimated speech length.
   *
   *  OURS IS 1.0, THE DOCUMENTED DEFAULT IS 1.1. The estimate plus ten per cent
   *  headroom comes back as dead air — measured at 3.2s before the first word
   *  in one audition file. Below 1.0 is the only real speed control the engine
   *  has, because the model fills the time it is given. */
  durationMultiplier: number;
  /** Explicit output duration in seconds. `null` is auto, which is right for
   *  dialogue; the docs suggest 20–60 for music or a long scene. */
  genDuration: number | null;
  /** Fixes the noise, not the speaker. The voice reference holds the voice. */
  seed: number;
  /** How many seconds of the reference clip the model conditions on.
   *  Documented default 10; ours is 20 because these clips are long. */
  refDuration: number;
  /** Run the reference clip through the denoiser first. */
  denoiseRef: boolean;
  /** Chunking, for prompts longer than one take. The engine splits at sentence
   *  and quote boundaries, keeps the speaker prefix on every chunk, and joins
   *  with an equal-power crossfade — so these are quality controls, not limits
   *  to be feared. */
  targetChunkDuration: number;
  maxChunkDuration: number;
  crossfadeMs: number;
  /** Resemble Perth neural watermark.
   *
   *  OFF, decided 18 Aug 2026. It is inaudible and it identifies the audio as
   *  machine-made to anyone running Resemble's detector — it does not and
   *  cannot say whose it is, because the API carries no custom payload. A mark
   *  that cannot be ours has nothing to do for us. The engine's own default is
   *  on, so this is a deliberate departure and not an oversight. */
  watermark: boolean;
}

export const DRAMABOX_DEFAULTS: DramaboxParams = {
  cfgScale: 2.5,
  stgScale: 1.5,
  rescaleScale: null,
  steps: 30,
  durationMultiplier: 1.0,
  genDuration: null,
  seed: 42,
  refDuration: 20.0,
  denoiseRef: true,
  targetChunkDuration: 37.0,
  maxChunkDuration: 45.0,
  crossfadeMs: 50.0,
  watermark: false,
};

/** What a control for each knob looks like, and what it is called in plain
 *  words. The UI builds itself from this, so a knob added here appears in the
 *  app without anything else being edited. */
export interface KnobSpec {
  key: keyof DramaboxParams;
  label: string;
  /** One line, said the way it would be said out loud. */
  hint: string;
  kind: "slider" | "toggle" | "number";
  min?: number;
  max?: number;
  step?: number;
  /** A slider that can also be "let the engine decide". */
  nullable?: boolean;
  nullLabel?: string;
  /** Knobs most people should leave alone, folded away behind a disclosure. */
  advanced?: boolean;
}

export const DRAMABOX_KNOBS: KnobSpec[] = [
  {
    key: "stgScale",
    label: "Acting",
    hint: "How hard the voice performs the direction. Up for Τσίκα, down for a flat read.",
    kind: "slider",
    min: 0,
    max: 4,
    step: 0.1,
  },
  {
    key: "durationMultiplier",
    label: "Pace",
    hint: "Time allowed for the words. Below 1 is faster and tighter; above 1 leaves dead air.",
    kind: "slider",
    min: 0.7,
    max: 1.4,
    step: 0.05,
  },
  {
    key: "cfgScale",
    label: "Obedience",
    hint: "How literally the prompt is followed. Higher is more faithful and less natural.",
    kind: "slider",
    min: 1,
    max: 6,
    step: 0.1,
  },
  {
    key: "refDuration",
    label: "Voice sample used",
    hint: "Seconds of the reference clip the voice is copied from.",
    kind: "slider",
    min: 3,
    max: 30,
    step: 1,
  },
  {
    key: "denoiseRef",
    label: "Clean the voice sample",
    hint: "Runs the reference recording through a denoiser before copying it.",
    kind: "toggle",
  },
  {
    key: "watermark",
    label: "Watermark",
    hint: "Marks the file as machine-made to anyone with the detector. It cannot say it is yours. Off.",
    kind: "toggle",
  },
  {
    key: "steps",
    label: "Quality steps",
    hint: "More steps, better audio, slower generation. 30 is the documented default.",
    kind: "slider",
    min: 10,
    max: 60,
    step: 1,
    advanced: true,
  },
  {
    key: "seed",
    label: "Seed",
    hint: "Same seed, same prompt, same file. Change it to get a different take.",
    kind: "number",
    advanced: true,
  },
  {
    key: "genDuration",
    label: "Force a length",
    hint: "Seconds. Normally left to the engine.",
    kind: "slider",
    min: 5,
    max: 60,
    step: 1,
    nullable: true,
    nullLabel: "Auto",
    advanced: true,
  },
  {
    key: "rescaleScale",
    label: "Rescale",
    hint: "Latent-side guidance rescale. Untested here.",
    kind: "slider",
    min: 0,
    max: 1,
    step: 0.05,
    nullable: true,
    nullLabel: "Auto",
    advanced: true,
  },
  {
    key: "targetChunkDuration",
    label: "Chunk target",
    hint: "Seconds per take when a block is long enough to be split.",
    kind: "slider",
    min: 15,
    max: 45,
    step: 1,
    advanced: true,
  },
  {
    key: "maxChunkDuration",
    label: "Chunk ceiling",
    hint: "Never generate a take longer than this. Quality drifts past 45.",
    kind: "slider",
    min: 20,
    max: 60,
    step: 1,
    advanced: true,
  },
  {
    key: "crossfadeMs",
    label: "Chunk join",
    hint: "Milliseconds of crossfade where two takes meet.",
    kind: "slider",
    min: 0,
    max: 200,
    step: 5,
    advanced: true,
  },
];

/** Starting points, so a character does not have to be dialled in from scratch.
 *
 *  Deliberately few and deliberately named after what they sound like rather
 *  than what they set. The numbers are the starting guess to audition, not
 *  findings — nothing here has been judged by ear yet. */
export const VOICE_PRESETS: Record<string, Partial<DramaboxParams>> = {
  "As documented": { stgScale: 1.5, durationMultiplier: 1.1, cfgScale: 2.5 },
  "House default": { stgScale: 1.5, durationMultiplier: 1.0, cfgScale: 2.5 },
  "Bigger performance": { stgScale: 2.2, durationMultiplier: 0.95, cfgScale: 2.3 },
  "Fast and bright": { stgScale: 2.0, durationMultiplier: 0.9, cfgScale: 2.5 },
  "Grave and unhurried": { stgScale: 1.2, durationMultiplier: 1.05, cfgScale: 2.7 },
  "Flat read": { stgScale: 0.8, durationMultiplier: 1.0, cfgScale: 3.0 },
};

/** Character settings over the defaults, then a single block's over those. */
export function resolveParams(
  ...layers: (Partial<DramaboxParams> | undefined)[]
): DramaboxParams {
  let out = { ...DRAMABOX_DEFAULTS };
  for (const layer of layers) {
    if (!layer) continue;
    for (const [k, v] of Object.entries(layer)) {
      if (v !== undefined) (out as Record<string, unknown>)[k] = v;
    }
  }
  return out;
}

/** The names the Python expects. Spelled once, here, so a rename cannot leave
 *  half the pipeline talking to itself. */
const TO_ENGINE: Record<keyof DramaboxParams, string> = {
  cfgScale: "cfg_scale",
  stgScale: "stg_scale",
  rescaleScale: "rescale_scale",
  steps: "steps",
  durationMultiplier: "duration_multiplier",
  genDuration: "gen_duration",
  seed: "seed",
  refDuration: "ref_duration",
  denoiseRef: "denoise_ref",
  targetChunkDuration: "target_chunk_duration",
  maxChunkDuration: "max_chunk_duration",
  crossfadeMs: "crossfade_ms",
  watermark: "watermark",
};

/** Engine-shaped, and only the values that differ from the engine's own
 *  defaults are worth sending — a smaller payload is a readable one, and the
 *  Python fills the rest from the same table. */
export function toEngineParams(p: DramaboxParams): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, name] of Object.entries(TO_ENGINE)) {
    const v = p[key as keyof DramaboxParams];
    if (v === null) continue; // "auto" — let the engine choose
    out[name] = v;
  }
  return out;
}
