import {
  getFacebookBrowserPage,
} from "../facebook/browser.mjs";

/*
|--------------------------------------------------------------------------
| iPROPERTY PRO
|--------------------------------------------------------------------------
*/

const IPROPERTY_PRO_URL =
  "https://www.iproperty.com.my/pro/";

const NAVIGATION_TIMEOUT =
  30000;

const PAGE_WAIT_MS =
  3000;

/*
|--------------------------------------------------------------------------
| FIND VISIBLE ELEMENT
|--------------------------------------------------------------------------
*/

async function findVisible(
  locators
) {
  for (
    const locator of locators
  ) {
    const count =
      await locator.count();

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
          .catch(
            () => false
          )
      ) {
        return element;
      }
    }
  }

  return null;
}

/*
|--------------------------------------------------------------------------
| WAIT FOR IPROPERTY SESSION
|--------------------------------------------------------------------------
*/

async function waitForIpropertySession(
  page
) {
  console.log(
    "Checking iProperty PRO session..."
  );

  const startTime =
    Date.now();

  const timeout =
    60000;

  while (
    Date.now() - startTime <
    timeout
  ) {
    /*
    |--------------------------------------------------------------------------
    | Dashboard indicators
    |--------------------------------------------------------------------------
    */

    const dashboard =
      await findVisible([
        page.getByText(
          "Dashboard",
          {
            exact: true,
          }
        ),

        page.getByText(
          "My Listings",
          {
            exact: true,
          }
        ),

        page.getByText(
          "Create Listing",
          {
            exact: true,
          }
        ),
      ]);

    if (dashboard) {
      console.log(
        "✅ iProperty PRO session appears active."
      );

      return true;
    }

    /*
    |--------------------------------------------------------------------------
    | Login indicators
    |--------------------------------------------------------------------------
    */

    const login =
      await findVisible([
        page.getByText(
          /log in|login|sign in/i
        ),

        page.getByRole(
          "button",
          {
            name: /log in|login|sign in/i,
          }
        ),
      ]);

    if (login) {
      throw new Error(
        "iProperty PRO requires login. Please log in manually in the MIB Desktop browser session."
      );
    }

    await page.waitForTimeout(
      1000
    );
  }

  throw new Error(
    "Timed out waiting for iProperty PRO session."
  );
}

/*
|--------------------------------------------------------------------------
| OPEN LISTINGS
|--------------------------------------------------------------------------
*/

async function openListings(
  page
) {
  console.log(
    "Looking for iProperty Listings..."
  );

  const listings =
    await findVisible([
      page.getByRole(
        "link",
        {
          name: "Listings",
          exact: true,
        }
      ),

      page.getByText(
        "Listings",
        {
          exact: true,
        }
      ),
    ]);

  if (!listings) {
    throw new Error(
      "Could not find iProperty Listings navigation."
    );
  }

  console.log(
    "✅ Listings navigation found."
  );

  await listings.click();

  await page.waitForTimeout(
    PAGE_WAIT_MS
  );

  console.log(
    "iProperty Listings page opened."
  );
}

/*
|--------------------------------------------------------------------------
| OPEN CREATE LISTING
|--------------------------------------------------------------------------
*/

async function openCreateListing(
  page
) {
  console.log(
    "Looking for Create Listing..."
  );

  const createListing =
    await findVisible([
      page.getByRole(
        "button",
        {
          name: /create listing/i,
        }
      ),

      page.getByRole(
        "link",
        {
          name: /create listing/i,
        }
      ),

      page.getByText(
        "Create Listing",
        {
          exact: true,
        }
      ),
    ]);

  if (!createListing) {
    throw new Error(
      "Could not find iProperty Create Listing button."
    );
  }

  console.log(
    "✅ Create Listing button found."
  );

  await createListing.click();

  await page.waitForTimeout(
    PAGE_WAIT_MS
  );

  console.log(
    "Create Listing clicked."
  );
}

/*
|--------------------------------------------------------------------------
| VERIFY LISTING TYPE SCREEN
|--------------------------------------------------------------------------
*/

