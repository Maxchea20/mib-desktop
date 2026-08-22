const PHOTO_BUTTON_TIMEOUT = 10000;
const UPLOAD_WAIT_MS = 15000;

export async function uploadFacebookPhotos(
  page,
  imagePaths
) {
  if (
    !Array.isArray(imagePaths) ||
    imagePaths.length === 0
  ) {
    return;
  }

  console.log("");
  console.log(
    "================================="
  );
  console.log(
    "UPLOADING FACEBOOK PHOTOS"
  );
  console.log(
    "================================="
  );
  console.log(
    "Photos:",
    imagePaths.length
  );

  const photoButton =
    page.locator(
      '[aria-label="Photo/video"]'
    );

  const count =
    await photoButton.count();

  if (count === 0) {
    throw new Error(
      'Could not find Facebook "Photo/video" button.'
    );
  }

  let visibleButton = null;

  for (
    let i = 0;
    i < count;
    i++
  ) {
    const button =
      photoButton.nth(i);

    if (
      await button
        .isVisible()
        .catch(() => false)
    ) {
      visibleButton = button;
      break;
    }
  }

  if (!visibleButton) {
    throw new Error(
      'Facebook "Photo/video" button is not visible.'
    );
  }

  console.log(
    "✅ Photo/video button found."
  );

  const fileChooserPromise =
    page.waitForEvent(
      "filechooser",
      {
        timeout:
          PHOTO_BUTTON_TIMEOUT,
      }
    );

  await visibleButton.click();

  console.log(
    "Photo/video button clicked."
  );

  const fileChooser =
    await fileChooserPromise;

  console.log(
    "✅ Facebook file chooser detected."
  );

  await fileChooser.setFiles(
    imagePaths
  );

  console.log(
    "✅ Photo files selected."
  );

  console.log(
    "Waiting for Facebook to process photos..."
  );

  await page.waitForTimeout(
    UPLOAD_WAIT_MS
  );

  console.log(
    "✅ Photo upload wait completed."
  );
}