/** Direction 2 — registry↔route drift guard. Two failure modes this pins down:
 *   1. a MODULES entry whose `key` has no folder under src/app/app/[projectId]/
 *      (a sidebar link that 404s), and
 *   2. a module-looking route folder with NO registry entry (an orphan page you can
 *      only reach by typing the URL) — save a documented exemption list.
 *  Plus a byte-for-byte pin of `modulesFor`'s output per project type, so the new
 *  explicit `order` field can never silently reorder the sidebar. Pure (fs + the
 *  framework-free registry); no backend. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const { MODULES, modulesFor } = await import("@/lib/projects/modules");
const { PROJECT_TYPES } = await import("@/lib/projects/types");

const ROUTES_DIR = join(process.cwd(), "src", "app", "app", "[projectId]");

/** Route folders that intentionally have NO registry entry:
 *   • report          — the shareable data-report/chat surface (reached from Výkon),
 *                        not a sidebar module.
 *   • obsah           — legacy redirect → obsahovy-engine (kept for old bookmarks).
 *   • rychla-reakce   — retired redirect → schranka (absorbed as the `leads` channel).
 *  Add here (with a reason) when a route deliberately isn't a sidebar module. */
const ROUTE_EXEMPTIONS = new Set(["report", "obsah", "rychla-reakce"]);

/** The route segment folders that actually render a page. */
function routeFolders() {
  return readdirSync(ROUTES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
}

test("every MODULES key maps to a real route folder (key '' = the overview page)", () => {
  const folders = new Set(routeFolders());
  for (const m of MODULES) {
    if (m.key === "") continue; // "" is the [projectId]/page.tsx overview, not a subfolder
    assert.ok(
      folders.has(m.key),
      `module "${m.key}" has no folder at src/app/app/[projectId]/${m.key}/`
    );
  }
});

test("every module-looking route folder has a registry entry (or a documented exemption)", () => {
  const keys = new Set(MODULES.map((m) => m.key));
  for (const folder of routeFolders()) {
    if (keys.has(folder) || ROUTE_EXEMPTIONS.has(folder)) continue;
    assert.fail(
      `route folder "${folder}" has no MODULES entry and isn't in ROUTE_EXEMPTIONS — ` +
        `either register it or add it to the exemption list with a reason.`
    );
  }
});

test("no stale exemption — every exempted folder still exists", () => {
  const folders = new Set(routeFolders());
  for (const ex of ROUTE_EXEMPTIONS) {
    assert.ok(folders.has(ex), `exempted folder "${ex}" no longer exists — prune the exemption`);
  }
});

// --- sort pin: current rendering must stay byte-identical ------------------
// Captured from `modulesFor` at the time the explicit `order` field was introduced.
// A diff here means the sidebar order changed — intentional edits update this map.
// 2026-08-22: `settings` split out of `system` as a first-level rail area — the four
// configure-the-workspace modules (ucet, branding, integrace, nastaveni) now render
// as their own group ABOVE the operational system drawer (katalog, spotreba,
// mesicni-report, aktivita). That is the only movement in this map.
const EXPECTED_ORDER = {
  eshop: ["", "vykon", "start", "kampane", "klicova-slova", "sklad-sezonnost", "obsahovy-engine", "kreativa", "produktova-kreativa", "ulozeny-obsah", "kanaly", "socialni", "twin", "sprava-kanalu", "schranka", "leady", "knihovna", "reporty", "zisk", "ltv", "ucet", "branding", "integrace", "nastaveni", "katalog", "spotreba", "mesicni-report", "aktivita"],
  app: ["", "vykon", "start", "kampane", "klicova-slova", "srovnani-seo", "obsahovy-engine", "experimenty-lp", "ulozeny-obsah", "kanaly", "socialni", "twin", "sprava-kanalu", "schranka", "leady", "knihovna", "reporty", "ltv", "ucet", "branding", "integrace", "nastaveni", "katalog", "spotreba", "mesicni-report", "aktivita"],
  leadgen: ["", "vykon", "start", "kampane", "klicova-slova", "lokalni", "obsahovy-engine", "ulozeny-obsah", "kanaly", "twin", "sprava-kanalu", "schranka", "leady", "knihovna", "reporty", "kvalita-leadu", "ucet", "branding", "integrace", "nastaveni", "katalog", "spotreba", "mesicni-report", "aktivita"],
  content: ["", "vykon", "start", "klicova-slova", "obsahovy-engine", "kreativa", "ulozeny-obsah", "kanaly", "socialni", "twin", "sprava-kanalu", "schranka", "distribuce", "leady", "reporty", "publikum", "ucet", "branding", "integrace", "nastaveni", "katalog", "spotreba", "mesicni-report", "aktivita"],
  local: ["", "vykon", "start", "kampane", "klicova-slova", "lokalni", "mapa", "obsahovy-engine", "recenze", "obsah-plan", "ulozeny-obsah", "kanaly", "socialni", "twin", "sprava-kanalu", "schranka", "leady", "reporty", "ucet", "branding", "integrace", "nastaveni", "katalog", "spotreba", "mesicni-report", "aktivita"],
};

test("modulesFor output is pinned per project type (order field preserves rendering)", () => {
  for (const type of PROJECT_TYPES) {
    assert.deepEqual(
      modulesFor(type).map((m) => m.key),
      EXPECTED_ORDER[type],
      `sidebar order drifted for "${type}"`
    );
  }
});

test("order values are unique and section-monotonic (a real tiebreak)", () => {
  const orders = MODULES.map((m) => m.order);
  assert.equal(new Set(orders).size, orders.length, "duplicate order values");
  // Within each section, order must strictly increase in registry appearance — that's
  // what makes (section, order) reproduce the previous stable-by-section output.
  const bySection = new Map();
  for (const m of MODULES) {
    const prev = bySection.get(m.section);
    if (prev !== undefined) assert.ok(m.order > prev, `order not increasing in section ${m.section}`);
    bySection.set(m.section, m.order);
  }
});