async function verifyListingTypeScreen(
  page
) {
  console.log(
    "Checking iProperty Create new listing screen..."
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

  if (
    !createNewListing
  ) {
    throw new Error(
      "iProperty Create new listing screen was not detected."
    );
  }

  const residential =
    await findVisible([
      page.getByText(
        "Residential",
        {
          exact: true,
        }
      ),
    ]);

  const commercial =
    await findVisible([
      page.getByText(
        "Commercial",
        {
          exact: true,
        }
      ),
    ]);

  const sale =
    await findVisible([
      page.getByText(
        "Sale",
        {
          exact: true,
        }
      ),
    ]);

  const rent =
    await findVisible([
      page.getByText(
        "Rent",
        {
          exact: true,
        }
      ),
    ]);

  if (
    !residential ||
    !commercial ||
    !sale ||
    !rent
  ) {
    throw new Error(
      "iProperty Listing Type screen was detected, but the expected Residential/Commercial/Sale/Rent options were not found."
    );
  }

  console.log(
    "✅ iProperty Listing Type screen confirmed."
  );

  console.log(
    "Residential option found."
  );

  console.log(
    "Commercial option found."
  );

  console.log(
    "Sale option found."
  );

  console.log(
    "Rent option found."
  );

  return true;
}

/*
|--------------------------------------------------------------------------
| MAIN HANDLER
|--------------------------------------------------------------------------
*/

export async function handleIpropertyCreateListing(
  job
) {
  console.log("");

  console.log(
    "================================="
  );

  console.log(
    "IPROPERTY PRO CREATE LISTING TEST"
  );

  console.log(
    "================================="
  );

  console.log(
    "Job ID:",
    job.id
  );

  console.log(
    "================================="
  );

  console.log("");

  /*
  |--------------------------------------------------------------------------
  | 1. Reuse MIB Desktop browser
  |--------------------------------------------------------------------------
  */

  const page =
    await getFacebookBrowserPage();

  /*
  |--------------------------------------------------------------------------
  | 2. Open iProperty PRO
  |--------------------------------------------------------------------------
  */

  console.log(
    "Opening iProperty PRO..."
  );

  await page.goto(
    IPROPERTY_PRO_URL,
    {
      waitUntil:
        "domcontentloaded",

      timeout:
        NAVIGATION_TIMEOUT,
    }
  );

  await page.waitForTimeout(
    PAGE_WAIT_MS
  );

  console.log(
    "iProperty PRO opened."
  );

  /*
  |--------------------------------------------------------------------------
  | 3. Check session
  |--------------------------------------------------------------------------
  */

  await waitForIpropertySession(
    page
  );

  /*
  |--------------------------------------------------------------------------
  | 4. Open Listings
  |--------------------------------------------------------------------------
  */

  await openListings(
    page
  );

  /*
  |--------------------------------------------------------------------------
  | 5. Open Create Listing
  |--------------------------------------------------------------------------
  */

  await openCreateListing(
    page
  );

  /*
  |--------------------------------------------------------------------------
  | 6. Verify first screen
  |--------------------------------------------------------------------------
  */

  await verifyListingTypeScreen(
    page
  );

  /*
  |--------------------------------------------------------------------------
  | IMPORTANT
  |--------------------------------------------------------------------------
  |
  | We intentionally STOP here.
  |
  | No property type is selected.
  | No Sale/Rent is selected.
  | No credits are consumed.
  | No listing is created.
  |
  |--------------------------------------------------------------------------
  */

  console.log("");

  console.log(
    "================================="
  );

  console.log(
    "✅ IPROPERTY CREATE LISTING SCREEN READY"
  );

  console.log(
    "================================="
  );

  console.log(
    "MIB successfully reached the Listing Type screen."
  );

  console.log(
    "No listing was created."
  );

  console.log(
    "No credits were consumed."
  );

  console.log(
    "================================="
  );

  return {
    success: true,

    status:
      "ready",

    message:
      "iProperty PRO Create Listing screen opened successfully.",

    url:
      page.url(),
  };
}