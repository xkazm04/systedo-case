import { test, expect } from "@playwright/test";

/**
 * Structural + visual-regression coverage for the living design system
 * (/design-system). The page is fully server-rendered from the design tokens in
 * globals.css, so it needs no API key and is deterministic — making it a stable
 * full-page screenshot baseline.
 *
 * On first run (or after an intentional design change) refresh the baseline:
 *   npx playwright test design-system --update-snapshots
 *
 * Run:  npm run test:e2e -- design-system
 */

test.describe("/design-system", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/design-system");
  });

  test("renders every showcase section", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Design system na jedné obrazovce" })).toBeVisible();

    // each token/component section is present
    for (const id of ["ds-colors", "ds-typography", "ds-buttons", "ds-pills", "ds-icons", "ds-sparklines", "ds-deltabadge", "ds-elevation"]) {
      await expect(page.getByTestId(id)).toBeVisible();
    }
  });

  test("DeltaBadge matrix renders the significance states", async ({ page }) => {
    const section = page.getByTestId("ds-deltabadge");
    // the sub-threshold delta collapses to the explicit "no change" state
    await expect(section.getByText("beze změny", { exact: true })).toBeVisible();
    // a statistically insignificant change renders muted with the noise tooltip
    await expect(section.locator('[title*="statisticky nevýznamná"]').first()).toBeVisible();
  });

  test("colour ramps and base tokens render swatches", async ({ page }) => {
    const colors = page.getByTestId("ds-colors");
    // the brand ramp endpoints, read live from globals.css token names
    await expect(colors.getByText("brand-50", { exact: true })).toBeVisible();
    await expect(colors.getByText("brand-900", { exact: true })).toBeVisible();
    // a single-value base token
    await expect(colors.getByText("canvas", { exact: true })).toBeVisible();
  });

  test("shows all six Pill tones", async ({ page }) => {
    const pills = page.getByTestId("ds-pills");
    for (const tone of ["brand", "navy", "positive", "negative", "neutral", "coral"]) {
      await expect(pills.getByText(`tone="${tone}"`)).toBeVisible();
    }
  });

  test("lists the full icon set with names", async ({ page }) => {
    const icons = page.getByTestId("ds-icons");
    // a representative spread of the exported icon names
    for (const name of ["Logo", "ArrowRight", "Sparkles", "TrendUp", "Copy"]) {
      await expect(icons.getByText(name, { exact: true })).toBeVisible();
    }
  });

  test("full-page visual baseline", async ({ page }) => {
    // disable animations so the snapshot is stable frame-to-frame
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(page).toHaveScreenshot("design-system.png", {
      fullPage: true,
      animations: "disabled",
    });
  });
});
