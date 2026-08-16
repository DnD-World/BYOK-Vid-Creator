export interface ScriptSegment {
  speakerId: string;
  speakerLabel: string;
  text: string;
  /** How this ONE line is delivered — "σιγανά, σαν μυστικό".
   *
   *  Written in the script as `Καίτη [σιγανά]: ...`, before the colon, because
   *  everything after the colon is spoken aloud and a direction written there
   *  would be read out. It is never part of `text` for the same reason.
   *
   *  DramaBox is prompt-driven and this is the half of its interface that the
   *  per-character paragraph in docs/CHARACTER-VOICES.md cannot reach: that
   *  paragraph is a constant, so it can say who someone is but not that this
   *  particular line is a whisper. Engines that have no such control ignore it,
   *  which costs nothing — a line still says the right words in the right
   *  voice. */
  direction?: string;
}

/** A sound effect, cued on its own line: `[ΗΧΟΣ: dog-bark-small]`.
 *
 *  A bark is not speech and must not go through a voice — writing "Γαβ!" as a
 *  line of dialogue makes a synthetic human say the word "bark" in Greek. So
 *  sounds are recordings from `sfx/library`, placed on their own track.
 *
 *  Position is given as a SEGMENT INDEX rather than a time, because when a
 *  script is written nobody knows how long any line will take to say. The
 *  runner turns it into a timestamp once narration exists. */
export interface SoundCue {
  /** File stem in `sfx/library`, without the extension. */
  name: string;
  /** Plays at the start of this segment. Equal to the number of segments when
   *  the cue is the last line, meaning "after everything". */
  beforeSegment: number;
}

/**
 * Parses a simple "Label: text" per line script format, matching each
 * line's label against a known speaker (case-insensitive, trimmed). Lines
 * that don't match a known speaker, or have no text after the colon, are
 * collected as unmatchedLines rather than thrown — a typo in one line
 * shouldn't block generating the rest of the narration.
 */
export function parseScript(
  script: string,
  speakers: { id: string; label: string }[]
): { segments: ScriptSegment[]; unmatchedLines: string[]; cues: SoundCue[] } {
  const segments: ScriptSegment[] = [];
  const unmatchedLines: string[] = [];
  const cues: SoundCue[] = [];
  const byLabel = new Map(speakers.map((s) => [s.label.trim().toLowerCase(), s]));

  for (const rawLine of script.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    // A sound cue is a whole line of its own and has no speaker, so it is
    // matched before the "Label: text" shape — `[ΗΧΟΣ: γάβγισμα]` does contain
    // a colon, and read as a name it would be a speaker nobody has.
    const cue = line.match(/^\[\s*(?:ΗΧΟΣ|HXOΣ|SFX)\s*:\s*([^\]]+?)\s*\]$/iu);
    if (cue) {
      cues.push({ name: cue[1], beforeSegment: segments.length });
      continue;
    }

    const idx = line.indexOf(":");
    if (idx === -1) {
      unmatchedLines.push(line);
      continue;
    }

    // The label may carry a stage direction: `Καίτη [σιγανά]: ...`. Split it
    // off before matching, or the name would never match and the line would be
    // silently dropped as a typo.
    const rawLabel = line.slice(0, idx).trim();
    const bracket = rawLabel.match(/^(.*?)\s*\[([^\]]*)\]\s*$/);
    const label = (bracket ? bracket[1] : rawLabel).trim().toLowerCase();
    const direction = bracket?.[2].trim() || undefined;
    const text = line.slice(idx + 1).trim();
    const speaker = byLabel.get(label);
    if (!speaker || !text) {
      unmatchedLines.push(line);
      continue;
    }

    segments.push({ speakerId: speaker.id, speakerLabel: speaker.label, text, direction });
  }

  return { segments, unmatchedLines, cues };
}
