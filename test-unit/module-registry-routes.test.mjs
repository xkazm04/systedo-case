/** Direction 2 — registry↔route drift guard, over the area tree (ADR-0013).
 *  Failure modes this pins down:
 *   1. a MODULES entry whose route segment (`moduleSegment`: flat for Home and
 *      settings, the area slug for a roof module, `<area>/<key>` for a room) has
 *      no page under src/app/app/[projectId]/ (a sidebar link that 404s),
 *   2. a route folder that is neither a module, an area roof, nor a documented
 *      exemption (an orphan page you can only reach by typing the URL),
 *   3. a moved module without a redirect from its old flat URL.
 *  Plus a byte-for-byte pin of `modulesFor`'s output per project type, so the
 *  explicit `order` field can never silently reorder the sidebar. Pure (fs + the
 *  framework-free registry); no backend. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const { MODULES, modulesFor, moduleSegment, movedModuleRoutes, areasFor, AREA_ORDER } = await import(
  "@/lib/projects/modules"
);
const { AREAS } = await import("@/lib/projects/areas");
const { PROJECT_TYPES } = await import("@/lib/projects/types");

const ROUTES_DIR = join(process.cwd(), "src", "app", "app", "[projectId]");

/** Route folders that intentionally have NO registry entry:
 *   • performance/report — the shareable data-report/chat surface (reached from
 *                          Výkon), not a sidebar module.
 *   • obsah              — legacy redirect → obsahovy-engine (old bookmarks).
 *   • rychla-reakce      — retired redirect → schranka (absorbed as the `leads` channel).
 *  Add here (with a reason) when a route deliberately isn't a sidebar module. */
const ROUTE_EXEMPTIONS = new Set(["performance/report", "obsah", "rychla-reakce"]);

const AREA_SLUGS = new Set(AREAS.map((a) => a.slug).filter(Boolean));

/** Every folder under [projectId] that renders a page, as a relative segment. */
function pageSegments(dir = ROUTES_DIR, prefix = "") {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const seg = prefix ? `${prefix}/${e.name}` : e.name;
    if (existsSync(join(dir, e.name, "page.tsx"))) out.push(seg);
    out.push(...pageSegments(join(dir, e.name), seg));
  }
  return out;
}

test("every MODULES entry maps to a real page (key '' = the project root)", () => {
  for (const m of MODULES) {
    const seg = moduleSegment(m);
    const page = seg ? join(ROUTES_DIR, ...seg.split("/"), "page.tsx") : join(ROUTES_DIR, "page.tsx");
    assert.ok(existsSync(page), `module "${m.key}" has no page at src/app/app/[projectId]/${seg}/page.tsx`);
  }
});

test("every page folder is a module, an area roof, a nested route of one, or an exemption", () => {
  const segs = new Set(MODULES.map((m) => moduleSegment(m)).filter(Boolean));
  for (const seg of pageSegments()) {
    if (segs.has(seg) || AREA_SLUGS.has(seg) || ROUTE_EXEMPTIONS.has(seg)) continue;
    // A page nested inside a module's own folder (a sub-route of the room) is the module's.
    if ([...segs].some((s) => seg.startsWith(`${s}/`))) continue;
    assert.fail(
      `route folder "${seg}" has no MODULES entry, is not an area roof and isn't in ROUTE_EXEMPTIONS — ` +
        `either register it or add it to the exemption list with a reason.`
    );
  }
});

test("no stale exemption — every exempted folder still exists", () => {
  for (const ex of ROUTE_EXEMPTIONS) {
    assert.ok(existsSync(join(ROUTES_DIR, ...ex.split("/"), "page.tsx")), `exempted route "${ex}" no longer exists`);
  }
});

test("every area slug has a roof page, and a roof module IS the roof", () => {
  for (const a of AREAS) {
    if (!a.slug) continue;
    assert.ok(existsSync(join(ROUTES_DIR, a.slug, "page.tsx")), `area "${a.key}" has no roof page`);
  }
  assert.equal(moduleSegment(MODULES.find((m) => m.key === "vykon")), "performance");
});

