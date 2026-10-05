import { expect, test, type Page } from "@playwright/test";

/**
 * The landing page is frozen (spec 0018, AC-1). These screenshots were taken
 * before the landing look reached the other screens, so a shared change that
 * leaks into `/` fails here.
 *
 * The browser clock is fixed and everything the server's clock or the day's
 * bookings decide is masked: the hero's mini board, the booking card (its day
 * strip and hours), the summary beside it, and the picked hours inside the
 * checkout card. What is left is every material the landing owns: the header,
 * type, cards, buttons, spacing and colour.
 *
 * Refresh the baseline only for a deliberate landing change:
 * `npx playwright test e2e/landing-frozen.spec.ts --update-snapshots`.
 */

const FIXED_NOW = new Date("2026-10-05T02:00:00Z");

async function openLanding(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.clock.setFixedTime(FIXED_NOW);
  await page.goto("/");
  await page.locator("#book table, #book [aria-label='Loading court hours']").first().waitFor();
  // A mask hides what is in a box, not how tall it is, and the booking card is
  // as tall as the day's opening hours. Fix the live parts' height so a short
  // day and a long day give the same page. Hide the dev server's own badge.
  await page.addStyleTag({
    content: `
      #book .grid > div:first-child, #book aside { height: 960px !important; overflow: hidden !important; }
      nextjs-portal { display: none !important; }
    `,
  });
  await page.evaluate(() => document.fonts.ready);
}

function liveParts(page: Page) {
  return [
    page.locator("main figure").first(),
    page.locator("#book .grid > div").first(),
    page.locator("#book aside"),
  ];
}

for (const width of [375, 1280]) {
  test(`the landing page at ${width} pixels matches its baseline`, async ({ page }) => {
    await openLanding(page, width);
    await expect(page).toHaveScreenshot(`landing-${width}.png`, {
      fullPage: true,
      mask: liveParts(page),
    });
  });
}

test("the open checkout card matches its baseline", async ({ page }) => {
  await openLanding(page, 1280);

  // Tomorrow onward always has hours that have not started yet.
  const days = page.locator("#book fieldset input[type='radio']:visible");
  const book = page.locator("#book aside").getByRole("button", { name: /^Book/ });
  test.skip((await book.count()) === 0, "Online checkout is off on this server.");

  let picked = false;
  for (let i = 1; i < (await days.count()) && !picked; i++) {
    await days.nth(i).check({ force: true });
    await page.locator("#book [aria-busy='false']").first().waitFor();
    const free = page.locator("#book table button[aria-pressed='false']");
    if ((await free.count()) > 0) {
      await free.first().click();
      picked = true;
    }
  }
  test.skip(!picked, "No free hour in the booking horizon to open checkout with.");

  await book.click();
  const card = page.locator("[data-checkout-card][data-state='open']");
  await card.waitFor();
  await expect(card).toHaveScreenshot("checkout-card.png", {
    mask: [card.locator("section > :first-child")],
  });
});
