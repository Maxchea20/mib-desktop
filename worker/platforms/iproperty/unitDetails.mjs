/*
|--------------------------------------------------------------------------
| iPROPERTY PRO - UNIT DETAILS
|--------------------------------------------------------------------------
|
| RESIDENTIAL:
| - Bedrooms
| - Bathrooms
| - Built-up
| - Land area
| - Parking
| - Furnishing
|
| COMMERCIAL:
| - Bathrooms
| - Built-up
| - Condition
| - Electricity phase
| - Electricity supply
|
| INDUSTRIAL:
| - Bathrooms
| - Built-up
| - Land area
| - Condition
| - Electricity phase
| - Electricity supply
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
        const element =
          locator.nth(i);

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
| HAS VALUE
|--------------------------------------------------------------------------
*/

function hasValue(value) {
  return (
    value !== null &&
    value !== undefined &&
    String(value).trim() !== ""
  );
}

/*
|--------------------------------------------------------------------------
| WAIT FOR UNIT DETAILS PAGE
|--------------------------------------------------------------------------
*/

async function waitForUnitDetailsPage(
  page,
  category
) {
  console.log(
    "Waiting for iProperty Unit Details page..."
  );

  const locators = [];

  /*
  |--------------------------------------------------------------------------
  | COMMERCIAL / INDUSTRIAL
  |--------------------------------------------------------------------------
  |
  | Both Commercial and Industrial have:
  | - Condition
  | - Electricity phase
  | - Electricity supply
  |
  */

  const normalizedCategory =
    String(category || "")
      .trim()
      .toLowerCase();

  if (
    normalizedCategory === "commercial" ||
    normalizedCategory === "industrial"
  ) {
    locators.push(
      page.getByText(
        "Condition",
        {
          exact: true,
        }
      ),

      page.getByText(
        "Electricity",
        {
          exact: true,
        }
      ),

      page.getByText(
        "Electricity phase",
        {
          exact: true,
        }
      )
    );
  }

  /*
  |--------------------------------------------------------------------------
  | RESIDENTIAL
  |--------------------------------------------------------------------------
  */

  if (
    normalizedCategory === "residential"
  ) {
    locators.push(
      page.locator(
        '[da-id="bedrooms-input-stepper"]'
      )
    );
  }

  /*
  |--------------------------------------------------------------------------
  | COMMON PAGE INDICATORS
  |--------------------------------------------------------------------------
  */

  locators.push(
    page.getByText(
      "Unit details",
      {
        exact: true,
      }
    ),

    page.locator(
      ".unit-details"
    ),

    page.getByText(
      "Rooms",
      {
        exact: true,
      }
    )
  );

  const unitDetails =
    await findVisible(
      locators,
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
| FILL NUMBER / TEXT INPUT
|--------------------------------------------------------------------------
*/

async function fillNumberField(
  page,
  fieldName,
  selectors,
  value
) {
  if (!hasValue(value)) {
    throw new Error(
      `${fieldName} is required but Supabase value is empty.`
    );
  }

  console.log("");

  console.log(
    `Entering ${fieldName}: ${value}`
  );

  const input =
    await findVisible(
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
| SELECT TEXT OPTION
|--------------------------------------------------------------------------
*/

async function selectTextOption(
  page,
  fieldName,
  value
) {
  if (!hasValue(value)) {
    throw new Error(
      `${fieldName} is required but Supabase value is empty.`
    );
  }

  const normalizedValue =
    String(value).trim();

  console.log("");

  console.log(
    `Selecting ${fieldName}: ${normalizedValue}`
  );

  const escapedValue =
    normalizedValue.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

  const option =
    await findVisible(
      [
        page.getByRole(
          "button",
          {
            name:
              new RegExp(
                `^${escapedValue}$`,
                "i"
              ),
          }
        ),

        page.getByText(
          new RegExp(
            `^${escapedValue}$`,
            "i"
          )
        ),
      ],
      10000
    );

  if (!option) {
    throw new Error(
      `Could not find "${normalizedValue}" ${fieldName} option on iProperty.`
    );
  }

  await option.scrollIntoViewIfNeeded();

  await option.click();

  await page.waitForTimeout(
    500
  );

  console.log(
    `✅ ${fieldName} selected: ${normalizedValue}`
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

      page.locator(
        '[da-id="bathrooms-input-stepper"] input[type="number"]'
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

      page.getByPlaceholder(
        "Enter built-up",
        {
          exact: true,
        }
      ),

      page.locator(
        'input[placeholder="Enter built-up"]'
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

      page.getByPlaceholder(
        "Enter land area",
        {
          exact: true,
        }
      ),

      page.locator(
        'input[placeholder="Enter land area"]'
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
|
| Supabase / MIB stores:
|
| fully_furnished
| partially_furnished
| unfurnished
|
| iProperty displays:
|
| Fully Furnished
| Partially Furnished
| Unfurnished
|
|--------------------------------------------------------------------------
*/

function getIpropertyFurnishingLabel(
  furnishing
) {
  const normalized =
    String(furnishing || "")
      .trim()
      .toLowerCase();

  const furnishingMap = {
    fully_furnished:
      "Fully Furnished",

    partially_furnished:
      "Partially Furnished",

    unfurnished:
      "Unfurnished",
  };

  if (
    furnishingMap[normalized]
  ) {
    return furnishingMap[normalized];
  }

  const humanReadableMap = {
    "fully furnished":
      "Fully Furnished",

    "partially furnished":
      "Partially Furnished",

    "unfurnished":
      "Unfurnished",
  };

  if (
    humanReadableMap[normalized]
  ) {
    return humanReadableMap[normalized];
  }

  throw new Error(
    `Unsupported furnishing value from Supabase: ${furnishing}`
  );
}

async function selectFurnishing(
  page,
  furnishing
) {
  if (!hasValue(furnishing)) {
    throw new Error(
      "Furnishing is required but Supabase value is empty."
    );
  }

  const ipropertyFurnishing =
    getIpropertyFurnishingLabel(
      furnishing
    );

  console.log("");

  console.log(
    `Selecting Furnishing: ${furnishing} -> ${ipropertyFurnishing}`
  );

  const escapedFurnishing =
    ipropertyFurnishing.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

  const furnishingOption =
    await findVisible(
      [
        page.getByRole(
          "button",
          {
            name:
              new RegExp(
                `^${escapedFurnishing}$`,
                "i"
              ),
          }
        ),

        page.getByText(
          new RegExp(
            `^${escapedFurnishing}$`,
            "i"
          )
        ),
      ],
      10000
    );

  if (!furnishingOption) {
    throw new Error(
      `Could not find "${ipropertyFurnishing}" furnishing option on iProperty. ` +
      `Supabase value was "${furnishing}".`
    );
  }

  await furnishingOption
    .scrollIntoViewIfNeeded();

  await furnishingOption.click();

  await page.waitForTimeout(
    500
  );

  console.log(
    `✅ Furnishing selected: ${ipropertyFurnishing}`
  );
}

/*
|--------------------------------------------------------------------------
| INDUSTRIAL / COMMERCIAL CONDITION
|--------------------------------------------------------------------------
*/

async function selectIndustrialCondition(
  page,
  condition
) {
  await selectTextOption(
    page,
    "Condition",
    condition
  );
}

/*
|--------------------------------------------------------------------------
| ELECTRICITY PHASE
|--------------------------------------------------------------------------
*/

async function selectElectricityPhase(
  page,
  electricityPhase
) {
  await selectTextOption(
    page,
    "Electricity phase",
    electricityPhase
  );
}

/*
|--------------------------------------------------------------------------
| ELECTRICITY SUPPLY
|--------------------------------------------------------------------------
*/

async function enterIndustrialPowerSupply(
  page,
  powerSupply
) {
  if (!hasValue(powerSupply)) {
    throw new Error(
      "industrial_power_supply is required but Supabase value is empty."
    );
  }

  console.log("");

  console.log(
    `Entering Electricity supply: ${powerSupply}`
  );

  const input =
    await findVisible(
      [
        page.getByPlaceholder(
          "Enter electricity supply",
          {
            exact: true,
          }
        ),

        page.locator(
          'input[placeholder="Enter electricity supply"]'
        ),
      ],
      10000
    );

  if (!input) {
    throw new Error(
      "Could not find Electricity supply input."
    );
  }

  await input.scrollIntoViewIfNeeded();

  await input.fill(
    String(powerSupply)
  );

  await page.waitForTimeout(
    500
  );

  const actualValue =
    await input
      .inputValue()
      .catch(() => "");

  const expected =
    String(powerSupply)
      .trim();

  const actual =
    String(actualValue)
      .trim();

  if (
    actual !== expected
  ) {
    throw new Error(
      `Electricity supply verification failed. Expected ${expected}, got ${actual}`
    );
  }

  console.log(
    `✅ Electricity supply entered: ${actualValue}`
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

  if (!listing) {
    throw new Error(
      "Listing data was not provided to iProperty Unit Details."
    );
  }

  const category =
    String(
      listing.category || ""
    )
      .trim()
      .toLowerCase();

  console.log(
    "MIB Listing ID:",
    listing.id
  );

  console.log(
    "MIB Category:",
    listing.category
  );

  /*
  |--------------------------------------------------------------------------
  | INDUSTRIAL WORKFLOW
  |--------------------------------------------------------------------------
  */

  if (
    category === "industrial"
  ) {
    console.log(
      "Industrial Unit Details workflow detected."
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
      "Condition:",
      listing.condition
    );

    console.log(
      "Electricity phase:",
      listing.electricity_phase
    );

    console.log(
      "Electricity supply:",
      listing.industrial_power_supply
    );

    await waitForUnitDetailsPage(
      page,
      "Industrial"
    );

    /*
    |--------------------------------------------------------------------------
    | BATHROOMS
    |--------------------------------------------------------------------------
    */

    await enterBathrooms(
      page,
      listing.bathrooms
    );

    /*
    |--------------------------------------------------------------------------
    | BUILT-UP
    |--------------------------------------------------------------------------
    */

    await enterBuiltUp(
      page,
      listing.built_up
    );

    /*
    |--------------------------------------------------------------------------
    | LAND AREA
    |--------------------------------------------------------------------------
    */

    await enterLandArea(
      page,
      listing.land_size
    );

    /*
    |--------------------------------------------------------------------------
    | CONDITION
    |--------------------------------------------------------------------------
    */

    await selectIndustrialCondition(
      page,
      listing.condition
    );

    /*
    |--------------------------------------------------------------------------
    | ELECTRICITY PHASE
    |--------------------------------------------------------------------------
    */

    await selectElectricityPhase(
      page,
      listing.electricity_phase
    );

    /*
    |--------------------------------------------------------------------------
    | ELECTRICITY SUPPLY
    |--------------------------------------------------------------------------
    */

    await enterIndustrialPowerSupply(
      page,
      listing.industrial_power_supply
    );

    /*
    |--------------------------------------------------------------------------
    | NEXT
    |--------------------------------------------------------------------------
    */

    await clickNext(
      page
    );

    console.log("");

    console.log(
      "================================="
    );

    console.log(
      "✅ INDUSTRIAL UNIT DETAILS COMPLETED"
    );

    console.log(
      "================================="
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
      "Condition:",
      listing.condition
    );

    console.log(
      "Electricity phase:",
      listing.electricity_phase
    );

    console.log(
      "Electricity supply:",
      listing.industrial_power_supply
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

      category:
        listing.category,

      bathrooms:
        listing.bathrooms,

      built_up:
        listing.built_up,

      land_size:
        listing.land_size,

      condition:
        listing.condition,

      electricity_phase:
        listing.electricity_phase,

      industrial_power_supply:
        listing.industrial_power_supply,

      url:
        page.url(),
    };
  }

  /*
  |--------------------------------------------------------------------------
  | VALIDATE STANDARD CATEGORY
  |--------------------------------------------------------------------------
  */

  const isResidential =
    category === "residential";

  const isCommercial =
    category === "commercial";

  if (
    !isResidential &&
    !isCommercial
  ) {
    throw new Error(
      `Unsupported Unit Details category: "${listing.category}".`
    );
  }

  /*
  |--------------------------------------------------------------------------
  | RESIDENTIAL WORKFLOW
  |--------------------------------------------------------------------------
  */

  if (isResidential) {
    console.log(
      "Residential Unit Details workflow detected."
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

    await waitForUnitDetailsPage(
      page,
      listing.category
    );

    /*
    |--------------------------------------------------------------------------
    | BEDROOMS
    |--------------------------------------------------------------------------
    */

    await enterBedrooms(
      page,
      listing.bedrooms
    );

    /*
    |--------------------------------------------------------------------------
    | BATHROOMS
    |--------------------------------------------------------------------------
    */

    await enterBathrooms(
      page,
      listing.bathrooms
    );

    /*
    |--------------------------------------------------------------------------
    | BUILT-UP
    |--------------------------------------------------------------------------
    */

    await enterBuiltUp(
      page,
      listing.built_up
    );

    /*
    |--------------------------------------------------------------------------
    | LAND AREA
    |--------------------------------------------------------------------------
    */

    await enterLandArea(
      page,
      listing.land_size
    );

    /*
    |--------------------------------------------------------------------------
    | PARKING
    |--------------------------------------------------------------------------
    */

    await enterParking(
      page,
      listing.parking_spaces
    );

    /*
    |--------------------------------------------------------------------------
    | FURNISHING
    |--------------------------------------------------------------------------
    */

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

    console.log("");

    console.log(
      "================================="
    );

    console.log(
      "✅ RESIDENTIAL UNIT DETAILS COMPLETED"
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

      category:
        listing.category,

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

  /*
  |--------------------------------------------------------------------------
  | COMMERCIAL WORKFLOW
  |--------------------------------------------------------------------------
  |
  | Commercial does NOT use:
  |
  | - Bedrooms
  | - Built-up dimensions
  | - Land area
  | - Parking
  | - Furnishing
  |
  | Commercial DOES use:
  |
  | - Bathrooms
  | - Built-up
  | - Condition
  | - Electricity phase
  | - Electricity supply
  |
  | Lift fields are optional and currently not data-driven.
  |
  |--------------------------------------------------------------------------
  */

  console.log(
    "Commercial Unit Details workflow detected."
  );

  console.log(
    "Bedrooms: SKIPPED"
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
    "Built-up dimensions: SKIPPED"
  );

  console.log(
    "Land area: SKIPPED"
  );

  console.log(
    "Parking: SKIPPED"
  );

  console.log(
    "Condition:",
    listing.condition
  );

  console.log(
    "Electricity phase:",
    listing.electricity_phase
  );

  console.log(
    "Electricity supply:",
    listing.industrial_power_supply
  );

  console.log(
    "Furnishing: SKIPPED"
  );

  await waitForUnitDetailsPage(
    page,
    listing.category
  );

  /*
  |--------------------------------------------------------------------------
  | BATHROOMS
  |--------------------------------------------------------------------------
  */

  await enterBathrooms(
    page,
    listing.bathrooms
  );

  /*
  |--------------------------------------------------------------------------
  | BUILT-UP
  |--------------------------------------------------------------------------
  */

  await enterBuiltUp(
    page,
    listing.built_up
  );

  /*
  |--------------------------------------------------------------------------
  | CONDITION
  |--------------------------------------------------------------------------
  */

  await selectIndustrialCondition(
    page,
    listing.condition
  );

  /*
  |--------------------------------------------------------------------------
  | ELECTRICITY PHASE
  |--------------------------------------------------------------------------
  */

  await selectElectricityPhase(
    page,
    listing.electricity_phase
  );

  /*
  |--------------------------------------------------------------------------
  | ELECTRICITY SUPPLY
  |--------------------------------------------------------------------------
  */

  await enterIndustrialPowerSupply(
    page,
    listing.industrial_power_supply
  );

  /*
  |--------------------------------------------------------------------------
  | NEXT
  |--------------------------------------------------------------------------
  */

  await clickNext(
    page
  );

  console.log("");

  console.log(
    "================================="
  );

  console.log(
    "✅ COMMERCIAL UNIT DETAILS COMPLETED"
  );

  console.log(
    "================================="
  );

  console.log(
    "Bedrooms: SKIPPED"
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
    "Condition:",
    listing.condition
  );

  console.log(
    "Electricity phase:",
    listing.electricity_phase
  );

  console.log(
    "Electricity supply:",
    listing.industrial_power_supply
  );

  console.log(
    "Furnishing: SKIPPED"
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

    category:
      listing.category,

    bathrooms:
      listing.bathrooms,

    built_up:
      listing.built_up,

    condition:
      listing.condition,

    electricity_phase:
      listing.electricity_phase,

    industrial_power_supply:
      listing.industrial_power_supply,

    url:
      page.url(),
  };
}