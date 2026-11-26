import test from "node:test";
import assert from "node:assert/strict";
import { extractOutputText, askOpenAI } from "./ai.mjs";

test("the answer text is found in the raw OpenAI response", () => {
  assert.equal(extractOutputText({ output_text: "{\"a\":1}" }), "{\"a\":1}");
  assert.equal(extractOutputText({ output: [{ content: [{ type: "output_text", text: "{\"b\":" }, { text: "2}" }] }] }), "{\"b\":2}");
  assert.equal(extractOutputText({}), "");
});

test("the request carries the key, the instructions and the cleaned text only", async () => {
  let seen;
  const fake = async (url, init) => {
    seen = { url, init };
    return { ok: true, json: async () => ({ output_text: "{\"price\":1}" }) };
  };
  const out = await askOpenAI("Taman X RM1", { apiKey: "k", fetchImpl: fake });
  assert.equal(out, "{\"price\":1}");
  assert.equal(seen.url, "https://api.openai.com/v1/responses");
  assert.equal(seen.init.headers.Authorization, "Bearer k");
  const body = JSON.parse(seen.init.body);
  assert.equal(body.input, "Taman X RM1");
  assert.match(body.instructions, /ONLY facts that are written in the post/);
});

test("a missing key and an OpenAI error are explained", async () => {
  await assert.rejects(() => askOpenAI("x", { apiKey: "" }), /OPENAI_API_KEY/);
  const bad = async () => ({ ok: false, status: 401, json: async () => ({ error: { message: "bad key" } }) });
  await assert.rejects(() => askOpenAI("x", { apiKey: "k", fetchImpl: bad }), /401.*bad key/);
});
