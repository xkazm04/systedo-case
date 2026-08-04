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

/** Land on the table, syncing the sample data first if this is a fresh DB.
 *
 *  Cold-start ordering matters here: the page first renders a loading skeleton
 *  while the initial GET /api/campaigns resolves — seconds on a cold server
 *  that is compiling the route (a fresh CI runner, a first local run). The old
 *  instant `sync.isVisible()` check raced that skeleton: it returned false
 *  before the empty state had ever rendered, the click never happened, and the
 *  spec then timed out waiting for a table nobody asked to sync (verified cold:
 *  button count is 0 at that instant and no POST ever fires). So wait for the
 *  page to reach one of its two terminal states — empty state (fresh DB) or
 *  table (already synced) — before deciding whether to click. */
async function ensureSynced(page: Page) {
  await page.goto("/kampane");
  const sync = page.getByRole("button", { name: "Synchronizovat z Google Ads" });
  const header = page.getByRole("columnheader", { name: "Priorita" });
  await expect(sync.or(header).first()).toBeVisible({ timeout: 30_000 });
  if (await sync.isVisible()) {
    await sync.click();
  }
  // 30s: the sync POST also cold-compiles its route handler on a fresh server.
  await expect(header).toBeVisible({ timeout: 30_000 });
}

test.describe("/kampane — triage", () => {
  test("summarises and flags campaigns that breach a rule", async ({ page }) => {
    await ensureSynced(page);

    // Summary banner headline. Scoped to the banner's <p>: TypeBreakdown now
    // renders the same phrase in a per-type pill for every breaching campaign
    // type, so a bare getByText resolves to 5 elements and trips strict mode.
    await expect(
      page.locator("p").filter({ hasText: /vyžad(uje|ují) pozornost/ }).first()
    ).toBeVisible();

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
