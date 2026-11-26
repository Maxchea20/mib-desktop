import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import sharp from "sharp";
import { askOpenAI, askOpenAIWithImages } from "./ai.mjs";
import { captureFacebookPost } from "./capture.mjs";
import { createDraft } from "./import.mjs";
import { isEmptyFacts, normalizeFields, redactContacts, snippet, summaryNote } from "./parse.mjs";

/*
|--------------------------------------------------------------------------
| BECKY'S JOB: listing_intake
|--------------------------------------------------------------------------
|
|   dry_run  true  : only says "received". Nothing is opened, read or created.
|   dry_run  false : opens the post, reads text and photos, makes a DRAFT listing
|                    (status Inactive, not public) with the co-broke agent's name.
|
| The listing_intake row is kept up to date at each step, so the CRM page shows where it is.
|
*/

const FB_HOST = /(^|\.)(facebook\.com|fb\.com|fb\.watch|fb\.me)$/i;

/** Keeps what Becky read and what OpenAI answered on this PC, so a poor result can be understood. */
function saveDebugFile(jobId, info) {
  try {
    const dir = process.env.MIB_INTAKE_DEBUG_DIR || path.join(os.homedir(), "MIB", "intake-debug");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `job-${String(jobId).slice(0, 8)}.txt`);
    fs.writeFileSync(file, [`URL: ${info.url}`, `PAGE: ${info.where ?? ""}`, "", "TEXT READ:", info.text || "(none)", "", ...info.answers, "", "NOTES:", ...info.notes].join("\n"));
  } catch {
    /* the debug copy is only a help */
  }
}

export const BECKY_PROFILE_DIR = () => process.env.FACEBOOK_PROFILE_DIR || path.join(os.homedir(), "MIB", "facebook-profile-becky");

/** Checks what the job carries. Returns the clean values or throws a plain-words error. */
export function readPayload(job) {
  const p = job?.payload ?? {};
  const intakeId = Number(p.intake_id);
  if (!Number.isSafeInteger(intakeId) || intakeId <= 0) throw new Error("The job has no intake link id.");
  let url;
  try {
    url = new URL(String(p.url ?? ""));
  } catch {
    throw new Error("The job has no valid link.");
  }
  if (url.protocol !== "https:" || !FB_HOST.test(url.hostname)) throw new Error("Only Facebook links are accepted.");
  return { intakeId, url: url.toString(), cobrokeAgent: String(p.cobroke_agent ?? "").trim(), dryRun: p.dry_run === true };
}

export async function handleListingIntake(job, { supabase, workerName = "Becky", env = process.env, deps = {}, log = console, now = () => new Date() }) {
  const { intakeId, url, cobrokeAgent, dryRun } = readPayload(job);
  const capture = deps.capture ?? captureFacebookPost;
  const ask = deps.ask ?? askOpenAI;
  const askImages = deps.askImages ?? askOpenAIWithImages;
  const draft = deps.createDraft ?? createDraft;

  const update = async (patch) => {
    const { error } = await supabase.from("listing_intake").update(patch).eq("id", intakeId);
    if (error) log.error("Could not update the intake row:", error.message);
  };

  await update({ status: "running", error: null });

  if (dryRun) {
    const hhmm = now().toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kuala_Lumpur" });
    await update({ status: "saved", error: `Test OK: ${workerName} received this link at ${hhmm}. Nothing was opened or created.`, job_id: null, sent_at: null });
    return { dry_run: true, intake_id: intakeId };
  }

  try {
    const captured = await capture(url, { profileDir: BECKY_PROFILE_DIR(), log });
    if (!captured.text && captured.photos.length === 0) {
      throw new Error(`Nothing could be read from the post. It may be private, deleted, or Facebook changed its page. ${(captured.notes ?? []).join(" ")}`.trim());
    }

    const notes = [...(captured.notes ?? [])];
    const cleanText = redactContacts(captured.text);
    const answers = [];
    let fields = normalizeFields({}).fields;
    let fieldNotes = [];

    if (captured.text) {
      const answer = await ask(cleanText, { apiKey: env.OPENAI_API_KEY });
      answers.push(`TEXT ANSWER: ${answer}`);
      log.log("OpenAI answered (from the text):", String(answer).replace(/\s+/g, " ").slice(0, 300));
      ({ fields, notes: fieldNotes } = normalizeFields(answer));
    }

    // Details written on a picture (a poster): when the text gave nothing, let OpenAI read the photos too.
    if (isEmptyFacts(fields) && captured.photos.length > 0) {
      try {
        log.log("Nothing useful in the text. Asking OpenAI to read the photos...");
        const small = await Promise.all(
          captured.photos.slice(0, 3).map((b) => sharp(b, { failOn: "none" }).rotate().resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 72 }).toBuffer())
        );
        const answer = await askImages(cleanText, small, { apiKey: env.OPENAI_API_KEY });
        answers.push(`PHOTO ANSWER: ${answer}`);
        log.log("OpenAI answered (from the photos):", String(answer).replace(/\s+/g, " ").slice(0, 300));
        const out = normalizeFields(answer);
        if (!isEmptyFacts(out.fields)) {
          fields = out.fields;
          fieldNotes = [...out.notes, "The details were read from the photos, so check them carefully."];
        }
      } catch (e) {
        notes.push(`Reading the photos failed: ${e instanceof Error ? e.message : "unknown error"}`);
      }
    }

    if (isEmptyFacts(fields)) {
      notes.push(`OpenAI found no property details. The text Becky read began: "${snippet(captured.text)}". The details may be on a picture, or Becky may have read the wrong part of the page.`);
    } else {
      notes.push(...fieldNotes);
    }

    saveDebugFile(job.id, { url, where: captured.where, text: captured.text, answers, notes });

    const result = await draft({ supabase, fields, cobrokeAgent, photos: captured.photos, log });
    if (captured.photos.length > 0 && result.photos < captured.photos.length) {
      notes.push(`${captured.photos.length - result.photos} photo(s) could not be saved.`);
    }
    await update({ status: "done", property_id: result.propertyId, error: summaryNote({ photos: result.photos, notes }), finished_at: now().toISOString() });
    return { intake_id: intakeId, property_id: result.propertyId, photos: result.photos };
  } catch (e) {
    const message = e instanceof Error ? e.message : "The link could not be imported.";
    await update({ status: "failed", error: message.slice(0, 400), finished_at: now().toISOString() });
    throw e;
  }
}
