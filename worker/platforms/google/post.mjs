import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import sharp from "sharp";

import { getGoogleBrowserPage } from "./browser.mjs";

/*
|--------------------------------------------------------------------------
| GOOGLE BUSINESS PROFILE - ADD PRODUCT
|--------------------------------------------------------------------------
|
| Each listing is added as a Product on the Business Profile
| (Products > Add product): photo, name, category, price and description.
| The landing page URL is left empty; the description ends with the
| WhatsApp number.
|
| Payload (built by the MIB web app):
|   title, description (or summary), price (number), photo_url, dry_run
|
| dry_run: fills in the whole form but does NOT publish, so you can check
| it in the open browser window first.
|
| Product category is required by Google. Set GOOGLE_PRODUCT_CATEGORY in
| .env to the category text to pick (e.g. "Real estate"); otherwise the
| worker picks a property-like category, else the first one.
|
| Google changes this screen from time to time. Every step uses visible
| text rather than CSS classes, and a screenshot is saved to
| MIB\google-debug when something fails.
|
*/

const START_URL =
  process.env.GOOGLE_BUSINESS_URL ||
  "https://www.google.com/search?q=my+business";

const LOGIN_WAIT_MS = 3 * 60 * 1000;
const STEP_TIMEOUT = 15000;

const DEBUG_DIR = path.join(os.homedir(), "MIB", "google-debug");

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function allFrames(page) {
  return [page, ...page.frames().filter((f) => f !== page.mainFrame())];
}

async function findVisible(page, builders, timeout = STEP_TIMEOUT) {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    for (const frame of allFrames(page)) {
      for (const build of builders) {
        const locator = build(frame);
        const count = await locator.count().catch(() => 0);

        for (let i = 0; i < count; i++) {
          const el = locator.nth(i);
          if (await el.isVisible().catch(() => false)) return el;
        }
      }
    }

    await page.waitForTimeout(400);
  }

  return null;
}

async function mustFind(page, label, builders, timeout) {
  const el = await findVisible(page, builders, timeout);
  if (!el) throw new Error(`Could not find ${label}.`);
  return el;
}

function byText(...names) {
  return names.flatMap((name) => [
    (f) => f.getByRole("button", { name, exact: true }),
    (f) => f.getByRole("link", { name, exact: true }),
    (f) => f.getByRole("menuitem", { name, exact: true }),
    (f) => f.getByRole("option", { name, exact: true }),
    (f) => f.getByText(name, { exact: true }),
  ]);
}

async function saveDebugShot(page, label) {
  try {
    fs.mkdirSync(DEBUG_DIR, { recursive: true });
    const file = path.join(DEBUG_DIR, `${label}-${Date.now()}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log("Debug screenshot:", file);
    return file;
  } catch {
    return null;
  }
}

function isLoginPage(page) {
  return /accounts\.google\.com/.test(page.url());
}

/*
|--------------------------------------------------------------------------
| LOGIN
|--------------------------------------------------------------------------
*/

async function ensureSignedIn(page) {
  await page.goto(START_URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);

  const needsLogin = async () =>
    isLoginPage(page) ||
    (await page
      .getByRole("link", { name: "Sign in", exact: true })
      .first()
      .isVisible()
      .catch(() => false));

  if (!(await needsLogin())) return;

  console.log("");
  console.log("⚠️  Google is not signed in.");
  console.log(
    "Sign in to the Google account that manages your Business Profile in the browser window."
  );
  console.log(`Waiting up to ${LOGIN_WAIT_MS / 60000} minutes...`);

  const start = Date.now();

  while (Date.now() - start < LOGIN_WAIT_MS) {
    await page.waitForTimeout(3000);

    if (!isLoginPage(page) && /google\./.test(page.url())) {
      await page.goto(START_URL, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2500);
      if (!(await needsLogin())) {
        console.log("✅ Signed in.");
        return;
      }
    }
  }

  throw new Error(
    "Google sign-in was not completed. Sign in in the MIB Google browser window and queue the post again."
  );
}

/*
|--------------------------------------------------------------------------
| PHOTO
|--------------------------------------------------------------------------
*/

async function downloadPhoto(url) {
  if (!url) return null;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not download listing photo. HTTP ${response.status}`);
  }

  const buffer = await sharp(Buffer.from(await response.arrayBuffer()))
    .rotate()
    .resize({ width: 1600, withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mib-google-"));
  const file = path.join(dir, "listing.jpg");
  fs.writeFileSync(file, buffer);
  return file;
}

// Clicks `el` and returns the file chooser if one opens (null otherwise).
// Never throws, so a missing chooser cannot crash the worker.
async function clickForFileChooser(page, el, timeout = 6000) {
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser", { timeout }).catch(() => null),
    el.click().catch(() => {}),
  ]);
  return chooser;
}

