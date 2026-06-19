// Bespoke L2 driver: prove Tobias's competitor-grounding fix end-to-end live.
// Fills the competitor + positioning inputs, generates one comparison outline, and
// waits for the real-Claude result — then checks the output echoes the real entity
// ("Asana") that only appears if the model grounded in the supplied context.
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const outDir = "uat/runs/2026-06-19-L2-cert/shots/";
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 2200 } });
await page.goto(BASE + "/app/demo-app/srovnani-seo", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
await page.waitForTimeout(600);

await page.getByPlaceholder(/Konkurent X/).fill("Asana");
await page
  .getByPlaceholder(/levnější/)
  .fill("levnější, plně česky, napojení na Sklik a Fakturoid, data v EU");
await page.getByRole("button", { name: /Vygenerovat srovnání/ }).first().click();

// Poll for the generated outline echoing "Asana" — it appears in the body text only
// if the model used our supplied competitor (the query rows never mention it).
const start = Date.now();
let hit = false;
while (Date.now() - start < 135000) {
  await page.waitForTimeout(3000);
  const t = await page.locator("body").innerText();
  if (/Asana/.test(t)) {
    hit = true;
    break;
  }
}
await page.waitForTimeout(1000);
await page.screenshot({ path: outDir + "tobias-grounded.png", fullPage: true });
writeFileSync(outDir + "tobias-grounded.text.txt", (await page.locator("body").innerText()).slice(0, 14000));
console.log("grounded-hit:", hit, "elapsed:", Math.round((Date.now() - start) / 1000) + "s");
await browser.close();
