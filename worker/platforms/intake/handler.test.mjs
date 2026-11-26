import test from "node:test";
import assert from "node:assert/strict";
import { handleListingIntake, readPayload } from "./handler.mjs";
import { createDraft } from "./import.mjs";
import sharp from "sharp";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";

process.env.MIB_INTAKE_DEBUG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "intake-debug-"));

const quiet = { log() {}, error() {} };
function fakeSupabase() {
  const updates = [];
  const inserted = { properties: [], photos: [], files: [] };
  const sb = {
    updates, inserted,
    from(table) {
      return {
        update(patch) { return { eq: async (_c, id) => (updates.push({ id, ...patch }), { error: null }) }; },
        insert(rows) { inserted.properties.push(...rows); return { select: () => ({ single: async () => ({ data: { id: 77 }, error: null }) }) }; },
        upsert: async (row) => (inserted.photos.push({ table, ...row }), { error: null }),
      };
    },
    storage: { from: () => ({ upload: async (path) => (inserted.files.push(path), { error: null }), getPublicUrl: (p) => ({ data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/property-images/${p}` } }) }) },
  };
  return sb;
}
const job = (extra = {}) => ({ id: "j", payload: { intake_id: 5, url: "https://www.facebook.com/groups/1/posts/2", cobroke_agent: "Ah Seng", ...extra } });

test("the job is checked before anything happens", () => {
  assert.throws(() => readPayload({ payload: { intake_id: 0, url: "https://facebook.com/x" } }), /intake link id/);
  assert.throws(() => readPayload({ payload: { intake_id: 1, url: "not a link" } }), /valid link/);
  assert.throws(() => readPayload({ payload: { intake_id: 1, url: "https://evil.com/x" } }), /Facebook/);
  assert.throws(() => readPayload({ payload: { intake_id: 1, url: "https://facebook.com.evil.com/x" } }), /Facebook/);
  assert.equal(readPayload(job({ dry_run: true })).dryRun, true);
});

test("a dry run only says received: nothing is opened, read or created", async () => {
  const sb = fakeSupabase();
  const boom = () => { throw new Error("must not be called"); };
  const out = await handleListingIntake(job({ dry_run: true }), { supabase: sb, deps: { capture: boom, ask: boom, createDraft: boom }, ...quiet, log: quiet });
  assert.equal(out.dry_run, true);
  assert.equal(sb.inserted.properties.length, 0);
  const last = sb.updates.at(-1);
  assert.equal(last.status, "saved");
  assert.match(last.error, /^Test OK: Becky received this link/);
  assert.equal(sb.updates[0].status, "running");
});

test("a real run makes a private draft with the co-broke agent and the photos", async () => {
  const sb = fakeSupabase();
  const photo = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#789" } }).jpeg().toBuffer();
  let sentToAi = "";
  const out = await handleListingIntake(job(), {
    supabase: sb, env: { OPENAI_API_KEY: "k" }, log: quiet,
    deps: {
      capture: async () => ({ text: "Taman Canning 3 bed RM430k call 012-345 6789", photos: [photo, photo], notes: [] }),
      ask: async (t) => (sentToAi = t, JSON.stringify({ title: "3-bedroom terrace, Taman Canning", category: "Residential", purpose: "For Sale", price: 430000, area: "Taman Canning", city: "Ipoh", state: "Perak", bedrooms: 3 })),
    },
  });
  assert.ok(!/345 6789/.test(sentToAi), "phone number must not reach the AI");
  assert.equal(out.property_id, 77);
  assert.equal(out.photos, 2);
  const row = sb.inserted.properties[0];
  assert.equal(row.status, "Inactive");
  assert.equal(row.is_public, false);
  assert.equal(row.cobroke_agent_name, "Ah Seng");
  assert.equal(sb.inserted.photos.length, 2);
  // the first photo is the listing's cover (its Front House slot); the rest are Photo 2, Photo 3...
  assert.equal(sb.inserted.photos[0].photo_type, "Front House");
  assert.equal(sb.inserted.photos[1].photo_type, "Photo 2");
  assert.ok(sb.inserted.files.includes("77/Front_House.jpg") && sb.inserted.files.includes("77/thumb/Front_House.jpg") && sb.inserted.files.includes("77/medium/Photo_2.jpg"));
  const last = sb.updates.at(-1);
  assert.equal(last.status, "done");
  assert.equal(last.property_id, 77);
});

test("a post with nothing readable fails clearly and the row says so", async () => {
  const sb = fakeSupabase();
  await assert.rejects(() => handleListingIntake(job(), { supabase: sb, log: quiet, deps: { capture: async () => ({ text: "", photos: [], notes: [] }) } }), /Nothing could be read/);
  const last = sb.updates.at(-1);
  assert.equal(last.status, "failed");
  assert.match(last.error, /Nothing could be read/);
  assert.equal(sb.inserted.properties.length, 0);
});

test("a missing OpenAI key fails before any draft is made", async () => {
  const sb = fakeSupabase();
  await assert.rejects(
    () => handleListingIntake(job(), { supabase: sb, env: {}, log: quiet, deps: { capture: async () => ({ text: "x RM1", photos: [], notes: [] }) } }),
    /OPENAI_API_KEY/
  );
  assert.equal(sb.updates.at(-1).status, "failed");
  assert.equal(sb.inserted.properties.length, 0);
});

test("a photo that fails is skipped and the draft is still kept", async () => {
  const sb = fakeSupabase();
  const good = await sharp({ create: { width: 400, height: 300, channels: 3, background: "#123" } }).jpeg().toBuffer();
  const r = await createDraft({ supabase: sb, fields: { title: "T", category: "Residential", purpose: "For Sale", price: 1, area: "A", state: "Perak" }, cobrokeAgent: "X", photos: [Buffer.from("not an image"), good], log: quiet });
  assert.equal(r.propertyId, 77);
  assert.equal(r.photos, 1);
  assert.equal(sb.inserted.photos[0].photo_type, "Photo 2"); // the first photo failed, the second kept its own number
});

test("when the text gives nothing, OpenAI reads the photos (a poster) and the draft is filled from them", async () => {
  const sb = fakeSupabase();
  const photo = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#789" } }).jpeg().toBuffer();
  let photoCalls = 0;
  const out = await handleListingIntake(job(), {
    supabase: sb, env: { OPENAI_API_KEY: "k" }, log: quiet,
    deps: {
      capture: async () => ({ text: "Facebook menu things only", photos: [photo], notes: [], where: "x" }),
      ask: async () => JSON.stringify({ title: null, price: null }),
      askImages: async (_t, imgs) => (photoCalls++, assert.equal(imgs.length, 1), JSON.stringify({ title: "3-bedroom terrace, Taman X", category: "Residential", purpose: "For Sale", price: 430000, area: "Taman X", bedrooms: 3 })),
    },
  });
  assert.equal(photoCalls, 1);
  assert.equal(sb.inserted.properties[0].price, 430000);
  assert.match(sb.updates.at(-1).error, /read from the photos/);
  assert.equal(out.property_id, 77);
});

test("when nothing at all is found, the note says what Becky read, without phone numbers", async () => {
  const sb = fakeSupabase();
  await handleListingIntake(job(), {
    supabase: sb, env: { OPENAI_API_KEY: "k" }, log: quiet,
    deps: { capture: async () => ({ text: "Selamat Pagi call 012-345 6789 about nothing", photos: [], notes: [], where: "p" }), ask: async () => "{}" },
  });
  const note = sb.updates.at(-1).error;
  assert.match(note, /OpenAI found no property details/);
  assert.match(note, /Selamat Pagi/);
  assert.ok(!/345 6789/.test(note));
  assert.ok(fs.readdirSync(process.env.MIB_INTAKE_DEBUG_DIR).some((f) => f.startsWith("job-")));
});
