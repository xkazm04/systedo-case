/** Step 2 — open /kanaly on the seeded plan, then press "Sestavit plán na míru
 *  (AI)" and TIME the real channel-research call. Dumps the wire request, the
 *  wire response and the rendered plan, applies it, reloads and re-dumps. */
import { open, shot, dump, saveState, state, BASE } from "./lib.mjs";

const who = process.argv[2] ?? "standa";
const s = state();
const projectId = who === "radek" ? s.radekProjectId : s.standaProjectId;
if (!projectId) throw new Error(`no project id for ${who}`);

const { browser, page } = await open();
try {
  await page.goto(`${BASE}/app/${projectId}/kanaly`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { level: 2, name: /Kanály zdarma/ }).first().waitFor({ timeout: 90_000 });
  await page.waitForTimeout(1200);
  await shot(page, `${who}-10-kanaly-seeded`);
  dump(`${who}-10-kanaly-seeded`, await page.locator("main").innerText());

  // Capture the exact wire request the client sends (the grounding proof).
  let wireReq = null;
  page.on("request", (r) => {
    if (r.url().includes("/api/ai") && r.method() === "POST") {
      try {
        wireReq = r.postDataJSON();
      } catch {}
    }
  });

  const t0 = Date.now();
  const respP = page.waitForResponse(
    (r) => r.url().includes("/api/ai") && r.request().method() === "POST",
    { timeout: 300_000 }
  );
  await page.getByRole("button", { name: /Sestavit plán na míru \(AI\)|Přegenerovat/ }).first().click();
  const resp = await respP;
  const wallMs = Date.now() - t0;
  const json = await resp.json().catch(() => null);
  console.log(`CHANNEL-RESEARCH: http=${resp.status()} wall=${(wallMs / 1000).toFixed(1)}s`);
  console.log("meta:", JSON.stringify(json?.meta ?? null));
  dump(`${who}-11-wire-request`, JSON.stringify(wireReq, null, 2));
  dump(`${who}-11-wire-response`, JSON.stringify(json, null, 2));
  saveState({ [`${who}ResearchWallMs`]: wallMs, [`${who}ResearchMeta`]: json?.meta ?? null });

  // The "plan is ready" banner, then the rendered preview.
  await page.getByText(/Plán na míru je připravený/).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(800);
  await shot(page, `${who}-12-kanaly-ai-preview`);
  dump(`${who}-12-kanaly-ai-preview`, await page.locator("main").innerText());

  // Pin it.
  const saved = page.waitForResponse(
    (r) => r.url().includes(`/organic-channels`) && r.request().method() === "POST",
    { timeout: 60_000 }
  );
  await page.getByRole("button", { name: /Použít tento plán/ }).click();
  const sres = await saved;
  console.log("POST /organic-channels →", sres.status());
  await page.waitForTimeout(2500);
  // The apply auto-opens the setup wizard for the top-3 unconfigured channels;
  // close it so the reload proof is about the PLAN, not the wizard.
  const esc = page.getByRole("dialog").first();
  if (await esc.isVisible().catch(() => false)) await page.keyboard.press("Escape");
  await page.waitForTimeout(500);

  // THE PIN PROOF: full reload, server-rendered from the store.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { level: 2, name: /Kanály zdarma/ }).first().waitFor({ timeout: 90_000 });
  await page.waitForTimeout(1500);
  await shot(page, `${who}-13-kanaly-pinned-after-reload`);
  dump(`${who}-13-kanaly-pinned-after-reload`, await page.locator("main").innerText());

  // And the other end of the path.
  await page.goto(`${BASE}/app/${projectId}/klicova-slova`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { level: 2, name: /Klíčová slova/ }).first().waitFor({ timeout: 90_000 });
  await page.waitForTimeout(1500);
  await shot(page, `${who}-14-klicova-slova`);
  dump(`${who}-14-klicova-slova`, await page.locator("main").innerText());
  console.log("DONE");
} finally {
  await browser.close();
}
