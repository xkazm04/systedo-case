/** Step 7 — the AFTER measurement, leg B: an `app` project with an APPLIED website
 *  scan. Before the fix the wire carried the starter catalog's "Předplatné" +
 *  "Free / Pro / Team" and the tenant's own scanned offering never left the store. */
import { open, shot, dump, saveState, BASE } from "./lib.mjs";

const { browser, page } = await open();
page.on("close", () => console.log("!! page closed"));
page.on("crash", () => console.log("!! page CRASHED"));
browser.on("disconnected", () => console.log("!! browser disconnected"));
try {
  const res = await page.request.post(`${BASE}/api/projects`, {
    data: { name: "Fakturoid (po opravě)", type: "app" },
  });
  const id = (await res.json()).project?.id;
  console.log("app id", id, res.status());

  await page.goto(`${BASE}/app/${id}/start`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: /Vítejte/ }).waitFor({ timeout: 180_000 });
  await page.locator('input[placeholder="vasefirma.cz"]').fill("fakturoid.cz");
  const scanBtn = page.getByRole("button", { name: /^Naskenovat$/ });
  for (let i = 0; i < 120 && (await scanBtn.isDisabled().catch(() => true)); i++) {
    await page.waitForTimeout(1000);
  }
  const scanP = page.waitForResponse(
    (r) => r.url().includes("/api/ai") && r.request().method() === "POST",
    { timeout: 300_000 }
  );
  await scanBtn.click();
  await scanP;
  await page.getByRole("heading", { name: /Zkontrolujte profil/ }).waitFor({ timeout: 60_000 });
  await page.getByRole("button", { name: /Použít a naplnit aplikaci/ }).click();
  await page.getByRole("heading", { name: /Hotovo\. Aplikace mluví/ }).waitFor({ timeout: 120_000 });
  console.log("scan applied");

  await page.goto(`${BASE}/app/${id}/kanaly`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { level: 2, name: /Kanály zdarma/ }).first().waitFor({ timeout: 180_000 });
  const cta = page.getByRole("button", { name: /Sestavit plán na míru \(AI\)|Přegenerovat/ }).first();
  await cta.waitFor({ timeout: 120_000 });
  for (let i = 0; i < 120 && (await cta.isDisabled().catch(() => true)); i++) {
    await page.waitForTimeout(1000);
  }
  let wireReq = null;
  page.on("request", (r) => {
    if (r.url().includes("/api/ai") && r.method() === "POST") {
      try { wireReq = r.postDataJSON(); } catch {}
    }
  });
  const t0 = Date.now();
  const respP = page.waitForResponse(
    (r) => r.url().includes("/api/ai") && r.request().method() === "POST",
    { timeout: 300_000 }
  );
  await cta.click();
  const resp = await respP;
  const wall = Date.now() - t0;
  const json = await resp.json().catch(() => null);
  dump("fix-app-wire-request", JSON.stringify(wireReq, null, 2));
  dump("fix-app-wire-response", JSON.stringify(json, null, 2));
  console.log(`app: wall=${(wall / 1000).toFixed(1)}s meta=${JSON.stringify(json?.meta)}`);
  console.log("app: wire=", JSON.stringify(wireReq));
  console.log("app: channels=", (json?.result?.channels ?? []).map((c) => c.name).join(" | "));
  await page.waitForTimeout(1500);
  await shot(page, "fix-app-preview");
  saveState({ fixAppProjectId: id, fixAppWallMs: wall });
} finally {
  await browser.close();
}
