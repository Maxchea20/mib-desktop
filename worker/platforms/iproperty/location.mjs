/*
|--------------------------------------------------------------------------
| iPROPERTY PRO - LOCATION
|--------------------------------------------------------------------------
|
| Handles:
|
| 1. Property name
| 2. Enter manually
| 3. Property type
| 4. Property sub type
| 5. Property unit type
| 6. State
| 7. City
| 8. Postal code
| 9. Tenure
| 10. Title type
| 11. Click Next
|
|--------------------------------------------------------------------------
*/

const PAGE_WAIT_MS = 1000;

const ELEMENT_TIMEOUT = 15000;

const ENTER_MANUALLY_TIMEOUT = 10000;


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
    Date.now() - startTime <
    timeout
  ) {
    for (
      const locator of locators
    ) {
      const count =
        await locator
          .count()
          .catch(() => 0);

      for (
        let i = 0;
        i < count;
        i++
      ) {
        const element =
          locator.nth(i);

        const visible =
          await element
            .isVisible()
            .catch(
              () => false
            );

        if (visible) {
          return element;
        }
      }
    }

    await new Promise(
      (resolve) =>
        setTimeout(
          resolve,
          300
        )
    );
  }

  return null;
}


/*
|--------------------------------------------------------------------------
| WAIT FOR LOCATION PAGE
|--------------------------------------------------------------------------
*/

async function waitForLocationPage(
  page
) {
  console.log(
    "Waiting for iProperty Location page..."
  );

  const propertyName =
    await findVisible(
      [
        page.locator(
          'input[placeholder="Search by property name"]'
        ),

        page.getByText(
          "Property name",
          {
            exact: true,
          }
        ),
      ],
      15000
    );

  if (!propertyName) {
    throw new Error(
      "iProperty Location page did not appear."
    );
  }

  console.log(
    "✅ iProperty Location page detected."
  );
}


/*
|--------------------------------------------------------------------------
| ENTER PROPERTY NAME
|--------------------------------------------------------------------------
*/

async function enterPropertyName(
  page,
  propertyName
) {
  console.log("");

  console.log(
    "Entering property name:",
    propertyName
  );

  const input =
    await findVisible(
      [
        page.locator(
          'input[placeholder="Search by property name"]'
        ),
      ],
      15000
    );

  if (!input) {
    throw new Error(
      "Could not find iProperty property name input."
    );
  }

  await input.click();

  await input.fill(
    propertyName
  );

  console.log(
    "✅ Property name entered."
  );

  await page.waitForTimeout(
    1500
  );
}


/*
|--------------------------------------------------------------------------
| CLICK ENTER MANUALLY
|--------------------------------------------------------------------------
*/

async function clickEnterManually(
  page
) {
  console.log(
    'Looking for "Enter manually"...'
  );

  const startTime =
    Date.now();

  let enterManually =
    null;

  while (
    Date.now() - startTime <
    ENTER_MANUALLY_TIMEOUT
  ) {
    enterManually =
      await findVisible(
        [
          page.getByText(
            "Enter manually",
            {
              exact: true,
            }
          ),

          page.getByText(
            /Enter manually/i
          ),

          page.locator(
            "text=Enter manually"
          ),
        ],
        1000
      );

    if (enterManually) {
      break;
    }

    console.log(
      'Waiting for "Enter manually"...'
    );

    await page.waitForTimeout(
      1000
    );
  }

  if (!enterManually) {
    throw new Error(
      'Could not find iProperty "Enter manually" option.'
    );
  }

  console.log(
    '✅ "Enter manually" found.'
  );

  await enterManually.scrollIntoViewIfNeeded();

  await enterManually.click();

  await page.waitForTimeout(
    1000
  );

  console.log(
    "✅ Manual location form opened."
  );
}


/*
|--------------------------------------------------------------------------
| FIND FIELD LABEL
|--------------------------------------------------------------------------
*/

async function findFieldLabel(
  page,
  label
) {
  const labelElement =
    await findVisible(
      [
        page.getByText(
          label,
          {
            exact: true,
          }
        ),

        page.locator(
          "label"
        ).filter({
          hasText:
            label,
        }),
      ],
      10000
    );

  if (!labelElement) {
    throw new Error(
      `Could not find field label: ${label}`
    );
  }

  return labelElement;
}


/*
|--------------------------------------------------------------------------
| FIND SELECT AN OPTION FOR FIELD
|--------------------------------------------------------------------------
*/

