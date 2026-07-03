import { test, expect, type Locator, type Page } from "@playwright/test";
import { CLAUDE_TIMEOUT_MS } from "../src/lib/llm/models";
import type { AdResponse } from "../src/lib/ai-types";

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
function tool(
  page: Page,
  id: "ads" | "keywords" | "brief" | "analysis" | "creative" | "pipeline"
): Locator {
  return page.getByTestId(`tool-${id}`);
}

/** Typed fixture for the keyless render-path test: a schema-complete AdResult
 *  with `meta.demo` set, served via route interception so the entire result UI
 *  (counters, Ad Strength, RSA preview, demo pill, prompt disclosure) is proven
 *  deterministically on every run — no GEMINI_API_KEY, no model, no flakiness.
 *  Copy stays inside the Google Ads limits (30/90/25/90) the counters assert. */
const AD_FIXTURE: AdResponse = {
  result: {
    headlines: ["Ořechy nejvyšší kvality", "Čerstvé ořechy a semínka", "Sleva na první nákup"],
    descriptions: [
      "Pražené i syrové ořechy s doručením do 24 hodin. Vyzkoušejte chuť čerstvosti.",
      "Kešu, mandle i vlašské ořechy bez zbytečných přísad. Nakupujte online.",
    ],
    callouts: ["Doprava zdarma", "Čerstvé šarže", "Český e-shop"],
    keywords: ["ořechy", "semínka", "kešu natural"],
    longHeadline: "Čerstvé ořechy a semínka s doručením až domů po celé ČR",
    rationale: "Nadpisy kombinují produkt, hlavní benefit a výzvu k akci.",
  },
  meta: {
    model: "demo",
    demo: true,
    prompt: "Testovací prompt — grounding s reálnými čísly v Kč.",
    tookMs: 42,
  },
};

async function openTab(page: Page, name: RegExp) {
  await page.getByRole("tab", { name }).click();
}

test.describe("/ai-asistent", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/ai-asistent");
  });

  test("renders all six Systedo tool tabs", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "AI marketingový asistent" })).toBeVisible();
    await expect(page.getByRole("tab", { name: /PPC inzeráty/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Klíčová slova/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Obsahový brief/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Analýza dat/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Vizuály/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Obsahová linka/ })).toBeVisible();
    // default tab is the ad generator
    await expect(tool(page, "ads").getByRole("heading", { name: "Zadání kampaně" })).toBeVisible();
  });

  test("keyword, creative and pipeline panels render structurally (keyless)", async ({ page }) => {
    // The suite previously never touched these tabs — a broken panel could ship
    // while the smoke test stayed green. Structure only; no model, no key.
    await openTab(page, /Klíčová slova/);
    await expect(
      tool(page, "keywords").getByRole("heading", { name: "Téma k prozkoumání" })
    ).toBeVisible();

    await openTab(page, /Vizuály/);
    await expect(
      tool(page, "creative").getByRole("heading", { name: "Zadání vizuálu" })
    ).toBeVisible();

    await openTab(page, /Obsahová linka/);
    await expect(
      tool(page, "pipeline").getByRole("heading", { name: "Obsahová linka" })
    ).toBeVisible();
  });

  test("PPC: renders the full result UI from a keyless fixture response", async ({ page }) => {
    // The page's marquee claim is „funguje i bez klíče" — prove the result UI on
    // the same interception seam the timeout test uses, but fulfilled with a
    // typed AiResponse<AdResult>. Deterministic and seconds-fast on every run,
    // with or without GEMINI_API_KEY.
    await page.route("**/api/ai", (route) => route.fulfill({ json: AD_FIXTURE }));

    const t = tool(page, "ads");
    await t.getByRole("button", { name: "Vyplnit ukázku" }).click();
    await t.getByRole("button", { name: "Vygenerovat inzeráty" }).click();

    // result groups render from the fixture
    await expect(t.getByRole("heading", { name: "Nadpisy" })).toBeVisible();
    // .first(): the RSA preview legitimately repeats headline copy
    await expect(t.getByText("Ořechy nejvyšší kvality").first()).toBeVisible();
    await expect(t.getByRole("heading", { name: "Klíčová slova" })).toBeVisible();
    // limit-aware counters (e.g. "23/30") are wired to the headline limit
    await expect(t.getByText(/\/30/).first()).toBeVisible();
    // Ad Strength meter + RSA preview build from the same fixture set
    await expect(t.getByTestId("ad-strength")).toBeVisible();
    await expect(t.getByTestId("rsa-preview")).toBeVisible();
    await expect(t.getByTestId("rsa-preview").getByText(/Sponzorováno/)).toBeVisible();
    // meta.demo renders the demo pill — not the "generated by model" badge
    await expect(t.getByText("Ukázkový režim (bez API klíče)")).toBeVisible();
    await expect(t.getByText(/Vygenerováno modelem/)).toBeHidden();
    // transparency: the prompt disclosure opens and shows the exact prompt
    await t.getByRole("button", { name: "Zobrazit prompt poslaný modelu" }).click();
    await expect(t.getByText(/grounding s reálnými čísly/)).toBeVisible();
  });

  test("tab strip is a real WAI-ARIA tablist: arrow keys move focus + selection", async ({ page }) => {
    const tab = (name: RegExp) => page.getByRole("tab", { name });

    // focus the active tab (the strip's single tab stop) and step right
    await tab(/PPC inzeráty/).click();
    await page.keyboard.press("ArrowRight");
    await expect(tab(/Klíčová slova/)).toBeFocused();
    await expect(tab(/Klíčová slova/)).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("tool-keywords")).toBeVisible();

    // End jumps to the last tab, ArrowRight wraps back to the first
    await page.keyboard.press("End");
    await expect(tab(/Obsahová linka/)).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(tab(/PPC inzeráty/)).toBeFocused();
    await expect(page.getByTestId("tool-ads")).toBeVisible();

    // the roles are wired: tab ↔ panel pairing via aria-controls/labelledby
    await expect(tab(/PPC inzeráty/)).toHaveAttribute("aria-controls", "tool-ads");
    await expect(page.getByTestId("tool-ads")).toHaveAttribute("role", "tabpanel");
    await expect(page.getByTestId("tool-ads")).toHaveAttribute("aria-labelledby", "ai-tab-ads");
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
