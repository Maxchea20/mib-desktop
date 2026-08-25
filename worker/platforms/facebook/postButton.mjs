const POST_BUTTON_WAIT_MS = 10000;
const POLL_INTERVAL_MS = 500;

export async function findPostButton(page) {
  console.log(
    "Looking for Facebook Post button..."
  );

  const startTime = Date.now();

  while (
    Date.now() - startTime <
    POST_BUTTON_WAIT_MS
  ) {
    const postButtons =
      page.locator(
        '[aria-label="Post"]'
      );

    const count =
      await postButtons.count();

    for (
      let i = 0;
      i < count;
      i++
    ) {
      const button =
        postButtons.nth(i);

      if (
        await button
          .isVisible()
          .catch(() => false)
      ) {
        console.log(
          "✅ Facebook Post button found."
        );

        return button;
      }
    }

    // Fallback: visible exact "Post" text
    const postText =
      page.getByText(
        "Post",
        {
          exact: true,
        }
      );

    const textCount =
      await postText.count();

    for (
      let i = 0;
      i < textCount;
      i++
    ) {
      const element =
        postText.nth(i);

      if (
        !(await element
          .isVisible()
          .catch(() => false))
      ) {
        continue;
      }

      const parent =
        element.locator(
          'xpath=ancestor-or-self::*[@role="button" or self::button or @aria-label="Post"][1]'
        );

      if (
        await parent.count() > 0
      ) {
        const clickable =
          parent.first();

        if (
          await clickable
            .isVisible()
            .catch(() => false)
        ) {
          console.log(
            "✅ Facebook Post button found through fallback."
          );

          return clickable;
        }
      }

      console.log(
        "✅ Visible Post element found."
      );

      return element;
    }

    await page.waitForTimeout(
      POLL_INTERVAL_MS
    );
  }

  return null;
}

export async function clickPostButton(
  postButton
) {
  console.log(
    "Post button found."
  );

  const disabled =
    await postButton
      .isDisabled()
      .catch(() => false);

  if (disabled) {
    throw new Error(
      "Facebook Post button is still disabled after entering the message."
    );
  }

  await postButton.click();

  console.log(
    "Post button clicked."
  );
}