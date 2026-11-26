import path from "node:path";
import os from "node:os";
import { askOpenAI } from "./ai.mjs";
import { captureFacebookPost } from "./capture.mjs";
import { createDraft } from "./import.mjs";
import { normalizeFields, redactContacts, summaryNote } from "./parse.mjs";

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
    let fields;
    if (captured.text) {
      const answer = await ask(redactContacts(captured.text), { apiKey: env.OPENAI_API_KEY });
      const out = normalizeFields(answer);
      fields = out.fields;
      notes.push(...out.notes);
    } else {
      fields = normalizeFields({}).fields;
      notes.push("No text was read, so no details were filled in.");
    }

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
