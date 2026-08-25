import { chromium } from "playwright";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";


/*
|--------------------------------------------------------------------------
| iPROPERTY BROWSER PROFILE
|--------------------------------------------------------------------------
|
| Completely separate from Facebook.
|
| Facebook:
|   MIB\facebook-profile
|
| iProperty:
|   MIB\iproperty-profile
|
|--------------------------------------------------------------------------
*/

const DEFAULT_PROFILE_DIR =
  path.join(
    os.homedir(),
    "MIB",
    "iproperty-profile"
  );


const IPROPERTY_PROFILE_DIR =
  process.env.IPROPERTY_PROFILE_DIR ||
  DEFAULT_PROFILE_DIR;


const NAVIGATION_TIMEOUT =
  Number(
    process.env.IPROPERTY_NAVIGATION_TIMEOUT ||
      30000
  );


const ACTION_TIMEOUT =
  Number(
    process.env.IPROPERTY_ACTION_TIMEOUT ||
      15000
  );


/*
|--------------------------------------------------------------------------
| BROWSER STATE
|--------------------------------------------------------------------------
*/

let browserContext =
  null;

let browserPage =
  null;


/*
|--------------------------------------------------------------------------
| ENSURE PROFILE DIRECTORY
|--------------------------------------------------------------------------
*/

function ensureProfileDirectory() {
  if (
    !fs.existsSync(
      IPROPERTY_PROFILE_DIR
    )
  ) {
    fs.mkdirSync(
      IPROPERTY_PROFILE_DIR,
      {
        recursive:
          true,
      }
    );
  }
}


/*
|--------------------------------------------------------------------------
| GET iPROPERTY BROWSER PAGE
|--------------------------------------------------------------------------
*/

export async function getIpropertyBrowserPage() {
  ensureProfileDirectory();


  /*
  |--------------------------------------------------------------------------
  | REUSE EXISTING iPROPERTY BROWSER
  |--------------------------------------------------------------------------
  */

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
    "STARTING IPROPERTY BROWSER"
  );

  console.log(
    "================================="
  );

  console.log(
    "Profile:",
    IPROPERTY_PROFILE_DIR
  );


  /*
  |--------------------------------------------------------------------------
  | LAUNCH SEPARATE PERSISTENT CONTEXT
  |--------------------------------------------------------------------------
  */

  browserContext =
    await chromium.launchPersistentContext(
      IPROPERTY_PROFILE_DIR,
      {
        headless:
          false,

        viewport: {
          width:
            1440,

          height:
            900,
        },

        locale:
          "en-US",

        args: [
          "--disable-blink-features=AutomationControlled",
        ],
      }
    );


  /*
  |--------------------------------------------------------------------------
  | DEFAULT TIMEOUTS
  |--------------------------------------------------------------------------
  */

  browserContext.setDefaultTimeout(
    ACTION_TIMEOUT
  );


  browserContext.setDefaultNavigationTimeout(
    NAVIGATION_TIMEOUT
  );


  /*
  |--------------------------------------------------------------------------
  | REUSE EXISTING PAGE
  |--------------------------------------------------------------------------
  */

  const pages =
    browserContext.pages();


  if (
    pages.length >
    0
  ) {
    browserPage =
      pages[0];
  } else {
    browserPage =
      await browserContext.newPage();
  }


  console.log(
    "iProperty browser ready."
  );

  console.log(
    "Profile:",
    IPROPERTY_PROFILE_DIR
  );


  return browserPage;
}


/*
|--------------------------------------------------------------------------
| CLOSE iPROPERTY BROWSER
|--------------------------------------------------------------------------
*/

export async function closeIpropertyBrowser() {
  if (
    browserContext
  ) {
    try {
      await browserContext.close();
    } catch (
      error
    ) {
      console.error(
        "iProperty browser close error:",
        error
      );
    }
  }


  browserContext =
    null;

  browserPage =
    null;
}


/*
|--------------------------------------------------------------------------
| GET iPROPERTY PROFILE DIRECTORY
|--------------------------------------------------------------------------
*/

export function getIpropertyProfileDir() {
  return IPROPERTY_PROFILE_DIR;
}


/*
|--------------------------------------------------------------------------
| GET iPROPERTY TIMEOUTS
|--------------------------------------------------------------------------
*/

export function getIpropertyTimeouts() {
  return {
    navigation:
      NAVIGATION_TIMEOUT,

    action:
      ACTION_TIMEOUT,
  };
}