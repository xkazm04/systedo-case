import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type Page } from "@playwright/test";

/**
 * The accessibility budget: what a page owes a keyboard and a screen reader
 * before the build refuses it.
 *
 * WHY THIS FILE EXISTS. It is the twin of tests/perf-budget.spec.ts and it closes
 * the other half of the same gap. The suite here is strong on WRONG and, since the
 * perf budgets landed, on SLOW. Nothing asked whether the page could still be
 * USED — and the specs beside this one cannot, because they drive the page by CSS
 * selector, and a selector does not care whether a human could have reached the
 * element. A change that drops `lang`, loses the `<main>` landmark, strands the
 * skip link or ships an icon button nothing can name is green everywhere, and the
 * first thing that reports it is somebody using the product with a keyboard.
 *
 * WHY NO axe-core. The gate layer here is deliberately zero-dependency (ADR-0008),
 * and an a11y engine is a large runtime dependency behind rubric A4. Everything
 * below is a DOM query the browser can already answer, which is why the rule set
 * is small and each rule says exactly what it looks at. It is a floor, not an
 * audit, and `.github/a11y-budgets.json` § notCovered says so in its own words.
 *
 * TWO RUNGS (docs/adr/0007-gate-rung-discipline.md), read out of the registry:
 *
 *   blocking  — the rule passes today on every budgeted route because
 *               src/app/layout.tsx establishes it structurally. A red here is a
 *               regression THIS change introduced, and it fails the
 *               `E2E smoke (Playwright, key-free)` job that
 *               .github/required-checks.json names as a check that may stop a
 *               change.
 *   reporting — the rule COUNTS findings, nothing has measured them, `baseline` is
 *               null, and a count fails nothing. Each run attaches its counts and
 *               annotates them, which is exactly what a first ratchet needs.
 *               Promoting one is the measured number plus the reason, in one diff.
 *
 * NEVER DOWNGRADE A RULE TO GO GREEN. A blocking rule that starts firing has found
 * the regression it was drawn around; moving it to `reporting` is rubric B3 with
 * extra steps.
 *
 * Run:  npm run test:e2e -- a11y-budget
 */

type A11yRule = {
  id: string;
  label: string;
  enforcement: "blocking" | "reporting";
  why: string;
};

type A11yRoute = { path: string; label: string; why: string };

type A11yBudgets = {
  metric: { what: string; waitUntil: string; why: string };
  baseline: null | Record<string, number>;
  rules: A11yRule[];
  routes: A11yRoute[];
};

// Read rather than imported: the registry is also read by
// test-unit/a11y-budget.test.mjs and by a human, so it stays JSON that nothing has
// to compile. `process.cwd()` is the repository root, the same way
// playwright.config.ts resolves its own paths.
const BUDGETS_REL = ".github/a11y-budgets.json";
const budgets = JSON.parse(readFileSync(join(process.cwd(), BUDGETS_REL), "utf8")) as A11yBudgets;

const RULES = new Map<string, A11yRule>(budgets.rules.map((r) => [r.id, r] as [string, A11yRule]));
const blocking = (id: string) => RULES.get(id)?.enforcement === "blocking";
const why = (id: string) => RULES.get(id)?.why ?? "";

/** One rule's verdict on one page: how many findings, and up to five examples a
 *  reader can act on without opening a browser. */
type Finding = { rule: string; count: number; examples: string[] };

/**
 * Everything the budget looks at, collected in ONE pass in the page.
 *
 * It runs in the browser, so it may not close over anything from this module —
 * hence the literal vocabulary inside. Keep it a pure read: a probe that clicks,
 * focuses or scrolls would change the thing it is measuring, and would make the
 * spec order-dependent against the specs that share this server.
 */
