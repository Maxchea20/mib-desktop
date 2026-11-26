import sharp from "sharp";
import { buildPropertyRow, photoSlot } from "./parse.mjs";

// Same sizes and folders as the CRM's photo storage (see mib-v1/src/lib/photoSize.ts).
const BUCKET = "property-images";
const MAIN = { max: 1600, quality: 82 };
const MEDIUM = { max: 1200, quality: 80 };
const THUMB = { max: 480, quality: 78 };
const CACHE = "31536000";

const resized = (buf, { max, quality }) =>
  sharp(buf, { failOn: "none" })
    .rotate()
    .resize({ width: max, height: max, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality, mozjpeg: true, progressive: true })
    .toBuffer();

/**
 * Saves the draft listing, then its photos (main, medium and small copies). A photo that fails is skipped:
 * the draft is still kept, with the photos that worked.
 */
export async function createDraft({ supabase, fields, cobrokeAgent, photos, log = console }) {
  const { data: created, error } = await supabase.from("properties").insert([buildPropertyRow(fields, cobrokeAgent)]).select("id").single();
  if (error || !created) throw new Error(`Could not save the draft listing: ${error?.message ?? "no id returned"}`);
  const propertyId = created.id;

  let saved = 0;
  for (let i = 0; i < photos.length; i++) {
    const n = i + 1;
    const { type, file } = photoSlot(i, fields.category);
    try {
      const [main, medium, thumb] = await Promise.all([resized(photos[i], MAIN), resized(photos[i], MEDIUM), resized(photos[i], THUMB)]);
      const up = (path, buf) => supabase.storage.from(BUCKET).upload(path, buf, { upsert: true, contentType: "image/jpeg", cacheControl: CACHE });
      const results = await Promise.all([up(`${propertyId}/${file}`, main), up(`${propertyId}/medium/${file}`, medium), up(`${propertyId}/thumb/${file}`, thumb)]);
      const failed = results.find((r) => r.error);
      if (failed) throw new Error(failed.error.message);
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(`${propertyId}/${file}`);
      const { error: rowError } = await supabase
        .from("property_photos")
        .upsert({ property_id: propertyId, photo_type: type, image_url: `${pub.publicUrl}?t=${Date.now()}`, file_name: file }, { onConflict: "property_id,photo_type" });
      if (rowError) throw new Error(rowError.message);
      saved++;
    } catch (e) {
      log.error(`Photo ${n} was skipped:`, e instanceof Error ? e.message : e);
    }
  }
  return { propertyId, photos: saved };
}
