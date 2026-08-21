import { chromium } from "playwright";

async function main() {
  console.log("Starting MIB Browser Engine...");

  const browser = await chromium.launch({
    headless: false,
  });

  const page = await browser.newPage();

  console.log("Opening test page...");

  await page.goto("https://example.com", {
    waitUntil: "domcontentloaded",
  });

  const title = await page.title();

  console.log("Page title:", title);
  console.log("Page URL:", page.url());

  await page.waitForTimeout(5000);

  await browser.close();

  console.log("Browser test completed successfully.");
}

main().catch((error) => {
  console.error("Browser test failed:");
  console.error(error);
  process.exit(1);
});