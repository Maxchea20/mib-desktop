/*
|--------------------------------------------------------------------------
| RUNWAY AVATAR VIDEO (a talking video of you, made by Runway)
|--------------------------------------------------------------------------
|
| Steps, using Runway's official "Avatars" and "Avatar videos" tools:
|   1. make an avatar once from your photo (Runway keeps it; the id is reused)
|   2. ask the avatar to speak a script (text) with a voice
|   3. wait for the video, then download it
|
| The Runway client is passed in, so this file is tested without Runway.
| Every call to Runway uses credits, so callers show the plan first.
|
*/

export const MODEL = "gwm1_avatars";
export const MAX_DATA_URI_BYTES = 5 * 1024 * 1024;
export const MAX_SCRIPT_CHARS = 1500;
export const SPEAKING_CHARS_PER_SECOND = 14;   // rough: about 2.5 words a second

export const PRESET_VOICES = [
  "victoria", "vincent", "clara", "drew", "skye", "max", "morgan", "felix", "mia", "marcus", "summer", "ruby", "aurora", "jasper",
  "leo", "adrian", "nina", "emma", "blake", "david", "maya", "nathan", "sam", "georgia", "petra", "adam", "zach", "violet", "roman", "luna",
];

const sleepFor = (ms) => new Promise((r) => setTimeout(r, ms));

/** base64 data address for an image or audio file (Runway accepts these up to 5 MB). */
export function toDataUri(buffer, mime) {
  if (!buffer || buffer.length === 0) throw new Error("The file is empty.");
  if (buffer.length > MAX_DATA_URI_BYTES) throw new Error("The file is over 5 MB. Use a smaller photo or a shorter audio sample.");
  return `data:${mime};base64,${Buffer.from(buffer).toString("base64")}`;
}

/** A short plain-text script, or a reason it cannot be used. */
export function cleanScript(text) {
  const t = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!t) throw new Error("The script is empty.");
  if (t.length > MAX_SCRIPT_CHARS) throw new Error(`The script is too long (${t.length} characters, the most allowed here is ${MAX_SCRIPT_CHARS}).`);
  return t;
}

/** Rough speaking time in seconds. */
export const estimateSeconds = (text) => Math.round(String(text).length / SPEAKING_CHARS_PER_SECOND);

/** voice: { preset: "adrian" } or { customId: "..." }. */
export function voiceChoice(v) {
  if (v?.customId) return { forAvatar: { type: "custom", id: String(v.customId) }, forSpeech: { type: "custom", id: String(v.customId) }, label: "your cloned voice" };
  const p = String(v?.preset ?? "").toLowerCase();
  if (!PRESET_VOICES.includes(p)) throw new Error(`Unknown voice "${v?.preset}". Choose one of: ${PRESET_VOICES.join(", ")}.`);
  return { forAvatar: { type: "runway-live-preset", presetId: p }, forSpeech: { type: "preset", presetId: p }, label: `the "${p}" voice` };
}

async function waitUntilReady(get, id, { what, pollMs, maxWaitMs, sleep, now }) {
  const started = now();
  for (;;) {
    const r = await get(id);
    if (r.status === "READY") return r;
    if (r.status === "FAILED") throw new Error(`Runway could not make the ${what}: ${r.failureReason || "no reason given"}.`);
    if (now() - started > maxWaitMs) throw new Error(`The ${what} is still not ready after ${Math.round(maxWaitMs / 60000)} minutes. Try again later.`);
    await sleep(pollMs);
  }
}

/** Make a voice from a recording of the user's own voice. Returns the voice id. */
export async function cloneVoice({ client, audioDataUri, name = "My voice", pollMs = 4000, maxWaitMs = 5 * 60_000, sleep = sleepFor, now = Date.now, log = () => {} }) {
  const created = await client.voices.create({ from: { type: "audio", audio: audioDataUri }, name });
  log(`Voice created (${created.id}), waiting for it to be ready…`);
  await waitUntilReady((id) => client.voices.retrieve(id), created.id, { what: "voice", pollMs, maxWaitMs, sleep, now });
  return created.id;
}

