import test from "node:test";
import assert from "node:assert/strict";
import { toDataUri, cleanScript, estimateSeconds, voiceChoice, createAvatar, speak, makeAvatarVideo, cloneVoice, cleanVoicePrompt, previewVoice, designVoice, PRESET_VOICES, MAX_SCRIPT_CHARS } from "./avatarVideo.mjs";

const fast = { pollMs: 1, sleep: async () => {} };

function fakeClient({ avatarStates = ["PROCESSING", "READY"], voiceStates = ["READY"], output = ["https://v.example/out.mp4"], fail = false } = {}) {
  const calls = { avatarCreate: [], avatarGet: 0, videoCreate: [], voiceCreate: [] };
  const a = [...avatarStates]; const vs = [...voiceStates];
  return {
    calls,
    avatars: {
      create: async (body) => { calls.avatarCreate.push(body); return { id: "av1", status: "PROCESSING" }; },
      retrieve: async () => { calls.avatarGet++; const s = a.shift() ?? "READY"; return s === "FAILED" ? { status: "FAILED", failureReason: "no face found" } : { status: s }; },
    },
    voices: {
      create: async (body) => { calls.voiceCreate.push(body); return { id: "vc1" }; },
      preview: async (body) => { calls.voicePreview = body; return { url: "https://a.example/p.mp3", durationSecs: 6 }; },
      retrieve: async () => ({ status: vs.shift() ?? "READY" }),
    },
    avatarVideos: {
      create: (body) => { calls.videoCreate.push(body); return { waitForTaskOutput: async () => { if (fail) throw new Error("task failed"); return { id: "t1", output }; } }; },
    },
  };
}

test("data addresses: size limit and empty files", () => {
  assert.ok(toDataUri(Buffer.from("abc"), "image/jpeg").startsWith("data:image/jpeg;base64,"));
  assert.throws(() => toDataUri(Buffer.alloc(0), "image/jpeg"), /empty/);
  assert.throws(() => toDataUri(Buffer.alloc(5 * 1024 * 1024 + 1), "audio/mpeg"), /5 MB/);
});

test("script: tidied, never empty, never too long, spoken time estimated", () => {
  assert.equal(cleanScript("  Hello \n  there  "), "Hello there");
  assert.throws(() => cleanScript("   "), /empty/);
  assert.throws(() => cleanScript("x".repeat(MAX_SCRIPT_CHARS + 1)), /too long/);
  assert.equal(estimateSeconds("x".repeat(420)), 30);
});

test("voices: a preset or the user's own cloned voice, nothing else", () => {
  assert.deepEqual(voiceChoice({ preset: "Adrian" }).forAvatar, { type: "runway-live-preset", presetId: "adrian" });
  assert.deepEqual(voiceChoice({ preset: "adrian" }).forSpeech, { type: "preset", presetId: "adrian" });
  assert.deepEqual(voiceChoice({ customId: "v9" }).forSpeech, { type: "custom", id: "v9" });
  assert.throws(() => voiceChoice({ preset: "nobody" }), /Unknown voice/);
  assert.throws(() => voiceChoice({}), /Unknown voice/);
  assert.equal(PRESET_VOICES.length, 30);
});

test("makes the avatar once, waits until it is ready, then asks it to speak", async () => {
  const c = fakeClient();
  const r = await makeAvatarVideo({ client: c, photoDataUri: "data:image/jpeg;base64,AA==", script: "Hi, I am Max.", voice: { preset: "adrian" }, ...fast });
  assert.equal(r.avatarId, "av1"); assert.equal(r.videoUrl, "https://v.example/out.mp4"); assert.equal(r.taskId, "t1");
  assert.equal(c.calls.avatarCreate.length, 1); assert.equal(c.calls.avatarCreate[0].imageProcessing, "optimize");
  assert.equal(c.calls.avatarGet, 2);
  const v = c.calls.videoCreate[0];
  assert.equal(v.model, "gwm1_avatars"); assert.deepEqual(v.avatar, { type: "custom", avatarId: "av1" });
  assert.deepEqual(v.speech, { type: "text", text: "Hi, I am Max.", voice: { type: "preset", presetId: "adrian" } });
});

test("an avatar you already have is reused: no second avatar is made", async () => {
  const c = fakeClient();
  const r = await makeAvatarVideo({ client: c, avatarId: "old9", script: "Hello", ...fast });
  assert.equal(r.avatarId, "old9"); assert.equal(c.calls.avatarCreate.length, 0);
  assert.deepEqual(c.calls.videoCreate[0].speech, { type: "text", text: "Hello" });   // the avatar's own voice
});

test("nothing is spent when the script is bad or the photo is missing", async () => {
  const c = fakeClient();
  await assert.rejects(() => makeAvatarVideo({ client: c, photoDataUri: "data:x", script: "", voice: { preset: "adrian" } }), /empty/);
  await assert.rejects(() => makeAvatarVideo({ client: c, script: "Hi", voice: { preset: "adrian" } }), /photo is needed/);
  assert.equal(c.calls.avatarCreate.length + c.calls.videoCreate.length, 0);
});

test("clear messages when Runway fails or takes too long", async () => {
  await assert.rejects(() => createAvatar({ client: fakeClient({ avatarStates: ["FAILED"] }), photoDataUri: "data:x", voice: { preset: "adrian" }, ...fast }), /no face found/);
  let t = 0;
  await assert.rejects(() => createAvatar({ client: fakeClient({ avatarStates: Array(50).fill("PROCESSING") }), photoDataUri: "data:x", voice: { preset: "adrian" }, ...fast, maxWaitMs: 5, now: () => (t += 10) }), /still not ready/);
  await assert.rejects(() => speak({ client: fakeClient({ fail: true }), avatarId: "a", script: "Hi" }), /task failed/);
  await assert.rejects(() => speak({ client: fakeClient({ output: [] }), avatarId: "a", script: "Hi" }), /no video address/);
});

test("cloning your own voice from a recording", async () => {
  const c = fakeClient();
  const id = await cloneVoice({ client: c, audioDataUri: "data:audio/mpeg;base64,AA==", name: "Max", ...fast });
  assert.equal(id, "vc1"); assert.deepEqual(c.calls.voiceCreate[0].from, { type: "audio", audio: "data:audio/mpeg;base64,AA==" });
});

test("describing a voice: needs a real description", () => {
  assert.throws(() => cleanVoicePrompt("man"), /at least 20/);
  assert.throws(() => cleanVoicePrompt("x".repeat(1001)), /too long/);
  assert.equal(cleanVoicePrompt("  A warm   Malaysian Chinese man speaking English  "), "A warm Malaysian Chinese man speaking English");
});

test("hear a described voice first, then make it", async () => {
  const c = fakeClient();
  const p = await previewVoice({ client: c, prompt: "A warm, calm Malaysian Chinese man speaking English" });
  assert.equal(p.url, "https://a.example/p.mp3"); assert.equal(c.calls.voicePreview.model, "eleven_ttv_v3");
  const id = await designVoice({ client: c, prompt: "A warm, calm Malaysian Chinese man speaking English", name: "Max", ...fast });
  assert.equal(id, "vc1");
  assert.deepEqual(c.calls.voiceCreate[0].from, { type: "text", model: "eleven_ttv_v3", prompt: "A warm, calm Malaysian Chinese man speaking English" });
  await assert.rejects(() => previewVoice({ client: c, prompt: "short" }), /at least 20/);
  await assert.rejects(() => designVoice({ client: fakeClient({ voiceStates: ["FAILED"] }), prompt: "A warm, calm Malaysian Chinese man speaking English", ...fast }), /voice/);
});
