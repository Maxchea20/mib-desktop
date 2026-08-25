import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  getFacebookBrowserPage,
} from "./browser.mjs";

import {
  waitForFacebookLogin,
} from "./login.mjs";

import {
  openGroupComposer,
  fillGroupComposer,
} from "./groupComposer.mjs";

import {
  findPostButton,
  clickPostButton,
} from "./postButton.mjs";

import {
  verifyFacebookGroupPost,
} from "./verification.mjs";
/*
|--------------------------------------------------------------------------
| CONFIGURATION
|--------------------------------------------------------------------------
*/

const FACEBOOK_NAVIGATION_TIMEOUT =
  30000;

const PHOTO_BUTTON_TIMEOUT =
  15000;

const PHOTO_UPLOAD_TIMEOUT =
  30000;

const PHOTO_RENDER_WAIT_MS =
  3000;

const PHOTO_UPLOAD_MAX_WAIT_MS =
  45000;

const PHOTO_UPLOAD_POLL_INTERVAL_MS =
  500;

/*
|--------------------------------------------------------------------------
| FACEBOOK URL NORMALIZATION
|--------------------------------------------------------------------------
*/

function normalizeFacebookUrl(value) {
  if (!value) {
    return "";
  }

  let url = String(value).trim();

  const markdownMatch =
    url.match(
      /\((https?:\/\/[^)]+)\)/
    );

  if (markdownMatch) {
    url = markdownMatch[1];
  }

  const directUrlMatch =
    url.match(
      /https?:\/\/(?:www\.)?facebook\.com\/groups\/[^\s\])]+/i
    );

  if (directUrlMatch) {
    url = directUrlMatch[0];
  }

  return url;
}

/*
|--------------------------------------------------------------------------
| IMAGE URL NORMALIZATION
|--------------------------------------------------------------------------
*/

function normalizeImageUrls(payload) {
  const rawUrls =
    Array.isArray(
      payload?.image_urls
    )
      ? payload.image_urls
      : Array.isArray(
          payload?.imageUrls
        )
      ? payload.imageUrls
      : [];

  return rawUrls
    .filter(
      (url) =>
        typeof url === "string" &&
        url.trim() !== ""
    )
    .map(
      (url) =>
        url.trim()
    );
}

/*
|--------------------------------------------------------------------------
| FILE EXTENSION
|--------------------------------------------------------------------------
*/

function getExtensionFromContentType(
  contentType
) {
  const type =
    String(
      contentType || ""
    ).toLowerCase();

  if (
    type.includes("image/jpeg") ||
    type.includes("image/jpg")
  ) {
    return ".jpg";
  }

  if (
    type.includes("image/png")
  ) {
    return ".png";
  }

  if (
    type.includes("image/webp")
  ) {
    return ".webp";
  }

  if (
    type.includes("image/gif")
  ) {
    return ".gif";
  }

  if (
    type.includes("image/bmp")
  ) {
    return ".bmp";
  }

  return ".jpg";
}

/*
|--------------------------------------------------------------------------
| IMAGE FILE SIGNATURE CHECK
|--------------------------------------------------------------------------
*/

function hasValidImageSignature(
  buffer
) {
  if (
    !buffer ||
    buffer.length < 12
  ) {
    return false;
  }

  // JPEG
  if (
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return true;
  }

  // PNG
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return true;
  }

  // GIF
  if (
    buffer
      .subarray(0, 3)
      .toString("ascii") === "GIF"
  ) {
    return true;
  }

  // WEBP
  if (
    buffer
      .subarray(0, 4)
      .toString("ascii") === "RIFF" &&
    buffer
      .subarray(8, 12)
      .toString("ascii") === "WEBP"
  ) {
    return true;
  }

  // BMP
  if (
    buffer[0] === 0x42 &&
    buffer[1] === 0x4d
  ) {
    return true;
  }

  return false;
}

