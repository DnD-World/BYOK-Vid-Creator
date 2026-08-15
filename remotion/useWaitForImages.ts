// ---------------------------------------------------------------------------
// Holds back frame capture until the given images have actually decoded.
//
// Why this exists: Remotion only knows to wait for assets it can see — <Img>,
// <Video>, <Audio>. A CSS `background-image` is invisible to it, so a frame
// gets captured the instant the DOM is ready, before a large PNG has decoded.
// The viseme sheets are 12-15MB each, and the symptom was a rendered frame
// showing a thin sliver of a partially-decoded sprite sheet while the preview
// looked perfect.
//
// The avatar draws its sprite via background-position (that's what makes the
// cell maths simple and identical in preview and render), so rather than
// restructure it around <Img>, we preload the same URLs here and tell Remotion
// to wait. Failures call continueRender too — a missing sheet should render a
// faceless disk, never hang the whole render until the delayRender timeout.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { continueRender, delayRender } from "remotion";

export function useWaitForImages(urls: string[]): void {
  // Join to a stable primitive so the effect isn't re-triggered by a new array
  // identity on every frame.
  const key = urls.filter(Boolean).join("|");

  const [handle] = useState(() => (key ? delayRender(`Loading viseme sheets`) : null));

  useEffect(() => {
    if (handle === null) return;
    const list = key ? key.split("|") : [];
    if (list.length === 0) {
      continueRender(handle);
      return;
    }

    let remaining = list.length;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      continueRender(handle);
    };
    // ONCE PER IMAGE. This used to be a bare counter, and an image could settle
    // twice — decode() resolved AND onerror was left attached — which lets the
    // count reach zero while other images are still loading, releasing the
    // render early. That is the exact failure this hook exists to prevent.
    const settleOnce = (settled: { done: boolean }) => () => {
      if (settled.done) return;
      settled.done = true;
      remaining -= 1;
      if (remaining <= 0) finish();
    };

    for (const url of list) {
      const img = new Image();
      const settle = settleOnce({ done: false });
      img.onload = settle;
      img.onerror = settle;
      img.src = url;
      // decode() resolves only once the bitmap is actually usable, which is the
      // real precondition — `onload` can fire while decoding is still pending.
      if (typeof img.decode === "function") {
        img.decode().then(settle, settle);
      }
    }
  }, [handle, key]);
}
