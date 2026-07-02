import { test, expect } from "@playwright/test";

/**
 * Hover-to-copy heading anchor permalinks on the article page (/clanek).
 *
 * The page is fully server-rendered (no API key, deterministic), so this is a
 * stable behavioural test. It covers the three observable effects of clicking a
 * heading's "#" button: the deep link is copied, the address bar reflects the
 * #anchor, a confirmation toast flashes, and the sticky TOC slides its
 * active-section highlight to the copied section.
 *
 * Run:  npm run test:e2e -- clanek-anchors
 */

// Reading the clipboard back needs explicit permission in headless Chromium.
test.use({ permissions: ["clipboard-read", "clipboard-write"] });

test.describe("/clanek heading anchors", () => {
  test.beforeEach(async ({ page }) => {
    // Snap animations to their end state so the toast is observed deterministically.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/clanek");
  });

  test("copies a section permalink, toasts, and syncs the TOC highlight", async ({ page }) => {
    const section = "Jak poznat kvalitu při nákupu"; // id="kvalita"

    const copyButton = page.getByRole("button", {
      name: `Kopírovat odkaz na sekci: ${section}`,
    });
    await copyButton.click();

    // 1) deep link landed on the clipboard
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toMatch(/\/clanek#kvalita$/);

    // 2) the address bar reflects the section anchor
    await expect(page).toHaveURL(/#kvalita$/);

    // 3) the confirmation toast announces the copy
    await expect(page.getByRole("status")).toContainText("Odkaz na sekci zkopírován");

    // 4) the sticky TOC highlights the copied section
    const toc = page.getByRole("navigation", { name: "Obsah článku" });
    await expect(toc.getByRole("link", { name: section })).toHaveAttribute("aria-current", "true");
  });
});

test.describe("/clanek mobile table of contents", () => {
  // Below the lg breakpoint the sticky TOC rail doesn't exist; the collapsible
  // <details> island is the only in-page navigation mobile readers get.
  test.use({ viewport: { width: 390, height: 844 } });

  test("expands, jumps to a section and collapses after the tap", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/clanek");

    // The desktop rail is display:none at this viewport, so the accessible
    // "Obsah článku" navigation resolves uniquely to the mobile island.
    const summary = page.locator("summary", { hasText: "Obsah článku" });
    await expect(summary).toBeVisible();
    await summary.click();

    const link = page
      .getByRole("navigation", { name: "Obsah článku" })
      .getByRole("link", { name: "Jak poznat kvalitu při nákupu" });
    await link.click();

    // the anchor jump landed on the section…
    await expect(page).toHaveURL(/#kvalita$/);
    await expect(page.locator("#kvalita")).toBeInViewport();
    // …and the panel collapsed so it doesn't cover the content
    await expect(link).not.toBeVisible();
  });
});