const DOWNLOAD_MAX_ATTEMPTS = 3;
const DOWNLOAD_RETRY_DELAY_MS = 1500;
const MIN_VALID_PHOTO_BYTES = 2048;

/*
|--------------------------------------------------------------------------
| DOWNLOAD IMAGE
|--------------------------------------------------------------------------
*/

async function downloadImageOnce(
  imageUrl,
  destinationPath
) {
  console.log(
    "Downloading Facebook photo:"
  );

  console.log(
    imageUrl
  );

  const response =
    await fetch(
      imageUrl
    );

  if (!response.ok) {
    throw new Error(
      `Failed to download property photo. HTTP ${response.status}`
    );
  }

  const contentType =
    response.headers.get(
      "content-type"
    ) || "";

  if (
    !contentType
      .toLowerCase()
      .startsWith("image/")
  ) {
    throw new Error(
      `Supabase photo URL did not return an image. Content-Type: ${contentType}`
    );
  }

  const expectedLength =
    response.headers.get(
      "content-length"
    );

  const extension =
    getExtensionFromContentType(
      contentType
    );

  const finalPath =
    destinationPath.endsWith(
      extension
    )
      ? destinationPath
      : `${destinationPath}${extension}`;

  const arrayBuffer =
    await response.arrayBuffer();

  const buffer =
    Buffer.from(
      arrayBuffer
    );

  if (
    expectedLength &&
    buffer.length !==
      Number(expectedLength)
  ) {
    throw new Error(
      `Downloaded photo is incomplete. Expected ${expectedLength} bytes, got ${buffer.length}.`
    );
  }

  if (
    buffer.length <
    MIN_VALID_PHOTO_BYTES
  ) {
    throw new Error(
      `Downloaded photo is suspiciously small (${buffer.length} bytes) - likely a broken or expired URL, not a real photo.`
    );
  }

  if (
    !hasValidImageSignature(
      buffer
    )
  ) {
    throw new Error(
      "Downloaded file does not match any known image format (corrupted download)."
    );
  }

  await fs.writeFile(
    finalPath,
    buffer
  );

  console.log(
    `✅ Photo downloaded and verified: ${path.basename(finalPath)} (${buffer.length} bytes)`
  );

  return finalPath;
}

async function downloadImage(
  imageUrl,
  destinationPath
) {
  let lastError = null;

  for (
    let attempt = 1;
    attempt <=
    DOWNLOAD_MAX_ATTEMPTS;
    attempt++
  ) {
    try {
      return await downloadImageOnce(
        imageUrl,
        destinationPath
      );
    } catch (error) {
      lastError = error;

      console.log(
        `⚠ Photo download attempt ${attempt}/${DOWNLOAD_MAX_ATTEMPTS} failed: ${error.message}`
      );

      if (
        attempt <
        DOWNLOAD_MAX_ATTEMPTS
      ) {
        await new Promise(
          (resolve) =>
            setTimeout(
              resolve,
              DOWNLOAD_RETRY_DELAY_MS
            )
        );
      }
    }
  }

  throw new Error(
    `Failed to download a valid property photo after ${DOWNLOAD_MAX_ATTEMPTS} attempts: ${lastError?.message}`
  );
}

/*
|--------------------------------------------------------------------------
| DOWNLOAD ALL PROPERTY PHOTOS
|--------------------------------------------------------------------------
*/

async function downloadPropertyPhotos(
  imageUrls,
  jobId
) {
  if (
    imageUrls.length === 0
  ) {
    return {
      directory: null,
      files: [],
    };
  }

  const safeJobId =
    String(jobId)
      .replace(
        /[^a-zA-Z0-9_-]/g,
        "_"
      );

  const directory =
    path.join(
      os.tmpdir(),
      "mib-facebook-group",
      safeJobId
    );

  await fs.mkdir(
    directory,
    {
      recursive: true,
    }
  );

  const files = [];

  for (
    let i = 0;
    i < imageUrls.length;
    i++
  ) {
    const imageUrl =
      imageUrls[i];

    const basePath =
      path.join(
        directory,
        `property-${String(
          i + 1
        ).padStart(2, "0")}`
      );

    const filePath =
      await downloadImage(
        imageUrl,
        basePath
      );

    files.push(
      filePath
    );
  }

  return {
    directory,
    files,
  };
}

