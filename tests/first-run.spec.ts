import { test, expect } from "@playwright/test";
import { gotoAppHub, signInGate, workspaceHome } from "./support";

/**
 * End-to-end coverage for the first-run critical path:
 *
 *   / (landing) → /app (sign-in gate or workspace) → create a project via the
 *   real form → land on /app/[projectId]/start → the onboarding checklist
 *   renders its type-aware steps.
 *
 * Auth: the local webServer runs with DEV_AUTH=true (playwright.config.ts), so
 * `await auth()` resolves the fixed test user (src/auth.ts — hard-gated off in
 * production builds) and LOCAL_DB=true persists projects to .data/systedo.db
 * (tables are created on demand by src/lib/db.ts — no seed step required; a
 * fresh DB simply renders the first-project form). Against a server where
 * DEV_AUTH is off (e.g. BASE_URL pointed at a deployment) the authed tests
 * self-skip when the sign-in gate renders — mirroring how ai-asistent.spec.ts
 * self-skips without GEMINI_API_KEY — while the landing smoke still runs.
 *
 * Selectors: roles + hrefs only, no marketing copy — the landing's wording is
 * allowed to change without breaking this suite. Czech UI strings are asserted
 * only on the authed surfaces (steps.ts labels), with English alternates where
 * the string tables define them.
 *
 * Run:  npm run test:e2e -- first-run
 */

test.describe("/ — landing", () => {
  // The assertions that make a broken landing undeployable. Structure only
  // (roles + hrefs), so concurrent copy/visual reworks of BrandLanding cannot
  // fail it — if this breaks, navigation itself broke.
  test("hero, primary CTA and footer render", { tag: "@smoke" }, async ({ page }) => {
    await page.goto("/");

    // hero: a level-1 heading with actual text
    const hero = page.getByRole("heading", { level: 1 }).first();
    await expect(hero).toBeVisible();
    expect((await hero.innerText()).trim().length).toBeGreaterThan(0);

    // the two conversion paths: see-the-demo and start-free. Hrefs are the
    // stable contract; the landing renders each at least once.
    await expect(page.locator('a[href="/dashboard"]').first()).toBeVisible();
    await expect(page.locator('a[href="/app"]').first()).toBeVisible();

    // footer: every meta page link (FOOTER_META_PAGES in src/lib/nav.ts)
    const footer = page.getByRole("contentinfo");
    await expect(footer).toBeVisible();
    for (const href of [
      "/cena",
      "/socialni",
      "/knihovna",
      "/kvalita-modelu",
      "/lokalni-seo",
      "/mapa",
      "/design-system",
    ]) {
      await expect(footer.locator(`a[href="${href}"]`)).toBeVisible();
    }
  });
});

test.describe("/app — first run", () => {
  test("shows the sign-in gate (anonymous) or the workspace (DEV_AUTH)", async ({ page }) => {
    // Both states are legitimate; assert whichever rendered is coherent.
    const state = await gotoAppHub(page);
    if (state === "gate") {
      // the conversion wall: the gate's own heading plus the back-to-demo hatch
      await expect(signInGate(page)).toBeVisible();
      await expect(page.locator('a[href="/dashboard"]').first()).toBeVisible();
    } else {
      // the hub: topbar + one of the three headings (first-project form,
      // new-project form, or the project list)
      await expect(workspaceHome(page)).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    }
  });

  test("creates a project via the real form and lands on the Start checklist", async ({ page }) => {
    const state = await gotoAppHub(page);
    test.skip(state === "gate", "DEV_AUTH is off — /app renders the sign-in gate");

    // With zero projects the hub IS the create form; with existing projects
    // (seed:local, prior runs) it's the project list with a "new project" tile.
    const nameField = page.getByLabel(/Název projektu|Project name/);
    if (!(await nameField.isVisible().catch(() => false))) {
      await page.getByRole("button", { name: /^(Nový projekt|New project)$/ }).click();
    }

    // the single-step matrix form (CreateProjectForm); default type = eshop
    await expect(
      page.getByRole("heading", { name: /Vyberte typ a poskládejte moduly|Choose a type and assemble modules/ })
    ).toBeVisible();

    // unique name per run so repeated local runs never collide
    const projectName = `E2E projekt ${Date.now()}`;
    await nameField.fill(projectName);
    await page.getByRole("button", { name: /Vytvořit projekt|Create project/ }).click();

    // new projects land on the Start module (create-project-shared.tsx)
    await page.waitForURL(/\/app\/[^/]+\/start(\?|$)/, { timeout: 60_000 });
    const projectId = new URL(page.url()).pathname.split("/")[2]!;

    try {
      // The onboarding checklist, type-aware (src/lib/onboarding/steps.ts): the
      // default eshop package gets 5 of the 6 defined steps — scan, channels,
      // catalog, costModel, ads. Scope to the checklist card's list: the step
      // label "Naskenovat web" also titles the scan card above it.
      await expect(
        page.getByRole("heading", { name: /Vaše první kroky|Your first steps/ })
      ).toBeVisible({ timeout: 30_000 });

      const checklist = page
        .getByRole("list")
        .filter({ has: page.getByText(/Připojit Google Ads|Connect Google Ads/) });
      await expect(checklist.getByRole("listitem")).toHaveCount(5);
      for (const label of [
        /Naskenovat web|Scan your website/,
        /Naimportovat nabídku|Import your catalog/,
        /Zadat marži a náklady|Enter margin & costs/,
        /Připojit Google Ads|Connect Google Ads/,
        /Vybrat kanály zdarma|Pick free channels/,
      ]) {
        await expect(checklist.getByText(label)).toBeVisible();
      }

      // ORDER, not just membership (ADR-0009): free channels is the first step
      // after the scan, ahead of the Google Ads connection a budget-less tenant
      // cannot complete. A membership-only assertion passed before this change
      // too, which is exactly why the order is pinned here.
      const rows = checklist.getByRole("listitem");
      await expect(rows.nth(0)).toContainText(/Naskenovat web|Scan your website/);
      await expect(rows.nth(1)).toContainText(/Vybrat kanály zdarma|Pick free channels/);
    } finally {
      // best-effort cleanup so repeated runs don't pile projects into the local DB
      await page.request.delete(`/api/projects/${projectId}`).catch(() => {});
    }
  });
});