export const VOICE_MODEL = "eleven_ttv_v3";
export const MIN_VOICE_PROMPT = 20;

/** A written description of the wanted voice, or a reason it cannot be used. */
export function cleanVoicePrompt(text) {
  const t = String(text ?? "").replace(/\s+/g, " ").trim();
  if (t.length < MIN_VOICE_PROMPT) throw new Error(`Describe the voice in at least ${MIN_VOICE_PROMPT} characters, for example: a warm, calm adult man with a Malaysian Chinese accent speaking English.`);
  if (t.length > 1000) throw new Error("The voice description is too long (the most allowed here is 1000 characters).");
  return t;
}

/** A short audio sample of a described voice, so it can be heard before anything is made. Returns { url, durationSecs }. */
export async function previewVoice({ client, prompt }) {
  const r = await client.voices.preview({ model: VOICE_MODEL, prompt: cleanVoicePrompt(prompt) });
  if (!r?.url) throw new Error("Runway gave no audio preview.");
  return { url: r.url, durationSecs: r.durationSecs ?? null };
}

/** Make a voice from a written description (for example an Asian male voice). Returns the voice id. */
export async function designVoice({ client, prompt, name = "Designed voice", pollMs = 4000, maxWaitMs = 5 * 60_000, sleep = sleepFor, now = Date.now, log = () => {} }) {
  const created = await client.voices.create({ from: { type: "text", model: VOICE_MODEL, prompt: cleanVoicePrompt(prompt) }, name });
  log(`Voice designed (${created.id}), waiting for it to be ready…`);
  await waitUntilReady((id) => client.voices.retrieve(id), created.id, { what: "voice", pollMs, maxWaitMs, sleep, now });
  return created.id;
}

/** Make the avatar from a photo (once). Returns its id. */
export async function createAvatar({ client, photoDataUri, name = "Max Chea", voice, pollMs = 4000, maxWaitMs = 10 * 60_000, sleep = sleepFor, now = Date.now, log = () => {} }) {
  const v = voiceChoice(voice);
  const created = await client.avatars.create({
    name,
    personality: "A friendly, professional real estate negotiator based in Ipoh, Perak, Malaysia. Speaks clearly and honestly.",
    referenceImage: photoDataUri,
    voice: v.forAvatar,
    imageProcessing: "optimize",
  });
  log(`Avatar created (${created.id}), waiting for it to be ready…`);
  await waitUntilReady((id) => client.avatars.retrieve(id), created.id, { what: "avatar", pollMs, maxWaitMs, sleep, now });
  return created.id;
}

/** Ask the avatar to speak the script. Returns { taskId, videoUrl }. */
export async function speak({ client, avatarId, script, voice, timeoutMs = 15 * 60_000, log = () => {} }) {
  const text = cleanScript(script);
  const v = voice ? voiceChoice(voice) : null;
  const call = client.avatarVideos.create({
    model: MODEL,
    avatar: { type: "custom", avatarId },
    speech: { type: "text", text, ...(v ? { voice: v.forSpeech } : {}) },
  });
  log("Video requested. Runway is making it (this usually takes a few minutes)…");
  const task = await call.waitForTaskOutput({ timeout: timeoutMs });
  const url = task?.output?.[0];
  if (!url) throw new Error("Runway finished but gave no video address.");
  return { taskId: task.id ?? null, videoUrl: url };
}

/** The whole job: avatar (made once, or reused) then the talking video. */
export async function makeAvatarVideo({ client, photoDataUri, avatarId, script, voice, name, log = () => {}, ...timing }) {
  cleanScript(script);   // fail before spending anything
  let id = avatarId;
  if (!id) {
    if (!photoDataUri) throw new Error("A photo is needed to make the avatar.");
    id = await createAvatar({ client, photoDataUri, name, voice, log, ...timing });
  } else {
    log(`Using the avatar you already made (${id}).`);
  }
  const out = await speak({ client, avatarId: id, script, voice, log });
  return { avatarId: id, ...out };
}
