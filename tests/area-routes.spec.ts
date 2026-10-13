/**
 * ADR-0013: modules moved from flat /app/[id]/<key> URLs to rooms nested under
 * their area. A bookmark that breaks must break a test, so every old URL is
 * asserted to answer 308 with its nested location — read from the registry, so
 * a room that moves later is covered without editing this file. The redirects
 * are config-level (next.config.ts), so they answer before auth: any id works.
 *
 * Then, with the dev-auth user and a scratch `local` project (it has all six areas),
 * every roof renders its rooms, a room links back to its roof, and an e-shop gets
 * the not-found page on Local.
 */
import { test, expect } from "@playwright/test";
import { movedModuleRoutes } from "../src/lib/projects/modules";
import { gotoAppHub } from "./support";

const PID = "redirect-probe";

test.describe("ADR-0013 — old module URLs redirect to their area", () => {
  for (const { from, to } of [...movedModuleRoutes(), { from: "report", to: "performance/report" }]) {
    test(`/app/:id/${from} → /app/:id/${to}`, async ({ request }) => {
      const res = await request.get(`/app/${PID}/${from}?x=1`, { maxRedirects: 0 });
      expect(res.status()).toBe(308);
      expect(new URL(res.headers()["location"]!, "http://h").pathname).toBe(`/app/${PID}/${to}`);
    });
  }
});

test.describe.serial("ADR-0013 — area roofs render", () => {
  let projectId = "";
  /** Every scratch project this describe creates — removed even when a test fails. */
  const created: string[] = [];
  test.afterAll(async ({ request }) => {
    for (const id of created) await request.delete(`/api/projects/${id}`);
  });

  test("creates a scratch local project (it has all six areas)", async ({ page }) => {
    const state = await gotoAppHub(page);
    test.skip(state === "gate", "DEV_AUTH is off — /app renders the sign-in gate");
    const res = await page.request.post("/api/projects", { data: { name: `E2E roofs ${Date.now()}`, type: "local" } });
    expect(res.ok(), `POST /api/projects → ${res.status()}`).toBeTruthy();
    const body = (await res.json()) as { project?: { id?: string }; id?: string };
    projectId = body.project?.id ?? body.id ?? "";
    expect(projectId).not.toEqual("");
    created.push(projectId);
  });

  test("each roof shows its rooms, and a room leads back to its roof", async ({ page }) => {
    test.skip(!projectId, "no scratch project");
    const base = `/app/${projectId}`;
    const names: Record<string, RegExp> = { reach: /Reach|Dosah/, local: /Local|Lokální/, studio: /Studio|Tvorba/, channels: /Channels|Kanály/ };
    for (const slug of ["reach", "local", "studio", "channels"]) {
      await page.goto(`${base}/${slug}`);
      await expect(page.getByRole("heading", { level: 2, name: names[slug] }).first()).toBeVisible({ timeout: 45_000 });
      await expect(page.locator(`a[href^="${base}/${slug}/"]`).first()).toBeVisible();
    }
    await page.goto(`${base}/channels/kanaly`);
    const back = page.getByRole("navigation", { name: /breadcrumb|drobečková/i }).getByRole("link");
    await expect(back).toHaveAttribute("href", `${base}/channels`, { timeout: 45_000 });
  });

  test("an e-shop has no Local roof", async ({ page }) => {
    test.skip(!projectId, "no scratch project");
    const res = await page.request.post("/api/projects", { data: { name: `E2E eshop ${Date.now()}`, type: "eshop" } });
    const body = (await res.json()) as { project?: { id?: string }; id?: string };
    const eshop = body.project?.id ?? body.id ?? "";
    created.push(eshop);
    // Streamed rendering (Cache Components) answers 200 and renders the not-found
    // boundary, so assert the boundary, not the status code.
    await page.goto(`/app/${eshop}/local`);
    await expect(page.getByRole("heading", { name: /Page not found|Stránka nenalezena/ })).toBeVisible({ timeout: 45_000 });
  });

});
