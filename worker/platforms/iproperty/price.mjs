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

        const visible = await element
          .isVisible()
          .catch(() => false);

        if (visible) {
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
| PRICE PAGE
|--------------------------------------------------------------------------
*/

async function waitForPricePage(
  page
) {
  const sellingPrice = await findVisible(
    [
      page.locator("#sellingPrice"),

      page.locator(
        '[da-id="selling-price-input"] input'
      ),
    ]
  );

  if (!sellingPrice) {
    throw new Error(
      "iProperty Price page did not appear."
    );
  }

  console.log(
    "✅ iProperty Price page detected."
  );
}

/*
|--------------------------------------------------------------------------
| SELLING PRICE
|--------------------------------------------------------------------------
*/

async function enterSellingPrice(
  page
) {
  const value = 500000;

  console.log("");

  console.log(
    `Entering Selling price: ${value}`
  );

  const input = await findVisible(
    [
      page.locator("#sellingPrice"),

      page.locator(
        '[da-id="selling-price-input"] input'
      ),
    ]
  );

  if (!input) {
    throw new Error(
      "Could not find Selling price input."
    );
  }

  await input.scrollIntoViewIfNeeded();

  await input.fill(
    String(value)
  );

  await page.waitForTimeout(
    500
  );

  const actualValue = await input
    .inputValue()
    .catch(() => "");

  const normalizeNumber = (number) =>
    String(number)
      .replace(/,/g, "")
      .trim();

  if (
    normalizeNumber(actualValue) !==
    normalizeNumber(value)
  ) {
    throw new Error(
      `Selling price verification failed. Expected ${value}, got ${actualValue}`
    );
  }

  console.log(
    `✅ Selling price entered: ${actualValue}`
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
  const next = await findVisible(
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
      'Could not find "Next" button on Price page.'
    );
  }

  await next.scrollIntoViewIfNeeded();

  console.log(
    "🖱️ Clicking Price -> Next"
  );

  await next.click();

  await page.waitForTimeout(
    2000
  );

  console.log(
    "✅ Price Next clicked."
  );
}

/*
|--------------------------------------------------------------------------
| MAIN PRICE HANDLER
|--------------------------------------------------------------------------
*/

export async function handlePrice(
  page
) {
  console.log("");

  console.log(
    "================================="
  );

  console.log(
    "IPROPERTY PRICE"
  );

  console.log(
    "================================="
  );

  await waitForPricePage(
    page
  );

  // Price type remains "None" because it is optional.
  await enterSellingPrice(
    page
  );

  await clickNext(
    page
  );
}