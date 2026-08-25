const LOGIN_WAIT_MS = 120000;
const POLL_INTERVAL_MS = 2000;

export async function waitForFacebookLogin(page) {
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