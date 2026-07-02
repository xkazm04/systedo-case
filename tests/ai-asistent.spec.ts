import { test, expect, type Locator, type Page } from "@playwright/test";
import { CLAUDE_TIMEOUT_MS } from "../src/lib/llm/models";

/**
 * End-to-end tests for the AI assistant (/ai-asistent).
 *
 * The "live model" tests hit the real Gemini API and only run when
 * GEMINI_API_KEY is present (in .env.local or the environment). Without a key
 * they are skipped — the structural tests and the timeout test still run.
 *
 * Run:  npm run test:e2e          (add GEMINI_API_KEY to .env.local first)
 */

const HAS_KEY = Boolean(process.env.GEMINI_API_KEY);
// The e2e suite runs under `next dev` (NODE_ENV !== "production"), where the client
// abort ceiling is CLAUDE_TIMEOUT_MS + 30s (see useAiTool's AI_TIMEOUT_MS). Derive
// every latency bound from that constant so a server-cap bump moves the tests with
// it — the old flat 60s literals could never reach the (now ~180s) timeout state.
const AI_TIMEOUT_MS = CLAUDE_TIMEOUT_MS + 30_000;
// Live-model result: wait past the abort ceiling + transfer margin.
const RESULT_TIMEOUT = AI_TIMEOUT_MS + 15_000;

/** Inactive tool panels stay mounted (hidden); scope to the active one. */
function tool(page: Page, id: "ads" | "brief" | "analysis"): Locator {
  return page.getByTestId(`tool-${id}`);
}

async function openTab(page: Page, name: RegExp) {
  await page.getByRole("tab", { name }).click();
}

