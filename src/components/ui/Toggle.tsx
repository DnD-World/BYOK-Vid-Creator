interface Props {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}

/**
 * Breaker switch — a paddle in a machined slot, with the state said in words.
 *
 * The previous version showed only a cap sliding along a rail, which meant the
 * ONLY signal for on-vs-off was the cap's position plus a slight glow. That is
 * one signal, and a weak one: you had to already know which end meant "on".
 *
 * This shows exactly one state word at a time, and four things agree on it —
 * the word, a lamp, the paddle's position, and colour. Nothing here asks you
 * to remember a convention. That is a legibility requirement, not decoration:
 * two competing labels (an "OFF ... ON" pair with a cap between them) is
 * measurably harder to read at a glance and was rejected for exactly that.
 *
 * A real <input type="checkbox"> underneath, so keyboard, focus and screen
 * readers work without reimplementing any of it.
 */
export function Toggle({ label, checked, onChange }: Props) {
  return (
    <div className="leverrow">
      <span className="tlabel">{label}</span>
      <label className="lever">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="slot cut-sm">
          <span className="paddle cut-sm" />
        </span>
        <span className="state">
          <span className="lamp" />
          <span className="word" />
        </span>
      </label>
    </div>
  );
}
