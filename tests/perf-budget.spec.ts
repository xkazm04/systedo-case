import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type Page } from "@playwright/test";

/**
 * The performance budget: what a route may cost before the build refuses it.
 *
 * WHY THIS FILE EXISTS. Everything else in this suite asks whether the answer is
 * WRONG — the unit suite, the mutation drill, the flake drill, and the specs
 * beside this one that load whole pages and assert what rendered. Nothing asked
 * whether the answer arrived. A change that doubles a route's server time is
 * green in `npm run check:ci`, green in the rubric review, green here, and the
 * first thing that reports it is somebody waiting for a page.
 *
 * WHAT IT MEASURES, and why not the obvious thing. The clock runs from
 * `page.goto` to the navigation COMMITTING — the server answering the route with
 * its HTML document. `domcontentloaded` would be the intuitive choice and it is
 * the wrong one here: this lane runs `next dev`, whose deferred chunks are
 * unminified and megabytes wide, so that number would mostly measure Turbopack.
 * The document response is the half this repository's own code owns.
 *
 * WARM, BEST OF THREE. The first hit compiles the route, which is a fact about
 * the dev server rather than about the page, so `metric.warmups` navigations are
 * discarded before `metric.samples` are kept and the fastest is compared. A
 * shared runner stalls; a route that is genuinely twice as slow is slow in every
 * sample. Robustness over sensitivity, deliberately: a perf gate that fails at
 * random teaches whoever is waiting to press the button again, and then a real
 * red is indistinguishable from the noise.
 *
 * THE CEILINGS ARE IN `.github/perf-budgets.json`, with the reason each route
 * earns one, what the metric is, and what it deliberately does not cover. They
 * are generous and unmeasured — every run attaches its own numbers to the
 * Playwright report, so the first green run produces what a tighter ceiling
 * needs. Move one the way every threshold here moves: with the reason, in the
 * same diff. Never raise one to make your own change pass (rubric B3).
 *
 * Runs inside `npm run test:e2e` — the `E2E smoke (Playwright, key-free)` job
 * that .github/required-checks.json names as a check that may stop a change.
 * Key-free and account-free: every route below renders from fixtures or the
 * anonymous sample tenant.
 *
 * Run:  npm run test:e2e -- perf-budget
 */

type PerfRoute = {
  path: string;
  label: string;
  budgetMs: number;
  why: string;
};

type PerfBudgets = {
  metric: { warmups: number; samples: number; cacheBusting: boolean };
  routes: PerfRoute[];
};

// Read rather than imported: the registry is also read by
// test-unit/perf-budget.test.mjs and by a human, so it stays JSON that nothing
// has to compile. `process.cwd()` is the repository root — playwright.config.ts
// resolves its own paths the same way.
const BUDGETS_REL = ".github/perf-budgets.json";
const budgets = JSON.parse(readFileSync(join(process.cwd(), BUDGETS_REL), "utf8")) as PerfBudgets;

const WARMUPS = Math.max(1, budgets.metric.warmups);
const SAMPLES = Math.max(2, budgets.metric.samples);

/**
 * One measured navigation: milliseconds until the server's document response
 * commits. Fails the test on any status the browser would render as an error
 * page — a 500 that answers in 40 ms is not a fast route.
 */
async function measure(page: Page, path: string, attempt: number, bust: boolean): Promise<number> {
  // A unique query keeps a browser (or a proxy in front of a deployment) from
  // answering the second navigation out of its own cache, which would measure
  // nothing. These routes ignore unknown parameters.
  const url = bust ? `${path}${path.includes("?") ? "&" : "?"}_perf=${attempt}` : path;
  const started = Date.now();
  const response = await page.goto(url, { waitUntil: "commit", timeout: 60_000 });
  const elapsed = Date.now() - started;
  expect(response?.status(), `${url} responded ${response?.status()}`).toBeLessThan(400);
  return elapsed;
}

test.describe("performance budget", () => {
  for (const route of budgets.routes) {
    test(`${route.path} answers within ${route.budgetMs} ms`, async ({ page }, testInfo) => {
      for (let i = 0; i < WARMUPS; i += 1) {
        await measure(page, route.path, i, budgets.metric.cacheBusting);
      }

      const samples: number[] = [];
      for (let i = 0; i < SAMPLES; i += 1) {
        samples.push(await measure(page, route.path, WARMUPS + i, budgets.metric.cacheBusting));
      }
      const best = Math.min(...samples);

      // The measurement outlives the verdict. A ceiling can only be tightened by
      // somebody who knows what the route actually costs, and this is where that
      // number comes from — including on the runs that pass.
      await testInfo.attach(`perf ${route.path}`, {
        contentType: "application/json",
        body: JSON.stringify(
          { path: route.path, label: route.label, budgetMs: route.budgetMs, samplesMs: samples, bestMs: best },
          null,
          2
        ),
      });
      testInfo.annotations.push({
        type: "perf",
        description: `${route.path} — best ${best} ms of [${samples.join(", ")}] against a ${route.budgetMs} ms ceiling`,
      });

      expect(
        best,
        `${route.label} (${route.path}) took ${best} ms to answer — best of ${samples.join(", ")} ms — against a ` +
          `ceiling of ${route.budgetMs} ms.\n\n` +
          `Why this route has a budget: ${route.why}\n\n` +
          "The ceiling is a document response, warm, best of three (see .github/perf-budgets.json). Three honest " +
          "answers: make the route faster, prove the ceiling was wrong and move it in the same diff with the " +
          "reason, or say why this route should not be budgeted. Raising the number to go green is rubric B3."
      ).toBeLessThanOrEqual(route.budgetMs);
    });
  }
});
