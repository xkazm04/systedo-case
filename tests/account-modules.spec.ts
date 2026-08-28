import { test, expect, type Page } from "@playwright/test";
import { gotoAppHub } from "./support";

/**
 * End-to-end coverage for the four ACCOUNT-LEVEL module routes — the ones with no
 * project-type gate, so every user of every project type has them in the sidebar:
 *
 *   /app/[projectId]/ucet       — profile, honest security checklist, session card
 *   /app/[projectId]/nastaveni  — project settings + the account-wide BYOM panels
 *   /app/[projectId]/aktivita   — live feed, seeded fallback, or outage state
 *   /app/[projectId]/integrace  — connector readiness board
 *
 * Before this file the suite never opened a /app/[projectId]/* route at all, so a
 * page that threw on render (a bad server read, a client/server boundary slip)
 * shipped green. These are deliberately STATE assertions, not copy assertions:
 * each page has a small set of legitimate outcomes and the test pins that one of
 * them rendered, which is what makes it stable against a Firestore that may or may
 * not answer from a dev machine.
 *
 * Auth: same contract as first-run.spec.ts — the local webServer runs DEV_AUTH=true
 * + LOCAL_DB=true, and against a target where DEV_AUTH is off the whole describe
 * self-skips at the sign-in gate.
 *
 * Run:  npm run test:e2e -- account-modules
 */

/** The module's own page header. ModulePage renders the title as an h2; the
 *  topbar renders the SAME label as the h1, so the level matters here.
 *
 *  `.first()` throughout this file is deliberate, matching the rest of the suite:
 *  the dev server keeps a hidden copy of some client-boundary markup in the DOM,
 *  which trips Playwright's strict mode even though the accessibility tree — what
 *  a user or a screen reader gets — contains exactly one. */
function moduleHeading(page: Page, name: RegExp) {
  return page.getByRole("heading", { level: 2, name }).first();
}

