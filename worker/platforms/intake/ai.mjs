import { INTAKE_INSTRUCTIONS } from "./parse.mjs";

const OPENAI_URL = "https://api.openai.com/v1/responses";
const MODEL = "gpt-5-mini";

/** The text of an OpenAI "responses" answer (the SDK's output_text, done by hand). */
export function extractOutputText(json) {
  if (typeof json?.output_text === "string") return json.output_text;
  const parts = [];
  for (const item of Array.isArray(json?.output) ? json.output : []) {
    for (const c of Array.isArray(item?.content) ? item.content : []) {
      if (typeof c?.text === "string") parts.push(c.text);
    }
  }
  return parts.join("");
}

/** OpenAI's JSON mode needs the word JSON inside the message itself, not only in the instructions. */
export const inputFor = (cleanText) => "Post text:\n---\n" + cleanText + "\n---\n\nReturn the facts as the JSON object described in the instructions.";

/** Sends the already-cleaned post text to OpenAI and returns the JSON text it answers with. */
export async function askOpenAI(cleanText, { apiKey, fetchImpl = fetch, timeoutMs = 60_000 }) {
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set in the worker's .env file.");
  const res = await fetchImpl(OPENAI_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, instructions: INTAKE_INSTRUCTIONS, input: inputFor(cleanText), text: { format: { type: "json_object" } } }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.json())?.error?.message ?? "";
    } catch {
      /* no detail */
    }
    throw new Error(`OpenAI could not read the post (${res.status}). ${detail}`.trim());
  }
  const text = extractOutputText(await res.json());
  if (!text) throw new Error("OpenAI returned nothing for this post.");
  return text;
}

/** Same question, with the post's photos attached, for posts whose details are written on a picture. */
export async function askOpenAIWithImages(cleanText, imageBuffers, { apiKey, fetchImpl = fetch, timeoutMs = 90_000 }) {
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set in the worker's .env file.");
  const content = [
    { type: "input_text", text: inputFor(cleanText || "(no text was found in the post)") + " The photos from the post are attached: read any words written on them." },
    ...imageBuffers.map((b) => ({ type: "input_image", image_url: `data:image/jpeg;base64,${b.toString("base64")}` })),
  ];
  const res = await fetchImpl(OPENAI_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, instructions: INTAKE_INSTRUCTIONS, input: [{ role: "user", content }], text: { format: { type: "json_object" } } }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.json())?.error?.message ?? "";
    } catch {
      /* no detail */
    }
    throw new Error(`OpenAI could not read the photos (${res.status}). ${detail}`.trim());
  }
  const text = extractOutputText(await res.json());
  if (!text) throw new Error("OpenAI returned nothing for the photos.");
  return text;
}