/*
|--------------------------------------------------------------------------
| CLEANUP TEMPORARY PHOTOS
|--------------------------------------------------------------------------
*/

const CLEANUP_MAX_ATTEMPTS = 5;
const CLEANUP_RETRY_DELAY_MS = 1000;

function delay(ms) {
  return new Promise(
    (resolve) =>
      setTimeout(
        resolve,
        ms
      )
  );
}

async function cleanupTemporaryPhotos(
  directory
) {
  if (!directory) {
    return;
  }

  for (
    let attempt = 1;
    attempt <=
    CLEANUP_MAX_ATTEMPTS;
    attempt++
  ) {
    try {
      await fs.rm(
        directory,
        {
          recursive: true,
          force: true,
        }
      );

      console.log(
        "Temporary Facebook photo files cleaned up."
      );

      return;
    } catch (error) {
      const isLocked =
        error?.code === "EBUSY" ||
        error?.code === "EPERM" ||
        error?.code === "ENOTEMPTY";

      const isLastAttempt =
        attempt ===
        CLEANUP_MAX_ATTEMPTS;

      if (
        !isLocked ||
        isLastAttempt
      ) {
        console.error(
          "Temporary photo cleanup error:",
          error
        );

        return;
      }

      console.log(
        `Temp files still locked (attempt ${attempt}/${CLEANUP_MAX_ATTEMPTS}). Retrying shortly...`
      );

      await delay(
        CLEANUP_RETRY_DELAY_MS
      );
    }
  }
}

/*
|--------------------------------------------------------------------------
| FIND PHOTO / VIDEO BUTTON
|--------------------------------------------------------------------------
*/

async function findPhotoVideoButton(
  page
) {
  console.log(
    "Looking for Facebook Photo/video button..."
  );

  const candidates = [
    page.getByRole(
      "button",
      {
        name: /^photo\/video$/i,
      }
    ),

    page.locator(
      '[aria-label="Photo/video"]'
    ),

    page.locator(
      '[aria-label*="Photo/video" i]'
    ),

    page.locator(
      '[role="button"][aria-label*="Photo/video" i]'
    ),
  ];

  for (
    const candidate of candidates
  ) {
    const count =
      await candidate.count();

    for (
      let i = 0;
      i < count;
      i++
    ) {
      const button =
        candidate.nth(i);

      if (
        await button
          .isVisible()
          .catch(
            () => false
          )
      ) {
        console.log(
          "✅ Facebook Photo/video button found."
        );

        return button;
      }
    }
  }

  return null;
}

/*
|--------------------------------------------------------------------------
| FIND ADD PHOTOS BUTTON
|--------------------------------------------------------------------------
*/

async function findAddPhotosButton(
  page
) {
  const candidates = [
    page.getByRole(
      "button",
      {
        name: /add photos|add photo|add photos\/videos|add photo\/video/i,
      }
    ),

    page.locator(
      '[aria-label*="Add photos" i]'
    ),

    page.locator(
      '[aria-label*="Add photo" i]'
    ),

    page.locator(
      '[aria-label*="Add photos/videos" i]'
    ),

    page.locator(
      '[aria-label*="Add photo/video" i]'
    ),

    page.getByText(
      /add photos|add photo/i
    ),
  ];

  for (
    const candidate of candidates
  ) {
    const count =
      await candidate.count();

    for (
      let i = 0;
      i < count;
      i++
    ) {
      const element =
        candidate.nth(i);

      if (
        await element
          .isVisible()
          .catch(
            () => false
          )
      ) {
        console.log(
          "✅ Facebook Add Photos control found."
        );

        return element;
      }
    }
  }

  return null;
}

