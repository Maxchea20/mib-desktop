const ELEMENT_TIMEOUT = 15000;

/*
|--------------------------------------------------------------------------
| SUPABASE
|--------------------------------------------------------------------------
*/

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ||
  "https://vdvwcworcsawbopafzfp.supabase.co";

const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY;

const SUPABASE_STORAGE_BUCKET =
  "property-images";

const ACCESS_TOKEN =
  process.env.MIB_WORKER_ACCESS_TOKEN;

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
  const gotIt =
    page.getByRole(
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
| GET LISTING PHOTOS FROM SUPABASE STORAGE
|--------------------------------------------------------------------------
|
| Data-driven:
|
| Listing #36
|     ↓
| property-images / 36/
|     ↓
| all image files
|
| No hardcoded filenames.
|
|--------------------------------------------------------------------------
*/

async function getListingPhotos(
  listing
) {
  if (!listing) {
    throw new Error(
      "Listing data was not provided to iProperty Gallery."
    );
  }

  if (!listing.id) {
    throw new Error(
      "Listing is missing ID. Cannot load gallery photos."
    );
  }

  if (!SUPABASE_ANON_KEY) {
    throw new Error(
      "Missing VITE_SUPABASE_ANON_KEY."
    );
  }

  if (!ACCESS_TOKEN) {
    throw new Error(
      "Missing MIB_WORKER_ACCESS_TOKEN."
    );
  }

  console.log("");

  console.log(
    `Loading gallery photos for MIB Listing ID: ${listing.id}`
  );

  /*
  |--------------------------------------------------------------------------
  | LIST SUPABASE STORAGE OBJECTS
  |--------------------------------------------------------------------------
  */

  const listUrl =
    `${SUPABASE_URL}/storage/v1/object/list/${SUPABASE_STORAGE_BUCKET}`;

  const response =
    await fetch(
      listUrl,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",

          apikey:
            SUPABASE_ANON_KEY,

          Authorization:
            `Bearer ${ACCESS_TOKEN}`,
        },

        body: JSON.stringify({
          prefix:
            `${listing.id}/`,

          limit:
            100,

          offset:
            0,

          sortBy: {
            column:
              "created_at",

            order:
              "asc",
          },
        }),
      }
    );

  /*
  |--------------------------------------------------------------------------
  | HANDLE STORAGE ERROR
  |--------------------------------------------------------------------------
  */

  if (!response.ok) {
    const errorText =
      await response
        .text()
        .catch(
          () => ""
        );

    throw new Error(
      `Could not load gallery photos for listing ${listing.id}. HTTP ${response.status}. ${errorText}`
    );
  }

  const objects =
    await response.json();

  if (
    !Array.isArray(objects)
  ) {
    throw new Error(
      "Supabase Storage returned an invalid gallery response."
    );
  }

  /*
  |--------------------------------------------------------------------------
  | FILTER IMAGE FILES
  |--------------------------------------------------------------------------
  */

  const photos =
    objects
      .filter(
        (object) =>
          object &&
          object.name &&
          !object.name.endsWith("/")
      )
      .map(
        (object) => {
          /*
          |--------------------------------------------------------------------------
          | SUPABASE LIST MAY RETURN:
          |
          | Bathroom.jpeg
          |
          | OR:
          |
          | 36/Bathroom.jpeg
          |
          |--------------------------------------------------------------------------
          */

          const rawName =
            String(
              object.name
            );

          const fileName =
            rawName
              .split("/")
              .pop();

          if (!fileName) {
            return null;
          }

          /*
          |--------------------------------------------------------------------------
          | ALWAYS BUILD FULL STORAGE PATH
          |--------------------------------------------------------------------------
          */

          const storagePath =
            rawName.startsWith(
              `${listing.id}/`
            )
              ? rawName
              : `${listing.id}/${fileName}`;

          const mimeType =
            object.metadata?.mimetype ||
            object.metadata?.mimeType ||
            "application/octet-stream";

          /*
          |--------------------------------------------------------------------------
          | ENCODE EACH PATH PART
          |--------------------------------------------------------------------------
          */

          const encodedPath =
            storagePath
              .split("/")
              .map(
                (part) =>
                  encodeURIComponent(
                    part
                  )
              )
              .join("/");

          /*
          |--------------------------------------------------------------------------
          | PUBLIC STORAGE URL
          |--------------------------------------------------------------------------
          */

          const url =
            `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_STORAGE_BUCKET}/${encodedPath}`;

          return {
            url,

            fileName,

            mimeType,
          };
        }
      )
      .filter(
        Boolean
      );

  /*
  |--------------------------------------------------------------------------
  | VALIDATE PHOTO COUNT
  |--------------------------------------------------------------------------
  */

  if (
    photos.length < 5
  ) {
    throw new Error(
      `iProperty requires at least 5 photos. Listing ${listing.id} has only ${photos.length} photo(s) in Supabase Storage.`
    );
  }

  /*
  |--------------------------------------------------------------------------
  | LOG PHOTOS
  |--------------------------------------------------------------------------
  */

  console.log(
    `✅ Found ${photos.length} gallery photos for listing ${listing.id}.`
  );

  for (
    const photo of photos
  ) {
    console.log(
      `   - ${photo.fileName}`
    );
  }

  return photos;
}

/*
|--------------------------------------------------------------------------
| DOWNLOAD PHOTO
|--------------------------------------------------------------------------
*/

async function downloadPhoto(
  photo
) {
  console.log(
    `Downloading ${photo.fileName}...`
  );

  const response =
    await fetch(
      photo.url
    );

  if (!response.ok) {
    throw new Error(
      `Could not download ${photo.fileName}. HTTP ${response.status}`
    );
  }

  const fileBuffer =
    Buffer.from(
      await response.arrayBuffer()
    );

  return {
    name:
      photo.fileName,

    mimeType:
      photo.mimeType,

    buffer:
      fileBuffer,
  };
}

