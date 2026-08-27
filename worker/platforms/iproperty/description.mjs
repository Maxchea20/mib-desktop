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
| FILL TEXT FIELD
|--------------------------------------------------------------------------
*/

async function fillTextField(
  page,
  fieldName,
  locators,
  value
) {
  if (
    value === null ||
    value === undefined ||
    String(value).trim() === ""
  ) {
    throw new Error(
      `Listing is missing ${fieldName}.`
    );
  }

  const text =
    String(value);

  const input =
    await findVisible(
      locators
    );

  if (!input) {
    throw new Error(
      `Could not find ${fieldName} input.`
    );
  }

  await input.scrollIntoViewIfNeeded();

  await input.fill(
    text
  );

  await page.waitForTimeout(
    300
  );

  const actualValue =
    await input
      .inputValue()
      .catch(() => "");

  if (
    actualValue.trim() !==
    text.trim()
  ) {
    throw new Error(
      `${fieldName} verification failed. Expected "${text}", got "${actualValue}".`
    );
  }

  console.log(
    `✅ ${fieldName} entered.`
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
  const next =
    await findVisible(
      [
        page.locator(
          '[da-id="footer-next-button"]'
        ),

        page.getByRole(
          "button",
          {
            name: "Next",
            exact: true,
          }
        ),
      ]
    );

  if (!next) {
    throw new Error(
      'Could not find "Next" button on Description page.'
    );
  }

  await next.scrollIntoViewIfNeeded();

  console.log(
    "🖱️ Clicking Description -> Next"
  );

  await next.click();

  await page.waitForTimeout(
    2000
  );

  console.log(
    "✅ Description Next clicked."
  );
}

/*
|--------------------------------------------------------------------------
| MAIN DESCRIPTION HANDLER
|--------------------------------------------------------------------------
*/

export async function handleDescription(
  page,
  listing
) {
  console.log("");

  console.log(
    "================================="
  );

  console.log(
    "IPROPERTY DESCRIPTION"
  );

  console.log(
    "================================="
  );

  /*
  |--------------------------------------------------------------------------
  | VALIDATE LISTING
  |--------------------------------------------------------------------------
  */

  if (!listing) {
    throw new Error(
      "Listing data was not provided to iProperty Description."
    );
  }

  console.log(
    "MIB Listing ID:",
    listing.id
  );

  console.log(
    "Headline:",
    listing.headline
  );

  console.log(
    "Description length:",
    listing.description
      ? String(listing.description).length
      : 0
  );

  /*
  |--------------------------------------------------------------------------
  | HEADLINE
  |--------------------------------------------------------------------------
  */

  await fillTextField(
    page,
    "Headline",
    [
      page.getByPlaceholder(
        "A short sentence to describe the highlights",
        {
          exact: true,
        }
      ),
    ],
    listing.headline
  );

  /*
  |--------------------------------------------------------------------------
  | DESCRIPTION
  |--------------------------------------------------------------------------
  */

  await fillTextField(
    page,
    "Description",
    [
      page.getByPlaceholder(
        "Describe the property and its surroundings",
        {
          exact: true,
        }
      ),
    ],
    listing.description
  );

  /*
  |--------------------------------------------------------------------------
  | NEXT
  |--------------------------------------------------------------------------
  */

  await clickNext(
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
    "✅ IPROPERTY DESCRIPTION COMPLETED"
  );

  console.log(
    "================================="
  );

  console.log(
    "Headline:",
    listing.headline
  );

  console.log(
    "Description loaded from Supabase."
  );

  console.log(
    "Next clicked."
  );

  console.log(
    "Current URL:",
    page.url()
  );

  console.log(
    "================================="
  );

  return {
    success:
      true,

    status:
      "description_completed",

    headline:
      listing.headline,

    description:
      listing.description,

    url:
      page.url(),
  };
}