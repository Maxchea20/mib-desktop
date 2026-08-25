const ELEMENT_TIMEOUT = 15000;

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

async function fillTextField(
  page,
  fieldName,
  locators,
  value
) {
  const input = await findVisible(
    locators
  );

  if (!input) {
    throw new Error(
      `Could not find ${fieldName} input.`
    );
  }

  await input.scrollIntoViewIfNeeded();

  await input.fill(value);

  const actualValue = await input
    .inputValue()
    .catch(() => "");

  if (actualValue.trim() !== value) {
    throw new Error(
      `${fieldName} verification failed.`
    );
  }

  console.log(
    `✅ ${fieldName} entered.`
  );
}

export async function handleDescription(
  page
) {
  console.log("");

  console.log(
    "IPROPERTY DESCRIPTION"
  );

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
    "Fully Furnished Double-Storey Terrace in Bandar Cyber"
  );

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
    "Fully furnished double-storey terrace in Bandar Cyber, Perak, offering four bedrooms, three bathrooms, two parking spaces, a 2,000 sqft built-up area, and 1,400 sqft land area."
  );

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