/** Step 6 — the AFTER measurement for the sample-catalog grounding fix, live
 *  against the worktree's own dev server (BASE_URL=:3108).
 *
 *  Two fresh projects, so nothing is served from the 15-minute response cache:
 *   • leadgen, no scan   → the seed's "Ukázková služba A/B" must not reach the wire
 *                          and must not come back as advice;
 *   • app, scan applied  → the tenant's own scanned offering must reach the wire
 *                          instead of the seed's "Předplatné / Free / Pro / Team". */
import { open, shot, dump, saveState, BASE } from "./lib.mjs";

const { browser, page } = await open();
const out = {};
try {
  // ---------- A. leadgen, catalog-first, no scan ----------
  let res = await page.request.post(`${BASE}/api/projects`, {
    data: { name: "Radek Poradenstvi (po opravě)", type: "leadgen" },
  });
  const a = (await res.json()).project?.id ?? (await res.json()).id;
  console.log("A leadgen id", a, res.status());

  const runOne = async (projectId, tag) => {
    await page.goto(`${BASE}/app/${projectId}/kanaly`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { level: 2, name: /Kanály zdarma/ }).first().waitFor({ timeout: 180_000 });
    // The tailor CTA is gated by the AI preflight (`/api/ai/status`), which on this
    // box takes 17-27s because the durable rate limiter keeps reaching for a
    // Firestore it has no credentials for. Wait for the control to be ENABLED
    // rather than for a fixed settle.
    const cta = page.getByRole("button", { name: /Sestavit plán na míru \(AI\)|Přegenerovat/ }).first();
    await cta.waitFor({ timeout: 120_000 });
    for (let i = 0; i < 120 && (await cta.isDisabled().catch(() => true)); i++) {
      await page.waitForTimeout(1000);
    }
    let wireReq = null;
    const onReq = (r) => {
      if (r.url().includes("/api/ai") && r.method() === "POST") {
        try { wireReq = r.postDataJSON(); } catch {}
      }
    };
    page.on("request", onReq);
    const t0 = Date.now();
    const respP = page.waitForResponse(
      (r) => r.url().includes("/api/ai") && r.request().method() === "POST",
      { timeout: 300_000 }
    );
    await cta.click();
    const resp = await respP;
    const wall = Date.now() - t0;
    const json = await resp.json().catch(() => null);
    page.off("request", onReq);
    dump(`fix-${tag}-wire-request`, JSON.stringify(wireReq, null, 2));
    dump(`fix-${tag}-wire-response`, JSON.stringify(json, null, 2));
    const blob = JSON.stringify(json);
    const leak = (blob.match(/Ukázk/g) ?? []).length;
    console.log(`${tag}: wall=${(wall / 1000).toFixed(1)}s meta=${JSON.stringify(json?.meta)}`);
    console.log(`${tag}: wire=`, JSON.stringify(wireReq));
    console.log(`${tag}: "Ukázk" occurrences in the returned plan: ${leak}`);
    console.log(`${tag}: channels=`, (json?.result?.channels ?? []).map((c) => c.name).join(" | "));
    await page.waitForTimeout(1200);
    await shot(page, `fix-${tag}-preview`);
    return { wall, wireReq, leak, meta: json?.meta, channels: (json?.result?.channels ?? []).length };
  };

  out.leadgen = await runOne(a, "leadgen");

  // ---------- B. app + applied scan ----------
  res = await page.request.post(`${BASE}/api/projects`, {
    data: { name: "Fakturoid (po opravě)", type: "app" },
  });
  const b = (await res.json()).project?.id ?? (await res.json()).id;
  console.log("B app id", b, res.status());

  await page.goto(`${BASE}/app/${b}/start`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: /Vítejte/ }).waitFor({ timeout: 180_000 });
  await page.locator('input[placeholder="vasefirma.cz"]').fill("fakturoid.cz");
  const scanP = page.waitForResponse(
    (r) => r.url().includes("/api/ai") && r.request().method() === "POST",
    { timeout: 240_000 }
  );
  await page.getByRole("button", { name: /^Naskenovat$/ }).click();
  await scanP;
  await page.getByRole("heading", { name: /Zkontrolujte profil/ }).waitFor({ timeout: 60_000 });
  await page.getByRole("button", { name: /Použít a naplnit aplikaci/ }).click();
  await page.getByRole("heading", { name: /Hotovo\. Aplikace mluví/ }).waitFor({ timeout: 90_000 });
  console.log("scan applied for B");

  out.app = await runOne(b, "app");

  saveState({ fixLeadgenProjectId: a, fixAppProjectId: b, fixVerification: out });
  dump("fix-verification", JSON.stringify(out, null, 2));
} finally {
  await browser.close();
}