/*
|--------------------------------------------------------------------------
| WAIT FOR PHOTO UPLOAD
|--------------------------------------------------------------------------
*/

async function waitForPhotoUploadReady(
  page
) {
  console.log(
    "Waiting for Facebook to finish processing the photo(s)..."
  );

  await page.waitForTimeout(
    PHOTO_RENDER_WAIT_MS
  );

  const startTime =
    Date.now();

  while (
    Date.now() - startTime <
    PHOTO_UPLOAD_MAX_WAIT_MS
  ) {
    const uploadingIndicators =
      page.locator(
        [
          '[aria-label*="Uploading" i]',
          '[aria-label*="uploading photo" i]',
          '[aria-label*="Photo is uploading" i]',
          '[role="progressbar"]',
        ].join(", ")
      );

    const indicatorCount =
      await uploadingIndicators
        .count()
        .catch(
          () => 0
        );

    let stillUploading =
      false;

    for (
      let i = 0;
      i < indicatorCount;
      i++
    ) {
      const visible =
        await uploadingIndicators
          .nth(i)
          .isVisible()
          .catch(
            () => false
          );

      if (visible) {
        stillUploading =
          true;

        break;
      }
    }

    if (
      !stillUploading
    ) {
      await page.waitForTimeout(
        1000
      );

      console.log(
        "✅ Facebook shows no active upload indicators. Continuing."
      );

      return;
    }

    console.log(
      "Facebook is still processing the photo(s), waiting..."
    );

    await page.waitForTimeout(
      PHOTO_UPLOAD_POLL_INTERVAL_MS
    );
  }

  console.log(
    "⚠ Timed out waiting for an explicit Facebook upload-complete signal. Proceeding after the maximum safety wait."
  );
}

/*
|--------------------------------------------------------------------------
| ATTACH ONE BATCH
|--------------------------------------------------------------------------
|
| IMPORTANT:
| We intentionally keep each browser file selection small.
|
| Facebook accepts the same files manually, but the automated
| multi-file selection becomes unreliable with larger batches.
|
*/

async function attachPhotoBatch(
  page,
  imageFiles,
  batchNumber
) {
  console.log("");
  console.log(
    "---------------------------------"
  );

  console.log(
    `FACEBOOK PHOTO BATCH ${batchNumber}`
  );

  console.log(
    "Photos in batch:",
    imageFiles.length
  );

  console.log(
    "---------------------------------"
  );

  const fileChooserPromise =
    page.waitForEvent(
      "filechooser",
      {
        timeout:
          PHOTO_BUTTON_TIMEOUT,
      }
    );

  /*
  |--------------------------------------------------------------------------
  | First batch uses Photo/video.
  |--------------------------------------------------------------------------
  */

  const photoButton =
    await findPhotoVideoButton(
      page
    );

  if (
    !photoButton
  ) {
    throw new Error(
      "Could not find Facebook Photo/video button."
    );
  }

  await photoButton.click();

  let fileChooser = null;

  try {
    fileChooser =
      await fileChooserPromise;
  } catch {
    /*
    |--------------------------------------------------------------------------
    | Facebook may expose a normal input instead.
    |--------------------------------------------------------------------------
    */

    await page.waitForTimeout(
      1500
    );

    const fileInputs =
      page.locator(
        'input[type="file"]'
      );

    const inputCount =
      await fileInputs.count();

    if (
      inputCount === 0
    ) {
      throw new Error(
        "Facebook opened the photo interface, but no file upload input was detected."
      );
    }

    let uploaded =
      false;

    for (
      let i = 0;
      i < inputCount;
      i++
    ) {
      try {
        await fileInputs
          .nth(i)
          .setInputFiles(
            imageFiles,
            {
              timeout:
                PHOTO_UPLOAD_TIMEOUT,
            }
          );

        uploaded =
          true;

        break;
      } catch {
        console.log(
          `Facebook file input ${i} could not accept this photo batch.`
        );
      }
    }

    if (!uploaded) {
      throw new Error(
        `Facebook could not accept photo batch ${batchNumber}.`
      );
    }

    console.log(
      `✅ Photo batch ${batchNumber} attached.`
    );

    await waitForPhotoUploadReady(
      page
    );

    return;
  }

  await fileChooser.setFiles(
    imageFiles
  );

  console.log(
    `✅ Photo batch ${batchNumber} attached through native file chooser.`
  );

  await waitForPhotoUploadReady(
    page
  );
}

