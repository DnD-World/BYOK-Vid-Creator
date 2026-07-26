import https from "node:https";
import * as keyStore from "../keyStore";

// ---------------------------------------------------------------------------
// GLM-5.2 via NVIDIA NIM — script draft assistant. Rather than inventing a
// separate "scenes" data structure that nothing else in the app uses yet,
// this generates directly into the "Label: text" per-line format
// NarrationPanel/parseScript.ts already consume — the draft becomes an
// editable starting point in the same script textarea, not a new pipeline
// stage. MIT-licensed model, OpenAI-compatible API.
// ---------------------------------------------------------------------------

const NVIDIA_MODEL = "z-ai/glm-5.2";
const NVIDIA_HOST = "integrate.api.nvidia.com";

export interface DraftScriptOptions {
  topic: string;
  speakerLabels: string[];
  languageName: string; // e.g. "Greek", "English" — spelled out for the prompt
  tone?: string;        // e.g. "playful", "informative" — optional
}

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```[a-z]*\n([\s\S]*?)\n```$/i);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

export async function draftScript(opts: DraftScriptOptions): Promise<string> {
  const apiKey = await keyStore.getKey("nvidia");
  if (!apiKey) {
    throw new Error("No NVIDIA API key saved — add one in Backend Settings first.");
  }
  if (opts.speakerLabels.length === 0) {
    throw new Error("Add at least one speaker before generating a script draft.");
  }

  const systemPrompt = [
    `You write short narration/dialogue scripts in ${opts.languageName}.`,
    `Output ONLY the script itself, one line per line of speech, formatted exactly as:`,
    `Label: text`,
    `Use ONLY these exact speaker labels, spelled exactly as given: ${opts.speakerLabels.join(", ")}.`,
    `Do not add a title, headers, scene directions, markdown formatting, or any commentary — just the`,
    `"Label: text" lines themselves, nothing before or after them.`,
  ].join(" ");

  const userPrompt = [
    `Topic: ${opts.topic}`,
    opts.tone ? `Tone: ${opts.tone}` : null,
  ].filter(Boolean).join("\n");

  const payload = JSON.stringify({
    model: NVIDIA_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.7,
    max_tokens: 2048,
  });

  const body = await new Promise<string>((resolve, reject) => {
    const req = https.request(
      {
        host: NVIDIA_HOST,
        path: "/v1/chat/completions",
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
        timeout: 60000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf-8");
          if ((res.statusCode ?? 500) >= 400) {
            reject(new Error(`NVIDIA API returned ${res.statusCode}: ${text}`));
          } else {
            resolve(text);
          }
        });
        res.on("error", reject);
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("NVIDIA API request timed out."));
    });
    req.write(payload);
    req.end();
  });

  const parsed = JSON.parse(body);
  const content: string | undefined = parsed?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("NVIDIA API response didn't include any content — check the raw response if this persists.");
  }

  return stripCodeFences(content);
}