/*
|--------------------------------------------------------------------------
| UPLOAD PHOTOS
|--------------------------------------------------------------------------
*/

async function uploadPhotos(
  page,
  listing
) {
  console.log("");

  /*
  |--------------------------------------------------------------------------
  | LOAD PHOTOS FROM SUPABASE
  |--------------------------------------------------------------------------
  */

  const photos =
    await getListingPhotos(
      listing
    );

  console.log("");

  console.log(
    `Preparing ${photos.length} gallery photos...`
  );

  /*
  |--------------------------------------------------------------------------
  | DOWNLOAD ALL PHOTOS
  |--------------------------------------------------------------------------
  */

  const files = [];

  for (
    const photo of photos
  ) {
    const file =
      await downloadPhoto(
        photo
      );

    files.push(
      file
    );
  }

  console.log(
    `✅ ${files.length} photos downloaded.`
  );

  /*
  |--------------------------------------------------------------------------
  | FIND ADD PHOTOS
  |--------------------------------------------------------------------------
  */

  const addPhotos =
    await findVisible(
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

  /*
  |--------------------------------------------------------------------------
  | OPEN FILE CHOOSER
  |--------------------------------------------------------------------------
  */

  console.log(
    'Opening the "Add photos" file chooser...'
  );

  const [
    fileChooser,
  ] =
    await Promise.all([
      page.waitForEvent(
        "filechooser"
      ),

      addPhotos.click(),
    ]);

  /*
  |--------------------------------------------------------------------------
  | SUBMIT ALL PHOTOS
  |--------------------------------------------------------------------------
  */

  await fileChooser.setFiles(
    files
  );

  console.log(
    `Submitted ${files.length} photos.`
  );

  /*
  |--------------------------------------------------------------------------
  | WAIT FOR IPROPERTY TO SHOW ACTUAL PHOTO COUNT
  |--------------------------------------------------------------------------
  */

  const expectedPhotoCount =
    files.length;

  console.log(
    `Waiting for iProperty to show Photos (${expectedPhotoCount})...`
  );

  const uploadedPhotoCount =
    await findVisible(
      [
        page.getByText(
          `Photos (${expectedPhotoCount})`,
          {
            exact: true,
          }
        ),
      ],
      30000
    );

  if (!uploadedPhotoCount) {
    throw new Error(
      `${expectedPhotoCount} photo upload did not complete within 30 seconds.`
    );
  }

  console.log(
    `✅ Gallery now has ${expectedPhotoCount} photos.`
  );

  return expectedPhotoCount;
}

/*
|--------------------------------------------------------------------------
| MAIN GALLERY HANDLER
|--------------------------------------------------------------------------
*/

export async function handleGallery(
  page,
  listing
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

  /*
  |--------------------------------------------------------------------------
  | VALIDATE LISTING
  |--------------------------------------------------------------------------
  */

  if (!listing) {
    throw new Error(
      "Listing data was not provided to iProperty Gallery."
    );
  }

  console.log(
    "MIB Listing ID:",
    listing.id
  );

  /*
  |--------------------------------------------------------------------------
  | WAIT FOR GALLERY
  |--------------------------------------------------------------------------
  */

  const gallery =
    await findVisible(
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

  /*
  |--------------------------------------------------------------------------
  | DISMISS AUTO-TAGGING
  |--------------------------------------------------------------------------
  */

  await dismissAutoTaggingModal(
    page
  );

  /*
  |--------------------------------------------------------------------------
  | UPLOAD PHOTOS
  |--------------------------------------------------------------------------
  */

  const uploadedCount =
    await uploadPhotos(
      page,
      listing
    );

  /*
  |--------------------------------------------------------------------------
  | VERIFY FINAL PHOTO COUNT
  |--------------------------------------------------------------------------
  */

  console.log(
    `Waiting for all ${uploadedCount} gallery photos...`
  );

  const finalPhotoCount =
    await findVisible(
      [
        page.getByText(
          `Photos (${uploadedCount})`,
          {
            exact: true,
          }
        ),
      ],
      30000
    );

  if (!finalPhotoCount) {
    throw new Error(
      `Gallery did not reach Photos (${uploadedCount}).`
    );
  }

  console.log(
    `✅ Gallery contains ${uploadedCount} photos.`
  );

  /*
  |--------------------------------------------------------------------------
  | CLICK NEXT
  |--------------------------------------------------------------------------
  */

  console.log(
    "Looking for Gallery Next button..."
  );

  const next =
    await findVisible(
      [
        page.getByRole(
          "button",
          {
            name: "Next",
            exact: true,
          }
        ),

        page.getByText(
          "Next",
          {
            exact: true,
          }
        ),
      ],
      10000
    );

  if (!next) {
    throw new Error(
      'Could not find "Next" button on Gallery page.'
    );
  }

  await next.scrollIntoViewIfNeeded();

  console.log(
    "🖱️ Clicking Gallery Next..."
  );

  await next.click();

  await page.waitForTimeout(
    2000
  );

  console.log(
    "✅ Gallery Next clicked."
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
    "✅ IPROPERTY GALLERY COMPLETED"
  );

  console.log(
    "================================="
  );

  console.log(
    `Photos uploaded: ${uploadedCount}`
  );

  console.log(
    "Next clicked."
  );

  console.log(
    "Current URL:",
    page.url()
  );

  console.log(
    "================================="
  );

  return {
    success:
      true,

    status:
      "gallery_completed",

    photos_uploaded:
      uploadedCount,

    url:
      page.url(),
  };
}