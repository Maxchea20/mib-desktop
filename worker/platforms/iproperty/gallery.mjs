const ELEMENT_TIMEOUT = 15000;

const PHOTO_URL =
  "https://vdvwcworcsawbopafzfp.supabase.co/storage/v1/object/public/property-images/14/Front_House.png";

const PHOTO_FILE_NAME =
  "Front_House.png";

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
| DISMISS AUTO-TAGGING INTRODUCTION
|--------------------------------------------------------------------------
*/

async function dismissAutoTaggingModal(
  page
) {
  const gotIt = page.getByRole(
    "button",
    {
      name: "Got it",
      exact: true,
    }
  );

  if (
    await gotIt
      .isVisible()
      .catch(() => false)
  ) {
    console.log(
      "Dismissing auto-tagging introduction..."
    );

    await gotIt.click();

    await page.waitForTimeout(
      500
    );

    console.log(
      "✅ Auto-tagging introduction dismissed."
    );
  }
}

/*
|--------------------------------------------------------------------------
| UPLOAD PHOTO
|--------------------------------------------------------------------------
*/

async function uploadPhoto(
  page
) {
  console.log(
    "Downloading Front_House.png..."
  );

  const response = await fetch(
    PHOTO_URL
  );

  if (!response.ok) {
    throw new Error(
      `Could not download gallery photo. HTTP ${response.status}`
    );
  }

  const fileBuffer = Buffer.from(
    await response.arrayBuffer()
  );

  const addPhotos = await findVisible(
    [
      page.getByText(
        "Add photos",
        {
          exact: true,
        }
      ),

      page.getByRole(
        "button",
        {
          name: /add photos/i,
        }
      ),
    ]
  );

  if (!addPhotos) {
    throw new Error(
      'Could not find the "Add photos" control.'
    );
  }

  console.log(
    'Opening the "Add photos" file chooser...'
  );

  const [fileChooser] = await Promise.all(
    [
      page.waitForEvent(
        "filechooser"
      ),

      addPhotos.click(),
    ]
  );

  await fileChooser.setFiles(
    {
      name: PHOTO_FILE_NAME,
      mimeType: "image/png",
      buffer: fileBuffer,
    }
  );

  console.log(
    "Photo submitted. Waiting for upload..."
  );

  const uploadedPhotoCount = await findVisible(
    [
      page.getByText(
        "Photos (1)",
        {
          exact: true,
        }
      ),
    ],
    30000
  );

  if (!uploadedPhotoCount) {
    throw new Error(
      "Photo upload did not complete within 30 seconds."
    );
  }

  console.log(
    "✅ Gallery photo uploaded."
  );
}

/*
|--------------------------------------------------------------------------
| MAIN GALLERY HANDLER
|--------------------------------------------------------------------------
*/

export async function handleGallery(
  page
) {
  console.log("");

  console.log(
    "================================="
  );

  console.log(
    "IPROPERTY GALLERY"
  );

  console.log(
    "================================="
  );

  const gallery = await findVisible(
    [
      page.getByText(
        "Photos (0)",
        {
          exact: true,
        }
      ),

      page.getByText(
        "Get started with media upload",
        {
          exact: true,
        }
      ),

      page.getByRole(
        "button",
        {
          name: "Got it",
          exact: true,
        }
      ),
    ]
  );

  if (!gallery) {
    throw new Error(
      "iProperty Gallery page did not appear."
    );
  }

  console.log(
    "✅ iProperty Gallery page detected."
  );

  await dismissAutoTaggingModal(
    page
  );

  await uploadPhoto(
    page
  );

  console.log(
    "✅ Gallery complete. Stopping before Next."
  );
}