/*
|--------------------------------------------------------------------------
| UPLOAD PHOTOS TO FACEBOOK
|--------------------------------------------------------------------------
*/

async function uploadPhotosToFacebook(
  page,
  imageFiles
) {
  if (
    imageFiles.length === 0
  ) {
    return;
  }

  console.log("");
  console.log(
    "================================="
  );

  console.log(
    "FACEBOOK PHOTO UPLOAD"
  );

  console.log(
    "================================="
  );

  console.log(
    "Total photos:",
    imageFiles.length
  );

  /*
  |--------------------------------------------------------------------------
  | IMPORTANT
  |--------------------------------------------------------------------------
  |
  | We deliberately use batches of TWO.
  |
  | We already proved manually that Facebook accepts two of these
  | MIB-generated files, while larger automated selections become
  | unreliable.
  |
  */

  const BATCH_SIZE = 2;

  let batchNumber = 1;

  for (
    let start = 0;
    start < imageFiles.length;
    start += BATCH_SIZE
  ) {
    const batch =
      imageFiles.slice(
        start,
        start + BATCH_SIZE
      );

    await attachPhotoBatch(
      page,
      batch,
      batchNumber
    );

    batchNumber++;

    /*
    |--------------------------------------------------------------------------
    | Give Facebook a little breathing room before opening the
    | next photo selection.
    |--------------------------------------------------------------------------
    */

    if (
      start + BATCH_SIZE <
      imageFiles.length
    ) {
      console.log(
        "Waiting before next Facebook photo batch..."
      );

      await page.waitForTimeout(
        1500
      );
    }
  }

  console.log("");
  console.log(
    `✅ All ${imageFiles.length} property photo(s) sent to Facebook in controlled batches.`
  );
}

/*
|--------------------------------------------------------------------------
| MAIN FACEBOOK GROUP POST HANDLER
|--------------------------------------------------------------------------
*/

