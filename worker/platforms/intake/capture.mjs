import { chromium } from "playwright";
import fs from "node:fs";
import { isPostPhoto, photoKey } from "./parse.mjs";

/*
|--------------------------------------------------------------------------
| LISTING INTAKE: opening the Facebook post (browser)
|--------------------------------------------------------------------------
|
| Becky has her OWN browser profile folder, separate from Woody's, so each stays logged in to Facebook
| by themselves. The first time, Becky's window may ask you to log in: do it in that window and she
| carries on by herself. Facebook changes its pages often, so this is written to fail with a clear
| message instead of guessing; the draft is then made from whatever was found.
|
*/

const NAV_TIMEOUT = 45_000;
const LOGIN_WAIT_MS = 180_000;
const MAX_PHOTOS = 12;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ARTICLE = '[role="article"]';
const SEE_MORE = /^(see more|lihat lagi|查看更多|展开|展開)$/i;

async function loginWallShowing(page) {
  if (/\/login|checkpoint/.test(page.url())) return true;
  return (await page.locator('input[name="pass"]').count()) > 0 && (await page.locator(ARTICLE).count()) === 0;
}

/** The text of the main post: the first article on a permalink page, "See more" opened. */
async function readPostText(page) {
  const article = page.locator(ARTICLE).first();
  if ((await article.count()) === 0) return "";
  for (const button of await article.getByRole("button").all()) {
    try {
      const label = ((await button.innerText({ timeout: 500 })) ?? "").trim();
      if (SEE_MORE.test(label)) await button.click({ timeout: 1500 });
    } catch {
      /* a button that cannot be clicked is not the one we want */
    }
  }
  await sleep(800);
  return ((await article.innerText({ timeout: 5000 })) ?? "").trim();
}

/** Photo addresses visible in the post (big ones, from Facebook's image servers). */
async function visiblePhotos(page) {
  const found = await page
    .locator(`${ARTICLE} img`)
    .evaluateAll((imgs) => imgs.map((i) => ({ src: i.currentSrc || i.src, w: i.naturalWidth, h: i.naturalHeight })))
    .catch(() => []);
  return found.filter((p) => isPostPhoto(p.src, p.w, p.h));
}

/** For a post with several photos, open the photo viewer and step through with "Next". */
async function walkPhotoViewer(page, seen, out) {
  const first = page.locator(`${ARTICLE} a[href*="/photo"]`).first();
  if ((await first.count()) === 0) return;
  try {
    await first.click({ timeout: 4000 });
    await sleep(2500);
    for (let step = 0; step < MAX_PHOTOS && out.length < MAX_PHOTOS; step++) {
      const imgs = await page
        .locator('img[data-visualcompletion="media-vc-image"], [role="dialog"] img, [role="main"] img')
        .evaluateAll((list) => list.map((i) => ({ src: i.currentSrc || i.src, w: i.naturalWidth, h: i.naturalHeight })))
        .catch(() => []);
      const big = imgs.filter((p) => isPostPhoto(p.src, p.w, p.h)).sort((a, b) => b.w * b.h - a.w * a.h)[0];
      if (!big) break;
      const key = photoKey(big.src);
      if (seen.has(key)) break; // came back round to one we have: done
      seen.add(key);
      out.push(big.src);
      const next = page.locator('[aria-label="Next photo"], [aria-label="Next"], [aria-label="下一张"], [aria-label="Seterusnya"]').first();
      if ((await next.count()) === 0) break;
      await next.click({ timeout: 3000 }).catch(() => {});
      await sleep(1500);
    }
  } catch {
    /* the photos found so far are kept */
  }
}

/**
 * Opens the post and returns its text and photo files.
 * Returns { text, photos: Buffer[], log: string[] }. Never throws for "nothing found": it returns what it has.
 */
export async function captureFacebookPost(url, { profileDir, log = console }) {
  fs.mkdirSync(profileDir, { recursive: true });
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: { width: 1280, height: 900 },
    locale: "en-US",
    args: ["--disable-blink-features=AutomationControlled"],
  });
  context.setDefaultTimeout(15_000);
  context.setDefaultNavigationTimeout(NAV_TIMEOUT);
  const notes = [];
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await sleep(4000);

    if (await loginWallShowing(page)) {
      log.log("Becky is not logged in to Facebook. Please log in in the browser window; she waits up to 3 minutes.");
      const until = Date.now() + LOGIN_WAIT_MS;
      while (Date.now() < until && (await loginWallShowing(page))) await sleep(3000);
      if (await loginWallShowing(page)) throw new Error("Becky is not logged in to Facebook. Run her again and log in in her browser window.");
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await sleep(4000);
    }

    const text = await readPostText(page);
    if (!text) notes.push("The post text could not be read.");

    const seen = new Set();
    const srcs = [];
    for (const p of await visiblePhotos(page)) {
      const key = photoKey(p.src);
      if (!seen.has(key)) {
        seen.add(key);
        srcs.push(p.src);
      }
    }
    if (srcs.length < 2) await walkPhotoViewer(page, seen, srcs);

    const photos = [];
    for (const src of srcs.slice(0, MAX_PHOTOS)) {
      try {
        const res = await context.request.get(src, { timeout: 20_000 });
        if (res.ok()) photos.push(Buffer.from(await res.body()));
      } catch {
        /* skip a photo that cannot be downloaded */
      }
    }
    if (photos.length === 0) notes.push("No photos could be downloaded from the post.");
    return { text, photos, notes };
  } finally {
    await context.close().catch(() => {});
  }
}