async function findSelectAnOptionForField(
  page,
  label
) {
  const fieldLabel =
    await findFieldLabel(
      page,
      label
    );

  console.log(
    `✅ ${label} label found.`
  );

  const parents = [
    fieldLabel.locator(
      "xpath=.."
    ),

    fieldLabel.locator(
      "xpath=../.."
    ),

    fieldLabel.locator(
      "xpath=../../.."
    ),

    fieldLabel.locator(
      "xpath=../../../.."
    ),

    fieldLabel.locator(
      "xpath=../../../../.."
    ),
  ];

  for (
    const parent of parents
  ) {
    const select =
      await findVisible(
        [
          parent.getByText(
            "Select an option",
            {
              exact: true,
            }
          ),

          parent.locator(
            ".hui-select__toggle"
          ),

          parent.getByRole(
            "button",
            {
              name:
                /Select an option/i,
            }
          ),

          parent.getByRole(
            "combobox"
          ),
        ],
        1500
      );

    if (select) {
      return select;
    }
  }

  const allSelects =
    page.getByText(
      "Select an option",
      {
        exact: true,
      }
    );

  const count =
    await allSelects
      .count()
      .catch(() => 0);

  if (count === 0) {
    throw new Error(
      `Could not find "Select an option" for field: ${label}`
    );
  }

  const labelBox =
    await fieldLabel
      .boundingBox()
      .catch(() => null);

  if (!labelBox) {
    throw new Error(
      `Could not determine position of field: ${label}`
    );
  }

  let bestElement =
    null;

  let bestDistance =
    Number.POSITIVE_INFINITY;

  for (
    let i = 0;
    i < count;
    i++
  ) {
    const candidate =
      allSelects.nth(i);

    const visible =
      await candidate
        .isVisible()
        .catch(
          () => false
        );

    if (!visible) {
      continue;
    }

    const candidateBox =
      await candidate
        .boundingBox()
        .catch(
          () => null
        );

    if (!candidateBox) {
      continue;
    }

    const vertical =
      candidateBox.y -
      labelBox.y;

    const horizontal =
      Math.abs(
        candidateBox.x -
        labelBox.x
      );

    const abovePenalty =
      vertical < -20
        ? 100000
        : 0;

    const distance =
      Math.abs(vertical) +
      horizontal * 0.25 +
      abovePenalty;

    if (
      distance <
      bestDistance
    ) {
      bestDistance =
        distance;

      bestElement =
        candidate;
    }
  }

  if (!bestElement) {
    throw new Error(
      `Could not find "Select an option" for field: ${label}`
    );
  }

  return bestElement;
}


/*
|--------------------------------------------------------------------------
| WAIT FOR OPEN DROPDOWN
|--------------------------------------------------------------------------
*/

async function waitForDropdownMenu(
  page
) {
  const startTime =
    Date.now();

  while (
    Date.now() - startTime <
    10000
  ) {
    const menu =
      await findVisible(
        [
          page.locator(
            ".hui-select__menu.show"
          ),

          page.locator(
            '[role="listbox"]'
          ),

          page.locator(
            ".hui-select__menu"
          ),
        ],
        1000
      );

    if (menu) {
      return menu;
    }

    await page.waitForTimeout(
      300
    );
  }

  return null;
}


/*
|--------------------------------------------------------------------------
| SELECT iPROPERTY DROPDOWN
|--------------------------------------------------------------------------
*/

async function selectIpropertyDropdown(
  page,
  label,
  option
) {
  if (
    option === undefined ||
    option === null ||
    option === ""
  ) {
    throw new Error(
      `No value supplied for iProperty field: ${label}`
    );
  }

  console.log("");

  console.log(
    `Selecting ${label}: ${option}`
  );

  const selectControl =
    await findSelectAnOptionForField(
      page,
      label
    );

  console.log(
    `✅ ${label} "Select an option" found.`
  );

  await selectControl.scrollIntoViewIfNeeded();

  await page.waitForTimeout(
    300
  );

  console.log(
    `🖱️ CLICKING ${label} -> Select an option`
  );

  await selectControl.click();

  console.log(
    `✅ ${label} "Select an option" clicked.`
  );

  console.log(
    `Waiting for ${label} menu to open...`
  );

  const menu =
    await waitForDropdownMenu(
      page
    );

  if (!menu) {
    throw new Error(
      `Dropdown menu did not open for field: ${label}`
    );
  }

  console.log(
    `✅ ${label} dropdown menu opened.`
  );

  console.log(
    `Looking for ${label} option: ${option}`
  );

  const optionElement =
    await findVisible(
      [
        menu.getByText(
          option,
          {
            exact: true,
          }
        ),

        page.getByRole(
          "option",
          {
            name:
              option,
            exact:
              true,
          }
        ),

        page.getByText(
          option,
          {
            exact: true,
          }
        ),
      ],
      10000
    );

  if (!optionElement) {
    throw new Error(
      `Could not find option "${option}" for field: ${label}`
    );
  }

  console.log(
    `✅ ${label} option found: ${option}`
  );

  await optionElement.scrollIntoViewIfNeeded();

  console.log(
    `🖱️ Clicking ${label} option: ${option}`
  );

  await optionElement.click();

  await page.waitForTimeout(
    PAGE_WAIT_MS
  );

  console.log(
    `✅ ${label} selected: ${option}`
  );
}


