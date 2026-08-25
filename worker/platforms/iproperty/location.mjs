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
  page
) {
  await selectIpropertyDropdown(
    page,
    "Property type",
    "Terrace / Link House"
  );
}


/*
|--------------------------------------------------------------------------
| PROPERTY SUB TYPE
|--------------------------------------------------------------------------
*/

async function selectPropertySubType(
  page
) {
  await selectIpropertyDropdown(
    page,
    "Property sub type",
    "2-storey Terrace House"
  );
}


/*
|--------------------------------------------------------------------------
| PROPERTY UNIT TYPE
|--------------------------------------------------------------------------
*/

async function selectPropertyUnitType(
  page
) {
  await selectIpropertyDropdown(
    page,
    "Property unit type",
    "Intermediate"
  );
}


/*
|--------------------------------------------------------------------------
| STATE
|--------------------------------------------------------------------------
*/

async function selectState(
  page
) {
  console.log("");

  console.log(
    "Selecting State: Perak"
  );

  const selectControl =
    await findSelectAnOptionForField(
      page,
      "State"
    );

  await selectControl.scrollIntoViewIfNeeded();

  console.log(
    "🖱️ Clicking State -> Select an option"
  );

  await selectControl.click();

  await page.waitForTimeout(700);

  console.log(
    "Looking for Perak..."
  );

  let perak =
    await findVisible(
      [
        page.getByRole(
          "option",
          {
            name: "Perak",
            exact: true,
          }
        ),

        page.getByText(
          "Perak",
          {
            exact: true,
          }
        ),
      ],
      5000
    );

  if (perak) {
    console.log(
      "✅ Perak found. Clicking Perak..."
    );

    await perak.scrollIntoViewIfNeeded();

    await perak.click();

    await page.waitForTimeout(
      PAGE_WAIT_MS
    );

    console.log(
      "✅ State selected: Perak"
    );

    return;
  }

  console.log(
    "Perak not visible. Trying searchable State input..."
  );

  const stateInput =
    await findVisible(
      [
        page.locator(
          'input[placeholder*="state" i]'
        ),

        page.locator(
          'input[aria-label*="state" i]'
        ),

        page.locator(
          '.hui-select__menu.show input'
        ),

        page.locator(
          '[role="listbox"] input'
        ),
      ],
      5000
    );

  if (!stateInput) {
    throw new Error(
      "State dropdown opened, but Perak was not found and no State search input was available."
    );
  }

  await stateInput.click();

  await stateInput.fill(
    "Perak"
  );

  console.log(
    "Typed Perak. Looking for Perak option..."
  );

  await page.waitForTimeout(
    1000
  );

  perak =
    await findVisible(
      [
        page.getByRole(
          "option",
          {
            name: "Perak",
            exact: true,
          }
        ),

        page.getByText(
          "Perak",
          {
            exact: true,
          }
        ),
      ],
      10000
    );

  if (!perak) {
    throw new Error(
      'Could not find "Perak" after typing.'
    );
  }

  await perak.scrollIntoViewIfNeeded();

  await perak.click();

  await page.waitForTimeout(
    PAGE_WAIT_MS
  );

  console.log(
    "✅ State selected: Perak"
  );
}


/*
|--------------------------------------------------------------------------
| CITY
|--------------------------------------------------------------------------
*/

async function enterCity(
  page
) {
  console.log("");

  console.log(
    "Selecting City: Ipoh"
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
    "Typing Ipoh..."
  );

  await input.fill(
    "Ipoh"
  );

  await page.waitForTimeout(
    1000
  );

  console.log(
    "Looking for Ipoh suggestion..."
  );

  const ipoh =
    await findVisible(
      [
        page.getByRole(
          "option",
          {
            name: /Ipoh/i,
          }
        ),

        page.getByText(
          "Ipoh",
          {
            exact: true,
          }
        ),

        page.locator(
          '[role="option"]'
        ).filter({
          hasText: /Ipoh/i,
        }),

        page.locator(
          '[class*="suggestion" i]'
        ).filter({
          hasText: /Ipoh/i,
        }),
      ],
      10000
    );

  if (!ipoh) {
    throw new Error(
      'Could not find "Ipoh" city suggestion after typing.'
    );
  }

  console.log(
    "✅ Ipoh found. Clicking Ipoh..."
  );

  await ipoh.scrollIntoViewIfNeeded();

  await ipoh.click();

  await page.waitForTimeout(
    PAGE_WAIT_MS
  );

  console.log(
    "✅ City selected: Ipoh"
  );
}


