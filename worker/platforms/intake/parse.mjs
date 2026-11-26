/*
|--------------------------------------------------------------------------
| LISTING INTAKE: reading a co-broke agent's Facebook post (pure, unit-tested)
|--------------------------------------------------------------------------
|
| The text of the post is cleaned of phone numbers, emails, links and @names BEFORE it is sent to
| OpenAI, and the AI is told to copy only facts that are really written in the post. Whatever
| comes back is checked here: anything that is not a clean, expected value is thrown away, never
| guessed. The result is a DRAFT (status Inactive, not public) for you to check and complete.
|
*/

export const CATEGORIES = ["Residential", "Commercial", "Industrial", "Land"];
export const PURPOSES = ["For Sale", "For Rent"];
export const TENURES = ["Freehold", "Leasehold"];
export const DEFAULT_STATE = "Perak";
export const MAX_TEXT_FOR_AI = 6000;

/** Remove phone numbers, emails, links and @handles from the post text. */
export function redactContacts(raw) {
  return String(raw ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ")
    .replace(/https?:\/\/\S+|www\.\S+/gi, "[link]")
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/(?:\+?6?0)?[\s-]*\(?\d{2,3}\)?[\s-]*\d{3,4}[\s-]*\d{3,4}\b/g, (m) => (m.replace(/\D/g, "").length >= 9 ? "[phone]" : m))
    .replace(/@[\w.]{3,}/g, "[name]")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_TEXT_FOR_AI);
}

export const INTAKE_INSTRUCTIONS = `You read a property agent's Facebook post (Malaysia) and copy out the facts into JSON.

RULES
- Use ONLY facts that are written in the post. If a fact is not there, use null. Never guess, never fill in from general knowledge.
- Do not copy the agent's wording or marketing sentences. Do not include any person's name, phone number, email or link.
- price is a number in RM (no commas, no "RM"). "430k" is 430000. "1.2m" is 1200000. If the post gives a range or "nego" only, use the number stated.
- purpose is "For Sale" or "For Rent". category is one of Residential, Commercial, Industrial, Land (houses, condos and apartments are Residential; shops and offices are Commercial; factories and warehouses are Industrial).
- bedrooms and bathrooms are whole numbers. built_up and land_size are the size text as written with its unit (for example "1,650 sqft"). tenure is "Freehold" or "Leasehold" only if stated.
- area is the neighbourhood or township, city is the town, state is the Malaysian state, each only if written.
- title is a short factual title you build from the facts, such as "3-bedroom double-storey terrace, Taman Canning". Do not use words like "best", "rare", "must see".

Return ONLY a JSON object with exactly these keys:
title, category, purpose, price, area, city, state, bedrooms, bathrooms, built_up, land_size, tenure`;

const str = (v, max = 80) => {
  if (typeof v !== "string") return null;
  const t = v.replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim();
  return t ? Array.from(t).slice(0, max).join("") : null;
};

const whole = (v, max) => {
  const n = typeof v === "string" ? Number(v.replace(/[^\d.]/g, "")) : v;
  return Number.isInteger(n) && n >= 0 && n <= max ? n : null;
};

/**
 * Turns the AI's answer into clean fields plus a list of things for you to check.
 * Accepts the JSON text or an object; anything unusable gives a safe, mostly empty draft.
 */
export function normalizeFields(input) {
  let raw = input;
  if (typeof input === "string") {
    try {
      raw = JSON.parse(input);
    } catch {
      raw = {};
    }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) raw = {};

  const notes = [];

  const category = CATEGORIES.includes(raw.category) ? raw.category : null;
  if (!category) notes.push("Category was not clear: set to Residential, please check.");
  const purpose = PURPOSES.includes(raw.purpose) ? raw.purpose : null;
  if (!purpose) notes.push("Sale or rent was not clear: set to For Sale, please check.");

  let price = typeof raw.price === "string" ? Number(raw.price.replace(/[^\d.]/g, "")) : raw.price;
  if (!(typeof price === "number" && Number.isFinite(price) && price > 0 && price < 1e10)) {
    price = 0;
    notes.push("No price found: please enter it.");
  } else {
    price = Math.round(price);
  }

  const area = str(raw.area);
  if (!area) notes.push("No area found: please enter it.");

  const fields = {
    title: str(raw.title, 100),
    category: category ?? "Residential",
    purpose: purpose ?? "For Sale",
    price,
    area: area ?? "",
    city: str(raw.city),
    state: str(raw.state) ?? DEFAULT_STATE,
    bedrooms: whole(raw.bedrooms, 30),
    bathrooms: whole(raw.bathrooms, 30),
    built_up: str(raw.built_up, 40),
    land_size: str(raw.land_size, 40),
    tenure: TENURES.includes(raw.tenure) ? raw.tenure : null,
  };
  if (!str(raw.state)) notes.push(`State not written in the post: set to ${DEFAULT_STATE}, please check.`);
  if (!fields.title) fields.title = "Imported listing: please check";
  return { fields, notes };
}

/** The row saved in "properties": a private draft from a co-broke agent. */
export function buildPropertyRow(fields, cobrokeAgentName) {
  const isLand = fields.category === "Land";
  return {
    title: fields.title,
    category: fields.category,
    purpose: fields.purpose,
    price: fields.price,
    status: "Inactive", // not live: you check it, then change the status
    is_public: false, // never public by itself
    listing_agent: "Cobroke Agent",
    cobroke_agent_name: str(cobrokeAgentName, 80),
    area: fields.area,
    city: fields.city,
    state: fields.state,
    land_size: fields.category === "Commercial" ? null : fields.land_size,
    built_up: isLand ? null : fields.built_up,
    bedrooms: fields.category === "Residential" ? fields.bedrooms : null,
    bathrooms: fields.category === "Residential" ? fields.bathrooms : null,
    tenure: fields.tenure,
  };
}

/** Photos are saved as "Photo 1", "Photo 2"... next to the listing's own photo types. */
export const photoTypeFor = (n) => `Photo ${n}`;
export const photoFileFor = (n) => `Photo_${n}.jpg`;

/** Keep image addresses that look like real post photos: Facebook's image servers, big enough, not profile pictures or emoji. */
export function isPostPhoto(src, width = 0, height = 0) {
  if (typeof src !== "string" || !/^https:\/\//.test(src)) return false;
  if (!/(fbcdn\.net|scontent)/i.test(src)) return false;
  if (/emoji|static\.xx|rsrc\.php|\/p\d{2,3}x\d{2,3}\/|s\d{2,3}x\d{2,3}|_s\d{2,3}x\d{2,3}/i.test(src)) return false;
  return Math.min(width, height) >= 280;
}

/** Same photo seen twice (different size parameters) counts once. */
export function photoKey(src) {
  try {
    const u = new URL(src);
    return u.pathname.split("/").pop() ?? src;
  } catch {
    return src;
  }
}

/** The note shown on the intake row after a good run. */
export function summaryNote({ photos, notes }) {
  const parts = [`Draft made with ${photos} photo${photos === 1 ? "" : "s"}. Please check every detail before you go live.`];
  return [...parts, ...notes].join(" ");
}
