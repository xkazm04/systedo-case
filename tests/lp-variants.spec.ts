import { test, expect } from "@playwright/test";

/**
 * Smoke coverage for the three landing-research variants (docs/design/nextgen-landing.md).
 *
 * What is asserted is the half that can break silently: each route renders with a
 * real h1 and the `/app` conversion path; no image ships without an alt attribute;
 * nothing focusable hides inside an `aria-hidden` decoration (the story's stage is
 * one); and, for the instrument, that operating the rail actually changes the board —
 * the lit count for a lead-gen project differs from the e-shop default, which is the
 * product's own claim ("an e-shop does not see what a lead-gen site sees") made
 * checkable. Design quality is judged in docs/design/qa/, not here.
 *
 * Run:  npm run test:e2e -- lp-variants
 */

const ROUTES = ["/lp/story", "/lp/exhibit", "/lp/instrument"] as const;

for (const route of ROUTES) {
  test(`${route} renders, converts, and keeps decorations out of the a11y tree`, { tag: "@smoke" }, async ({ page }) => {
    await page.goto(route);

    const h1 = page.getByRole("heading", { level: 1 }).first();
    await expect(h1).toBeVisible();
    expect((await h1.innerText()).trim().length).toBeGreaterThan(0);
    await expect(page.locator('a[href="/app"]').first()).toBeVisible();

    const imgs = page.locator("main img");
    const n = await imgs.count();
    for (let i = 0; i < n; i += 1) {
      expect(await imgs.nth(i).getAttribute("alt"), `${route}: image ${i} has no alt attribute`).not.toBeNull();
    }

    // a link or button inside an aria-hidden subtree is reachable by keyboard and
    // invisible to a screen reader at once — the worst of both
    const trapped = page.locator('[aria-hidden="true"] a, [aria-hidden="true"] button, [aria-hidden="true"] [tabindex="0"]');
    await expect(trapped).toHaveCount(0);
  });
}

test("/lp/instrument — the rail re-composes the switchboard", { tag: "@smoke" }, async ({ page }) => {
  await page.goto("/lp/instrument");
  const lit = page.locator('.sb-key[data-lit="1"]');
  const before = await lit.count();
  expect(before).toBeGreaterThan(0);

  const buttons = page.getByRole("group").getByRole("button");
  await expect(buttons).toHaveCount(5);
  // the third rail entry is lead-gen in PROJECT_TYPES order (eshop, app, leadgen, …)
  await buttons.nth(2).click();
  await expect(buttons.nth(2)).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => lit.count()).not.toBe(before);
});

test("/lp — the review sheet links all three variants", { tag: "@smoke" }, async ({ page }) => {
  await page.goto("/lp");
  for (const route of ROUTES) await expect(page.locator(`a[href="${route}"]`)).toHaveCount(1);
});