/*
|--------------------------------------------------------------------------
| PROPERTY TYPE
|--------------------------------------------------------------------------
*/

async function selectPropertyType(
  page,
  propertyType
) {
  await selectIpropertyDropdown(
    page,
    "Property type",
    propertyType
  );
}


/*
|--------------------------------------------------------------------------
| PROPERTY SUB TYPE
|--------------------------------------------------------------------------
*/

async function selectPropertySubType(
  page,
  propertySubType
) {
  await selectIpropertyDropdown(
    page,
    "Property sub type",
    propertySubType
  );
}


/*
|--------------------------------------------------------------------------
| PROPERTY UNIT TYPE
|--------------------------------------------------------------------------
*/

async function selectPropertyUnitType(
  page,
  propertyUnitType
) {
  await selectIpropertyDropdown(
    page,
    "Property unit type",
    propertyUnitType
  );
}


/*
|--------------------------------------------------------------------------
| STATE
|--------------------------------------------------------------------------
*/

async function selectState(
  page,
  state
) {
  if (
    !state
  ) {
    throw new Error(
      "Listing is missing state."
    );
  }

  console.log("");

  console.log(
    "Selecting State:",
    state
  );

  const stateInput =
    page.locator(
      '[da-id="state-input-dropdown"] input[role="combobox"]'
    );

  await stateInput.waitFor({
    state:
      "visible",
    timeout:
      ELEMENT_TIMEOUT,
  });

  await stateInput.click();

  await stateInput.press(
    "Control+A"
  );

  await stateInput.fill(
    ""
  );

  await stateInput.fill(
    state
  );

  await page.waitForTimeout(
    500
  );

  const suggestion =
    page.getByRole(
      "option",
      {
        name:
          state,
      }
    ).first();

  if (
    await suggestion
      .isVisible()
      .catch(
        () => false
      )
  ) {
    await suggestion.click();
  } else {
    await stateInput.press(
      "ArrowDown"
    );

    await stateInput.press(
      "Enter"
    );
  }

  await page.waitForTimeout(
    300
  );

  console.log(
    "✅ State selected:",
    state
  );
}


/*
|--------------------------------------------------------------------------
| CITY
|--------------------------------------------------------------------------
*/

async function enterCity(
  page,
  city
) {
  if (
    !city
  ) {
    throw new Error(
      "Listing is missing city."
    );
  }

  console.log("");

  console.log(
    "Selecting City:",
    city
  );

  const input =
    await findVisible(
      [
        page.locator(
          'input[placeholder="Enter city"]'
        ),

        page.locator(
          'input[aria-label="City"]'
        ),
      ],
      10000
    );

  if (!input) {
    throw new Error(
      'Could not find "City" input.'
    );
  }

  await input.scrollIntoViewIfNeeded();

  console.log(
    "🖱️ Clicking City input..."
  );

  await input.click();

  await page.waitForTimeout(
    500
  );

  console.log(
    `Typing ${city}...`
  );

  await input.fill(
    city
  );

  await page.waitForTimeout(
    1000
  );

  console.log(
    `Looking for ${city} suggestion...`
  );

  const citySuggestion =
    await findVisible(
      [
        page.getByRole(
          "option",
          {
            name:
              new RegExp(
                `^${city}$`,
                "i"
              ),
          }
        ),

        page.getByText(
          city,
          {
            exact: true,
          }
        ),

        page.locator(
          '[role="option"]'
        ).filter({
          hasText:
            new RegExp(
              city,
              "i"
            ),
        }),

        page.locator(
          '[class*="suggestion" i]'
        ).filter({
          hasText:
            new RegExp(
              city,
              "i"
            ),
        }),
      ],
      10000
    );

  if (!citySuggestion) {
    throw new Error(
      `Could not find "${city}" city suggestion after typing.`
    );
  }

  console.log(
    `✅ ${city} found. Clicking ${city}...`
  );

  await citySuggestion.scrollIntoViewIfNeeded();

  await citySuggestion.click();

  await page.waitForTimeout(
    PAGE_WAIT_MS
  );

  console.log(
    "✅ City selected:",
    city
  );
}