// Sets the file on the hidden <input type=file> nearest to `anchor`
// (never a file input elsewhere on the page).
async function setFileNear(anchor, file) {
  const input = anchor.locator(
    'xpath=ancestor::*[.//input[@type="file"]][1]//input[@type="file"]'
  ).first();

  if ((await input.count().catch(() => 0)) > 0) {
    await input.setInputFiles(file);
    return true;
  }
  return false;
}

async function uploadPhoto(page, file) {
  console.log("Uploading photo...");

  const done = async () => {
    await page.waitForTimeout(5000);
    console.log("✅ Photo uploaded.");
  };

  // Only the "Select a photo" box inside the Add product form.
  // (Other "Add photo" buttons on the page belong to the profile itself.)
  const selectPhoto = await mustFind(
    page,
    'the "Select a photo" box in the Add product form',
    [
      (f) => f.getByRole("button", { name: "Select a photo", exact: true }),
      (f) => f.getByText("Select a photo", { exact: true }),
    ],
    10000
  );

  // 1. Opens the OS file picker directly...
  let chooser = await clickForFileChooser(page, selectPhoto);
  if (chooser) {
    await chooser.setFiles(file);
    return done();
  }
  await page.waitForTimeout(1500);

  // 2. ...or a hidden file input sits inside the form...
  if (await setFileNear(selectPhoto, file)) return done();

  // 3. ...or Google's own photo dialog with an upload button.
  const uploadButton = await findVisible(
    page,
    byText(
      "Upload photos",
      "Upload photo",
      "Upload",
      "Select photos",
      "Select from computer",
      "Browse"
    ),
    8000
  );

  if (uploadButton) {
    chooser = await clickForFileChooser(page, uploadButton, 8000);
    if (chooser) {
      await chooser.setFiles(file);
      return done();
    }
  }

  throw new Error(
    'Could not upload the photo: nothing opened after clicking "Select a photo".'
  );
}

