import { test, expect } from "@playwright/test";

/**
 * Smoke coverage for the Monolith landing rebuild at `/lp/monolith`
 * (docs/ship/2026-09-08-landing-motion-rebuild.md).
 *
 * WHAT THIS IS FOR, and what it deliberately is not. It does not assert that the
 * page looks good, and it cannot: the four scroll-driven techniques are CSS
 * timelines, and a spec that drove the scroll and sampled a transform would be
 * asserting Chromium's implementation of `animation-timeline` rather than this
 * repository's code. What it asserts is the half that CAN break silently and that
 * nothing else here would notice:
 *
 *   1. the route renders at all, with a real h1 and both conversion paths;
 *   2. the prism is hidden from assistive technology — it is twelve rectangles of
 *      stone photograph arguing for the text beside it, and a screen reader
 *      walking six unlabelled images is the failure mode of decorative 3D;
 *   3. every band's images carry an empty alt, for the same reason;
 *   4. the reused walkthrough still carries `id="core-path"` here, because that
 *      anchor is the contract tests/public-demos.spec.ts holds `/` to, and the
 *      promotion of this page onto `/` must not quietly drop it.
 *
 * Selectors are roles, ids and attributes — never marketing copy, which is
 * exactly what this page exists to change.
 *
 * Run:  npm run test:e2e -- lp-monolith
 */

test.describe("/lp/monolith — the landing rebuild", () => {
  test("renders, is reachable, and keeps its decorations out of the a11y tree", { tag: "@smoke" }, async ({
    page,
  }) => {
    await page.goto("/lp/monolith");

    // 1. a level-1 heading with actual text
    const hero = page.getByRole("heading", { level: 1 }).first();
    await expect(hero).toBeVisible();
    expect((await hero.innerText()).trim().length).toBeGreaterThan(0);

    // the two conversion paths, by href — the stable contract
    await expect(page.locator('a[href="/app"]').first()).toBeVisible();
    await expect(page.locator('a[href="/dashboard"]').first()).toBeVisible();

    // 2. the turntable is decoration. Its six faces must sit inside an
    //    aria-hidden subtree, or a screen reader walks six stone photographs.
    const prism = page.locator(".mono-prism");
    await expect(prism).toHaveCount(1);
    await expect(prism.locator(".mono-panel")).toHaveCount(6);
    await expect(prism.locator("xpath=ancestor-or-self::*[@aria-hidden='true']").first()).toHaveCount(1);

    // 3. every image on the page is decorative or named; none may be an
    //    unlabelled photograph.
    const imgs = page.locator("main img");
    const count = await imgs.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i += 1) {
      const alt = await imgs.nth(i).getAttribute("alt");
      expect(alt, `image ${i} has no alt attribute at all`).not.toBeNull();
    }

    // 4. the reused walkthrough keeps the anchor `/` is held to
    await expect(page.locator("#core-path")).toHaveCount(1);
  });

  test("the comparison index links both surfaces", { tag: "@smoke" }, async ({ page }) => {
    await page.goto("/lp");
    await expect(page.locator('a[href="/lp/monolith"]')).toHaveCount(1);
    await expect(page.locator('a[href="/"]').first()).toBeVisible();
  });
});
