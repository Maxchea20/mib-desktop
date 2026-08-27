/*
|--------------------------------------------------------------------------
| iPROPERTY PRO — LISTING TYPE
|--------------------------------------------------------------------------
*/

async function findVisible(locators) {
  for (const locator of locators) {
    const count = await locator.count();

    for (let i = 0; i < count; i++) {
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

  return null;
}

/*
|--------------------------------------------------------------------------
| NORMALIZE PURPOSE
|--------------------------------------------------------------------------
|
| MIB / Supabase may use:
|
| "For Sale"
| "Sale"
| "For Rent"
| "Rent"
|
| iProperty uses:
|
| "Sale"
| "Rent"
|
|--------------------------------------------------------------------------
*/

function normalizePurpose(purpose) {
  const value = String(purpose)
    .trim()
    .toLowerCase();

  if (
    value === "for sale" ||
    value === "sale"
  ) {
    return "Sale";
  }

  if (
    value === "for rent" ||
    value === "rent"
  ) {
    return "Rent";
  }

  throw new Error(
    `Unsupported listing purpose: "${purpose}". Expected Sale, For Sale, Rent, or For Rent.`
  );
}

/*
|--------------------------------------------------------------------------
| HANDLE LISTING TYPE PAGE
|--------------------------------------------------------------------------
*/

export async function handleListingType(
  page,
  listing
) {
  console.log("");
  console.log("=================================");
  console.log("IPROPERTY LISTING TYPE");
  console.log("=================================");

  /*
  |--------------------------------------------------------------------------
  | VALIDATE LISTING DATA
  |--------------------------------------------------------------------------
  */

  if (!listing) {
    throw new Error(
      "Listing data was not provided to iProperty Listing Type."
    );
  }

  if (!listing.category) {
    throw new Error(
      "Listing is missing category."
    );
  }

  if (!listing.purpose) {
    throw new Error(
      "Listing is missing purpose."
    );
  }

  console.log(
    "MIB Listing ID:",
    listing.id
  );

  console.log(
    "Property Category:",
    listing.category
  );

  console.log(
    "Supabase Purpose:",
    listing.purpose
  );

  /*
  |--------------------------------------------------------------------------
  | NORMALIZE PURPOSE FOR IPROPERTY
  |--------------------------------------------------------------------------
  */

  const ipropertyPurpose =
    normalizePurpose(
      listing.purpose
    );

  console.log(
    "iProperty Purpose:",
    ipropertyPurpose
  );

  /*
  |--------------------------------------------------------------------------
  | VERIFY PAGE
  |--------------------------------------------------------------------------
  */

  console.log(
    "Checking iProperty Listing Type screen..."
  );

  const createNewListing =
    await findVisible([
      page.getByText(
        "Create new listing",
        {
          exact: true,
        }
      ),
    ]);

  if (!createNewListing) {
    throw new Error(
      "iProperty Create new listing screen was not detected."
    );
  }

  console.log(
    "✅ Listing Type screen detected."
  );

  /*
  |--------------------------------------------------------------------------
  | PROPERTY CATEGORY
  |--------------------------------------------------------------------------
  */

  console.log(
    `Selecting ${listing.category}...`
  );

  const category =
    await findVisible([
      page.getByText(
        listing.category,
        {
          exact: true,
        }
      ),
    ]);

  if (!category) {
    throw new Error(
      `Could not find iProperty category option: "${listing.category}".`
    );
  }

  await category.click();

  await page.waitForTimeout(
    500
  );

  console.log(
    `✅ ${listing.category} selected.`
  );

  /*
  |--------------------------------------------------------------------------
  | PURPOSE
  |--------------------------------------------------------------------------
  */

  console.log(
    `Selecting ${ipropertyPurpose}...`
  );

  const purpose =
    await findVisible([
      page.getByText(
        ipropertyPurpose,
        {
          exact: true,
        }
      ),
    ]);

  if (!purpose) {
    throw new Error(
      `Could not find iProperty purpose option: "${ipropertyPurpose}".`
    );
  }

  await purpose.click();

  await page.waitForTimeout(
    500
  );

  console.log(
    `✅ ${ipropertyPurpose} selected.`
  );

  /*
  |--------------------------------------------------------------------------
  | IMMEDIATELY
  |--------------------------------------------------------------------------
  |
  | This remains unchanged because the current MIB properties
  | data does not contain a listing timing field.
  |
  |--------------------------------------------------------------------------
  */

  console.log(
    "Selecting Immediately..."
  );

  const immediately =
    await findVisible([
      page.getByText(
        "Immediately",
        {
          exact: true,
        }
      ),
    ]);

  if (!immediately) {
    throw new Error(
      "Could not find Immediately option."
    );
  }

  await immediately.click();

  await page.waitForTimeout(
    500
  );

  console.log(
    "✅ Immediately selected."
  );

  /*
  |--------------------------------------------------------------------------
  | NEXT
  |--------------------------------------------------------------------------
  */

  console.log(
    "Looking for Next button..."
  );

  const next =
    await findVisible([
      page.getByRole(
        "button",
        {
          name: /^Next$/i,
        }
      ),

      page.getByText(
        "Next",
        {
          exact: true,
        }
      ),
    ]);

  if (!next) {
    throw new Error(
      "Could not find Next button on Listing Type screen."
    );
  }

  console.log(
    "✅ Next button found."
  );

  await next.click();

  console.log(
    "Next clicked."
  );

  /*
  |--------------------------------------------------------------------------
  | WAIT FOR LOCATION PAGE
  |--------------------------------------------------------------------------
  */

  await page.waitForTimeout(
    1500
  );

  const locationScreen =
    await findVisible([
      page.getByText(
        "Confirm location details",
        {
          exact: true,
        }
      ),

      page.getByText(
        "Property name",
        {
          exact: true,
        }
      ),
    ]);

  if (!locationScreen) {
    throw new Error(
      "Listing Type completed, but iProperty Location screen was not detected."
    );
  }

  console.log(
    "✅ iProperty Location screen detected."
  );

  console.log(
    "================================="
  );

  console.log(
    "✅ LISTING TYPE COMPLETED"
  );

  console.log(
    "================================="
  );

  return {
    success: true,
    status: "location_ready",
  };
}