import { chromium } from "playwright";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

/*
|--------------------------------------------------------------------------
| GOOGLE BUSINESS BROWSER PROFILE
|--------------------------------------------------------------------------
|
| Separate from Facebook and iProperty:
|
|   MIB\google-business-profile
|
| Log into the Google account that manages your Business Profile once in
| this window. The session is kept for next time.
|
*/

const GOOGLE_PROFILE_DIR =
  process.env.GOOGLE_PROFILE_DIR ||
  path.join(os.homedir(), "MIB", "google-business-profile");

const NAVIGATION_TIMEOUT = Number(
  process.env.GOOGLE_NAVIGATION_TIMEOUT || 30000
);

const ACTION_TIMEOUT = Number(
  process.env.GOOGLE_ACTION_TIMEOUT || 15000
);

let browserContext = null;
let browserPage = null;

export async function getGoogleBrowserPage() {
  fs.mkdirSync(GOOGLE_PROFILE_DIR, { recursive: true });

  if (browserContext && browserPage && !browserPage.isClosed()) {
    return browserPage;
  }

  console.log("");
  console.log("=================================");
  console.log("STARTING GOOGLE BUSINESS BROWSER");
  console.log("=================================");
  console.log("Profile:", GOOGLE_PROFILE_DIR);

  browserContext = await chromium.launchPersistentContext(
    GOOGLE_PROFILE_DIR,
    {
      headless: false,
      viewport: { width: 1440, height: 900 },
      locale: "en-US",
      args: ["--disable-blink-features=AutomationControlled"],
    }
  );

  browserContext.setDefaultTimeout(ACTION_TIMEOUT);
  browserContext.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT);

  const pages = browserContext.pages();
  browserPage = pages.length > 0 ? pages[0] : await browserContext.newPage();

  return browserPage;
}

export async function closeGoogleBrowser() {
  if (browserContext) {
    try {
      await browserContext.close();
    } catch (error) {
      console.error("Google browser close error:", error);
    }
  }

  browserContext = null;
  browserPage = null;
}