/*
|--------------------------------------------------------------------------
| POSTAL CODE
|--------------------------------------------------------------------------
*/

async function enterPostalCode(
  page,
  postalCode
) {
  if (
    postalCode === undefined ||
    postalCode === null ||
    postalCode === ""
  ) {
    throw new Error(
      "Listing is missing postal_code."
    );
  }

  console.log("");

  console.log(
    "Entering Postal Code:",
    postalCode
  );

  const input =
    await findVisible(
      [
        page.locator(
          'input[placeholder="Enter postal code"]'
        ),

        page.locator(
          'input[aria-label="Postal code"]'
        ),
      ],
      10000
    );

  if (!input) {
    throw new Error(
      'Could not find "Postal code" input.'
    );
  }

  await input.scrollIntoViewIfNeeded();

  await input.click();

  await input.fill(
    String(
      postalCode
    )
  );

  console.log(
    "✅ Postal code entered:",
    postalCode
  );

  await page.waitForTimeout(
    PAGE_WAIT_MS
  );
}


/*
|--------------------------------------------------------------------------
| TENURE
|--------------------------------------------------------------------------
*/

async function selectTenure(
  page,
  tenure
) {
  await selectIpropertyDropdown(
    page,
    "Tenure",
    tenure
  );
}


/*
|--------------------------------------------------------------------------
| TITLE TYPE
|--------------------------------------------------------------------------
*/

async function selectIndividualTitle(
  page,
  titleType
) {
  if (
    !titleType
  ) {
    throw new Error(
      "Listing is missing title_type."
    );
  }

  console.log("");

  console.log(
    "Selecting Title type:",
    titleType
  );

  const title =
    await findVisible(
      [
        page.getByRole(
          "button",
          {
            name:
              titleType,
            exact:
              true,
          }
        ),

        page.getByText(
          titleType,
          {
            exact:
              true,
          }
        ),
      ],
      10000
    );

  if (!title) {
    throw new Error(
      `Could not find "${titleType}" title type.`
    );
  }

  await title.scrollIntoViewIfNeeded();

  await title.click();

  await page.waitForTimeout(
    PAGE_WAIT_MS
  );

  console.log(
    "✅ Title type selected:",
    titleType
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
    "Looking for Next button..."
  );

  const next =
    await findVisible(
      [
        page.getByRole(
          "button",
          {
            name:
              "Next",
            exact:
              true,
          }
        ),

        page.getByText(
          "Next",
          {
            exact:
              true,
          }
        ),
      ],
      10000
    );

  if (!next) {
    throw new Error(
      'Could not find "Next" button.'
    );
  }

  await next.scrollIntoViewIfNeeded();

  console.log(
    "🖱️ Clicking Next..."
  );

  await next.click();

  await page.waitForTimeout(
    2000
  );

  console.log(
    "✅ Next clicked."
  );
}


/*
|--------------------------------------------------------------------------
| MAIN LOCATION HANDLER
|--------------------------------------------------------------------------
*/

