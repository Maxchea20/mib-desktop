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
| 6. Furnishing
| 7. Click Next
|
| DATA DRIVEN VERSION
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
  page,
  bedrooms
) {
  if (
    bedrooms === null ||
    bedrooms === undefined ||
    bedrooms === ""
  ) {
    console.log(
      "Bedrooms: no value provided. Skipping."
    );

    return;
  }

  await fillNumberField(
    page,
    "Bedrooms",
    [
      page.locator(
        "#bedrooms"
      ),

      page.locator(
        '[da-id="bedrooms-input-stepper"] input'
      ),
    ],
    bedrooms
  );
}

/*
|--------------------------------------------------------------------------
| BATHROOMS
|--------------------------------------------------------------------------
*/

async function enterBathrooms(
  page,
  bathrooms
) {
  if (
    bathrooms === null ||
    bathrooms === undefined ||
    bathrooms === ""
  ) {
    console.log(
      "Bathrooms: no value provided. Skipping."
    );

    return;
  }

  await fillNumberField(
    page,
    "Bathrooms",
    [
      page.locator(
        "#bathrooms"
      ),

      page.locator(
        '[da-id="bathrooms-input-stepper"] input'
      ),
    ],
    bathrooms
  );
}

/*
|--------------------------------------------------------------------------
| BUILT-UP
|--------------------------------------------------------------------------
*/

async function enterBuiltUp(
  page,
  builtUp
) {
  if (
    builtUp === null ||
    builtUp === undefined ||
    builtUp === ""
  ) {
    console.log(
      "Built-up: no value provided. Skipping."
    );

    return;
  }

  await fillNumberField(
    page,
    "Built-up",
    [
      page.locator(
        "#floorSize"
      ),

      page.locator(
        '[da-id="built-up-input"] input'
      ),
    ],
    builtUp
  );
}

/*
|--------------------------------------------------------------------------
| LAND AREA
|--------------------------------------------------------------------------
*/

async function enterLandArea(
  page,
  landArea
) {
  if (
    landArea === null ||
    landArea === undefined ||
    landArea === ""
  ) {
    console.log(
      "Land area: no value provided. Skipping."
    );

    return;
  }

  await fillNumberField(
    page,
    "Land area",
    [
      page.locator(
        "#landArea"
      ),

      page.locator(
        '[da-id="land-area-input"] input'
      ),
    ],
    landArea
  );
}

/*
|--------------------------------------------------------------------------
| PARKING
|--------------------------------------------------------------------------
*/

async function enterParking(
  page,
  parking
) {
  if (
    parking === null ||
    parking === undefined ||
    parking === ""
  ) {
    console.log(
      "Parking: no value provided. Skipping."
    );

    return;
  }

  await fillNumberField(
    page,
    "Parking spots",
    [
      page.locator(
        "#parking"
      ),

      page.locator(
        '[da-id="parking-input-stepper"] input'
      ),
    ],
    parking
  );
}

/*
|--------------------------------------------------------------------------
| FURNISHING
|--------------------------------------------------------------------------
*/

async function selectFurnishing(
  page,
  furnishing
) {
  console.log("");

  console.log(
    `Selecting Furnishing: ${furnishing}`
  );

  if (
    furnishing === null ||
    furnishing === undefined ||
    furnishing === ""
  ) {
    console.log(
      "Furnishing: no value provided. Skipping."
    );

    return;
  }

  /*
  |--------------------------------------------------------------------------
  | NORMALIZE VALUE
  |--------------------------------------------------------------------------
  |
  | Supabase may contain:
  |
  | unfurnished
  | partially furnished
  | fully furnished
  |
  | iProperty may display:
  |
  | Unfurnished
  | Partially Furnished
  | Fully Furnished
  |
  | Match case-insensitively while keeping the
  | database as the source of truth.
  |
  |--------------------------------------------------------------------------
  */

  const normalizedFurnishing =
    String(furnishing)
      .trim()
      .toLowerCase();

  const furnishingOption =
    await findVisible(
      [
        page.getByRole(
          "button",
          {
            name:
              new RegExp(
                `^${normalizedFurnishing.replace(
                  /[.*+?^${}()|[\]\\]/g,
                  "\\$&"
                )}$`,
                "i"
              ),
          }
        ),

        page.getByText(
          new RegExp(
            `^${normalizedFurnishing.replace(
              /[.*+?^${}()|[\]\\]/g,
              "\\$&"
            )}$`,
            "i"
          )
        ),
      ],
      10000
    );

  if (!furnishingOption) {
    throw new Error(
      `Could not find "${furnishing}" furnishing option on iProperty.`
    );
  }

  await furnishingOption.scrollIntoViewIfNeeded();

  await furnishingOption.click();

  await page.waitForTimeout(
    500
  );

  console.log(
    `✅ Furnishing selected: ${furnishing}`
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
  | VALIDATE LISTING DATA
  |--------------------------------------------------------------------------
  */

  if (!listing) {
    throw new Error(
      "Listing data was not provided to iProperty Unit Details."
    );
  }

  console.log(
    "MIB Listing ID:",
    listing.id
  );

  console.log(
    "Bedrooms:",
    listing.bedrooms
  );

  console.log(
    "Bathrooms:",
    listing.bathrooms
  );

  console.log(
    "Built-up:",
    listing.built_up
  );

  console.log(
    "Land area:",
    listing.land_size
  );

  console.log(
    "Parking:",
    listing.parking_spaces
  );

  console.log(
    "Furnishing:",
    listing.furnishing
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
  | DATA DRIVEN FIELDS
  |--------------------------------------------------------------------------
  */

  await enterBedrooms(
    page,
    listing.bedrooms
  );

  await enterBathrooms(
    page,
    listing.bathrooms
  );

  await enterBuiltUp(
    page,
    listing.built_up
  );

  await enterLandArea(
    page,
    listing.land_size
  );

  await enterParking(
    page,
    listing.parking_spaces
  );

  await selectFurnishing(
    page,
    listing.furnishing
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
    "Bedrooms:",
    listing.bedrooms
  );

  console.log(
    "Bathrooms:",
    listing.bathrooms
  );

  console.log(
    "Built-up:",
    listing.built_up
  );

  console.log(
    "Land area:",
    listing.land_size
  );

  console.log(
    "Parking:",
    listing.parking_spaces
  );

  console.log(
    "Furnishing:",
    listing.furnishing
  );

  console.log(
    "Next clicked."
  );

  console.log(
    "================================="
  );

  return {
    success: true,

    status:
      "unit_details_completed",

    bedrooms:
      listing.bedrooms,

    bathrooms:
      listing.bathrooms,

    built_up:
      listing.built_up,

    land_size:
      listing.land_size,

    parking_spaces:
      listing.parking_spaces,

    furnishing:
      listing.furnishing,

    url:
      page.url(),
  };
}