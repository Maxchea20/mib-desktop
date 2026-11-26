import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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
// Facebook is slow to draw a post and its photos, so Becky always lets the page load at least this long (INTAKE_LOAD_SECONDS in .env to change).
const LOAD_MIN_MS = Math.max(15, Number(process.env.INTAKE_LOAD_SECONDS) || 60) * 1000;
const SETTLE_MS = 8_000;
const MAX_PHOTOS = 12;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ARTICLE = '[role="article"]';
const MAIN = '[role="main"]';
const DIALOG = '[role="dialog"]';
const SEE_MORE = /^(see more|lihat lagi|查看更多|展开|展開)$/i;

async function loginWallShowing(page) {
  if (/\/login|checkpoint/.test(page.url())) return true;
  return (await page.locator('input[name="pass"]').count()) > 0 && (await page.locator(ARTICLE).count()) === 0;
}

/** Open every "See more" button inside a region. */
async function openSeeMore(region) {
  for (const button of await region.getByRole("button").all()) {
    try {
      const label = ((await button.innerText({ timeout: 500 })) ?? "").trim();
      if (SEE_MORE.test(label)) await button.click({ timeout: 1500 });
    } catch {
      /* a button that cannot be clicked is not the one we want */
    }
  }
}

/**
 * The pop-up Facebook opens a post in ("Mr Chee Property Ipoh's Post"), when there is one. The page BEHIND it
 * is the home feed, which holds other people's posts, so the pop-up must be read first. If several dialogs are
 * open (chat, cookies), the one with the most text is the post.
 */
async function postDialog(page) {
  const dialogs = await page.locator(DIALOG).all();
  let best = null;
  let bestLength = 0;
  for (const d of dialogs) {
    const length = ((await d.innerText({ timeout: 3000 }).catch(() => "")) ?? "").trim().length;
    if (length > bestLength) {
      best = d;
      bestLength = length;
    }
  }
  return bestLength >= 60 ? best : null;
}

/**
 * The text of the post: from the pop-up when there is one, else the first article on the page, else the main region.
 * Never the whole page: that would pull in menus and other people's posts.
 */
async function readPostText(page) {
  const dialog = await postDialog(page);
  const regions = [];
  if (dialog) regions.push({ region: dialog, from: "the post pop-up" });
  regions.push({ region: page.locator(ARTICLE).first(), from: ARTICLE }, { region: page.locator(MAIN).first(), from: MAIN });
  for (const { region, from } of regions) {
    if ((await region.count()) === 0) continue;
    await openSeeMore(region);
    await sleep(800);
    const text = ((await region.innerText({ timeout: 5000 }).catch(() => "")) ?? "").trim();
    if (text.length >= 20) return { text, from };
  }
  return { text: "", from: "" };
}

/** Photo addresses visible in the post (big ones, from Facebook's image servers): in the pop-up, else the article, else the main region. */
async function visiblePhotos(page) {
  for (const selector of [DIALOG, ARTICLE, MAIN]) {
    const found = await page
      .locator(`${selector} img`)
      .evaluateAll((imgs) => imgs.map((i) => ({ src: i.currentSrc || i.src, w: i.naturalWidth, h: i.naturalHeight })))
      .catch(() => []);
    const good = found.filter((p) => isPostPhoto(p.src, p.w, p.h));
    if (good.length > 0) return good;
  }
  return [];
}

/** A few plain facts about the page, to understand a failure without seeing the screen. */
async function describePage(page) {
  try {
    const info = await page.evaluate(() => ({
      title: document.title,
      articles: document.querySelectorAll('[role="article"]').length,
      dialogs: document.querySelectorAll('[role="dialog"]').length,
      mains: document.querySelectorAll('[role="main"]').length,
      images: document.images.length,
      start: (document.body?.innerText ?? "").replace(/\s+/g, " ").trim().slice(0, 200),
    }));
    return `[page: "${info.title}", ${info.articles} article(s), ${info.dialogs} dialog(s), ${info.mains} main, ${info.images} image(s); text starts: "${info.start}"]`;
  } catch {
    return "";
  }
}

/**
 * For a post with several photos: go straight to the first photo's own page (clicking can be blocked by
 * overlays), then step through with the right-arrow key, taking the biggest picture on screen each time,
 * until a photo repeats.
 */
