// Bespoke: click the "Vygenerovat srovnání" button on the "vs Notion" row specifically (2nd row),
// with fields left blank — to test VOJ-L1-02 on the JTBD-critical "vs Competitor" row, not the
// "cena" row (which has no natural competitor).
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3002";
const outDir = (process.env.SHOT_DIR ?? "uat/_shots").replace(/\/?$/, "/");
const shot = process.argv[2] || "vs-notion";
const MAX_MS = Number(process.env.AI_MAX_MS ?? 140000);
const LOADING = /Generuji|Navrhuji|Analyzuji|Generuje|Načít|Loading|Generating/i;
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 2200 } });
await page.goto(BASE + "/app/demo-app/srovnani-seo", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
await page.waitForTimeout(600);

const buttons = page.getByRole("button", { name: /Vygenerovat srovnání/ });
const count = await buttons.count();
console.log("found buttons:", count);
// row index 1 = "vs Notion" (row 0 = cena)
await buttons.nth(1).click();

const start = Date.now();
let prevLen = -1;
let stable = 0;
while (Date.now() - start < MAX_MS) {
  await page.waitForTimeout(3000);
  const t = await page.locator("body").innerText();
  if (!LOADING.test(t) && Date.now() - start > 12000) {
    if (t.length === prevLen) {
      if (++stable >= 2) break;
    } else {
      stable = 0;
    }
    prevLen = t.length;
  }
}
await page.waitForTimeout(1000);
await page.screenshot({ path: `${outDir}${shot}.png`, fullPage: true });
writeFileSync(`${outDir}${shot}.text.txt`, (await page.locator("body").innerText()).slice(0, 14000));
console.log(`captured: ${shot} elapsed:${Math.round((Date.now() - start) / 1000)}s`);
await browser.close();
