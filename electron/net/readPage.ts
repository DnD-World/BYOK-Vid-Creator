// ---------------------------------------------------------------------------
// A web page, reduced to the words on it.
//
// The first step of "give it a URL and get a video": before anything can be
// written about a page, the page has to become plain text. That is all this
// does — fetch, strip the markup, and hand back the readable part.
//
// WHAT IT DELIBERATELY DOES NOT DO. It does not run JavaScript, so a page that
// renders its body in the browser comes back nearly empty. That is reported
// rather than passed on quietly: a script written from an empty page would be
// invented from nothing, and inventing dog-training advice is the single worst
// thing this project can produce.
// ---------------------------------------------------------------------------

export interface PageText {
  url: string;
  title: string;
  text: string;
  /** Anything the caller should know before trusting this. */
  warnings: string[];
}

/** Tags whose contents are never prose. Stripped whole, contents included. */
const DROP = /<(script|style|noscript|svg|nav|header|footer|form|aside)\b[^>]*>[\s\S]*?<\/\1>/gi;

const ENTITIES: Record<string, string> = {
  "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">",
  "&quot;": '"', "&#39;": "'", "&apos;": "'", "&hellip;": "…",
  "&mdash;": "—", "&ndash;": "–", "&laquo;": "«", "&raquo;": "»",
};

function decode(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&[a-z]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? m);
}

export async function readPage(url: string, timeoutMs = 20000): Promise<PageText> {
  const warnings: string[] = [];

  let normalised = url.trim();
  if (!/^https?:\/\//i.test(normalised)) normalised = `https://${normalised}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let html: string;
  try {
    const res = await fetch(normalised, {
      signal: controller.signal,
      headers: {
        // Some sites serve a stub to anything that does not look like a
        // browser. This is not a disguise — it is the same request a person
        // reading the page would make.
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        "Accept-Language": "el,en;q=0.8",
      },
    });
    if (!res.ok) throw new Error(`the site answered ${res.status} ${res.statusText}`);
    html = await res.text();
  } finally {
    clearTimeout(timer);
  }

  const title = decode(
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ""
  ).trim();

  // The main article if the page says which part that is, otherwise the body.
  const main =
    html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] ??
    html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ??
    html;

  const text = decode(
    main
      .replace(DROP, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      // A paragraph break should survive as one, or every sentence runs into
      // the next and the writer downstream cannot tell where a thought ended.
      .replace(/<\/(p|div|h[1-6]|li|tr|section)>/gi, "\n")
      .replace(/<br\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n")
    .trim();

  // A page that came back with almost nothing usually rendered its body in the
  // browser. Saying so is the whole point: the alternative is a lesson written
  // from thin air.
  if (text.length < 400) {
    warnings.push(
      `Only ${text.length} characters of text came back from ${normalised}. ` +
        `The page probably builds itself in the browser, which this cannot run. ` +
        `Paste the text in by hand rather than writing a lesson from nothing.`
    );
  }

  return { url: normalised, title, text, warnings };
}
