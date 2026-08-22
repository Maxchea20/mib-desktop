const VERIFICATION_WAIT_MS = 20000;
const POLL_INTERVAL_MS = 1000;

export async function verifyFacebookGroupPost(
  page,
  message
) {
  console.log(
    "Verifying Facebook Group post..."
  );

  const startTime = Date.now();

  while (
    Date.now() - startTime <
    VERIFICATION_WAIT_MS
  ) {
    // -----------------------------------------
    // 1. Check for explicit Facebook success
    // -----------------------------------------

    const bodyText =
      await page
        .locator("body")
        .innerText()
        .catch(() => "");

    const lower =
      bodyText.toLowerCase();

    if (
      lower.includes(
        "your post has been published"
      ) ||
      lower.includes(
        "post published"
      ) ||
      lower.includes(
        "your post is published"
      )
    ) {
      console.log(
        "✅ Facebook explicitly confirmed the post."
      );

      return {
        status: "posted",
        verified: true,
        method:
          "facebook_confirmation",
      };
    }

    // -----------------------------------------
    // 2. Look for obvious Facebook errors
    // -----------------------------------------

    if (
      lower.includes(
        "something went wrong"
      ) ||
      lower.includes(
        "couldn't post"
      ) ||
      lower.includes(
        "could not post"
      ) ||
      lower.includes(
        "post failed"
      )
    ) {
      console.log(
        "❌ Facebook reported a posting error."
      );

      return {
        status: "failed",
        verified: false,
        method:
          "facebook_error",
      };
    }

    // -----------------------------------------
    // 3. Check whether exact message appears
    //    on the Group page.
    // -----------------------------------------

    if (
      message &&
      bodyText.includes(message)
    ) {
      console.log(
        "✅ Exact post message found on the Group page."
      );

      return {
        status: "posted",
        verified: true,
        method:
          "message_visible",
      };
    }

    // -----------------------------------------
    // 4. Check for pending/review language
    // -----------------------------------------

    const pendingIndicators = [
      "pending approval",
      "awaiting approval",
      "post is pending",
      "pending review",
      "submitted for review",
    ];

    const pending =
      pendingIndicators.some(
        (indicator) =>
          lower.includes(indicator)
      );

    if (pending) {
      console.log(
        "⚠ Facebook indicates the post is pending review."
      );

      return {
        status: "review",
        verified: true,
        method:
          "facebook_pending",
      };
    }

    await page.waitForTimeout(
      POLL_INTERVAL_MS
    );
  }

  // -----------------------------------------
  // 5. Final verification attempt
  // -----------------------------------------

  const finalBody =
    await page
      .locator("body")
      .innerText()
      .catch(() => "");

  if (
    message &&
    finalBody.includes(message)
  ) {
    console.log(
      "✅ Exact post message found during final verification."
    );

    return {
      status: "posted",
      verified: true,
      method:
        "final_message_check",
    };
  }

  console.log(
    "⚠ Facebook did not provide definitive post confirmation."
  );

  return {
    status: "review",
    verified: false,
    method: "timeout",
  };
}