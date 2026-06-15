import { test, expect, type Page } from "@playwright/test";

/**
 * End-to-end coverage for the campaign triage layer (/kampane).
 *
 * Triage runs entirely client-side over the synced numbers, and syncing uses the
 * deterministic sample provider, so this needs no GEMINI_API_KEY and is fully
 * reproducible: the sample portfolio always contains rule-breaching campaigns
 * (a paused-but-spending Video campaign plus several far-below-target prospecting
 * campaigns), while brand Search stays comfortably on target.
 *
 * Run:  npm run test:e2e -- kampane-triage
 */

/** Land on the table, syncing the sample data first if this is a fresh DB. */
async function ensureSynced(page: Page) {
  await page.goto("/kampane");
  const sync = page.getByRole("button", { name: "Synchronizovat z Google Ads" });
  if (await sync.isVisible().catch(() => false)) {
    await sync.click();
  }
  await expect(page.getByRole("columnheader", { name: "Priorita" })).toBeVisible();
}

test.describe("/kampane — triage", () => {
  test("summarises and flags campaigns that breach a rule", async ({ page }) => {
    await ensureSynced(page);

    // summary banner headline
    await expect(page.getByText(/vyžad(uje|ují) pozornost/)).toBeVisible();

    // per-row severity badges render, and the portfolio keeps at least one healthy row
    await expect(page.getByText("Kritické").first()).toBeVisible();
    expect(await page.getByLabel("V pořádku").count()).toBeGreaterThan(0);

    // the "needs attention" filter hides every healthy row
    await page.getByRole("button", { name: /Vyžaduje pozornost/ }).click();
    await expect(page.getByLabel("V pořádku")).toHaveCount(0);
  });

  test("sorts worst-first from the banner CTA", async ({ page }) => {
    await ensureSynced(page);

    await page.getByRole("button", { name: "Seřadit podle priority" }).click();
    await expect(page.getByRole("button", { name: "Seřazeno podle priority" })).toBeVisible();

    // after sorting by priority the first data row (row 0 is the header) is critical
    await expect(page.getByRole("row").nth(1).getByText("Kritické")).toBeVisible();
  });
});
