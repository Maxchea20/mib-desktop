const ELEMENT_TIMEOUT = 15000;

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
| CLEAN HEADLINE
|--------------------------------------------------------------------------
|
| iProperty rejects headlines that:
|   - contain anything other than letters, numbers and basic punctuation
|     (for example "|" or emoji)
|   - are written in ALL CAPS
|   - are longer than 70 characters
|
| MIB keeps the headline as typed. The worker cleans a copy before typing
| it into iProperty.
|
*/

const HEADLINE_MAX = 70;

// Words kept in capitals when an ALL CAPS headline is converted.
const KEEP_UPPER = new Set([
  "KL", "PJ", "IGB", "CCTV", "AC", "OKU", "RM", "KVA",
  "ID", "PTD", "HDB", "KLIA", "USJ", "MRT", "LRT", "MSC", "SME",
]);

// Small words kept in lower case in Title Case (not at the start).
const SMALL_WORDS = new Set([
  "a", "an", "and", "at", "for", "in", "of", "on", "or", "the", "to", "with",
]);

function titleCaseWord(word, index) {
  const upper = word.toUpperCase();

  // "KL," or "(KL)" keep their capitals too.
  if (KEEP_UPPER.has(upper.replace(/[^\p{L}]/gu, ""))) return upper;

  const lower = word.toLowerCase();

  if (index > 0 && SMALL_WORDS.has(lower)) return lower;

  // Capitalise the first letter of each part ("semi-d" -> "Semi-D" is fine,
  // "o'brien" -> "O'Brien").
  return lower.replace(/(^|[-'/(])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
}

export function cleanHeadline(value) {
  let text = String(value ?? "");

  // Separators and fancy punctuation -> plain ones.
  text = text
    .replace(/[|•·▪►◆■]/g, " - ")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, "")
    .replace(/["]/g, "");

  // Keep letters, numbers, spaces and basic punctuation only.
  text = text.replace(/[^\p{L}\p{N}\s.,'&()\/!?-]/gu, " ");

  // Tidy spaces and doubled separators.
  text = text
    .replace(/\s+/g, " ")
    .replace(/(\s-)+\s*-/g, " -")
    .replace(/\s+([.,!?])/g, "$1")
    .replace(/([.,!?])\1+/g, "$1")
    .replace(/^[\s-]+|[\s-]+$/g, "")
    .trim();

  // ALL CAPS (most letters upper case) -> Title Case.
  const letters = text.replace(/[^\p{L}]/gu, "");
  const upperCount = letters.replace(/[^\p{Lu}]/gu, "").length;

  if (letters.length > 3 && upperCount / letters.length > 0.6) {
    text = text
      .split(" ")
      .map((word, i) => titleCaseWord(word, i))
      .join(" ");
  }

  // Max length, cut at a word boundary.
  if (text.length > HEADLINE_MAX) {
    const cut = text.slice(0, HEADLINE_MAX);
    const lastSpace = cut.lastIndexOf(" ");

    text = (lastSpace > 40 ? cut.slice(0, lastSpace) : cut)
      .replace(/[\s,.\-&/(]+$/g, "")
      .trim();

    // Do not end on "and", "with", "for"...
    const words = text.split(" ");

    const isSmall = (w) => SMALL_WORDS.has(w.toLowerCase());

    while (words.length > 3) {
      const last = words[words.length - 1];
      const prev = words[words.length - 2];

      if (isSmall(last)) {
        words.pop();
      } else if (/^\d+$/.test(last) && isSmall(prev)) {
        words.pop();
        words.pop();
      } else {
        break;
      }
    }

    text = words.join(" ").replace(/[\s,.\-&/(]+$/g, "");
  }

  return text;
}

/*
|--------------------------------------------------------------------------
| FILL TEXT FIELD
|--------------------------------------------------------------------------
*/

async function fillTextField(
  page,
  fieldName,
  locators,
  value
) {
  if (
    value === null ||
    value === undefined ||
    String(value).trim() === ""
  ) {
    throw new Error(
      `Listing is missing ${fieldName}.`
    );
  }

  const text =
    String(value);

  const input =
    await findVisible(
      locators
    );

  if (!input) {
    throw new Error(
      `Could not find ${fieldName} input.`
    );
  }

  await input.scrollIntoViewIfNeeded();

  await input.fill(
    text
  );

  await page.waitForTimeout(
    300
  );

  const actualValue =
    await input
      .inputValue()
      .catch(() => "");

  if (
    actualValue.trim() !==
    text.trim()
  ) {
    throw new Error(
      `${fieldName} verification failed. Expected "${text}", got "${actualValue}".`
    );
  }

  console.log(
    `✅ ${fieldName} entered.`
  );
}

/*
|--------------------------------------------------------------------------
| CLICK NEXT
|--------------------------------------------------------------------------
*/

async function clickNext(
  page
) {
  const next =
    await findVisible(
      [
        page.locator(
          '[da-id="footer-next-button"]'
        ),

        page.getByRole(
          "button",
          {
            name: "Next",
            exact: true,
          }
        ),
      ]
    );

  if (!next) {
    throw new Error(
      'Could not find "Next" button on Description page.'
    );
  }

  await next.scrollIntoViewIfNeeded();

  console.log(
    "🖱️ Clicking Description -> Next"
  );

  await next.click();

  await page.waitForTimeout(
    2000
  );

  console.log(
    "✅ Description Next clicked."
  );
}

/*
|--------------------------------------------------------------------------
| MAIN DESCRIPTION HANDLER
|--------------------------------------------------------------------------
*/

export async function handleDescription(
  page,
  listing
) {
  console.log("");

  console.log(
    "================================="
  );

  console.log(
    "IPROPERTY DESCRIPTION"
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
      "Listing data was not provided to iProperty Description."
    );
  }

  console.log(
    "MIB Listing ID:",
    listing.id
  );

  console.log(
    "Headline:",
    listing.headline
  );

  console.log(
    "Description length:",
    listing.description
      ? String(listing.description).length
      : 0
  );

  /*
  |--------------------------------------------------------------------------
  | HEADLINE
  |--------------------------------------------------------------------------
  */

  const headline =
    cleanHeadline(
      listing.headline
    );

  if (headline !== String(listing.headline ?? "").trim()) {
    console.log(
      "Headline cleaned for iProperty:"
    );
    console.log(
      "  from:",
      listing.headline
    );
    console.log(
      "  to:  ",
      headline
    );
  }

  await fillTextField(
    page,
    "Headline",
    [
      page.getByPlaceholder(
        "A short sentence to describe the highlights",
        {
          exact: true,
        }
      ),
    ],
    headline
  );

  /*
  | If iProperty still rejects the headline, say so clearly.
  */
  const headlineError =
    await page
      .getByText(
        /headlines? may only contain|headline.*(not allowed|invalid|all caps)/i
      )
      .first()
      .isVisible()
      .catch(() => false);

  if (headlineError) {
    throw new Error(
      `iProperty rejected the headline: "${headline}". Check it for symbols or capital letters.`
    );
  }

  /*
  |--------------------------------------------------------------------------
  | DESCRIPTION
  |--------------------------------------------------------------------------
  */

  await fillTextField(
    page,
    "Description",
    [
      page.getByPlaceholder(
        "Describe the property and its surroundings",
        {
          exact: true,
        }
      ),
    ],
    listing.description
  );

  /*
  |--------------------------------------------------------------------------
  | NEXT
  |--------------------------------------------------------------------------
  */

  await clickNext(
    page
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
    "✅ IPROPERTY DESCRIPTION COMPLETED"
  );

  console.log(
    "================================="
  );

  console.log(
    "Headline:",
    listing.headline
  );

  console.log(
    "Description loaded from Supabase."
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
      "description_completed",

    headline:
      listing.headline,

    description:
      listing.description,

    url:
      page.url(),
  };
}