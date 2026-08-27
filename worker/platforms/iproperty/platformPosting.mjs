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
| WAIT FOR PLATFORM POSTING PAGE
|--------------------------------------------------------------------------
*/

async function waitForPlatformPostingPage(
  page
) {
  console.log(
    "Waiting for iProperty Platform Posting page..."
  );

  const platformPosting =
    await findVisible(
      [
        page.getByText(
          "One Listing, Double the Exposure",
          {
            exact: true,
          }
        ),

        page.getByText(
          "Review your ad product details below:",
          {
            exact: true,
          }
        ),

        page.getByText(
          "Platform posting",
          {
            exact: true,
          }
        ),
      ],
      15000
    );

  if (!platformPosting) {
    throw new Error(
      "iProperty Platform Posting page did not appear."
    );
  }

  console.log(
    "✅ iProperty Platform Posting page detected."
  );
}

/*
|--------------------------------------------------------------------------
| CLICK NEXT
|--------------------------------------------------------------------------
*/

async function clickNext(
  page
) {
  console.log(
    "Looking for Platform Posting Next button..."
  );

  const next =
    await findVisible(
      [
        page.getByRole(
          "button",
          {
            name: "Next",
            exact: true,
          }
        ),

        page.getByText(
          "Next",
          {
            exact: true,
          }
        ),
      ],
      10000
    );

  if (!next) {
    throw new Error(
      'Could not find "Next" button on Platform Posting page.'
    );
  }

  await next.scrollIntoViewIfNeeded();

  console.log(
    "🖱️ Clicking Platform Posting Next..."
  );

  await next.click();

  await page.waitForTimeout(
    2000
  );

  console.log(
    "✅ Platform Posting Next clicked."
  );
}

/*
|--------------------------------------------------------------------------
| MAIN PLATFORM POSTING HANDLER
|--------------------------------------------------------------------------
*/

export async function handlePlatformPosting(
  page
) {
  console.log("");

  console.log(
    "================================="
  );

  console.log(
    "IPROPERTY PLATFORM POSTING"
  );

  console.log(
    "================================="
  );

  /*
  |--------------------------------------------------------------------------
  | 1. WAIT FOR PLATFORM POSTING PAGE
  |--------------------------------------------------------------------------
  */

  await waitForPlatformPostingPage(
    page
  );

  /*
  |--------------------------------------------------------------------------
  | 2. CLICK NEXT
  |--------------------------------------------------------------------------
  */

  await clickNext(
    page
  );

  /*
  |--------------------------------------------------------------------------
  | DONE
  |--------------------------------------------------------------------------
  |
  | We intentionally STOP here.
  |
  | Platform Posting:
  | - No data is entered.
  | - No confirmation is handled here.
  | - No Post now is clicked here.
  |
  | The next module/page is Preview.
  |
  |--------------------------------------------------------------------------
  */

  console.log("");

  console.log(
    "================================="
  );

  console.log(
    "✅ IPROPERTY PLATFORM POSTING COMPLETED"
  );

  console.log(
    "================================="
  );

  console.log(
    "Platform Posting Next clicked."
  );

  console.log(
    "Now on Preview page."
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
      "platform_posting_completed",
    url: page.url(),
  };
}