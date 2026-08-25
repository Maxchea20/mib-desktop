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
| HANDLE LISTING TYPE PAGE
|--------------------------------------------------------------------------
*/

export async function handleListingType(page) {
  console.log("");
  console.log("=================================");
  console.log("IPROPERTY LISTING TYPE");
  console.log("=================================");

  /*
  |--------------------------------------------------------------------------
  | Verify page
  |--------------------------------------------------------------------------
  */

  console.log(
    "Checking iProperty Listing Type screen..."
  );

  const createNewListing = await findVisible([
    page.getByText("Create new listing", {
      exact: true,
    }),
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
  | Residential
  |--------------------------------------------------------------------------
  */

  console.log(
    "Selecting Residential..."
  );

  const residential = await findVisible([
    page.getByText("Residential", {
      exact: true,
    }),
  ]);

  if (!residential) {
    throw new Error(
      "Could not find Residential option."
    );
  }

  await residential.click();

  await page.waitForTimeout(500);

  console.log(
    "✅ Residential selected."
  );

  /*
  |--------------------------------------------------------------------------
  | Sale
  |--------------------------------------------------------------------------
  */

  console.log(
    "Selecting Sale..."
  );

  const sale = await findVisible([
    page.getByText("Sale", {
      exact: true,
    }),
  ]);

  if (!sale) {
    throw new Error(
      "Could not find Sale option."
    );
  }

  await sale.click();

  await page.waitForTimeout(500);

  console.log(
    "✅ Sale selected."
  );

  /*
  |--------------------------------------------------------------------------
  | Immediately
  |--------------------------------------------------------------------------
  */

  console.log(
    "Selecting Immediately..."
  );

  const immediately = await findVisible([
    page.getByText("Immediately", {
      exact: true,
    }),
  ]);

  if (!immediately) {
    throw new Error(
      "Could not find Immediately option."
    );
  }

  await immediately.click();

  await page.waitForTimeout(500);

  console.log(
    "✅ Immediately selected."
  );

  /*
  |--------------------------------------------------------------------------
  | Next
  |--------------------------------------------------------------------------
  */

  console.log(
    "Looking for Next button..."
  );

  const next = await findVisible([
    page.getByRole("button", {
      name: /^Next$/i,
    }),

    page.getByText("Next", {
      exact: true,
    }),
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
  | Wait for Location page
  |--------------------------------------------------------------------------
  */

  await page.waitForTimeout(1500);

  const locationScreen = await findVisible([
    page.getByText("Confirm location details", {
      exact: true,
    }),

    page.getByText("Property name", {
      exact: true,
    }),
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