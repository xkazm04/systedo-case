import { test, expect, type Page } from "@playwright/test";

/**
 * Smoke coverage for every PUBLIC surface that claims to demo the product:
 *
 *   /                   the homepage — its three demonstrating bands
 *   /kampane            campaign triage on the demo tenant
 *   /knihovna           the winning-patterns library
 *   /socialni           the social center
 *   /dashboard          the demo app shell (portfolio overview)
 *   /dashboard?m=kanaly the free-channel module inside that shell
 *   /kanaly-zdarma      the free-channel feature page
 *   /lokalni-seo        the local-SEO showcase
 *
 * WHAT THIS IS FOR. Each of these pages is reachable with no account, and each
 * is cited on the marketing surfaces as evidence the product is real. Until this
 * file, four of them had no e2e coverage at all: a page that had quietly become
 * an empty box, a spinner or a 500 would have kept its link on the homepage and
 * nothing would have said so. The assertions are deliberately shallow — one
 * headline element per page, the thing a visitor came to see — because the deep
 * behaviour of /kampane and /kanaly already has its own spec
 * (kampane-triage.spec.ts, kanaly.spec.ts) and duplicating it here would just
 * make two files fail for one reason.
 *
 * KEYLESS AND ACCOUNTLESS BY DESIGN. Nothing here signs in and nothing calls a
 * model. Every page below renders from deterministic fixtures or from the
 * anonymous "sample" tenant, so the suite is reproducible on a bare CI runner
 * with no GEMINI_API_KEY and no Google OAuth.
 *
 * LOCALE. The default locale is `en` (DEFAULT_LOCALE in src/lib/format), but the
 * locale is a cookie and a run against a browser that carries `cs` is legitimate,
 * so every user-facing matcher accepts both columns of the copy table.
 *
 * Run:  npm run test:e2e -- public-demos
 */

/** A public page must never answer with the framework's error boundary. */
async function gotoPublic(page: Page, path: string) {
  const response = await page.goto(path, { waitUntil: "domcontentloaded", timeout: 60_000 });
  expect(response?.status(), `${path} responded ${response?.status()}`).toBeLessThan(400);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30_000 });
}

