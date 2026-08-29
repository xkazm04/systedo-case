/** Standa, step 1 — cold start from a URL.
 *  Create a scratch `app` project, run the real onboarding scan against a real
 *  Czech product site, review it, apply it. Times the scan. */
import { open, shot, dump, saveState, BASE } from "./lib.mjs";

const URL_TO_SCAN = process.env.SCAN_URL ?? "fakturoid.cz";
const NAME = process.env.PROJECT_NAME ?? "Fakturoid";

const { browser, page } = await open();
try {
  await page.goto(`${BASE}/app`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);

  // Create through the real API (the create FORM is first-run.spec.ts's subject).
  const res = await page.request.post(`${BASE}/api/projects`, {
    data: { name: NAME, type: "app" },
  });
  console.log("POST /api/projects →", res.status());
  const body = await res.json();
  const projectId = body.project?.id ?? body.id;
  console.log("projectId =", projectId);
  saveState({ standaProjectId: projectId, standaName: NAME, scanUrl: URL_TO_SCAN });

  await page.goto(`${BASE}/app/${projectId}/start`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: /Vítejte/ }).waitFor({ timeout: 60_000 });
  await shot(page, "01-standa-start-cold");

  // Fill the URL and scan.
  const input = page.locator('input[placeholder="vasefirma.cz"]');
  await input.fill(URL_TO_SCAN);

  const t0 = Date.now();
  const scanResp = page.waitForResponse(
    (r) => r.url().includes("/api/ai") && r.request().method() === "POST",
    { timeout: 240_000 }
  );
  await page.getByRole("button", { name: /^Naskenovat$/ }).click();
  const resp = await scanResp;
  const scanMs = Date.now() - t0;
  console.log(`SCAN: status=${resp.status()} wall=${(scanMs / 1000).toFixed(1)}s`);
  let payload = null;
  try {
    payload = await resp.json();
  } catch {}
  dump("01-scan-response", JSON.stringify(payload, null, 2));
  console.log("meta:", JSON.stringify(payload?.meta ?? null));

  // Review step
  await page.getByRole("heading", { name: /Zkontrolujte profil/ }).waitFor({ timeout: 30_000 });
  await shot(page, "02-standa-scan-review");
  const reviewText = await page.locator("main").innerText();
  dump("02-scan-review", reviewText);

  // Apply
  await page.getByRole("button", { name: /Použít a naplnit aplikaci/ }).click();
  await page.getByRole("heading", { name: /Hotovo\. Aplikace mluví/ }).waitFor({ timeout: 60_000 });
  await shot(page, "03-standa-scan-applied");
  const appliedText = await page.locator("main").innerText();
  dump("03-scan-applied", appliedText);
  saveState({ scanMs, scanMeta: payload?.meta ?? null });
  console.log("APPLIED OK");
} finally {
  await browser.close();
}
