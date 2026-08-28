import { existsSync } from "node:fs";
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
 * LOCALE. This file is the one spec that deliberately does NOT pin `cs` (the way
 * kampane-triage / clanek-anchors / dashboard-comparison do via
 * tests/support.ts): the committed visual baseline was captured in the app's
 * DEFAULT_LOCALE (`en`), and pinning a locale here would silently invalidate it.
 * Which language the visual reference speaks is a decision that belongs with the
 * default-locale owner, so the two copy assertions accept both columns instead —
 * the same contract tests/public-demos.spec.ts states for the public surfaces.
 *
 * Run:  npm run test:e2e -- design-system
 */

test.describe("/design-system", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/design-system");
  });

  test("renders every showcase section", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: /Design system na jedné obrazovce|The design system on one screen/ })
    ).toBeVisible();

    // each token/component section is present
    for (const id of ["ds-colors", "ds-typography", "ds-buttons", "ds-pills", "ds-icons", "ds-sparklines", "ds-deltabadge", "ds-elevation"]) {
      await expect(page.getByTestId(id)).toBeVisible();
    }
  });

  test("DeltaBadge matrix renders the significance states", async ({ page }) => {
    const section = page.getByTestId("ds-deltabadge");
    // the sub-threshold delta collapses to the explicit "no change" state
    await expect(section.getByText(/^(beze změny|no change)$/)).toBeVisible();
    // a statistically insignificant change renders muted with the noise tooltip
    await expect(
      section
        .locator('[title*="statisticky nevýznamná"]')
        .or(section.locator('[title*="not statistically significant"]'))
        .first()
    ).toBeVisible();
  });

  test("colour ramps and base tokens render swatches", async ({ page }) => {
    const colors = page.getByTestId("ds-colors");
    // the brand ramp endpoints, read live from globals.css token names
    await expect(colors.getByText("brand-50", { exact: true })).toBeVisible();
    await expect(colors.getByText("brand-900", { exact: true })).toBeVisible();
    // A single-value base token. .first() because the base-token swatch prints
    // its name twice — an overlay label inside the chip and a caption beneath —
    // where the ramp steps above print it once. Both nodes sit inside the same
    // "Kopírovat název tokenu --color-canvas" button.
    await expect(colors.getByText("canvas", { exact: true }).first()).toBeVisible();
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

  test("full-page visual baseline", async ({ page }, testInfo) => {
    // Baselines are platform-suffixed (…-chromium-<platform>.png) and only the
    // win32 one is committed, so on any other platform (e.g. a Linux CI runner)
    // this assertion can only fail on a missing snapshot — it would be comparing
    // against nothing. Least-magic guard: run the visual check only where a
    // matching baseline actually exists. A new platform opts in explicitly by
    // generating + committing its own baseline:
    //   npx playwright test design-system --update-snapshots
    // (the skip is bypassed while snapshots are being updated, which is exactly
    // how that first baseline gets minted).
    const baseline = testInfo.snapshotPath("design-system.png");
    const mode = testInfo.config.updateSnapshots; // "all" | "changed" | "missing" | "none"
    const updating = mode === "all" || mode === "changed";
    test.skip(
      !existsSync(baseline) && !updating,
      `no committed visual baseline for ${process.platform} — generate one with: npx playwright test design-system --update-snapshots`
    );
    // disable animations so the snapshot is stable frame-to-frame
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(page).toHaveScreenshot("design-system.png", {
      fullPage: true,
      animations: "disabled",
    });
  });
});