test.describe("/ai-asistent", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/ai-asistent");
  });

  test("renders the three Systedo tool tabs", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "AI marketingový asistent" })).toBeVisible();
    await expect(page.getByRole("tab", { name: /PPC inzeráty/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Obsahový brief/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Analýza dat/ })).toBeVisible();
    // default tab is the ad generator
    await expect(tool(page, "ads").getByRole("heading", { name: "Zadání kampaně" })).toBeVisible();
  });

  test("deep-links the active tool via ?tool=", async ({ page }) => {
    // a shared /ai-asistent?tool=brief link lands straight on the brief tool
    await page.goto("/ai-asistent?tool=brief");
    await expect(tool(page, "brief").getByRole("heading", { name: "Zadání obsahu" })).toBeVisible();
    await expect(tool(page, "ads")).toBeHidden();

    // an unknown tool id falls back to the default (ads) instead of a blank page
    await page.goto("/ai-asistent?tool=nonsense");
    await expect(tool(page, "ads").getByRole("heading", { name: "Zadání kampaně" })).toBeVisible();
  });

  test("PPC: generates ads with the live model", async ({ page }) => {
    test.skip(!HAS_KEY, "Needs GEMINI_API_KEY");
    const t = tool(page, "ads");

    await t.getByRole("button", { name: "Vyplnit ukázku" }).click();
    await t.getByRole("button", { name: "Vygenerovat inzeráty" }).click();

    // animated timer appears while generating
    await expect(t.getByTestId("ai-loading")).toBeVisible();

    // live (not demo) result arrives
    await expect(t.getByText(/Vygenerováno modelem/)).toBeVisible({ timeout: RESULT_TIMEOUT });
    await expect(t.getByRole("heading", { name: "Nadpisy" })).toBeVisible();
    await expect(t.getByRole("heading", { name: "Klíčová slova" })).toBeVisible();
    // character counters are rendered (e.g. "27/30")
    await expect(t.getByText(/\/30/).first()).toBeVisible();
    // Ad Strength meter + live RSA preview render from the generated set
    await expect(t.getByTestId("ad-strength").getByRole("heading", { name: "Síla inzerátu" })).toBeVisible();
    await expect(t.getByTestId("rsa-preview")).toBeVisible();
    await expect(t.getByTestId("rsa-preview").getByText(/Sponzorováno/)).toBeVisible();
  });

  test("Brief: generates an SEO content brief with the live model", async ({ page }) => {
    test.skip(!HAS_KEY, "Needs GEMINI_API_KEY");
    await openTab(page, /Obsahový brief/);
    const t = tool(page, "brief");

    await t.getByRole("button", { name: "Vyplnit ukázku" }).click();
    await t.getByRole("button", { name: "Vytvořit brief" }).click();

    await expect(t.getByTestId("ai-loading")).toBeVisible();
    await expect(t.getByText(/Vygenerováno modelem/)).toBeVisible({ timeout: RESULT_TIMEOUT });

    // SERP preview + SEO metadata with limit-aware counters
    await expect(t.getByText("Náhled ve vyhledávání")).toBeVisible();
    await expect(t.getByText("Title tag")).toBeVisible();
    await expect(t.getByText("Meta description")).toBeVisible();
    await expect(t.getByText(/\/60/).first()).toBeVisible();
    await expect(t.getByRole("heading", { name: "Osnova" })).toBeVisible();
  });

  test("Analysis: analyzes the dashboard data with the live model", async ({ page }) => {
    test.skip(!HAS_KEY, "Needs GEMINI_API_KEY");
    await openTab(page, /Analýza dat/);
    const t = tool(page, "analysis");

    await t.getByRole("button", { name: "Analyzovat data" }).click();

    await expect(t.getByTestId("ai-loading")).toBeVisible();
    await expect(t.getByText(/Vygenerováno modelem/)).toBeVisible({ timeout: RESULT_TIMEOUT });

    await expect(t.getByRole("heading", { name: "Co se daří" })).toBeVisible();
    await expect(t.getByRole("heading", { name: "Doporučené kroky" })).toBeVisible();

    // grounded: the prompt shown contains real figures (Kč) from the dataset
    await t.getByRole("button", { name: /Zobrazit prompt/ }).click();
    await expect(t.getByText(/Kč/).first()).toBeVisible();
  });

  test("preserves each tool's results when switching tabs", async ({ page }) => {
    test.skip(!HAS_KEY, "Needs GEMINI_API_KEY");
    const ads = tool(page, "ads");

    await ads.getByRole("button", { name: "Vyplnit ukázku" }).click();
    await ads.getByRole("button", { name: "Vygenerovat inzeráty" }).click();
    await expect(ads.getByText(/Vygenerováno modelem/)).toBeVisible({ timeout: RESULT_TIMEOUT });

    // switch away and back — results should still be there (state preserved)
    await openTab(page, /Analýza dat/);
    await expect(tool(page, "analysis").getByRole("button", { name: "Analyzovat data" })).toBeVisible();
    await openTab(page, /PPC inzeráty/);
    await expect(ads.getByRole("heading", { name: "Nadpisy" })).toBeVisible();
  });

  test("shows a styled timeout illustration when the model does not respond", async ({ page }) => {
    // Intercept the API and never answer; the client aborts at AI_TIMEOUT_MS and
    // shows the timeout illustration. No API key needed — the request never reaches
    // it. The per-test cap must clear the abort ceiling, so raise it explicitly.
    test.setTimeout(AI_TIMEOUT_MS + 40_000);
    await page.route("**/api/ai", async () => {
      // deliberately never fulfilled
    });

    const t = tool(page, "ads");
    await t.getByRole("button", { name: "Vyplnit ukázku" }).click();
    await t.getByRole("button", { name: "Vygenerovat inzeráty" }).click();

    await expect(t.getByTestId("ai-loading")).toBeVisible();
    await expect(t.getByTestId("ai-timeout")).toBeVisible({ timeout: AI_TIMEOUT_MS + 20_000 });
    await expect(t.getByRole("heading", { name: "Vypršel časový limit" })).toBeVisible();
    await expect(t.getByRole("button", { name: "Zkusit znovu" })).toBeVisible();
  });
});