async function audit(page: Page) {
  return page.evaluate(() => {
    const findings: Record<string, { count: number; examples: string[] }> = {};
    const note = (rule: string, example: string) => {
      const f = (findings[rule] ??= { count: 0, examples: [] });
      f.count += 1;
      if (f.examples.length < 5) f.examples.push(example);
    };
    /** A short, stable way to point at an element in a failure message. */
    const describe = (el: Element) => {
      const tag = el.tagName.toLowerCase();
      const id = el.id ? `#${el.id}` : "";
      const cls =
        el.getAttribute("class")?.trim().split(/\s+/).slice(0, 2).join(".") ?? "";
      const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
      return `<${tag}${id}${cls ? `.${cls}` : ""}>${text ? ` “${text}”` : ""}`;
    };
    /** Elements a user can neither see nor reach are not findings. */
    const visible = (el: Element) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return false;
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") return false;
      return !el.closest("[aria-hidden='true']") && !el.closest("[hidden]");
    };
    /** The name assistive technology would announce, as far as the DOM can say. */
    const accessibleName = (el: Element) => {
      const labelledBy = el.getAttribute("aria-labelledby");
      if (labelledBy) {
        const named = labelledBy
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent ?? "")
          .join(" ")
          .trim();
        if (named) return named;
      }
      const aria = el.getAttribute("aria-label")?.trim();
      if (aria) return aria;
      const text = (el.textContent ?? "").trim();
      if (text) return text;
      const title = el.getAttribute("title")?.trim();
      if (title) return title;
      const value = el.getAttribute("value")?.trim();
      if (value && el.tagName === "INPUT") return value;
      // An icon-only control is named by the image it wraps.
      const img = el.querySelector("img[alt], svg[aria-label], svg > title");
      if (img) {
        const alt = img.getAttribute("alt") ?? img.getAttribute("aria-label") ?? img.textContent ?? "";
        if (alt.trim()) return alt.trim();
      }
      return "";
    };

    // --- blocking invariants -------------------------------------------------

    const lang = document.documentElement.getAttribute("lang") ?? "";
    if (!/^[a-z]{2}(-[A-Za-z0-9]{2,8})*$/.test(lang)) {
      note("html-lang", `<html lang="${lang}">`);
    }

    const title = (document.title ?? "").trim();
    if (title.length < 3) note("document-title", `document.title is ${JSON.stringify(title)}`);

    const mains = [...document.querySelectorAll("main, [role='main']")].filter(
      (el) => el.getAttribute("aria-hidden") !== "true"
    );
    if (mains.length !== 1) note("main-landmark", `${mains.length} main landmark(s)`);

    const skipLinks = [...document.querySelectorAll("a[href^='#']")].filter((a) => {
      const href = a.getAttribute("href") ?? "";
      if (href.length < 2) return false;
      const target = document.getElementById(decodeURIComponent(href.slice(1)));
      return Boolean(target && (target.tagName === "MAIN" || target.closest("main") || target.getAttribute("role") === "main"));
    });
    if (!skipLinks.length) {
      note("skip-link", "no in-page link resolves to the main landmark — a keyboard user tabs the whole nav first");
    }

    for (const el of document.querySelectorAll("[tabindex]")) {
      const value = Number(el.getAttribute("tabindex"));
      if (Number.isFinite(value) && value > 0) note("no-positive-tabindex", `${describe(el)} tabindex=${value}`);
    }

    const viewport = document.querySelector("meta[name='viewport']")?.getAttribute("content") ?? "";
    if (/user-scalable\s*=\s*(no|0)/i.test(viewport)) {
      note("viewport-zoom", `viewport disables zoom: ${viewport}`);
    }
    const maxScale = /maximum-scale\s*=\s*([\d.]+)/i.exec(viewport);
    if (maxScale && Number(maxScale[1]) < 2) {
      note("viewport-zoom", `viewport caps zoom at ${maxScale[1]}×: ${viewport}`);
    }

    // --- counted findings ----------------------------------------------------

    for (const img of document.querySelectorAll("img")) {
      // `alt=""` is a deliberate answer (decoration). Only the MISSING attribute
      // is a finding — that is the one nobody chose.
      if (visible(img) && !img.hasAttribute("alt")) note("image-alt", describe(img));
    }

    const controls = "button, a[href], input:not([type='hidden']), select, textarea, [role='button'], [role='link']";
    for (const el of document.querySelectorAll(controls)) {
      if (!visible(el)) continue;
      const type = el.getAttribute("type");
      if (el.tagName === "INPUT" && type !== "submit" && type !== "button" && type !== "reset") continue;
      if (!accessibleName(el)) note("control-name", describe(el));
    }

    for (const el of document.querySelectorAll("input:not([type='hidden']), select, textarea")) {
      if (!visible(el)) continue;
      const type = el.getAttribute("type");
      if (type === "submit" || type === "button" || type === "reset") continue;
      const id = el.getAttribute("id");
      const labelled =
        (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)) ||
        el.closest("label") ||
        el.getAttribute("aria-label")?.trim() ||
        el.getAttribute("aria-labelledby")?.trim();
      if (!labelled) note("form-label", describe(el));
    }

    const headings = [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")].filter(visible);
    const h1s = headings.filter((h) => h.tagName === "H1");
    if (h1s.length !== 1) note("heading-order", `${h1s.length} <h1> on the page`);
    let previous = 0;
    for (const h of headings) {
      const level = Number(h.tagName.slice(1));
      if (previous && level > previous + 1) note("heading-order", `${describe(h)} jumps h${previous} → h${level}`);
      previous = level;
    }

    const FILLER = ["click here", "here", "more", "read more", "learn more", "zde", "více", "vice", "tady", "odkaz"];
    for (const a of document.querySelectorAll("a[href]")) {
      if (!visible(a)) continue;
      const name = accessibleName(a).toLowerCase().replace(/\s+/g, " ").replace(/[.…»→]+$/, "").trim();
      if (name && FILLER.includes(name)) note("link-text", describe(a));
    }

    for (const a of document.querySelectorAll("a[href^='#']")) {
      const href = a.getAttribute("href") ?? "";
      if (href.length < 2) continue;
      if (!document.getElementById(decodeURIComponent(href.slice(1)))) note("anchor-targets", `${describe(a)} → ${href}`);
    }

    return findings;
  });
}

