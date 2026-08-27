const ELEMENT_TIMEOUT = 15000;

/*
|--------------------------------------------------------------------------
| FIND VISIBLE ELEMENT
|--------------------------------------------------------------------------
*/

async function findVisible(
  locators,
  timeout = ELEMENT_TIMEOUT
) {
  const startTime = Date.now();

  while (
    Date.now() - startTime < timeout
  ) {
    for (const locator of locators) {
      const count = await locator
        .count()
        .catch(() => 0);

      for (
        let i = 0;
        i < count;
        i++
      ) {
        const element = locator.nth(i);

        if (
          await element
            .isVisible()
            .catch(() => false)
        ) {
          return element;
        }
      }
    }

    await new Promise((resolve) =>
      setTimeout(resolve, 300)
    );
  }

  return null;
}

/*
|--------------------------------------------------------------------------
| WAIT FOR PREVIEW PAGE
|--------------------------------------------------------------------------
*/

async function waitForPreviewPage(
  page
) {
  console.log(
    "Waiting for iProperty Preview page..."
  );

  const preview =
    await findVisible(
      [
        page.getByText(
          "Preview",
          {
            exact: true,
          }
        ),

        page.getByRole(
          "button",
          {
            name: /Post now/i,
          }
        ),

        page.getByText(
          "Post now",
          {
            exact: true,
          }
        ),
      ],
      15000
    );

  if (!preview) {
    throw new Error(
      "iProperty Preview page did not appear."
    );
  }

  console.log(
    "✅ iProperty Preview page detected."
  );
}

/*
|--------------------------------------------------------------------------
| CLICK POST NOW
|--------------------------------------------------------------------------
*/

async function clickPostNow(
  page
) {
  console.log(
    'Looking for "Post now" button...'
  );

  const postNow =
    await findVisible(
      [
        page.getByRole(
          "button",
          {
            name: "Post now",
            exact: true,
          }
        ),

        page.getByText(
          "Post now",
          {
            exact: true,
          }
        ),
      ],
      10000
    );

  if (!postNow) {
    throw new Error(
      'Could not find "Post now" button on Preview page.'
    );
  }

  await postNow.scrollIntoViewIfNeeded();

  console.log(
    '🖱️ Clicking "Post now"...'
  );

  await postNow.click();

  await page.waitForTimeout(
    1000
  );

  console.log(
    '✅ "Post now" clicked.'
  );
}

/*
|--------------------------------------------------------------------------
| WAIT FOR CONFIRM POSTING POPUP
|--------------------------------------------------------------------------
*/

async function waitForConfirmPosting(
  page
) {
  console.log(
    'Waiting for "Confirm posting" popup...'
  );

  const confirmPopup =
    await findVisible(
      [
        page.getByText(
          "Confirm posting",
          {
            exact: true,
          }
        ),

        page.getByText(
          /Confirm posting/i
        ),

        page.getByRole(
          "button",
          {
            name: "Confirm",
            exact: true,
          }
        ),
      ],
      10000
    );

  if (!confirmPopup) {
    throw new Error(
      'The "Confirm posting" popup did not appear.'
    );
  }

  console.log(
    '✅ "Confirm posting" popup detected.'
  );
}

/*
|--------------------------------------------------------------------------
| CLICK CONFIRM
|--------------------------------------------------------------------------
*/

async function clickConfirm(
  page
) {
  console.log(
    'Looking for "Confirm" button...'
  );

  const confirm =
    await findVisible(
      [
        page.getByRole(
          "button",
          {
            name: "Confirm",
            exact: true,
          }
        ),

        page.getByText(
          "Confirm",
          {
            exact: true,
          }
        ),
      ],
      10000
    );

  if (!confirm) {
    throw new Error(
      'Could not find "Confirm" button in posting popup.'
    );
  }

  await confirm.scrollIntoViewIfNeeded();

  console.log(
    '🖱️ Clicking "Confirm"...'
  );

  await confirm.click();

  await page.waitForTimeout(
    3000
  );

  console.log(
    '✅ "Confirm" clicked.'
  );
}

/*
|--------------------------------------------------------------------------
| MAIN PREVIEW HANDLER
|--------------------------------------------------------------------------
*/

export async function handlePreview(
  page
) {
  console.log("");

  console.log(
    "================================="
  );

  console.log(
    "IPROPERTY PREVIEW"
  );

  console.log(
    "================================="
  );

  /*
  |--------------------------------------------------------------------------
  | 1. WAIT FOR PREVIEW PAGE
  |--------------------------------------------------------------------------
  */

  await waitForPreviewPage(
    page
  );

  /*
  |--------------------------------------------------------------------------
  | 2. CLICK POST NOW
  |--------------------------------------------------------------------------
  */

  await clickPostNow(
    page
  );

  /*
  |--------------------------------------------------------------------------
  | 3. WAIT FOR CONFIRM POSTING POPUP
  |--------------------------------------------------------------------------
  */

  await waitForConfirmPosting(
    page
  );

  /*
  |--------------------------------------------------------------------------
  | 4. CLICK CONFIRM
  |--------------------------------------------------------------------------
  */

  await clickConfirm(
    page
  );

  /*
  |--------------------------------------------------------------------------
  | DONE
  |--------------------------------------------------------------------------
  */

  console.log("");

  console.log(
    "================================="
  );

  console.log(
    "✅ IPROPERTY PREVIEW COMPLETED"
  );

  console.log(
    "================================="
  );

  console.log(
    '"Post now" clicked.'
  );

  console.log(
    '"Confirm" clicked.'
  );

  console.log(
    "Current URL:",
    page.url()
  );

  console.log(
    "================================="
  );

  return {
    success: true,

    status:
      "preview_completed",

    url:
      page.url(),
  };
}