export interface ScriptSegment {
  speakerId: string;
  speakerLabel: string;
  text: string;
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

    const label = line.slice(0, idx).trim().toLowerCase();
    const text = line.slice(idx + 1).trim();
    const speaker = byLabel.get(label);
    if (!speaker || !text) {
      unmatchedLines.push(line);
      continue;
    }

    segments.push({ speakerId: speaker.id, speakerLabel: speaker.label, text });
  }

  return { segments, unmatchedLines };
}
