/*
|--------------------------------------------------------------------------
| iPROPERTY PRO - UNIT DETAILS
|--------------------------------------------------------------------------
|
| Handles:
|
| 1. Bedrooms
| 2. Bathrooms
| 3. Built-up
| 4. Land area
| 5. Parking spots
| 6. Click Next
|
| HARD CODED TEST VERSION
|
|--------------------------------------------------------------------------
*/

const PAGE_WAIT_MS = 1000;
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
| WAIT FOR UNIT DETAILS PAGE
|--------------------------------------------------------------------------
*/

async function waitForUnitDetailsPage(
  page
) {
  console.log(
    "Waiting for iProperty Unit Details page..."
  );

  const unitDetails = await findVisible(
    [
      page.locator(
        '[da-id="bedrooms-input-stepper"]'
      ),

      page.getByText(
        "Unit details",
        {
          exact: true,
        }
      ),

      page.locator(
        ".unit-details"
      ),
    ],
    15000
  );

  if (!unitDetails) {
    throw new Error(
      "iProperty Unit Details page did not appear."
    );
  }

  console.log(
    "✅ iProperty Unit Details page detected."
  );
}

/*
|--------------------------------------------------------------------------
| FILL NUMBER FIELD
|--------------------------------------------------------------------------
*/

async function fillNumberField(
  page,
  fieldName,
  selectors,
  value
) {
  console.log("");

  console.log(
    `Entering ${fieldName}: ${value}`
  );

  const input = await findVisible(
    selectors,
    10000
  );

  if (!input) {
    throw new Error(
      `Could not find ${fieldName} input.`
    );
  }

  await input.scrollIntoViewIfNeeded();

await input.fill(
  String(value)
);

  await page.waitForTimeout(
    500
  );

  const actualValue =
    await input
      .inputValue()
      .catch(() => "");

  const normalizedExpected =
    String(value)
      .replace(/,/g, "")
      .trim();

  const normalizedActual =
    String(actualValue)
      .replace(/,/g, "")
      .trim();

  if (
    normalizedActual !==
    normalizedExpected
  ) {
    throw new Error(
      `${fieldName} value verification failed. Expected ${normalizedExpected}, got ${normalizedActual}`
    );
  }

  console.log(
    `✅ ${fieldName} entered: ${actualValue}`
  );
}

  
/*
|--------------------------------------------------------------------------
| BEDROOMS
|--------------------------------------------------------------------------
*/

async function enterBedrooms(
  page
) {
  await fillNumberField(
    page,
    "Bedrooms",
    [
      page.locator(
        '#bedrooms'
      ),

      page.locator(
        '[da-id="bedrooms-input-stepper"] input'
      ),
    ],
    4
  );
}

/*
|--------------------------------------------------------------------------
| BATHROOMS
|--------------------------------------------------------------------------
*/

async function enterBathrooms(
  page
) {
  await fillNumberField(
    page,
    "Bathrooms",
    [
      page.locator(
        '#bathrooms'
      ),

      page.locator(
        '[da-id="bathrooms-input-stepper"] input'
      ),
    ],
    3
  );
}

/*
|--------------------------------------------------------------------------
| BUILT-UP
|--------------------------------------------------------------------------
*/

async function enterBuiltUp(
  page
) {
  await fillNumberField(
    page,
    "Built-up",
    [
      page.locator(
        '#floorSize'
      ),

      page.locator(
        '[da-id="built-up-input"] input'
      ),
    ],
    2000
  );
}

/*
|--------------------------------------------------------------------------
| LAND AREA
|--------------------------------------------------------------------------
*/

async function enterLandArea(
  page
) {
  await fillNumberField(
    page,
    "Land area",
    [
      page.locator(
        '#landArea'
      ),

      page.locator(
        '[da-id="land-area-input"] input'
      ),
    ],
    1400
  );
}

/*
|--------------------------------------------------------------------------
| PARKING
|--------------------------------------------------------------------------
*/

async function enterParking(
  page
) {
  await fillNumberField(
    page,
    "Parking spots",
    [
      page.locator(
        '#parking'
      ),

      page.locator(
        '[da-id="parking-input-stepper"] input'
      ),
    ],
    2
  );
}

/*
|--------------------------------------------------------------------------
| FURNISHING
|--------------------------------------------------------------------------
*/

async function selectFurnishing(
  page
) {
  console.log("");

  console.log(
    "Selecting Furnishing: Fully Furnished"
  );

  const fullyFurnished = await findVisible(
    [
      page.getByRole(
        "button",
        {
          name: "Fully Furnished",
          exact: true,
        }
      ),

      page.getByText(
        "Fully Furnished",
        {
          exact: true,
        }
      ),
    ],
    10000
  );

  if (!fullyFurnished) {
    throw new Error(
      'Could not find "Fully Furnished" option.'
    );
  }

  await fullyFurnished.scrollIntoViewIfNeeded();

  await fullyFurnished.click();

  await page.waitForTimeout(
    500
  );

  console.log(
    "✅ Furnishing selected: Fully Furnished"
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
  console.log("");

  console.log(
    "Looking for Unit Details Next button..."
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
    ],
    10000
  );

  if (!next) {
    throw new Error(
      'Could not find "Next" button on Unit Details page.'
    );
  }

  await next.scrollIntoViewIfNeeded();

  console.log(
    "🖱️ Clicking Unit Details -> Next"
  );

  await next.click();

  await page.waitForTimeout(
    2000
  );

  console.log(
    "✅ Unit Details Next clicked."
  );
}

/*
|--------------------------------------------------------------------------
| MAIN UNIT DETAILS HANDLER
|--------------------------------------------------------------------------
*/

export async function handleUnitDetails(
  page,
  listing
) {
  console.log("");

  console.log(
    "================================="
  );

  console.log(
    "IPROPERTY UNIT DETAILS"
  );

  console.log(
    "================================="
  );

  /*
  |--------------------------------------------------------------------------
  | WAIT
  |--------------------------------------------------------------------------
  */

  await waitForUnitDetailsPage(
    page
  );

  /*
  |--------------------------------------------------------------------------
  | HARD CODED TEST DATA
  |--------------------------------------------------------------------------
  */

  await enterBedrooms(
    page
  );

  await enterBathrooms(
    page
  );

  await enterBuiltUp(
    page
  );

  await enterLandArea(
    page
  );

  await enterParking(
    page
  );

  await selectFurnishing(
  page
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
    "✅ IPROPERTY UNIT DETAILS COMPLETED"
  );

  console.log(
    "================================="
  );

  console.log(
    "Bedrooms: 4"
  );

  console.log(
    "Bathrooms: 3"
  );

  console.log(
    "Built-up: 2000 sqft"
  );

  console.log(
    "Land area: 1400 sqft"
  );

  console.log(
    "Parking: 2"
  );

  console.log(
    "Next clicked."
  );

  console.log(
    "================================="
  );

  return {
    success: true,
    status: "unit_details_completed",

    bedrooms: 4,
    bathrooms: 3,
    built_up: 2000,
    land_area: 1400,
    parking: 2,

    url: page.url(),
  };
}