export async function handleLocation(
  page,
  listing
) {
  console.log("");

  console.log(
    "================================="
  );

  console.log(
    "IPROPERTY LOCATION"
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
      "Listing data was not provided to iProperty Location."
    );
  }

  console.log(
    "MIB Listing ID:",
    listing.id
  );

  console.log(
    "Property:",
    listing.title
  );

  console.log(
    "Property Type:",
    listing.property_type
  );

  console.log(
    "Property Sub Type:",
    listing.property_sub_type
  );

  console.log(
    "Property Unit Type:",
    listing.unit_type
  );

  console.log(
    "State:",
    listing.state
  );

  console.log(
    "City:",
    listing.city
  );

  console.log(
    "Township:",
    listing.area
  );

  console.log(
    "Postal Code:",
    listing.postal_code
  );

  console.log(
    "Tenure:",
    listing.tenure
  );

  console.log(
    "Title Type:",
    listing.title_type
  );

  /*
  |--------------------------------------------------------------------------
  | PROPERTY TITLE
  |--------------------------------------------------------------------------
  */

  const propertyName =
    listing.property_name ||
    listing.title ||
    listing.name;

  if (!propertyName) {
    throw new Error(
      "No property title found in Supabase listing."
    );
  }

  /*
  |--------------------------------------------------------------------------
  | REQUIRED DATA
  |--------------------------------------------------------------------------
  */

  const requiredFields = [
    [
      "property_type",
      listing.property_type,
    ],

    [
      "property_sub_type",
      listing.property_sub_type,
    ],

    [
      "unit_type",
      listing.unit_type,
    ],

    [
      "state",
      listing.state,
    ],

    [
      "city",
      listing.city,
    ],

    [
      "postal_code",
      listing.postal_code,
    ],

    [
      "tenure",
      listing.tenure,
    ],

    [
      "title_type",
      listing.title_type,
    ],
  ];

  for (
    const [
      field,
      value,
    ] of requiredFields
  ) {
    if (
      value === undefined ||
      value === null ||
      value === ""
    ) {
      throw new Error(
        `Supabase listing #${listing.id} is missing required field: ${field}`
      );
    }
  }

  /*
  |--------------------------------------------------------------------------
  | WAIT FOR LOCATION PAGE
  |--------------------------------------------------------------------------
  */

  await waitForLocationPage(
    page
  );

  /*
  |--------------------------------------------------------------------------
  | PROPERTY NAME
  |--------------------------------------------------------------------------
  */

  await enterPropertyName(
    page,
    propertyName
  );

  /*
  |--------------------------------------------------------------------------
  | ENTER MANUALLY
  |--------------------------------------------------------------------------
  */

  await clickEnterManually(
    page
  );

  /*
  |--------------------------------------------------------------------------
  | PROPERTY TYPE
  |--------------------------------------------------------------------------
  */

  await selectPropertyType(
    page,
    listing.property_type
  );

  /*
  |--------------------------------------------------------------------------
  | PROPERTY SUB TYPE
  |--------------------------------------------------------------------------
  */

  await selectPropertySubType(
    page,
    listing.property_sub_type
  );

  /*
  |--------------------------------------------------------------------------
  | PROPERTY UNIT TYPE
  |--------------------------------------------------------------------------
  */

  await selectPropertyUnitType(
    page,
    listing.unit_type
  );

  /*
  |--------------------------------------------------------------------------
  | STATE
  |--------------------------------------------------------------------------
  */

  await selectState(
    page,
    listing.state
  );

  /*
  |--------------------------------------------------------------------------
  | CITY
  |--------------------------------------------------------------------------
  */

  await enterCity(
    page,
    listing.city
  );

  /*
  |--------------------------------------------------------------------------
  | POSTAL CODE
  |--------------------------------------------------------------------------
  */

  await enterPostalCode(
    page,
    listing.postal_code
  );

  /*
  |--------------------------------------------------------------------------
  | TENURE
  |--------------------------------------------------------------------------
  */

  await selectTenure(
    page,
    listing.tenure
  );

  /*
  |--------------------------------------------------------------------------
  | TITLE TYPE
  |--------------------------------------------------------------------------
  */

  await selectIndividualTitle(
    page,
    listing.title_type
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
    "✅ IPROPERTY LOCATION COMPLETED"
  );

  console.log(
    "================================="
  );

  console.log(
    "Property name:",
    propertyName
  );

  console.log(
    "Property type:",
    listing.property_type
  );

  console.log(
    "Property sub type:",
    listing.property_sub_type
  );

  console.log(
    "Property unit type:",
    listing.unit_type
  );

  console.log(
    "State:",
    listing.state
  );

  console.log(
    "City:",
    listing.city
  );

  console.log(
    "Township:",
    listing.area
  );

  console.log(
    "Postal code:",
    listing.postal_code
  );

  console.log(
    "Tenure:",
    listing.tenure
  );

  console.log(
    "Title type:",
    listing.title_type
  );

  console.log(
    "Next clicked."
  );

  console.log(
    "================================="
  );

  return {
    success:
      true,

    status:
      "location_completed",

    property_name:
      propertyName,

    property_type:
      listing.property_type,

    property_sub_type:
      listing.property_sub_type,

    property_unit_type:
      listing.unit_type,

    state:
      listing.state,

    city:
      listing.city,

    township:
      listing.area,

    postal_code:
      listing.postal_code,

    tenure:
      listing.tenure,

    title_type:
      listing.title_type,

    url:
      page.url(),
  };
}