async function walkPhotoViewer(page, seen, out, log) {
  const href = await page
    .locator(`${DIALOG} a[href*="/photo"], ${ARTICLE} a[href*="/photo"], ${MAIN} a[href*="/photo"]`)
    .first()
    .getAttribute("href", { timeout: 4000 })
    .catch(() => null);
  if (!href) {
    log.log("Becky: no photo link found to open the viewer.");
    return;
  }
  try {
    await page.goto(new URL(href, page.url()).toString(), { waitUntil: "domcontentloaded" });
    await sleep(6000);
    for (let step = 0; step < MAX_PHOTOS && out.length < MAX_PHOTOS; step++) {
      const imgs = await page
        .locator("img")
        .evaluateAll((list) => list.map((i) => ({ src: i.currentSrc || i.src, w: i.naturalWidth, h: i.naturalHeight })))
        .catch(() => []);
      const big = imgs.filter((p) => isPostPhoto(p.src, p.w, p.h)).sort((a, b) => b.w * b.h - a.w * a.h)[0];
      if (!big) break;
      const key = photoKey(big.src);
      if (seen.has(key)) break; // back at one we already have: finished
      seen.add(key);
      out.push(big.src);
      await page.keyboard.press("ArrowRight");
      await sleep(2000);
    }
    log.log(`Becky: the photo viewer gave ${out.length} photo(s).`);
  } catch (e) {
    log.log("Becky: the photo viewer stopped:", e instanceof Error ? e.message.split("\n")[0] : e);
  }
}

/**
 * Waits for the post to appear, but never less than LOAD_MIN_MS in total, then a few seconds more so the
 * photos draw. A login page is left to the caller (it is waiting for you, not for the post).
 */
async function letPageLoad(page, log) {
  const started = Date.now();
  log.log(`Becky is letting the page load (at least ${Math.round(LOAD_MIN_MS / 1000)} seconds)...`);
  while (Date.now() - started < LOAD_MIN_MS) {
    await sleep(2000);
    if (await loginWallShowing(page)) return;
  }
  // still no post? give it one more minute, since Facebook can be very slow
  const extraUntil = Date.now() + 60_000;
  while (Date.now() < extraUntil && (await page.locator(ARTICLE).count()) === 0) {
    if (await loginWallShowing(page)) return;
    await sleep(2000);
  }
  await sleep(SETTLE_MS);
}

/** When nothing can be read, keep what Becky saw so the cause can be found. */
async function saveDebug(page, log) {
  try {
    const dir = path.join(os.homedir(), "MIB", "intake-debug");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `post-${new Date().toISOString().replace(/[:.]/g, "-")}.png`);
    await page.screenshot({ path: file, fullPage: false });
    log.log("Screenshot of what Becky saw:", file);
    return file;
  } catch {
    return null;
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
    await letPageLoad(page, log);

    if (await loginWallShowing(page)) {
      log.log("Becky is not logged in to Facebook. Please log in in the browser window; she waits up to 3 minutes.");
      const until = Date.now() + LOGIN_WAIT_MS;
      while (Date.now() < until && (await loginWallShowing(page))) await sleep(3000);
      if (await loginWallShowing(page)) throw new Error("Becky is not logged in to Facebook. Run her again and log in in her browser window.");
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await letPageLoad(page, log);
    }

    const { text, from } = await readPostText(page);
    if (text) log.log(`Becky read ${text.length} characters of text from ${from}.`);
    const where = await describePage(page);
    if (!text) {
      const shot = await saveDebug(page, log);
      notes.push(`The post text could not be read. ${where}${shot ? ` Screenshot: ${shot}` : ""}`);
    }

    const seen = new Set();
    const srcs = [];
    for (const p of await visiblePhotos(page)) {
      const key = photoKey(p.src);
      if (!seen.has(key)) {
        seen.add(key);
        srcs.push(p.src);
      }
    }
    log.log(`Becky found ${srcs.length} photo(s) in the post itself.`);
    if (srcs.length < 2) await walkPhotoViewer(page, seen, srcs, log);

    const photos = [];
    for (const src of srcs.slice(0, MAX_PHOTOS)) {
      try {
        const res = await context.request.get(src, { timeout: 20_000 });
        if (res.ok()) photos.push(Buffer.from(await res.body()));
      } catch {
        /* skip a photo that cannot be downloaded */
      }
    }
    if (photos.length === 0) notes.push(`No photos could be downloaded from the post${srcs.length ? ` (${srcs.length} found, none could be downloaded)` : " (none found on the page)"}.`);
    else log.log(`Becky downloaded ${photos.length} photo(s).`);
    return { text, photos, notes, where };
  } finally {
    await context.close().catch(() => {});
  }
}

// For tests of the page-reading steps only.
export const _internals = { readPostText, visiblePhotos, postDialog, describePage };
