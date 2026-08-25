import { chromium } from "playwright";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

const DEFAULT_PROFILE_DIR = path.join(
  os.homedir(),
  "MIB",
  "facebook-profile"
);

const FACEBOOK_PROFILE_DIR =
  process.env.FACEBOOK_PROFILE_DIR ||
  DEFAULT_PROFILE_DIR;

const NAVIGATION_TIMEOUT = Number(
  process.env.FACEBOOK_NAVIGATION_TIMEOUT ||
    30000
);

const ACTION_TIMEOUT = Number(
  process.env.FACEBOOK_ACTION_TIMEOUT ||
    15000
);

let browserContext = null;
let browserPage = null;

function ensureProfileDirectory() {
  if (!fs.existsSync(FACEBOOK_PROFILE_DIR)) {
    fs.mkdirSync(FACEBOOK_PROFILE_DIR, {
      recursive: true,
    });
  }
}

export async function getFacebookBrowserPage() {
  ensureProfileDirectory();

  if (
    browserContext &&
    browserPage &&
    !browserPage.isClosed()
  ) {
    return browserPage;
  }

  console.log("");
  console.log(
    "================================="
  );
  console.log(
    "STARTING FACEBOOK BROWSER"
  );
  console.log(
    "================================="
  );
  console.log(
    "Profile:",
    FACEBOOK_PROFILE_DIR
  );

  browserContext =
    await chromium.launchPersistentContext(
      FACEBOOK_PROFILE_DIR,
      {
        headless: false,

        viewport: {
          width: 1440,
          height: 900,
        },

        locale: "en-US",

        args: [
          "--disable-blink-features=AutomationControlled",
        ],
      }
    );

  browserContext.setDefaultTimeout(
    ACTION_TIMEOUT
  );

  browserContext.setDefaultNavigationTimeout(
    NAVIGATION_TIMEOUT
  );

  const pages =
    browserContext.pages();

  if (pages.length > 0) {
    browserPage = pages[0];
  } else {
    browserPage =
      await browserContext.newPage();
  }

  return browserPage;
}

export async function closeFacebookBrowser() {
  if (browserContext) {
    try {
      await browserContext.close();
    } catch (error) {
      console.error(
        "Facebook browser close error:",
        error
      );
    }
  }

  browserContext = null;
  browserPage = null;
}

export function getFacebookProfileDir() {
  return FACEBOOK_PROFILE_DIR;
}

export function getFacebookTimeouts() {
  return {
    navigation: NAVIGATION_TIMEOUT,
    action: ACTION_TIMEOUT,
  };
}