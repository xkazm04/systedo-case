import { test, expect, type Page } from "@playwright/test";
import { gotoAppHub } from "./support";

/**
 * End-to-end coverage for the free-channel path — "Kanály zdarma" — the app's
 * zero-ad-budget core path (docs/ship/2026-08-28-kanaly-core-path.md §1.2):
 *
 *   /app/[projectId]/kanaly          — the ranked plan of free visibility channels
 *   /app/[projectId]/klicova-slova   — the SAME composed visibility plan, other end
 *
 * Until this file the module had no e2e coverage at all (gap T2): 7 specs, none
 * touching `/kanaly`, while the module was rebuilt after the last UAT run. What it
 * pins, in the order the path is walked:
 *
 *   1. the page renders its two halves — the VisibilityPlanCard (the one plan
 *      across queries/content/channels) and the ChannelTable (the signpost);
 *   2. the SEEDED plan speaks the project's real business, not filler: no
 *      "vaší firmy" / "vaší nabídky" placeholder survives into the advice the
 *      user reads (card first-action line, and the playbook's rationale +
 *      firstActions, which is where the fills actually land);
 *   3. a decision made in the UI — the setup wizard, the "decide" step of the
 *      lifecycle — is PERSISTED: it survives a reload as a stage change on the
 *      channel's row, which is the whole difference between a generated list and
 *      a working plan;
 *   4. `/klicova-slova` renders the same card naming the same channel, the
 *      cross-module claim the artifact exists to make.
 *
 * KEYLESS BY DESIGN. Nothing here calls `channel-research`. With no LLM provider
 * the tailor button returns the honest curated demo, so asserting a *tailored*
 * plan would assert the demo and call it AI. The seeded plan is the state a real
 * tenant lands on before they ever generate, it is fully interactive, and the
 * wizard persists against it — so the pinned behaviour is real behaviour, not a
 * stand-in. Live-model quality is L2's job (uat/journeys/find-free-channels.md).
 *
 * Auth + data: same contract as first-run.spec.ts / account-modules.spec.ts — the
 * local webServer runs DEV_AUTH=true + LOCAL_DB=true, and against a target where
 * DEV_AUTH is off the whole describe self-skips at the sign-in gate. The scratch
 * project is created through the real API and deleted by the last test; a fresh
 * project resolves the seed catalog (src/lib/catalog/load.ts:52-54), which is what
 * gives the seeded plan its {category} fill.
 *
 * Run:  npm run test:e2e -- kanaly
 */

/** Filler the seeded plan falls back to when it knows nothing about the business
 *  (src/lib/organic-channels/sample.ts `fill`). Reaching the user means the
 *  grounding chain broke — the plan is advice, and advice about "vaší nabídky" is
 *  advice about nothing. */
const PLACEHOLDERS = /vaší firmy|vaší nabídky/;

/** ModulePage renders the module title as an h2 (the topbar repeats it as h1).
 *  `.first()` matches the rest of the suite — the dev server keeps a hidden copy
 *  of some client-boundary markup that trips strict mode. */
function moduleHeading(page: Page, name: RegExp) {
  return page.getByRole("heading", { level: 2, name }).first();
}

/** The one visibility plan (VisibilityPlanCard) — labelled by its own h2. */
function planCard(page: Page) {
  return page.locator('section[aria-labelledby="visibility-plan-title"]').first();
}

/** The signpost table (ChannelTable). The pipeline strip above it prints every
 *  stage label unconditionally, so every stage assertion must be scoped here. */
function channelTable(page: Page) {
  return page.locator("table").first();
}

