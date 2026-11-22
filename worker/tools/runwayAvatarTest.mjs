/*
|--------------------------------------------------------------------------
| RUNWAY TALKING-VIDEO TEST (run it by hand on your PC)
|--------------------------------------------------------------------------
|
| By default this only SHOWS what it would do and spends nothing.
| Add --run to really call Runway (this uses Runway credits).
|
|   node worker/tools/runwayAvatarTest.mjs                      show the plan
|   node worker/tools/runwayAvatarTest.mjs --run                make the test video
|   node worker/tools/runwayAvatarTest.mjs --run --voice adrian choose a preset voice
|   node worker/tools/runwayAvatarTest.mjs --run --preview-voice "a warm, calm Malaysian Chinese man speaking English"
|                                                               only makes a short audio sample of that voice, so you can listen first
|   node worker/tools/runwayAvatarTest.mjs --run --design-voice "a warm, calm Malaysian Chinese man speaking English"
|                                                               makes the video with a voice built from that description
|   node worker/tools/runwayAvatarTest.mjs --run --voice-sample my-voice.mp3
|                                                               speak with a clone of YOUR voice
|   --script "text" | --script-file file.txt    what to say (default: a short test)
|   --photo photo.jpg                           your photo (default: your website profile photo)
|   --out folder                                where to save (default: ~/MIB/runway)
|
| The key is read from RUNWAYML_API_SECRET (put it in the .env file next to the
| worker, never in chat or in code). The avatar is made once and its id is kept in
| avatar.json inside the output folder, so later runs do not make a new one.
|
*/

import "dotenv/config";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import RunwayML from "@runwayml/sdk";
import { cleanScript, cleanVoicePrompt, cloneVoice, designVoice, estimateSeconds, makeAvatarVideo, previewVoice, toDataUri, voiceChoice, PRESET_VOICES } from "../runway/avatarVideo.mjs";

const DEFAULT_PHOTO = "https://vdvwcworcsawbopafzfp.supabase.co/storage/v1/object/public/property-images/agent/photo.jpg";
const DEFAULT_SCRIPT = "Hi, I'm Max Chea, a Real Estate Negotiator based in Ipoh, Perak. I help clients find factories, land, shops and homes.";

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const val = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };

const run = flag("run");
const outDir = path.resolve(val("out") ?? path.join(os.homedir(), "MIB", "runway"));
const voiceSample = val("voice-sample");
const presetName = (val("voice") ?? "adrian").toLowerCase();
const designText = val("design-voice");
const previewText = val("preview-voice");
const script = cleanScript(val("script") ?? (val("script-file") ? fs.readFileSync(val("script-file"), "utf8") : DEFAULT_SCRIPT));
const log = (m) => console.log(m);

async function loadPhoto(src) {
  const raw = /^https?:\/\//i.test(src) ? Buffer.from(await (await fetch(src)).arrayBuffer()) : fs.readFileSync(src);
  // a clear, upright JPEG that is safely under Runway's 5 MB limit
  const jpg = await sharp(raw, { failOn: "none" }).rotate().resize({ height: 1280, withoutEnlargement: true }).jpeg({ quality: 92 }).toBuffer();
  return toDataUri(jpg, "image/jpeg");
}

(async () => {
  if (!PRESET_VOICES.includes(presetName) && !voiceSample && !designText && !previewText) { console.error(`Unknown voice "${presetName}". Choose one of: ${PRESET_VOICES.join(", ")}`); process.exit(1); }
  fs.mkdirSync(outDir, { recursive: true });
  const stateFile = path.join(outDir, "avatar.json");
  const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, "utf8")) : {};

  console.log("");
  console.log("Runway talking-video test");
  console.log("-------------------------");
  console.log(`Script (${script.length} characters, about ${estimateSeconds(script)} seconds): ${script}`);
  console.log(`Voice: ${previewText ? `audio sample only, of: ${cleanVoicePrompt(previewText)}` : designText ? `designed from: ${cleanVoicePrompt(designText)}` : voiceSample ? `a clone of your voice from ${voiceSample}` : `the "${presetName}" preset`}`);
  if (!previewText) console.log(`Avatar: ${state.avatarId ? `already made (${state.avatarId}), will be reused` : "will be made from your photo (once)"}`);
  console.log(`Saves to: ${outDir}`);
  console.log("");
  if (!run) {
    console.log("This was only a preview. Nothing was sent to Runway and no credits were used.");
    console.log("Add --run to make the video.");
    return;
  }

  const key = process.env.RUNWAYML_API_SECRET;
  if (!key) { console.error("RUNWAYML_API_SECRET is not set. Add it to the .env file next to the worker, then run again."); process.exit(1); }
  const client = new RunwayML({ apiKey: key });

  if (previewText) {
    const sample = await previewVoice({ client, prompt: previewText });
    const res = await fetch(sample.url);
    if (!res.ok) throw new Error(`Could not download the audio sample (${res.status}).`);
    const file = path.join(outDir, `voice-sample-${new Date().toISOString().replace(/[:.]/g, "-")}.mp3`);
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    console.log(`\nA ${sample.durationSecs ?? "short"}-second sample of that voice is saved here. Listen to it:\n${file}`);
    console.log("If it sounds right, run again with --design-voice and the same words. If not, change the words and preview again.");
    return;
  }

  // a made voice is reused only while it came from the same source (same recording or same description)
  const source = voiceSample ? `sample:${path.basename(voiceSample)}` : designText ? `design:${cleanVoicePrompt(designText)}` : null;
  let voice = { preset: presetName };
  if (source) {
    let id = state.voiceSource === source ? state.voiceId : undefined;
    if (!id) {
      if (voiceSample) {
        const mime = /\.wav$/i.test(voiceSample) ? "audio/wav" : /\.m4a$/i.test(voiceSample) ? "audio/mp4" : "audio/mpeg";
        id = await cloneVoice({ client, audioDataUri: toDataUri(fs.readFileSync(voiceSample), mime), name: "Max Chea", log });
      } else {
        id = await designVoice({ client, prompt: designText, name: "Max Chea (designed)", log });
      }
      state.voiceId = id; state.voiceSource = source; fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
    } else {
      log(`Using the voice you already made (${id}).`);
    }
    voice = { customId: id };
  }
  voiceChoice(voice);

  const photoDataUri = state.avatarId ? undefined : await loadPhoto(val("photo") ?? DEFAULT_PHOTO);
  const result = await makeAvatarVideo({ client, photoDataUri, avatarId: state.avatarId, script, voice, name: "Max Chea", log });
  state.avatarId = result.avatarId; fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));

  const res = await fetch(result.videoUrl);
  if (!res.ok) throw new Error(`Could not download the video (${res.status}).`);
  const file = path.join(outDir, `talking-intro-${new Date().toISOString().replace(/[:.]/g, "-")}.mp4`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  console.log("");
  console.log(`Done. Your video is saved here:\n${file}`);
  console.log("Runway's link expires, so keep this file.");
})().catch((e) => { console.error("\nStopped:", e instanceof Error ? e.message : e); process.exit(1); });
