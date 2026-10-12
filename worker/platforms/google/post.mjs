import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import sharp from "sharp";

import { getGoogleBrowserPage } from "./browser.mjs";

/*
|--------------------------------------------------------------------------
| GOOGLE BUSINESS PROFILE POST
|--------------------------------------------------------------------------
|
| Payload (built by the MIB web app):
|   title, summary, price_text, photo_url,
|   button_label ("Learn more"), button_url (wa.me link), dry_run
|
| Google post buttons cannot say "WhatsApp", so the button is
| "Learn more" linking to WhatsApp.
|
| dry_run: fills in the whole post but does NOT publish, so you can check
| it in the open browser window first.
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

async function setFileOnHiddenInput(page, file) {
  for (const frame of allFrames(page)) {
    const input = frame.locator('input[type="file"]').first();
    if ((await input.count().catch(() => 0)) > 0) {
      await input.setInputFiles(file);
      return true;
    }
  }
  return false;
}

async function uploadPhoto(page, file) {
  console.log("Uploading photo...");

  const done = async () => {
    await page.waitForTimeout(5000);
    console.log("✅ Photo uploaded.");
  };

  // 1. "Add photo" may open the OS file picker directly...
  const addPhoto = await findVisible(
    page,
    byText("Add photo", "Add photos", "Add a photo", "Photo"),
    8000
  );

  if (addPhoto) {
    const chooser = await clickForFileChooser(page, addPhoto);
    if (chooser) {
      await chooser.setFiles(file);
      return done();
    }
    await page.waitForTimeout(1500);
  }

  // 2. ...or a hidden <input type=file> may be on the page...
  if (await setFileOnHiddenInput(page, file)) return done();

  // 3. ...or Google's own photo dialog with an upload button inside.
  const uploadButton = await findVisible(
    page,
    [
      ...byText(
        "Upload photos",
        "Upload photo",
        "Upload",
        "Select photos",
        "Select photo",
        "Select from computer",
        "Browse"
      ),
      (f) => f.getByText(/upload|select photos?|browse|from your computer/i),
    ],
    8000
  );

  if (uploadButton) {
    const chooser = await clickForFileChooser(page, uploadButton, 8000);
    if (chooser) {
      await chooser.setFiles(file);
      return done();
    }
    if (await setFileOnHiddenInput(page, file)) return done();
  }

  throw new Error(
    "Could not upload the photo: no file picker or upload button appeared after clicking Add photo."
  );
}

/*
|--------------------------------------------------------------------------
| HANDLER
|--------------------------------------------------------------------------
*/

export async function handleGoogleBusinessPost(job) {
  const p = job.payload ?? {};

  if (!p.summary || !p.button_url) {
    throw new Error("Google Business job is missing summary or button_url.");
  }

  console.log("");
  console.log("=================================");
  console.log("GOOGLE BUSINESS POST");
  console.log("=================================");
  console.log("Title:", p.title);
  console.log("Price:", p.price_text);
  console.log("Dry run:", p.dry_run === true);

  const page = await getGoogleBrowserPage();

  try {
    const photoFile = await downloadPhoto(p.photo_url);

    /*
    | OPEN THE PROFILE
    */
    await ensureSignedIn(page);

    const addUpdateNames = [
      "Add update",
      "Add an update",
      "Add post",
      "Add a post",
      "Create post",
    ];

    // The search page only shows a "You manage this profile" card with a
    // "View profile" button. "Add update" appears after clicking it.
    let add = await findVisible(page, byText(...addUpdateNames), 4000);

    if (!add) {
      console.log('Clicking "View profile"...');

      const viewProfile = await mustFind(
        page,
        'the "View profile" button. Make sure this Google account manages your Business Profile',
        byText("View profile", "Manage profile", "Manage this profile"),
        15000
      );
      await viewProfile.click();
      await page.waitForTimeout(3000);
    }

    add = add ?? (await mustFind(
      page,
      'the "Add update" button. Check the MIB Google window to see what page it stopped on. You can also set GOOGLE_BUSINESS_URL to your profile\'s management page',
      byText(...addUpdateNames),
      20000
    ));
    await add.click();
    await page.waitForTimeout(2500);

    /*
    | PHOTO
    */
    if (photoFile) await uploadPhoto(page, photoFile);

    /*
    | TEXT
    */
    console.log("Entering text...");

    const textBox = await mustFind(page, "the post text box", [
      (f) => f.getByRole("textbox", { name: /description|text|update|post/i }),
      (f) => f.locator("textarea"),
      (f) => f.locator('[contenteditable="true"]'),
      (f) => f.getByRole("textbox"),
    ]);

    await textBox.click();
    await textBox.fill(p.summary);
    console.log("✅ Text entered.");

    /*
    | BUTTON
    */
    console.log("Adding button:", p.button_label);

    const addButton = await mustFind(
      page,
      'the "Add a button" control',
      byText("Add a button", "Add button", "Button (optional)", "Button")
    );
    await addButton.click();
    await page.waitForTimeout(800);

    const option = await mustFind(
      page,
      `the "${p.button_label}" button option`,
      byText(p.button_label || "Learn more")
    );
    await option.click();
    await page.waitForTimeout(800);

    const link = await mustFind(page, "the button link field", [
      (f) => f.getByRole("textbox", { name: /link|url/i }),
      (f) => f.getByPlaceholder(/link|url|https/i),
      (f) => f.locator('input[type="url"]'),
    ]);
    await link.fill(p.button_url);
    console.log("✅ Button added.");

    /*
    | PUBLISH (skipped in dry run)
    */
    if (p.dry_run === true) {
      const shot = await saveDebugShot(page, "dry-run");
      console.log("");
      console.log(
        "✅ DRY RUN: post filled in but NOT published. Check the browser window."
      );

      return {
        success: true,
        status: "google_post_filled_not_published",
        screenshot: shot,
      };
    }

    const publish = await mustFind(
      page,
      "the Post/Publish button",
      byText("Post", "Publish", "Share")
    );
    await publish.click();
    await page.waitForTimeout(5000);

    await saveDebugShot(page, "published");

    console.log("✅ Google Business post published.");

    return {
      success: true,
      status: "google_post_published",
    };
  } catch (error) {
    const shot = await saveDebugShot(page, "error");
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(shot ? `${message} (screenshot: ${shot})` : message);
  }
}