test.describe.serial("/app/[projectId]/kanaly — free-channel plan", () => {
  /** Scratch project shared by the whole describe; deleted by the last test. */
  let projectId = "";
  /** The channel the wizard configured — asserted again after the reload. */
  let decidedChannel = "";

  test("creates a scratch eshop project to hang the path on", async ({ page }) => {
    const state = await gotoAppHub(page);
    test.skip(state === "gate", "DEV_AUTH is off — /app renders the sign-in gate");

    // Through the real API: first-run.spec.ts owns the creation FORM, this file
    // owns the module. eshop because `kanaly` is availableFor ALL and eshop is the
    // create form's own default, so the fixture matches what a new tenant gets.
    const res = await page.request.post("/api/projects", {
      data: { name: `E2E kanály ${Date.now()}`, type: "eshop" },
    });
    expect(res.ok(), `POST /api/projects → ${res.status()}`).toBeTruthy();
    const body = (await res.json()) as { project?: { id?: string }; id?: string };
    projectId = body.project?.id ?? body.id ?? "";
    expect(projectId, "created project id").not.toEqual("");
  });

  test("renders the visibility plan card and the ranked channel table", async ({ page }) => {
    test.skip(!projectId, "no scratch project");
    await page.goto(`/app/${projectId}/kanaly`);

    await expect(moduleHeading(page, /Kanály zdarma|Free channels/)).toBeVisible({ timeout: 45_000 });

    // A never-generated project is on the seeded plan and says so.
    await expect(page.getByText(/^(Ukázkový plán|Sample plan)$/).first()).toBeVisible();

    // Half one: the artifact that joins queries → content → channels. It renders
    // for every project type that has all three modules (eshop does).
    const card = planCard(page);
    await expect(card).toBeVisible();
    await expect(
      card.getByRole("heading", { name: /Plán viditelnosti|Visibility plan/ })
    ).toBeVisible();
    // With no saved keywords the plan is honestly channels-only rather than
    // inventing a query leg — the empty leg is stated, not hidden.
    await expect(card.getByRole("status")).toContainText(
      /Nemáte uložená klíčová slova|You have no saved keywords/
    );
    await expect(card.getByRole("listitem").first()).toBeVisible();

    // Half two: the signpost. The eshop seed carries 10 channels; assert the
    // domain-meaningful floor (the AI plan contract is 6–9) rather than the exact
    // curation, which is allowed to change.
    const table = channelTable(page);
    await expect(table).toBeVisible();
    await expect(table.getByRole("columnheader", { name: /^(Kanál|Channel)$/ })).toBeVisible();
    expect(await table.locator("tbody tr").count()).toBeGreaterThanOrEqual(6);

    // Ranked: the plan is sorted by fit descending, which is what makes "start
    // here" meaningful. Read the fit column and assert the order holds.
    const fits = (await table.locator("tbody tr td:nth-child(2)").allInnerTexts()).map((t) =>
      Number(t.trim())
    );
    expect(fits.length).toBeGreaterThanOrEqual(6);
    expect(fits.every((n) => Number.isFinite(n))).toBeTruthy();
    expect([...fits].sort((a, b) => b - a)).toEqual(fits);
  });

  test("the seeded plan speaks the project's business — no placeholder filler", async ({ page }) => {
    test.skip(!projectId, "no scratch project");
    await page.goto(`/app/${projectId}/kanaly`);
    await expect(moduleHeading(page, /Kanály zdarma|Free channels/)).toBeVisible({ timeout: 45_000 });

    // The card surfaces the top channel's first action, one of the three filled
    // fields — so the leak, if any, is on screen before anything is opened.
    await expect(planCard(page)).not.toContainText(PLACEHOLDERS);

    // The playbook is where the fills really live (rationale, payoff, the 2–4
    // first actions). Open the top row — the row itself is the control.
    const topRow = channelTable(page).locator("tbody tr").first();
    const channelName = (await topRow.locator("td").first().innerText()).split("\n")[0]!.trim();
    expect(channelName.length).toBeGreaterThan(0);
    // The row IS the control (interactiveRowProps). Click the name cell, not the
    // row's centre, so the trailing next-step button is never the hit target.
    await topRow.locator("td").first().click();

    const playbook = page.getByRole("dialog").first();
    await expect(playbook).toBeVisible();
    await expect(playbook).toContainText(channelName);
    await expect(playbook).not.toContainText(PLACEHOLDERS);
    // Also the demo marker: promptSafeName strips "(ukázka)" before the brand is
    // ever spoken back, and this project's name carries none — so neither the
    // plan nor the playbook may invent one.
    await expect(playbook).not.toContainText(/\(ukázka\)/);
  });

  test("a decision made in the wizard is pinned and survives a reload", async ({ page }) => {
    test.skip(!projectId, "no scratch project");
    await page.goto(`/app/${projectId}/kanaly`);
    await expect(moduleHeading(page, /Kanály zdarma|Free channels/)).toBeVisible({ timeout: 45_000 });

    const table = channelTable(page);
    // Nothing is decided yet: every row is "Nalezeno" (identified).
    await expect(table.getByText(/^(Naplánováno|Planned)$/)).toHaveCount(0);

    const topRow = table.locator("tbody tr").first();
    decidedChannel = (await topRow.locator("td").first().innerText()).split("\n")[0]!.trim();

    // The derived next step for an untracked channel is "decide" — the wizard.
    await topRow.getByRole("button", { name: /Nastavit kanál|Set up channel/ }).click();
    const wizard = page.getByRole("dialog").first();
    await expect(wizard).toBeVisible();
    await expect(wizard).toContainText(decidedChannel);

    // Choose "manually" explicitly: the twin branch would route to voice training
    // on finish, which is a different journey. Manual keeps the flow inside this
    // module and is what a listing channel is for anyway.
    // Substring match, not anchored: an OptionCard's accessible name is its label
    // PLUS its hint line, so an anchored regex would match nothing.
    await wizard.getByRole("button", { name: /Ručně|Manually/ }).first().click();

    // Walk to the last step (mode → [inbox for conversational channels] → cadence)
    // without hardcoding how many steps this channel's kind has.
    const save = wizard.getByRole("button", { name: /Uložit plán|Save plan/ });
    for (let i = 0; i < 4 && !(await save.isVisible().catch(() => false)); i++) {
      await wizard.getByRole("button", { name: /^(Pokračovat|Continue)$/ }).click();
    }
    await expect(save).toBeVisible();

    // The save is a fire-and-forget POST; wait for the write, not for the modal.
    const saved = page.waitForResponse(
      (r) => r.url().includes(`/api/projects/${projectId}/organic-channels`) && r.request().method() === "POST"
    );
    await save.click();
    expect((await saved).ok(), "POST /organic-channels").toBeTruthy();
    await expect(wizard).toBeHidden();

    // The proof: a full round trip through the store, not optimistic local state.
    await page.reload();
    await expect(moduleHeading(page, /Kanály zdarma|Free channels/)).toBeVisible({ timeout: 45_000 });
    const decidedRow = channelTable(page)
      .locator("tbody tr")
      .filter({ hasText: decidedChannel })
      .first();
    await expect(decidedRow).toContainText(/Naplánováno|Planned/);
    await expect(decidedRow).toContainText(/Ručně|Manual/);
  });

  test("/klicova-slova renders the same visibility plan", async ({ page }) => {
    test.skip(!projectId, "no scratch project");
    await page.goto(`/app/${projectId}/klicova-slova`);
    await expect(moduleHeading(page, /Klíčová slova|Keywords/)).toBeVisible({ timeout: 45_000 });

    const card = planCard(page);
    await expect(card).toBeVisible();
    await expect(card.getByRole("heading", { name: /Plán viditelnosti|Visibility plan/ })).toBeVisible();
    await expect(card).not.toContainText(PLACEHOLDERS);

    // Same plan, same spine: the channel this run configured on /kanaly is named
    // here too, resolved independently by this page. This is the whole claim of
    // the artifact — the two ends of the path cannot describe it differently.
    if (decidedChannel) await expect(card).toContainText(decidedChannel);

    // The footer hop points back at the module we came from, never at this page.
    await expect(card.getByRole("link", { name: /Kanály zdarma|Free channels/ })).toBeVisible();
    await expect(card.getByRole("link", { name: /^(Klíčová slova|Keywords)$/ })).toHaveCount(0);
  });

  test("cleans up the scratch project", async ({ page }) => {
    test.skip(!projectId, "no scratch project");
    const res = await page.request.delete(`/api/projects/${projectId}`);
    expect(res.ok(), `DELETE /api/projects/${projectId} → ${res.status()}`).toBeTruthy();
  });
});