test.describe("public demo surfaces", () => {
  test("/ demonstrates the core path, the module registry and the FAQ", async ({ page }) => {
    await gotoPublic(page, "/");

    // 1. THE WALKTHROUGH. Its whole claim is that each step shows the product's
    // real output, so the assertions are on DERIVED values, not on prose: the
    // demo fixture's own domain (src/lib/demo/projects.ts) in the open first
    // step, and a ranked list whose fit scores are numbers.
    const walk = page.locator("#core-path");
    await expect(walk).toBeVisible();
    await expect(walk.getByText("mionelo.cz")).toBeVisible();

    // The stepper is a native <details name> accordion — zero client JS. The
    // ranked panel is in the HTML but closed, and opening it is what a reader
    // does. Both halves are asserted: if the accordion silently stopped
    // toggling, "the rows exist in the DOM" would still pass on its own.
    const ranked = walk.locator("ol > li");
    await expect(ranked).toHaveCount(3);
    await expect(ranked.first()).toBeHidden();
    await walk.getByText(/Dostanete seřazený plán|You get a ranked plan/).click();
    await expect(ranked.first()).toBeVisible();
    // A fit score, i.e. a number the seeded plan computed — not a typed claim.
    await expect(ranked.first()).toContainText(/\d+/);

    // 2. THE MODULE GRID, derived from src/lib/projects/modules.ts. Assert a
    // section heading AND a module name from the registry: a grid that rendered
    // its framing copy with an empty module list would pass the first alone.
    const modules = page.locator("#moduly");
    await expect(modules.getByRole("heading", { name: /^(Akvizice|Acquisition)$/ })).toBeVisible();
    await expect(modules.getByText(/^(Kanály zdarma|Free channels)$/).first()).toBeVisible();

    // 3. THE FAQ. Same accordion; the answer carries a link into /cena, which is
    // where the "free during validation" claim is substantiated.
    const faq = page.locator("#faq");
    await faq.getByRole("heading", { name: /Kolik to stojí|What does it cost/ }).click();
    await expect(faq.getByRole("link", { name: /bezplatném plánu|free plan covers/ })).toBeVisible();
  });

  test("/kampane reaches one of its two terminal states", async ({ page }) => {
    await gotoPublic(page, "/kampane");
    // Cold DB → the empty state with its sync affordance; already synced → the
    // triage table. Both are correct; a spinner that never resolves is not.
    const sync = page.getByRole("button", { name: /Synchronizovat z Google Ads|Sync from Google Ads/ });
    const priority = page.getByRole("columnheader", { name: /^(Priorita|Priority)$/ });
    await expect(sync.or(priority).first()).toBeVisible({ timeout: 30_000 });
  });

  test("/knihovna renders both library sections and never a blank auto section", async ({ page }) => {
    await gotoPublic(page, "/knihovna");
    await expect(page.getByRole("heading", { name: /Vaše knihovna|Your library/ })).toBeVisible({
      timeout: 30_000,
    });
    const auto = page.getByRole("heading", { name: /Automaticky rozpoznané|Auto-detected/ });
    await expect(auto).toBeVisible();

    // The auto half has three honest answers — patterns, "no data yet", or "the
    // library could not be loaded". It must say one of them; silence is the bug
    // this asserts against (the route used to swallow a failed read into an
    // empty body, which rendered as "sync campaigns" — advice an anonymous
    // visitor cannot take).
    const cards = page.getByRole("heading", { level: 3 });
    const explained = page.getByText(
      /Zatím nejsou data k analýze|No data to analyze yet|nepodařilo načíst|could not be loaded/
    );
    await expect(cards.first().or(explained.first())).toBeVisible({ timeout: 30_000 });
  });

  test("/socialni renders the social center's own surfaces", async ({ page }) => {
    await gotoPublic(page, "/socialni");
    await expect(page.getByRole("heading", { name: /Příspěvky|Posts/ })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole("heading", { name: /Schránka|Inbox/ })).toBeVisible();
  });

  test("/dashboard renders the demo shell's portfolio overview", async ({ page }) => {
    await gotoPublic(page, "/dashboard");
    await expect(page.getByRole("heading", { name: /Přehled portfolia|Portfolio overview/ })).toBeVisible(
      { timeout: 30_000 }
    );
    // The overview is a table of real fixture rows, not an empty shell.
    await expect(page.locator("tbody tr").first()).toBeVisible({ timeout: 30_000 });
  });

  test("/dashboard?m=kanaly reaches the free-channel module through the demo shell", async ({ page }) => {
    // The impact analysis could not determine whether the kanaly demo case was
    // reachable (DemoShell has no literal "kanaly" — its nav is derived from
    // MODULES). It is: this pins the reachability, not just the case existing.
    await gotoPublic(page, "/dashboard?m=kanaly");
    await expect(page.getByRole("heading", { name: /Kanály zdarma|Free channels/ }).first()).toBeVisible({
      timeout: 30_000,
    });
    const rows = page.locator("tbody tr");
    await expect(rows.first()).toBeVisible({ timeout: 30_000 });
    expect(await rows.count()).toBeGreaterThan(3);
  });

  test("/kanaly-zdarma renders the seeded plan it advertises", async ({ page }) => {
    await gotoPublic(page, "/kanaly-zdarma");
    // The page's whole claim is that the table is the product's real output, so
    // the assertion is on the rows — and on a channel name that comes from the
    // curated catalog rather than from this file's imagination.
    await expect(page.getByRole("cell", { name: "Google Business Profile" })).toBeVisible({
      timeout: 30_000,
    });
    expect(await page.locator("tbody tr").count()).toBeGreaterThan(3);
    // The derived counts must render as numbers, never as an empty stat tile.
    await expect(page.getByText(/rodin kanálů|channel families/)).toBeVisible();
  });

  test("/lokalni-seo renders the local-SEO showcase", async ({ page }) => {
    await gotoPublic(page, "/lokalni-seo");
    await expect(
      page.getByRole("heading", { name: /lokální dominanci|local dominance/ })
    ).toBeVisible({ timeout: 30_000 });
  });
});
