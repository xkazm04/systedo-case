/** Step 5 — the plan as a WORKING DOCUMENT, on the pinned AI plan (the e2e spec
 *  only pins this against the seeded plan).
 *   a) make a decision in the wizard, reload, assert the stage survived;
 *   b) REGENERATE (a second real channel-research call) and watch what the
 *      reconcile does to a decision whose channel the new plan may rename. */
import { open, shot, dump, saveState, state, BASE } from "./lib.mjs";

const who = process.argv[2] ?? "standa";
const s = state();
const projectId = who === "radek" ? s.radekProjectId : s.standaProjectId;

const { browser, page } = await open();
try {
  await page.goto(`${BASE}/app/${projectId}/kanaly`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { level: 2, name: /Kanály zdarma/ }).first().waitFor({ timeout: 90_000 });
  await page.waitForTimeout(1500);

  const table = page.locator("table").first();
  const topRow = table.locator("tbody tr").first();
  const decided = (await topRow.locator("td").first().innerText()).split("\n")[0].trim();
  console.log("deciding on:", decided);

  await topRow.getByRole("button", { name: /Nastavit kanál/ }).click();
  const wizard = page.getByRole("dialog").first();
  await wizard.waitFor({ timeout: 20_000 });
  await shot(page, `${who}-40-wizard`);
  dump(`${who}-40-wizard`, await wizard.innerText());

  await wizard.getByRole("button", { name: /Ručně/ }).first().click();
  const save = wizard.getByRole("button", { name: /Uložit plán/ });
  for (let i = 0; i < 4 && !(await save.isVisible().catch(() => false)); i++) {
    await wizard.getByRole("button", { name: /^Pokračovat$/ }).click();
    await page.waitForTimeout(300);
  }
  const saved = page.waitForResponse(
    (r) => r.url().includes("/organic-channels") && r.request().method() === "POST",
    { timeout: 60_000 }
  );
  await save.click();
  console.log("wizard POST →", (await saved).status());
  await page.waitForTimeout(1500);
  if (await page.getByRole("dialog").first().isVisible().catch(() => false)) {
    await page.keyboard.press("Escape");
  }

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { level: 2, name: /Kanály zdarma/ }).first().waitFor({ timeout: 90_000 });
  await page.waitForTimeout(1500);
  const row = page.locator("table tbody tr").filter({ hasText: decided }).first();
  const rowText = await row.innerText();
  console.log("AFTER RELOAD row:", JSON.stringify(rowText.replace(/\s+/g, " ")));
  await shot(page, `${who}-41-decision-after-reload`);
  dump(`${who}-41-decision-after-reload`, await page.locator("main").innerText());

  // b) regenerate — the rename/reconcile case.
  const t0 = Date.now();
  const respP = page.waitForResponse(
    (r) => r.url().includes("/api/ai") && r.request().method() === "POST",
    { timeout: 300_000 }
  );
  await page.getByRole("button", { name: /Přegenerovat/ }).first().click();
  const resp = await respP;
  const wall = Date.now() - t0;
  const json = await resp.json().catch(() => null);
  console.log(`REGENERATE: wall=${(wall / 1000).toFixed(1)}s names=`,
    (json?.result?.channels ?? []).map((c) => c.name).join(" | "));
  dump(`${who}-42-regenerate-response`, JSON.stringify(json, null, 2));
  saveState({ [`${who}RegenWallMs`]: wall });

  await page.getByRole("button", { name: /Použít tento plán/ }).click();
  await page.waitForTimeout(2500);
  if (await page.getByRole("dialog").first().isVisible().catch(() => false)) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
  }
  await shot(page, `${who}-43-after-regenerate-apply`);
  dump(`${who}-43-after-regenerate-apply`, await page.locator("main").innerText());

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { level: 2, name: /Kanály zdarma/ }).first().waitFor({ timeout: 90_000 });
  await page.waitForTimeout(1500);
  await shot(page, `${who}-44-after-regenerate-reload`);
  dump(`${who}-44-after-regenerate-reload`, await page.locator("main").innerText());
  console.log("DONE");
} finally {
  await browser.close();
}
