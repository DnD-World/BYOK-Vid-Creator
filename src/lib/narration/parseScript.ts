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
): { segments: ScriptSegment[]; unmatchedLines: string[] } {
  const segments: ScriptSegment[] = [];
  const unmatchedLines: string[] = [];
  const byLabel = new Map(speakers.map((s) => [s.label.trim().toLowerCase(), s]));

  for (const rawLine of script.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

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

  return { segments, unmatchedLines };
}
