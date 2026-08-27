import {
  getIpropertyBrowserPage,
} from "./browser.mjs";

import {
  handleListingType,
} from "./listingType.mjs";

import {
  handleLocation,
} from "./location.mjs";

import {
  handleUnitDetails,
} from "./unitDetails.mjs";

import {
  handlePrice,
} from "./price.mjs";

import {
  handleDescription,
} from "./description.mjs";

import {
  handleGallery,
} from "./gallery.mjs";

import {
  handlePlatformPosting,
} from "./platformPosting.mjs";

import {
  handlePreview,
} from "./preview.mjs";

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

async function openCreateListing(page) {
  console.log(
    "Looking for Create Listing..."
  );

  const startTime = Date.now();
  const timeout = 60000;

  while (Date.now() - startTime < timeout) {

    const createListing =
      await findVisible([
        page.locator(
          '[da-id="page-header-create-listing-button"]'
        ),

        page.locator(
          'a[href="/pro/v2/add-listing"]'
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

    if (createListing) {

      console.log(
        "✅ Create Listing button found."
      );

      await createListing.scrollIntoViewIfNeeded();

      console.log(
        "🖱️ Clicking Create Listing..."
      );

      await createListing.click();

      await page.waitForTimeout(
        PAGE_WAIT_MS
      );

      console.log(
        "✅ Create Listing clicked."
      );

      return;
    }

    await page.waitForTimeout(1000);
  }

  throw new Error(
    "Could not find iProperty Create Listing button after waiting 60 seconds."
  );
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
  | 1. MIB Desktop browser Iproperty
  |--------------------------------------------------------------------------
  */

  const page =
  await getIpropertyBrowserPage();

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
  | 6. Handle Listing Type
  |--------------------------------------------------------------------------
  */

  await handleListingType(
  page,
  job.listing
);

await handleLocation(
  page,
  job.listing
);

await handleUnitDetails(
  page,
  job.listing
);

await handlePrice(
  page,
  job.listing
);

await handleDescription(
  page,
  job.listing
);

await handleGallery(
  page,
  job.listing
);

await handlePlatformPosting(
  page
);

await handlePreview(
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