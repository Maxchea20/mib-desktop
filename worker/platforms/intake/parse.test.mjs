import test from "node:test";
import assert from "node:assert/strict";
import { isEmptyFacts, photoSlot, snippet, redactContacts, normalizeFields, buildPropertyRow, isPostPhoto, photoKey, photoTypeFor, summaryNote, MAX_TEXT_FOR_AI } from "./parse.mjs";

test("phone numbers, emails, links and @names are removed before the AI sees the post", () => {
  const t = redactContacts("Taman Canning RM430k\nCall Ah Seng 012-345 6789 or +60 16-521 0993\nmail me a@b.com https://fb.com/x www.site.my @agent_one");
  assert.ok(!/012|521|a@b|fb\.com|site\.my|agent_one/.test(t), t);
  assert.match(t, /\[phone\]/);
  assert.match(t, /RM430k/);
});

test("prices, sizes and years are not mistaken for phone numbers", () => {
  const t = redactContacts("RM 430,000 nego, 1,650 sqft, built 2015, 3 bed 2 bath, 22x75 land 1650");
  assert.ok(!/\[phone\]/.test(t), t);
});

test("very long posts are cut", () => {
  assert.equal(redactContacts("a ".repeat(10000)).length <= MAX_TEXT_FOR_AI, true);
});

test("good AI answer becomes clean fields", () => {
  const { fields, notes } = normalizeFields(JSON.stringify({
    title: "3-bedroom double-storey terrace, Taman Canning", category: "Residential", purpose: "For Sale", price: 430000,
    area: "Taman Canning", city: "Ipoh", state: "Perak", bedrooms: 3, bathrooms: 2, built_up: "1,650 sqft", land_size: "22x75", tenure: "Freehold",
  }));
  assert.equal(fields.price, 430000);
  assert.equal(fields.bedrooms, 3);
  assert.equal(fields.tenure, "Freehold");
  assert.deepEqual(notes, []);
});

test("nothing is guessed: bad or missing values become empty with a note", () => {
  const { fields, notes } = normalizeFields({ category: "Spaceship", purpose: "Maybe", price: "ask", bedrooms: -4, bathrooms: 2.5, tenure: "Strata", area: "  ", state: null, title: null });
  assert.equal(fields.category, "Residential");
  assert.equal(fields.purpose, "For Sale");
  assert.equal(fields.price, 0);
  assert.equal(fields.bedrooms, null);
  assert.equal(fields.bathrooms, null);
  assert.equal(fields.tenure, null);
  assert.equal(fields.area, "");
  assert.equal(fields.state, "Perak");
  assert.equal(fields.title, "Imported listing: please check");
  assert.ok(notes.length >= 4);
});

test("price words and junk are handled; broken JSON gives a safe draft", () => {
  assert.equal(normalizeFields({ price: "RM 1,250,000" }).fields.price, 1250000);
  assert.equal(normalizeFields({ price: 1e12 }).fields.price, 0);
  assert.equal(normalizeFields("not json").fields.price, 0);
  assert.equal(normalizeFields(null).fields.category, "Residential");
  assert.equal(normalizeFields([1, 2]).fields.purpose, "For Sale");
});

test("text fields are tidied and limited", () => {
  const { fields } = normalizeFields({ title: "<b>Nice</b>   house\n", area: "x".repeat(300) });
  assert.equal(fields.title, "b Nice /b house");
  assert.equal(Array.from(fields.area).length, 80);
});

test("the saved row is a private, inactive draft with the co-broke agent's name", () => {
  const { fields } = normalizeFields({ title: "T", category: "Residential", purpose: "For Sale", price: 1, area: "A", bedrooms: 3, bathrooms: 2, built_up: "1000 sqft", land_size: "20x70" });
  const row = buildPropertyRow(fields, "  Ah  Seng ");
  assert.equal(row.status, "Inactive");
  assert.equal(row.is_public, false);
  assert.equal(row.listing_agent, "Cobroke Agent");
  assert.equal(row.cobroke_agent_name, "Ah Seng");
  assert.equal(row.bedrooms, 3);
  const land = buildPropertyRow(normalizeFields({ category: "Land", price: 5, area: "X", bedrooms: 3, built_up: "100" }).fields, "A");
  assert.equal(land.bedrooms, null);
  assert.equal(land.built_up, null);
  const shop = buildPropertyRow(normalizeFields({ category: "Commercial", price: 5, area: "X", land_size: "10" }).fields, "A");
  assert.equal(shop.land_size, null);
});

test("only real post photos are kept", () => {
  assert.equal(isPostPhoto("https://scontent-xx.xx.fbcdn.net/v/t39.30808-6/a.jpg?x=1", 960, 720), true);
  assert.equal(isPostPhoto("https://scontent-xx.xx.fbcdn.net/v/t1.6435-1/p50x50/a.jpg", 960, 720), false); // profile picture
  assert.equal(isPostPhoto("https://scontent.xx.fbcdn.net/a.jpg", 60, 60), false); // tiny
  assert.equal(isPostPhoto("https://static.xx.fbcdn.net/rsrc.php/y1/a.png", 500, 500), false);
  assert.equal(isPostPhoto("http://evil.com/a.jpg", 900, 900), false);
  assert.equal(isPostPhoto("https://evil.com/a.jpg", 900, 900), false);
  assert.equal(photoKey("https://scontent.fbcdn.net/v/t39/123_n.jpg?stp=dst-jpg_s720x720&x=1"), "123_n.jpg");
});

test("names and the summary note", () => {
  assert.equal(photoTypeFor(3), "Photo 3");
  assert.match(summaryNote({ photos: 1, notes: ["No price found: please enter it."] }), /1 photo\. .*No price found/);
});

test("wrapped or differently-cased AI answers are still understood", () => {
  assert.equal(normalizeFields({ listing: { Price: 430000, Area: "Taman X", Category: "Residential" } }).fields.price, 430000);
  assert.equal(normalizeFields({ data: { listing: { price: 1000, area: "A" } } }).fields.area, "A");
  assert.equal(normalizeFields({ price: 5, area: "B" }).fields.area, "B");
});

test("an empty result is recognised", () => {
  assert.equal(isEmptyFacts(normalizeFields({}).fields), true);
  assert.equal(isEmptyFacts(normalizeFields({ area: "X" }).fields), false);
  assert.equal(isEmptyFacts(normalizeFields({ price: 100 }).fields), false);
});

test("the first photo is the cover slot of its category, the rest are numbered", () => {
  assert.deepEqual(photoSlot(0, "Residential"), { type: "Front House", file: "Front_House.jpg" });
  assert.deepEqual(photoSlot(0, "Commercial"), { type: "Shop Front", file: "Shop_Front.jpg" });
  assert.deepEqual(photoSlot(0, "Industrial"), { type: "Factory Front", file: "Factory_Front.jpg" });
  assert.deepEqual(photoSlot(0, "Land"), { type: "Front View", file: "Front_View.jpg" });
  assert.deepEqual(photoSlot(1, "Land"), { type: "Photo 2", file: "Photo_2.jpg" });
});

test("the snippet has no phone numbers and is short", () => {
  assert.ok(!/345/.test(snippet("hello 012-345 6789 world")));
  assert.equal(Array.from(snippet("a".repeat(500))).length, 160);
});