export async function handleFacebookGroupPost(
  job
) {
  const payload =
    job?.payload ?? {};

  const groupUrl =
    normalizeFacebookUrl(
      payload.group_url ||
        payload.groupUrl
    );

  const message =
    payload.message ||
    payload.caption ||
    "";

  const imageUrls =
    normalizeImageUrls(
      payload
    );

  if (!groupUrl) {
    throw new Error(
      "Facebook Group post job is missing group_url."
    );
  }

  if (
    !message.trim()
  ) {
    throw new Error(
      "Facebook Group post job is missing message."
    );
  }

  if (
    !groupUrl.includes(
      "facebook.com"
    )
  ) {
    throw new Error(
      "Invalid Facebook Group URL."
    );
  }

  console.log("");
  console.log(
    "================================="
  );

  console.log(
    "FACEBOOK GROUP POST"
  );

  console.log(
    "================================="
  );

  console.log(
    "Job ID:",
    job.id
  );

  console.log(
    "Group:",
    groupUrl
  );

  console.log(
    "Message:",
    message
  );

  console.log(
    "Photos:",
    imageUrls.length
  );

  console.log(
    "================================="
  );

  console.log("");

  let temporaryPhotoDirectory =
    null;

  try {
    /*
    |--------------------------------------------------------------------------
    | 1. Start / reuse Facebook browser
    |--------------------------------------------------------------------------
    */

    const page =
      await getFacebookBrowserPage();

    /*
    |--------------------------------------------------------------------------
    | 2. Open Group
    |--------------------------------------------------------------------------
    */

    console.log(
      "Opening Facebook Group..."
    );

    await page.goto(
      groupUrl,
      {
        waitUntil:
          "domcontentloaded",

        timeout:
          FACEBOOK_NAVIGATION_TIMEOUT,
      }
    );

    await page.waitForTimeout(
      3000
    );

    /*
    |--------------------------------------------------------------------------
    | 3. Verify Facebook session
    |--------------------------------------------------------------------------
    */

    await waitForFacebookLogin(
      page
    );

    console.log(
      "Facebook session appears active."
    );

    /*
    |--------------------------------------------------------------------------
    | 4. Open Group composer
    |--------------------------------------------------------------------------
    */

    console.log(
      "Looking for Group composer..."
    );

    const composer =
      await openGroupComposer(
        page
      );

    if (!composer) {
      throw new Error(
        "Could not find the Facebook Group post composer. The Group may require approval, membership, or Facebook may have changed the page layout."
      );
    }

    console.log(
      "Group composer found."
    );

    /*
    |--------------------------------------------------------------------------
    | 5. Download property photos
    |--------------------------------------------------------------------------
    */

    let photoFiles = [];

    if (
      imageUrls.length > 0
    ) {
      console.log("");
      console.log(
        "Preparing property photos..."
      );

      const downloaded =
        await downloadPropertyPhotos(
          imageUrls,
          job.id
        );

      temporaryPhotoDirectory =
        downloaded.directory;

      photoFiles =
        downloaded.files;

      console.log(
        `✅ ${photoFiles.length} property photo(s) prepared.`
      );
    } else {
      console.log(
        "No property photos supplied. Continuing as text-only post."
      );
    }

    /*
    |--------------------------------------------------------------------------
    | 6. Upload property photos
    |--------------------------------------------------------------------------
    */

    if (
      photoFiles.length > 0
    ) {
      await uploadPhotosToFacebook(
        page,
        photoFiles
      );
    }

    /*
    |--------------------------------------------------------------------------
    | 7. Enter message
    |--------------------------------------------------------------------------
    */

    console.log(
      "Entering Facebook post message..."
    );

    await fillGroupComposer(
      composer,
      message
    );

    await page.waitForTimeout(
      1000
    );

    /*
    |--------------------------------------------------------------------------
    | 8. Find Post button
    |--------------------------------------------------------------------------
    */

    console.log(
      "Looking for Facebook Post button..."
    );

    const postButton =
      await findPostButton(
        page
      );

    if (!postButton) {
      throw new Error(
        "Could not find the Facebook Post button after preparing the Group post."
      );
    }

    console.log(
      "Post button found."
    );

    /*
    |--------------------------------------------------------------------------
    | 9. Click Post
    |--------------------------------------------------------------------------
    */

    await clickPostButton(
      postButton
    );

    console.log(
      "Post button clicked."
    );

    /*
    |--------------------------------------------------------------------------
    | 10. Verify result
    |--------------------------------------------------------------------------
    */

    const verification =
      await verifyFacebookGroupPost(
        page,
        message
      );

    if (
      verification.status ===
      "posted"
    ) {
      console.log(
        "✅ Facebook Group post published."
      );

      return {
        success: true,

        status: "posted",

        message:
          "Facebook Group post published successfully.",

        group_url:
          groupUrl,

        photoCount:
          imageUrls.length,

        verification,
      };
    }

    console.log(
      "Facebook post action completed, but verification was inconclusive."
    );

    return {
      success: true,

      status: "review",

      message:
        "Post action completed, but Facebook did not provide definitive confirmation.",

      group_url:
        groupUrl,

      photoCount:
        imageUrls.length,

      verification,
    };

  } finally {
    await cleanupTemporaryPhotos(
      temporaryPhotoDirectory
    );
  }
}