test.describe.serial("/app/[projectId] — account-level modules", () => {
  /** Scratch project shared by the whole describe; deleted by the last test. */
  let projectId = "";

  test("creates a scratch project to hang the module routes on", async ({ page }) => {
    const state = await gotoAppHub(page);
    test.skip(state === "gate", "DEV_AUTH is off — /app renders the sign-in gate");

    // Straight through the real API rather than the form: this file is about the
    // module pages, and first-run.spec.ts already owns the creation flow.
    const res = await page.request.post("/api/projects", {
      data: { name: `E2E account ${Date.now()}`, type: "eshop" },
    });
    expect(res.ok(), `POST /api/projects → ${res.status()}`).toBeTruthy();
    const body = (await res.json()) as { project?: { id?: string }; id?: string };
    projectId = body.project?.id ?? body.id ?? "";
    expect(projectId, "created project id").not.toEqual("");
  });

  test("/ucet renders the profile, the honest checklist and a session state", async ({ page }) => {
    test.skip(!projectId, "no scratch project");
    await page.goto(`/app/${projectId}/ucet`);

    await expect(moduleHeading(page, /Účet & zabezpečení|Account & security/)).toBeVisible({
      timeout: 45_000,
    });

    // Profile: the email is masked for display (compute.ts maskEmail), so the
    // bullet character is the end-to-end proof the mask actually ran.
    await expect(page.getByText(/^(Profil|Profile)$/).first()).toBeVisible();
    await expect(page.getByText(/•/).first()).toBeVisible();

    // All four checklist rows, including the two that are honestly "unavailable"
    // rather than green (SSO + session under dev-auth, 2FA always).
    for (const row of [
      /E-mailová adresa|Email address/,
      /Přihlášení přes Google \(SSO\)|Google sign-in \(SSO\)/,
      /^(Aktivní relace|Active session)$/,
      /Dvoufaktorové ověření|Two-factor authentication/,
    ]) {
      await expect(page.getByText(row).first()).toBeVisible();
    }

    // The sessions card has exactly two legitimate shapes: the dev-auth note, or
    // the real controls. Never nothing, and never both.
    const devNote = page.getByText(/Vývojové přihlášení \(DEV_AUTH\)|Dev sign-in \(DEV_AUTH\)/);
    const signOutAll = page.getByRole("button", { name: /Odhlásit se všude|Sign out everywhere/ });
    await expect(devNote.or(signOutAll).first()).toBeVisible();
  });

  test("/nastaveni renders the settings form and the data-source badge", async ({ page }) => {
    test.skip(!projectId, "no scratch project");
    await page.goto(`/app/${projectId}/nastaveni`);

    await expect(moduleHeading(page, /^(Nastavení|Settings)$/)).toBeVisible({ timeout: 45_000 });

    // The data-source card: a fresh project has synced nothing, so the honest
    // badge is the sample one — never "živá data" on an unsynced project.
    await expect(page.getByText(/^(Zdroj dat|Data source)$/).first()).toBeVisible();
    await expect(page.getByText(/^(Ukázková data|Sample data)$/).first()).toBeVisible();

    // The form itself, prefilled from the project.
    await expect(page.getByLabel(/Název projektu|Project name/).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Uložit změny|Save changes/ }).first()).toBeVisible();
  });

  test("/aktivita resolves to one of its three legitimate states", async ({ page }) => {
    test.skip(!projectId, "no scratch project");
    await page.goto(`/app/${projectId}/aktivita`);

    await expect(moduleHeading(page, /^(Aktivita|Activity)$/)).toBeVisible({ timeout: 45_000 });

    // live feed (nothing to assert generically) | seeded sample | honest outage.
    // The page must land on one of them rather than an empty frame — the outage
    // branch in particular must never be replaced by seeded events.
    const sample = page.getByText(/^(Ukázková data|Sample data)$/);
    const unavailable = page.getByText(/^(Data nedostupná|Data unavailable)$/);
    const timeline = page.getByRole("list").first();
    await expect(sample.or(unavailable).or(timeline).first()).toBeVisible();
  });

  test("/integrace renders the readiness board with its category groups", async ({ page }) => {
    test.skip(!projectId, "no scratch project");
    await page.goto(`/app/${projectId}/integrace`);

    await expect(moduleHeading(page, /^(Integrace|Integrations)$/)).toBeVisible({ timeout: 45_000 });

    // The summary row is always present (statusSummary over a fixed row set).
    await expect(page.getByText(/^(Připojeno|Connected)$/).first()).toBeVisible();

    // Project-scoped categories are visible to every signed-in user, and the
    // module only renders a category card when that category has rows.
    for (const cat of [/^(Reklama|Advertising)$/, /^AI$/]) {
      await expect(page.getByRole("heading", { name: cat }).first()).toBeVisible();
    }

    // Platform provisioning (auth / cron / persistence) is ADMIN_EMAILS-gated —
    // "auth: needs action" would otherwise tell any tenant this deployment runs
    // the DEV_AUTH bypass, and "cron: not configured" that /api/cron/* is open.
    // The allowlist fails closed, so derive the expectation from the same env the
    // server reads rather than assuming one configuration.
    const devEmail = (process.env.DEV_AUTH_USER_EMAIL ?? "dev@local.test").toLowerCase();
    const allowlist = (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    const cron = page.getByText(/^(Automatizace \(cron\)|Automation \(cron\))$/).first();
    if (allowlist.includes(devEmail)) {
      await expect(cron).toBeVisible();
    } else {
      await expect(cron).toBeHidden();
    }
  });

  test("cleans up the scratch project", async ({ page }) => {
    test.skip(!projectId, "no scratch project");
    const res = await page.request.delete(`/api/projects/${projectId}`);
    expect(res.ok(), `DELETE /api/projects/${projectId} → ${res.status()}`).toBeTruthy();
  });
});