test("every module that moved has a redirect from its old flat URL", () => {
  const moved = new Map(movedModuleRoutes().map((r) => [r.from, r.to]));
  for (const m of MODULES) {
    const seg = moduleSegment(m);
    if (!m.key || seg === m.key) continue;
    assert.equal(moved.get(m.key), seg, `module "${m.key}" moved to "${seg}" without a redirect`);
  }
  // A redirect source must never shadow a live page.
  for (const from of moved.keys()) {
    assert.ok(!existsSync(join(ROUTES_DIR, from, "page.tsx")), `"${from}" redirects away but still has a page`);
  }
});

// --- sort pin: current rendering must stay byte-identical ------------------
// 2026-10-13 (ADR-0013): modules are grouped by AREA (home, performance, reach,
// local, studio, channels, then the settings menu), not by the old sections.
// Within an area the registry `order` still decides. A diff here means the
// sidebar order changed — intentional edits update this map.
const EXPECTED_ORDER = {
  eshop: ["", "start", "vykon", "knihovna", "reporty", "zisk", "ltv", "mesicni-report", "kampane", "klicova-slova", "sklad-sezonnost", "obsahovy-engine", "kreativa", "produktova-kreativa", "ulozeny-obsah", "kanaly", "socialni", "twin", "sprava-kanalu", "schranka", "leady", "katalog", "ucet", "branding", "spotreba", "aktivita", "integrace", "nastaveni"],
  app: ["", "start", "vykon", "knihovna", "reporty", "ltv", "mesicni-report", "kampane", "klicova-slova", "srovnani-seo", "obsahovy-engine", "experimenty-lp", "ulozeny-obsah", "kanaly", "socialni", "twin", "sprava-kanalu", "schranka", "leady", "katalog", "ucet", "branding", "spotreba", "aktivita", "integrace", "nastaveni"],
  leadgen: ["", "start", "vykon", "knihovna", "reporty", "kvalita-leadu", "mesicni-report", "kampane", "klicova-slova", "lokalni", "obsahovy-engine", "ulozeny-obsah", "kanaly", "twin", "sprava-kanalu", "schranka", "leady", "katalog", "ucet", "branding", "spotreba", "aktivita", "integrace", "nastaveni"],
  content: ["", "start", "vykon", "reporty", "publikum", "mesicni-report", "klicova-slova", "obsahovy-engine", "kreativa", "ulozeny-obsah", "kanaly", "socialni", "twin", "sprava-kanalu", "schranka", "distribuce", "leady", "katalog", "ucet", "branding", "spotreba", "aktivita", "integrace", "nastaveni"],
  local: ["", "start", "vykon", "reporty", "mesicni-report", "kampane", "klicova-slova", "recenze", "obsah-plan", "lokalni", "mapa", "obsahovy-engine", "ulozeny-obsah", "kanaly", "socialni", "twin", "sprava-kanalu", "schranka", "leady", "katalog", "ucet", "branding", "spotreba", "aktivita", "integrace", "nastaveni"],
};

test("modulesFor output is pinned per project type (order field preserves rendering)", () => {
  for (const type of PROJECT_TYPES) {
    assert.deepEqual(modulesFor(type).map((m) => m.key), EXPECTED_ORDER[type], `sidebar order drifted for "${type}"`);
  }
});

test("order values are unique and area-monotonic (a real tiebreak)", () => {
  const orders = MODULES.map((m) => m.order);
  assert.equal(new Set(orders).size, orders.length, "duplicate order values");
  for (const m of MODULES) assert.ok(AREA_ORDER.includes(m.area), `module "${m.key}" has unknown area "${m.area}"`);
});

// --- ADR-0013: an area appears only where the type has rooms in it -----------
test("Local is a roof only for the types that have a Local room", () => {
  assert.deepEqual(areasFor("local"), ["home", "performance", "reach", "local", "studio", "channels"]);
  assert.deepEqual(areasFor("leadgen"), ["home", "performance", "reach", "local", "studio", "channels"]);
  for (const t of ["eshop", "app", "content"]) assert.ok(!areasFor(t).includes("local"), `${t} must not see Local`);
});

// --- ADR-0009: the free-channels module leads its area -----------------------
// The checklist sends every new tenant to kanaly first; a later `channels` entry
// with a lower `order` would silently demote it on the Channels roof and rail.
test("kanaly is the first module in the channels area, for every type that has it", () => {
  for (const type of PROJECT_TYPES) {
    const inArea = modulesFor(type).filter((m) => m.area === "channels");
    if (inArea.length === 0) continue;
    assert.equal(inArea[0].key, "kanaly", `channels does not lead with kanaly for "${type}"`);
  }
});
