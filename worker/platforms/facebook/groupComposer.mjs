const COMPOSER_OPEN_TIMEOUT = 20000;
const POLL_INTERVAL_MS = 500;

function isCommentLikeEditor(
  ariaLabel,
  ariaPlaceholder
) {
  const label =
    `${ariaLabel || ""} ${ariaPlaceholder || ""}`
      .toLowerCase();

  return (
    label.includes("comment") ||
    label.includes("answer as") ||
    label.includes("reply")
  );
}

async function isUsablePostEditor(
  editor
) {
  if (
    !(await editor
      .isVisible()
      .catch(() => false))
  ) {
    return false;
  }

  const ariaLabel =
    await editor
      .getAttribute("aria-label")
      .catch(() => "");

  const ariaPlaceholder =
    await editor
      .getAttribute("aria-placeholder")
      .catch(() => "");

  if (
    isCommentLikeEditor(
      ariaLabel,
      ariaPlaceholder
    )
  ) {
    return false;
  }

  return true;
}

async function findPostEditor(page) {
  const startTime = Date.now();

  while (
    Date.now() - startTime <
    COMPOSER_OPEN_TIMEOUT
  ) {
    // -----------------------------------------
    // 1. Exact Facebook Create Post editor
    // -----------------------------------------

    const postEditors =
      page.locator(
        '[aria-placeholder*="Create a public post"]'
      );

    const postEditorCount =
      await postEditors.count();

    for (
      let i = 0;
      i < postEditorCount;
      i++
    ) {
      const editor =
        postEditors.nth(i);

      if (
        await isUsablePostEditor(
          editor
        )
      ) {
        console.log(
          "✅ Facebook post editor found."
        );

        return editor;
      }
    }

    // -----------------------------------------
    // 2. Dialog-scoped contenteditable
    // -----------------------------------------
    // This is important because Facebook may
    // render the Create Post editor inside a
    // dialog before the aria-placeholder is
    // fully populated.
    // -----------------------------------------

    const dialogs =
      page.locator(
        '[role="dialog"]'
      );

    const dialogCount =
      await dialogs.count();

    for (
      let i = 0;
      i < dialogCount;
      i++
    ) {
      const dialog =
        dialogs.nth(i);

      if (
        !(await dialog
          .isVisible()
          .catch(() => false))
      ) {
        continue;
      }

      const dialogEditors =
        dialog.locator(
          '[contenteditable="true"]'
        );

      const count =
        await dialogEditors.count();

      for (
        let j = 0;
        j < count;
        j++
      ) {
        const editor =
          dialogEditors.nth(j);

        if (
          await isUsablePostEditor(
            editor
          )
        ) {
          console.log(
            "✅ Facebook post editor found inside Create Post dialog."
          );

          return editor;
        }
      }
    }

    // -----------------------------------------
    // 3. Global contenteditable + textbox
    // -----------------------------------------

    const editors =
      page.locator(
        '[contenteditable="true"][role="textbox"]'
      );

    const editorCount =
      await editors.count();

    for (
      let i = 0;
      i < editorCount;
      i++
    ) {
      const editor =
        editors.nth(i);

      if (
        await isUsablePostEditor(
          editor
        )
      ) {
        console.log(
          "✅ Facebook post editor found through textbox fallback."
        );

        return editor;
      }
    }

    // -----------------------------------------
    // 4. Last-resort visible contenteditable
    // -----------------------------------------

    const visibleEditors =
      page.locator(
        '[contenteditable="true"]'
      );

    const visibleCount =
      await visibleEditors.count();

    for (
      let i = 0;
      i < visibleCount;
      i++
    ) {
      const editor =
        visibleEditors.nth(i);

      if (
        await isUsablePostEditor(
          editor
        )
      ) {
        console.log(
          "✅ Facebook post editor found through visible contenteditable fallback."
        );

        return editor;
      }
    }

    await page.waitForTimeout(
      POLL_INTERVAL_MS
    );
  }

  return null;
}

export async function openGroupComposer(
  page
) {
  console.log(
    'Looking for "Write something..." composer...'
  );

  const writeSomething =
    page.getByText(
      "Write something...",
      {
        exact: true,
      }
    );

  const count =
    await writeSomething.count();

  for (
    let i = 0;
    i < count;
    i++
  ) {
    const element =
      writeSomething.nth(i);

    if (
      !(await element
        .isVisible()
        .catch(() => false))
    ) {
      continue;
    }

    console.log(
      '"Write something..." found. Opening composer...'
    );

    await element.click();

    console.log(
      "Create post dialog opened."
    );

    // Give Facebook's modal/editor a moment
    // to finish rendering before polling.
    await page.waitForTimeout(
      1000
    );

    const editor =
      await findPostEditor(page);

    if (editor) {
      return editor;
    }

    console.log(
      "Post editor did not appear."
    );
  }

  return null;
}

export async function fillGroupComposer(
  composer,
  message
) {
  console.log(
    "Clicking post textbox..."
  );

  await composer.click();

  await composer.fill(
    message
  );

  console.log(
    "✅ Message entered into post composer."
  );
}