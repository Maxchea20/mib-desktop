import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  getFacebookBrowserPage,
} from "../facebook/browser.mjs";

import {
  waitForFacebookLogin,
} from "../facebook/login.mjs";

import {
  openGroupComposer,
  fillGroupComposer,
} from "../facebook/groupComposer.mjs";

import {
  findPostButton,
  clickPostButton,
} from "../facebook/postButton.mjs";

import {
  verifyFacebookGroupPost,
} from "../facebook/verification.mjs";

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

  /*
  Handle normal URL:
  https://www.facebook.com/groups/123
  */

  /*
  Handle Markdown-style URL:
  [https://www.facebook.com/groups/123](https://www.facebook.com/groups/123)
  */

  const markdownMatch =
    url.match(
      /\((https?:\/\/[^)]+)\)/
    );

  if (markdownMatch) {
    url = markdownMatch[1];
  }

  /*
  Handle accidentally duplicated Markdown
  or bracket formatting.
  */

  const directUrlMatch =
    url.match(
      /https?:\/\/(?:www\.)?facebook\.com\/groups\/[^\s\])]+/i
    );

  if (directUrlMatch) {
    url =
      directUrlMatch[0];
  }

  return url;
}

/*
|--------------------------------------------------------------------------
| IMAGE URL NORMALIZATION
|--------------------------------------------------------------------------
*/

function normalizeImageUrls(
  payload
) {
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
        typeof url ===
          "string" &&
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
    type.includes(
      "image/jpeg"
    ) ||
    type.includes(
      "image/jpg"
    )
  ) {
    return ".jpg";
  }

  if (
    type.includes(
      "image/png"
    )
  ) {
    return ".png";
  }

  if (
    type.includes(
      "image/webp"
    )
  ) {
    return ".webp";
  }

  if (
    type.includes(
      "image/gif"
    )
  ) {
    return ".gif";
  }

  if (
    type.includes(
      "image/bmp"
    )
  ) {
    return ".bmp";
  }

  return ".jpg";
}

/*
|--------------------------------------------------------------------------
| DOWNLOAD IMAGE
|--------------------------------------------------------------------------
*/

async function downloadImage(
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

  if (
    !response.ok
  ) {
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

  await fs.writeFile(
    finalPath,
    buffer
  );

  console.log(
    `✅ Photo downloaded: ${path.basename(finalPath)}`
  );

  return finalPath;
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

async function cleanupTemporaryPhotos(
  directory
) {
  if (!directory) {
    return;
  }

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
  } catch (error) {
    console.error(
      "Temporary photo cleanup error:",
      error
    );
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
    "Photos to upload:",
    imageFiles.length
  );

  const photoButton =
    await findPhotoVideoButton(
      page
    );

  if (!photoButton) {
    throw new Error(
      "Could not find Facebook Photo/video button."
    );
  }

  console.log(
    "Opening Facebook photo picker..."
  );

  /*
  Wait for Facebook's native file chooser
  while clicking Photo/video.
  */

  const fileChooserPromise =
    page.waitForEvent(
      "filechooser",
      {
        timeout:
          PHOTO_BUTTON_TIMEOUT,
      }
    );

  await photoButton.click();

  let fileChooser;

  try {
    fileChooser =
      await fileChooserPromise;
  } catch (error) {
    console.log(
      "Native file chooser did not appear immediately."
    );

    /*
    Some Facebook versions open an internal
    upload UI rather than immediately exposing
    a native chooser.

    Give the page a moment to render it.
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
        "Facebook Photo/video was opened, but no file upload input was detected."
      );
    }

    let uploaded =
      false;

    for (
      let i = 0;
      i < inputCount;
      i++
    ) {
      const input =
        fileInputs.nth(i);

      try {
        await input.setInputFiles(
          imageFiles,
          {
            timeout:
              PHOTO_UPLOAD_TIMEOUT,
          }
        );

        uploaded =
          true;

        break;

      } catch (
        inputError
      ) {
        console.log(
          `Facebook file input ${i} could not accept files.`
        );
      }
    }

    if (!uploaded) {
      throw new Error(
        "Facebook opened the photo interface, but the property photos could not be attached."
      );
    }

    console.log(
      "✅ Property photos attached through Facebook file input."
    );

    await page.waitForTimeout(
      PHOTO_RENDER_WAIT_MS
    );

    return;
  }

  /*
  Native file chooser path.
  */

  console.log(
    "Attaching property photos..."
  );

  await fileChooser.setFiles(
    imageFiles
  );

  console.log(
    `✅ ${imageFiles.length} property photo(s) attached to Facebook.`
  );

  await page.waitForTimeout(
    PHOTO_RENDER_WAIT_MS
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
    // -----------------------------------------
    // 1. Start / reuse Facebook browser
    // -----------------------------------------

    const page =
      await getFacebookBrowserPage();

    // -----------------------------------------
    // 2. Open Group
    // -----------------------------------------

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

    // -----------------------------------------
    // 3. Verify Facebook session
    // -----------------------------------------

    await waitForFacebookLogin(
      page
    );

    console.log(
      "Facebook session appears active."
    );

    // -----------------------------------------
    // 4. Open Group composer
    // -----------------------------------------

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

    // -----------------------------------------
    // 5. Download property photos
    // -----------------------------------------

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

    // -----------------------------------------
    // 6. Upload property photos
    // -----------------------------------------

    if (
      photoFiles.length > 0
    ) {
      await uploadPhotosToFacebook(
        page,
        photoFiles
      );
    }

    // -----------------------------------------
    // 7. Enter message
    // -----------------------------------------

    console.log(
      "Entering Facebook post message..."
    );

    /*
    The editor returned by openGroupComposer()
    is still the correct Create Post editor.
    */

    await fillGroupComposer(
      composer,
      message
    );

    await page.waitForTimeout(
      1000
    );

    // -----------------------------------------
    // 8. Find Post button
    // -----------------------------------------

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

    // -----------------------------------------
    // 9. Click Post
    // -----------------------------------------

    await clickPostButton(
      postButton
    );

    console.log(
      "Post button clicked."
    );

    // -----------------------------------------
    // 10. Verify result
    // -----------------------------------------

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
    // -----------------------------------------
    // 11. Cleanup temporary files
    // -----------------------------------------

    await cleanupTemporaryPhotos(
      temporaryPhotoDirectory
    );
  }
}