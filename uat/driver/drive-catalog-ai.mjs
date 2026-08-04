// Bespoke driver: select a product by name, then click "Generovat AI texty" and poll.
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3002";
const [path, shot, productName, generateName] = process.argv.slice(2);
const outDir = (process.env.SHOT_DIR ?? "uat/_shots").replace(/\/?$/, "/");
const MAX_MS = Number(process.env.AI_MAX_MS ?? 140000);
const LOADING = /Generuji|Navrhuji|Analyzuji|Generuje|Načít|Loading|Generating/i;
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 2200 } });
await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
await page.waitForTimeout(600);

if (productName) {
  try {
    await page.getByRole("button", { name: new RegExp(productName) }).first().click();
    await page.waitForTimeout(400);
  } catch (e) {
    console.log("product click failed:", String(e).split("\n")[0]);
  }
}

try {
  await page.getByRole("button", { name: new RegExp(generateName || "Generovat AI texty") }).first().click();
} catch (e) {
  console.log("generate click failed:", String(e).split("\n")[0]);
}

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
writeFileSync(`${outDir}${shot}.aria.yaml`, await page.locator("body").ariaSnapshot());
console.log(`captured: ${shot}.{png,text.txt,aria.yaml} · elapsed:${Math.round((Date.now() - start) / 1000)}s`);
await browser.close();