/*
|--------------------------------------------------------------------------
| POSTAL CODE
|--------------------------------------------------------------------------
*/

async function enterPostalCode(
  page
) {
  console.log("");

  console.log(
    "Entering Postal Code: 31450"
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
    "31450"
  );

  console.log(
    "✅ Postal code entered: 31450"
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
  page
) {
  await selectIpropertyDropdown(
    page,
    "Tenure",
    "Leasehold"
  );
}


/*
|--------------------------------------------------------------------------
| TITLE TYPE
|--------------------------------------------------------------------------
*/

async function selectIndividualTitle(
  page
) {
  console.log("");

  console.log(
    "Selecting Title type: Individual"
  );

  const individual =
    await findVisible(
      [
        page.getByRole(
          "button",
          {
            name:
              "Individual",
            exact:
              true,
          }
        ),

        page.getByText(
          "Individual",
          {
            exact:
              true,
          }
        ),
      ],
      10000
    );

  if (!individual) {
    throw new Error(
      'Could not find "Individual" title type.'
    );
  }

  await individual.scrollIntoViewIfNeeded();

  await individual.click();

  await page.waitForTimeout(
    PAGE_WAIT_MS
  );

  console.log(
    "✅ Title type selected: Individual"
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
  | PROPERTY TITLE
  |--------------------------------------------------------------------------
  */

  let propertyName =
    listing?.property_name ||
    listing?.title ||
    listing?.name;

  /*
  |--------------------------------------------------------------------------
  | MANUAL BROWSER TEST FALLBACK
  |--------------------------------------------------------------------------
  */

  if (
    !propertyName &&
    listing?.source ===
      "manual_browser_test"
  ) {
    propertyName =
      "Double-storey terrace in Bandar Cyber, Perak";
  }

  if (
    !propertyName &&
    listing?.payload?.source ===
      "manual_browser_test"
  ) {
    propertyName =
      "Double-storey terrace in Bandar Cyber, Perak";
  }

  if (!propertyName) {
    throw new Error(
      "No property title found in listing payload."
    );
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
    page
  );

  /*
  |--------------------------------------------------------------------------
  | PROPERTY SUB TYPE
  |--------------------------------------------------------------------------
  */

  await selectPropertySubType(
    page
  );

  /*
  |--------------------------------------------------------------------------
  | PROPERTY UNIT TYPE
  |--------------------------------------------------------------------------
  */

  await selectPropertyUnitType(
    page
  );

  /*
  |--------------------------------------------------------------------------
  | STATE
  |--------------------------------------------------------------------------
  */

  await selectState(
    page
  );

  /*
  |--------------------------------------------------------------------------
  | CITY
  |--------------------------------------------------------------------------
  */

  await enterCity(
    page
  );

  /*
  |--------------------------------------------------------------------------
  | POSTAL CODE
  |--------------------------------------------------------------------------
  */

  await enterPostalCode(
    page
  );

  /*
  |--------------------------------------------------------------------------
  | TENURE
  |--------------------------------------------------------------------------
  */

  await selectTenure(
    page
  );

  /*
  |--------------------------------------------------------------------------
  | TITLE TYPE
  |--------------------------------------------------------------------------
  */

  await selectIndividualTitle(
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
    "Property type: Terrace / Link House"
  );

  console.log(
    "Property sub type: 2-storey Terrace House"
  );

  console.log(
    "Property unit type: Intermediate"
  );

  console.log(
    "State: Perak"
  );

  console.log(
    "City: Ipoh"
  );

  console.log(
    "Postal code: 31450"
  );

  console.log(
    "Tenure: Leasehold"
  );

  console.log(
    "Title type: Individual"
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
      "Terrace / Link House",

    property_sub_type:
      "2-storey Terrace House",

    property_unit_type:
      "Intermediate",

    state:
      "Perak",

    city:
      "Ipoh",

    postal_code:
      "31450",

    tenure:
      "Leasehold",

    title_type:
      "Individual",

    url:
      page.url(),
  };
}