test.describe("accessibility budget", () => {
  for (const route of budgets.routes) {
    test(`${route.path} holds its accessibility invariants`, async ({ page }, testInfo) => {
      const response = await page.goto(route.path, { waitUntil: "load", timeout: 60_000 });
      expect(response?.status(), `${route.path} responded ${response?.status()}`).toBeLessThan(400);

      // The root layout streams the page in behind a Suspense fallback that is
      // itself a `<main aria-hidden>`. Waiting for a main that is NOT the fallback
      // is what makes "exactly one main landmark" a fact about the page rather
      // than a race with the stream.
      await page.locator("main:not([aria-hidden='true'])").first().waitFor({ state: "attached", timeout: 30_000 });

      const raw = await audit(page);
      const findings: Finding[] = budgets.rules
        .map((rule) => ({ rule: rule.id, count: raw[rule.id]?.count ?? 0, examples: raw[rule.id]?.examples ?? [] }))
        .filter((f) => f.count > 0);

      // The measurement outlives the verdict — including on the runs that pass.
      // A reporting rule can only ever be promoted by somebody who knows what the
      // count actually is, and this is where that number comes from.
      await testInfo.attach(`a11y ${route.path}`, {
        contentType: "application/json",
        body: JSON.stringify({ path: route.path, label: route.label, findings }, null, 2),
      });
      for (const f of findings) {
        testInfo.annotations.push({
          type: `a11y:${RULES.get(f.rule)?.enforcement ?? "unknown"}`,
          description: `${route.path} — ${f.rule}: ${f.count} (${f.examples.join(" · ")})`,
        });
      }

      const broken = findings.filter((f) => blocking(f.rule));
      expect(
        broken.map((f) => `${f.rule} ×${f.count}: ${f.examples.join(" · ")}`),
        `${route.label} (${route.path}) breaks ${broken.length} blocking accessibility invariant(s).\n\n` +
          broken.map((f) => `  · ${f.rule} — ${why(f.rule)}`).join("\n") +
          "\n\nThese pass today on every budgeted route because src/app/layout.tsx establishes them " +
          "structurally, so this is a regression the change introduced. Fix the page. Moving the rule to " +
          "`reporting` in .github/a11y-budgets.json to go green is rubric B3."
      ).toEqual([]);
    });
  }
});