function shorten(text, max) {
  const clean = String(text ?? "").replace(/[ \t]+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

async function fillField(page, label, builders, value) {
  const el = await mustFind(page, `the ${label} field`, builders);
  await el.click();
  await el.fill(String(value));
  console.log(`✅ ${label} entered.`);
}

const field = (re) => [
  (f) => f.getByRole("textbox", { name: re }),
  (f) => f.getByLabel(re),
  (f) => f.getByPlaceholder(re),
];

async function selectCategory(page) {
  console.log("Selecting category...");

  const dropdown = await mustFind(page, "the category dropdown", [
    (f) => f.getByRole("combobox", { name: /category/i }),
    (f) => f.getByRole("button", { name: /category/i }),
    (f) => f.getByText(/select a category/i),
  ]);
  await dropdown.click();
  await page.waitForTimeout(1000);

  const options = [];
  for (const frame of allFrames(page)) {
    const items = frame.getByRole("option");
    const n = await items.count().catch(() => 0);
    for (let i = 0; i < n; i++) {
      if (await items.nth(i).isVisible().catch(() => false)) {
        options.push(items.nth(i));
      }
    }
  }

  if (options.length === 0) {
    throw new Error("The category list did not open.");
  }

  const names = [];
  for (const o of options) {
    names.push((await o.innerText().catch(() => "")).trim());
  }
  console.log("Categories available:", names.join(" | "));

  const wanted = process.env.GOOGLE_PRODUCT_CATEGORY;
  let index = -1;

  if (wanted) {
    index = names.findIndex((n) =>
      n.toLowerCase().includes(wanted.toLowerCase())
    );
  }
  if (index === -1) {
    index = names.findIndex((n) =>
      /real estate|propert|house|home|land/i.test(n)
    );
  }
  if (index === -1) index = 0;

  console.log("Category chosen:", names[index]);
  await options[index].click();
  await page.waitForTimeout(800);
}

export async function handleGoogleBusinessPost(job) {
  const p = job.payload ?? {};

  if (!p.title) {
    throw new Error("Google Business job is missing title.");
  }

  const name = shorten(p.title, 58);
  const description = shorten(p.description || p.summary, 1000);

  const priceNumber =
    p.price !== undefined && p.price !== null && p.price !== ""
      ? Number(p.price)
      : Number(String(p.price_text ?? "").replace(/[^0-9.]/g, ""));

  console.log("");
  console.log("=================================");
  console.log("GOOGLE BUSINESS - ADD PRODUCT");
  console.log("=================================");
  console.log("Name:", name);
  console.log("Price:", priceNumber || "(none)");
  console.log("Dry run:", p.dry_run === true);

  let page = await getGoogleBrowserPage();

  try {
    const photoFile = await downloadPhoto(p.photo_url);

    /*
    | OPEN THE PROFILE
    */
    await ensureSignedIn(page);

    // On the profile page the Products row has a dashed tile whose
    // button is just labelled "Add": <a role="button"><span>Add</span></a>.
    // Take the first "Add" button that follows the "Products" heading.
    const addProductBuilders = [
      (f) =>
        f
          .getByText("Products", { exact: true })
          .locator(
            'xpath=following::a[@role="button" or self::button][.//span[normalize-space()="Add"] or normalize-space()="Add"][1]'
          ),
      (f) => f.getByRole("button", { name: /add product/i }),
      (f) => f.getByRole("link", { name: /add product/i }),
      (f) => f.getByLabel(/add product/i),
      (f) => f.getByText(/^add product$/i),
      (f) => f.getByTitle(/add product/i),
    ];

    // The search page only shows a "You manage this profile" card with a
    // "View profile" button. The Products row appears after clicking it.
    let add = await findVisible(page, addProductBuilders, 4000);

    if (!add) {
      console.log('Clicking "View profile"...');

      const viewProfile = await mustFind(
        page,
        'the "View profile" button. Make sure this Google account manages your Business Profile',
        byText("View profile", "Manage profile", "Manage this profile"),
        15000
      );
      await viewProfile.click();
      await page.waitForTimeout(4000);

      // "View profile" can open the profile in a new tab: follow it.
      const tabs = page.context().pages();
      const newest = tabs[tabs.length - 1];
      if (newest && newest !== page) {
        console.log("Profile opened in a new tab; switching to it.");
        page = newest;
        await page.bringToFront();
        await page.waitForLoadState("domcontentloaded").catch(() => {});
      }

      // Let lazy-loaded panels (Products row) render.
      await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
      await page.mouse.wheel(0, 600).catch(() => {});
      await page.waitForTimeout(1500);
    }

    // Last resort: the dashed "+" tile right under the "Products" heading.
    add =
      add ??
      (await findVisible(
        page,
        [
          ...addProductBuilders,
          (f) =>
            f
              .getByText("Products", { exact: true })
              .locator(
                'xpath=following::*[self::a or self::button or @role="button"][1]'
              ),
        ],
        20000
      ));

    if (!add) {
      console.log("");
      console.log("Page:", page.url());
      console.log('Buttons/links containing "add" or "+" on the page:');
      for (const frame of allFrames(page)) {
        const items = frame.locator(
          'button, a, [role="button"], [aria-label]'
        );
        const n = Math.min(await items.count().catch(() => 0), 400);
        for (let i = 0; i < n; i++) {
          const el = items.nth(i);
          const label = (
            (await el.getAttribute("aria-label").catch(() => "")) ||
            (await el.innerText().catch(() => "")) ||
            ""
          )
            .replace(/\s+/g, " ")
            .trim();
          if (label && label.length < 80 && /add|\+|product/i.test(label)) {
            console.log("  -", label);
          }
        }
      }

      throw new Error(
        'Could not find "Add product" under Products. Check the MIB Google window to see what page it stopped on. You can also set GOOGLE_BUSINESS_URL to your profile\'s page'
      );
    }

    await add.click();
    await page.waitForTimeout(2500);
    console.log("✅ Add product form opened.");

    /*
    | PHOTO
    */
    if (photoFile) await uploadPhoto(page, photoFile);

    /*
    | NAME, CATEGORY, PRICE, DESCRIPTION (landing page URL is left empty)
    */
    await fillField(page, "Product name", field(/product name/i), name);

    await selectCategory(page);

    if (Number.isFinite(priceNumber) && priceNumber > 0) {
      await fillField(
        page,
        "Product price",
        field(/product price/i),
        priceNumber
      );
    }

    if (description) {
      await fillField(
        page,
        "Product description",
        field(/product description/i),
        description
      );
    }

    /*
    | PUBLISH (skipped in dry run)
    */
    if (p.dry_run === true) {
      const shot = await saveDebugShot(page, "dry-run");
      console.log("");
      console.log(
        "✅ DRY RUN: product filled in but NOT published. Check the browser window."
      );

      return {
        success: true,
        status: "google_product_filled_not_published",
        screenshot: shot,
      };
    }

    const publish = await mustFind(
      page,
      "the Publish button",
      byText("Publish")
    );

    const findFormFrame = () =>
      page
        .frames()
        .find((f) => /products\/add/.test(f.url()) && !f.isDetached());

    // Success screen: "Your product is being added".
    const publishedScreen = async () => {
      for (const f of page.frames()) {
        try {
          const n = await f
            .getByText(/product is being added|Add next product|See my products/i)
            .count();
          if (n > 0) return true;
        } catch {}
      }
      return false;
    };

    const attempts = [
      async () => {
        await publish.scrollIntoViewIfNeeded().catch(() => {});
        await publish.click({ timeout: 5000 });
      },
      async () => publish.click({ force: true, timeout: 5000 }),
      async () => {
        await publish.focus().catch(() => {});
        await page.keyboard.press("Enter");
      },
      async () => publish.evaluate((el) => el.click()),
    ];

    let done = false;
    for (let a = 0; a < attempts.length && !done; a++) {
      try {
        await attempts[a]();
        console.log(`Publish clicked (method ${a + 1}). Waiting...`);
      } catch (e) {
        console.log(`Publish click method ${a + 1} failed: ${e.message}`);
        continue;
      }
      for (let i = 0; i < 10 && !done; i++) {
        await page.waitForTimeout(1000);
        done = await publishedScreen();
      }
    }

    if (!done) {
      let formText = "";
      try {
        const frame = findFormFrame();
        formText = frame
          ? await frame.locator("body").innerText({ timeout: 3000 })
          : "";
      } catch {}

      console.log("");
      console.log("Add product form text after Publish:");
      console.log(shorten(formText.replace(/\s+/g, " "), 800));

      throw new Error(
        "Clicked Publish but never saw the 'Your product is being added' screen. Check the log text and screenshot."
      );
    }

    await page.waitForTimeout(2000);
    await saveDebugShot(page, "published");

    console.log("✅ Google Business product published.");

    return {
      success: true,
      status: "google_product_published",
    };
  } catch (error) {
    const shot = await saveDebugShot(page, "error");
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(shot ? `${message} (screenshot: ${shot})` : message);
  }
}
