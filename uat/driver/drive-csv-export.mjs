// Bespoke driver: select a product, click "Exportovat CSV", capture the downloaded file content.
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3002";
const [path, shot, productName] = process.argv.slice(2);
const outDir = (process.env.SHOT_DIR ?? "uat/_shots").replace(/\/?$/, "/");
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 1200 }, acceptDownloads: true });
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

let downloadInfo = null;
try {
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 10000 }),
    page.getByRole("button", { name: /Exportovat CSV/i }).first().click(),
  ]);
  const dlPath = `${outDir}${shot}.csv`;
  await download.saveAs(dlPath);
  const fs = await import("node:fs");
  const buf = fs.readFileSync(dlPath);
  downloadInfo = {
    suggestedFilename: download.suggestedFilename(),
    byteLength: buf.length,
    firstBytesHex: buf.subarray(0, 8).toString("hex"),
    text: buf.toString("utf-8"),
  };
} catch (e) {
  downloadInfo = { error: String(e).split("\n")[0] };
}

writeFileSync(`${outDir}${shot}.download.json`, JSON.stringify(downloadInfo, null, 2));
console.log("download result:", JSON.stringify(downloadInfo, null, 2).slice(0, 2000));
await browser.close();
