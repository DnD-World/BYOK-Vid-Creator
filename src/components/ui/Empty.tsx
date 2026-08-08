// Deco Noir's `.empty` / `.emptymark` — the system's own empty state.
//
// These were plain grey paragraphs. That reads as text the app forgot to
// remove, rather than as a considered "there is nothing here yet, and here is
// what would put something here". The library's version centres the message
// under a chamfered plate that breathes slowly, which is the difference
// between a gap and a place.
//
// The plate is decorative and marked aria-hidden; the words carry the meaning,
// and they are the same words as before — an empty state earns its keep by
// saying what to do next, and none of that changes because it got a frame.

interface Props {
  children: React.ReactNode;
}

export function Empty({ children }: Props) {
  return (
    <div className="empty">
      <span className="emptymark cut" aria-hidden />
      <p className="text-sm text-[color:var(--ink-3)] max-w-[34ch]">{children}</p>
    </div>
  );
}
