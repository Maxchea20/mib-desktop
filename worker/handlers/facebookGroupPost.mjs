import "dotenv/config";

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

function normalizeFacebookUrl(value) {
  if (!value) {
    return "";
  }

  let url = String(value).trim();

  // Handle Markdown-style URLs:
  // [https://www.facebook.com/groups/123](https://www.facebook.com/groups/123)
  const markdownMatch = url.match(
    /^\[.*?\]\((https?:\/\/[^)]+)\)$/
  );

  if (markdownMatch) {
    url = markdownMatch[1];
  }

  return url;
}

async function getBrowserPage() {
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

async function waitForFacebookLogin(page) {
  const LOGIN_WAIT_MS = 120000;
  const POLL_INTERVAL_MS = 2000;

  console.log("");
  console.log(
    "Waiting for Facebook login/session..."
  );
  console.log(
    "You have up to 2 minutes to complete login, identity confirmation, and browser trust."
  );

  const startTime = Date.now();

  while (
    Date.now() - startTime <
    LOGIN_WAIT_MS
  ) {
    const currentUrl =
      page.url();

    if (
      currentUrl.includes(
        "facebook.com/login"
      )
    ) {
      console.log(
        "Facebook login page detected. Waiting for login..."
      );

      await page.waitForTimeout(
        POLL_INTERVAL_MS
      );

      continue;
    }

    const loginButton =
      page.getByRole(
        "button",
        {
          name: /log in|login/i,
        }
      );

    const loginVisible =
      await loginButton
        .first()
        .isVisible()
        .catch(
          () => false
        );

    if (loginVisible) {
      console.log(
        "Facebook login prompt detected. Waiting..."
      );

      await page.waitForTimeout(
        POLL_INTERVAL_MS
      );

      continue;
    }

    const bodyText =
      await page
        .locator("body")
        .innerText()
        .catch(
          () => ""
        );

    const lower =
      bodyText.toLowerCase();

    const looksLoggedIn =
      currentUrl.includes(
        "facebook.com/groups/"
      ) &&
      !lower.includes(
        "log in to facebook"
      );

    if (looksLoggedIn) {
      console.log(
        "✅ Facebook session appears active."
      );

      return;
    }

    await page.waitForTimeout(
      POLL_INTERVAL_MS
    );
  }

  throw new Error(
    "Facebook login was not completed within 2 minutes."
  );
}

async function findComposer(page) {
  console.log(
    'Looking for "Write something..." composer...'
  );

  const writeSomething =
    page.getByText(
      "Write something...",
      {
        exact: true,
      }
    );

  const count =
    await writeSomething.count();

  for (
    let i = 0;
    i < count;
    i++
  ) {
    const element =
      writeSomething.nth(i);

    if (
      !(await element
        .isVisible()
        .catch(() => false))
    ) {
      continue;
    }

    console.log(
      '"Write something..." found. Opening composer...'
    );

    await element.click();

    await page.waitForTimeout(
      1500
    );

    console.log(
      "Create post dialog opened."
    );

    // -----------------------------------------
    // Find visible Facebook textbox editors
    // -----------------------------------------

    const editors =
      page.locator(
        '[contenteditable="true"][role="textbox"]'
      );

    const editorCount =
      await editors.count();

    console.log(
      `Found ${editorCount} contenteditable textbox element(s).`
    );

    for (
      let j = 0;
      j < editorCount;
      j++
    ) {
      const editor =
        editors.nth(j);

      if (
        !(await editor
          .isVisible()
          .catch(() => false))
      ) {
        continue;
      }

      const ariaLabel =
        await editor
          .getAttribute(
            "aria-label"
          )
          .catch(() => "");

      const ariaPlaceholder =
        await editor
          .getAttribute(
            "aria-placeholder"
          )
          .catch(() => "");

      console.log(
        `EDITOR ${j}:`,
        JSON.stringify({
          ariaLabel,
          ariaPlaceholder,
        })
      );

      const label =
        `${ariaLabel} ${ariaPlaceholder}`
          .toLowerCase();

      // Never use comment/reply editors.
      if (
        label.includes("comment") ||
        label.includes("answer as") ||
        label.includes("reply")
      ) {
        console.log(
          `EDITOR ${j}: skipped because it looks like a comment/reply editor.`
        );

        continue;
      }

      console.log(
        "✅ Facebook post editor found."
      );

      return editor;
    }

    // -----------------------------------------
    // Fallback: any visible contenteditable
    // that isn't a comment/reply editor
    // -----------------------------------------

    console.log(
      "Trying visible contenteditable fallback..."
    );

    const visibleEditors =
      page.locator(
        '[contenteditable="true"]:visible'
      );

    const visibleCount =
      await visibleEditors.count();

    console.log(
      `Visible contenteditable elements: ${visibleCount}`
    );

    for (
      let j = 0;
      j < visibleCount;
      j++
    ) {
      const editor =
        visibleEditors.nth(j);

      const ariaLabel =
        await editor
          .getAttribute(
            "aria-label"
          )
          .catch(() => "");

      const ariaPlaceholder =
        await editor
          .getAttribute(
            "aria-placeholder"
          )
          .catch(() => "");

      const label =
        `${ariaLabel} ${ariaPlaceholder}`
          .toLowerCase();

      if (
        label.includes("comment") ||
        label.includes("answer as") ||
        label.includes("reply")
      ) {
        continue;
      }

      console.log(
        "✅ Facebook post editor found through fallback."
      );

      return editor;
    }

    return null;
  }

  return null;
}

async function fillComposer(
  composer,
  message
) {
  console.log(
    "Clicking post textbox..."
  );

  await composer.click();

  await composer.fill(
    message
  );

  console.log(
    "✅ Message entered into post composer."
  );
}

async function findPostButton(page) {
  console.log(
    'Looking for Facebook Post button...'
  );

  await page.waitForTimeout(1000);

  // Facebook exposes the Create Post button
  // as a div with aria-label="Post".
  const postButtons =
    page.locator(
      '[aria-label="Post"]'
    );

  const count =
    await postButtons.count();

  console.log(
    `Found ${count} aria-label="Post" element(s).`
  );

  for (
    let i = 0;
    i < count;
    i++
  ) {
    const button =
      postButtons.nth(i);

    if (
      !(await button
        .isVisible()
        .catch(() => false))
    ) {
      continue;
    }

    console.log(
      "✅ Facebook Post button found."
    );

    return button;
  }

  return null;
}

async function waitForPostCompletion(
  page
) {
  /*
   * Give Facebook time to close the modal
   * and process the post.
   */
  await page.waitForTimeout(
    5000
  );

  const bodyText =
    await page
      .locator("body")
      .innerText()
      .catch(
        () => ""
      );

  const lower =
    bodyText.toLowerCase();

  if (
    lower.includes(
      "your post has been published"
    )
  ) {
    return true;
  }

  if (
    lower.includes(
      "post published"
    )
  ) {
    return true;
  }

  if (
    lower.includes(
      "your post is published"
    )
  ) {
    return true;
  }

  /*
   * If the Create Post dialog disappeared,
   * Facebook accepted the action even if it
   * didn't show a textual confirmation.
   */
  const dialog =
    page.getByRole(
      "dialog"
    );

  const dialogCount =
    await dialog.count();

  if (
    dialogCount === 0
  ) {
    return true;
  }

  const lastDialog =
    dialog.last();

  const dialogStillVisible =
    await lastDialog
      .isVisible()
      .catch(
        () => false
      );

  if (!dialogStillVisible) {
    return true;
  }

  return false;
}

export async function handleFacebookGroupPost(
  job
) {
  const payload =
    job?.payload ?? {};

  const groupUrl =
    normalizeFacebookUrl(
      payload.group_url ||
        payload.groupUrl
    );

  const message =
    payload.message ||
    payload.caption ||
    "";

  if (!groupUrl) {
    throw new Error(
      "Facebook Group post job is missing group_url."
    );
  }

  if (!message.trim()) {
    throw new Error(
      "Facebook Group post job is missing message."
    );
  }

  if (
    !groupUrl.includes(
      "facebook.com"
    )
  ) {
    throw new Error(
      "Invalid Facebook Group URL."
    );
  }

  console.log("");
  console.log(
    "================================="
  );
  console.log(
    "FACEBOOK GROUP POST"
  );
  console.log(
    "================================="
  );
  console.log(
    "Job ID:",
    job.id
  );
  console.log(
    "Group:",
    groupUrl
  );
  console.log(
    "Message:",
    message
  );
  console.log(
    "================================="
  );
  console.log("");

  const page =
    await getBrowserPage();

  console.log(
    "Opening Facebook Group..."
  );

  await page.goto(
    groupUrl,
    {
      waitUntil:
        "domcontentloaded",
      timeout:
        NAVIGATION_TIMEOUT,
    }
  );

  await page.waitForTimeout(
    3000
  );

  await waitForFacebookLogin(
    page
  );

  console.log(
    "Facebook session appears active."
  );

  console.log(
    "Looking for Group composer..."
  );

  const composer =
    await findComposer(
      page
    );

  if (!composer) {
    throw new Error(
      "Could not find the Facebook Group post composer. The Group may require approval, membership, or Facebook may have changed the page layout."
    );
  }

  console.log(
    "Group composer found."
  );

  await fillComposer(
    composer,
    message
  );

  await page.waitForTimeout(
    1000
  );

  console.log(
    "Looking for Post button..."
  );

  const postButton =
    await findPostButton(
      page
    );

  if (!postButton) {
    throw new Error(
      "Could not find the Facebook Post button after filling the Group composer."
    );
  }

  console.log(
    "Post button found."
  );

  const disabled =
    await postButton
      .isDisabled()
      .catch(
        () => false
      );

  if (disabled) {
    throw new Error(
      "Facebook Post button is still disabled after entering the message."
    );
  }

  await postButton.click();

  console.log(
    "Post button clicked."
  );

  const completed =
    await waitForPostCompletion(
      page
    );

  if (!completed) {
    console.log(
      "Facebook did not provide a definitive published confirmation."
    );

    return {
      success: true,
      status: "review",
      message:
        "Post action completed, but Facebook did not provide a definitive confirmation.",
      group_url:
        groupUrl,
    };
  }

  console.log(
    "✅ Facebook Group post published."
  );

  return {
    success: true,
    status: "posted",
    message:
      "Facebook Group post published successfully.",
    group_url:
      groupUrl,
  };
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