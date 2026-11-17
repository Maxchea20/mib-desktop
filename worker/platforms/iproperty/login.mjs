/*
|--------------------------------------------------------------------------
| iPROPERTY PRO - LOGIN
|--------------------------------------------------------------------------
|
| Makes sure the iProperty PRO session is logged in.
|
| 1. Already logged in (dashboard visible)  -> returns straight away.
| 2. IPROPERTY_EMAIL and IPROPERTY_PASSWORD are set in .env
|      -> fills the login form and submits it.
| 3. iProperty asks for a captcha, a code, or "trust this device"
|      -> waits so you can finish it by hand in the browser window.
| 4. No credentials in .env -> waits so you can log in by hand.
|
| The password is only read from process.env. It is never logged.
| Keep these two names WITHOUT a VITE_ prefix, so the app never bundles them.
|
|--------------------------------------------------------------------------
*/

const LOGIN_WAIT_MS = Number(
  process.env.IPROPERTY_LOGIN_WAIT_MS || 180000
);

const POLL_MS = 1500;

const MAX_AUTO_ATTEMPTS = 2;

const RETRY_AFTER_MS = 20000;

async function firstVisible(locators) {
  for (const locator of locators) {
    const count = await locator.count().catch(() => 0);

    for (let i = 0; i < count; i++) {
      const el = locator.nth(i);

      if (await el.isVisible().catch(() => false)) {
        return el;
      }
    }
  }

  return null;
}

async function isLoggedIn(page) {
  const marker = await firstVisible([
    page.getByText("Dashboard", { exact: true }),
    page.getByText("My Listings", { exact: true }),
    page.getByText("Create Listing", { exact: true }),
  ]);

  return Boolean(marker);
}

function findPasswordField(page) {
  return firstVisible([page.locator('input[type="password"]')]);
}

function findEmailField(page) {
  return firstVisible([
    page.locator('input[type="email"]'),
    page.locator('input[autocomplete="username"]'),
    page.locator('input[name*="email" i]'),
    page.locator('input[name*="user" i]'),
    page.locator('input[id*="email" i]'),
    page.locator('input[placeholder*="email" i]'),
  ]);
}

async function findSubmitButton(page, near) {
  /*
  | Prefer the submit button inside the same form as the field we just
  | filled. A "Log in" button in the page header must not be picked
  | instead.
  */
  if (near) {
    const form = near.locator("xpath=ancestor::form[1]");

    if ((await form.count().catch(() => 0)) > 0) {
      const inForm = await firstVisible([
        form.locator('button[type="submit"]'),
        form.locator('input[type="submit"]'),
        form.getByRole("button", {
          name: /^(log ?in|sign ?in|continue|next)$/i,
        }),
        form.locator("button"),
      ]);

      if (inForm) return inForm;
    }
  }

  return firstVisible([
    page.getByRole("button", {
      name: /^(log ?in|sign ?in|continue|next)$/i,
    }),
    page.locator('button[type="submit"]'),
    page.locator('input[type="submit"]'),
  ]);
}

async function attemptLogin(page, email, password) {
  console.log("Trying to log in to iProperty PRO...");

  /*
  | Some pages show a "Log in" button first, and the form only
  | appears after it is clicked.
  */
  if (!(await findPasswordField(page)) && !(await findEmailField(page))) {
    const opener = await firstVisible([
      page.getByRole("button", { name: /log ?in|sign ?in/i }),
      page.getByRole("link", { name: /log ?in|sign ?in/i }),
    ]);

    if (opener) {
      await opener.click().catch(() => {});
      await page.waitForTimeout(2000);
    }
  }

  /*
  | Step 1: email (some sites ask for it on its own, then show password).
  */
  const emailField = await findEmailField(page);

  if (emailField) {
    await emailField.click().catch(() => {});
    await emailField.fill(email);

    if (!(await findPasswordField(page))) {
      const next = await findSubmitButton(page, emailField);

      if (next) {
        await next.click().catch(() => {});
      } else {
        await emailField.press("Enter").catch(() => {});
      }

      await page.waitForTimeout(2000);
    }
  }

  /*
  | Step 2: password.
  */
  const passwordField = await findPasswordField(page);

  if (!passwordField) {
    console.log(
      "Could not find the password field. If iProperty shows a check, finish it in the browser window."
    );

    return false;
  }

  await passwordField.click().catch(() => {});
  await passwordField.fill(password);

  const submit = await findSubmitButton(page, passwordField);

  if (submit) {
    await submit.click().catch(() => {});
  } else {
    await passwordField.press("Enter").catch(() => {});
  }

  await page.waitForTimeout(3000);

  console.log("Login form submitted.");

  return true;
}

export async function ensureIpropertySession(page) {
  console.log("Checking iProperty PRO session...");

  const email = (process.env.IPROPERTY_EMAIL || "").trim();
  const password = process.env.IPROPERTY_PASSWORD || "";
  const canAutoLogin = Boolean(email && password);

  const startTime = Date.now();

  let attempts = 0;
  let lastAttemptAt = 0;
  let warnedManual = false;
  let lastNotice = 0;

  while (Date.now() - startTime < LOGIN_WAIT_MS) {
    if (await isLoggedIn(page)) {
      console.log("✅ iProperty PRO session is active.");

      return true;
    }

    if (
      canAutoLogin &&
      attempts < MAX_AUTO_ATTEMPTS &&
      Date.now() - lastAttemptAt > RETRY_AFTER_MS
    ) {
      attempts += 1;
      lastAttemptAt = Date.now();

      try {
        await attemptLogin(page, email, password);
      } catch (error) {
        console.log(
          "Automatic login step failed:",
          error?.message || error
        );
      }

      continue;
    }

    if (!warnedManual) {
      warnedManual = true;

      console.log(
        canAutoLogin
          ? "If iProperty asks for a captcha, a code or to trust this device, finish it in the browser window."
          : "No IPROPERTY_EMAIL / IPROPERTY_PASSWORD in .env. Please log in by hand in the browser window."
      );
    }

    if (Date.now() - lastNotice > 15000) {
      lastNotice = Date.now();

      console.log(
        `Waiting for iProperty login... ${Math.round(
          (LOGIN_WAIT_MS - (Date.now() - startTime)) / 1000
        )}s left`
      );
    }

    await page.waitForTimeout(POLL_MS);
  }

  throw new Error(
    "iProperty PRO login did not complete in time. Check IPROPERTY_EMAIL / IPROPERTY_PASSWORD in .env, or log in by hand in the browser window."
  );
}
