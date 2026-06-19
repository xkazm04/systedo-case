// Tomáš's deep steps: sort worst-first, then run the live AI evaluation on the
// top critical campaign and capture the grounded report.
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";

const PORT = process.env.E2E_PORT ?? "3100";
const shots = new URL("../shots/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const base = `http://localhost:${PORT}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 1300 } });
await page.goto(`${base}/app/demo-eshop/kampane`, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(1000);

// 1) Sort by priority and capture the resulting order.
try {
  await page.getByRole("button", { name: /Seřadit podle priority/ }).click();
  await page.waitForTimeout(700);
} catch (e) {
  console.log("sort click failed:", String(e).split("\n")[0]);
}
await page.screenshot({ path: `${shots}/kampane-sorted.png`, fullPage: true });

// 2) Run the live AI evaluation on the top critical campaign (Demand Gen · Akvizice).
const row = page.getByRole("row").filter({ hasText: "Demand Gen · Akvizice" });
const analyzeBtn = row.getByRole("button", { name: /Analyzovat|Znovu/i }).first();
const respP = page
  .waitForResponse((r) => r.url().includes("/api/campaigns/analyze"), { timeout: 150000 })
  .catch(() => null);
const t0 = Date.now();
try {
  await analyzeBtn.click();
} catch (e) {
  console.log("analyze click failed:", String(e).split("\n")[0]);
}
const resp = await respP;
console.log("analyze response:", resp ? `${resp.status()} in ${Date.now() - t0}ms` : "none (timeout)");
// give the report card time to render/animate in
await page.waitForTimeout(3000);
await page.screenshot({ path: `${shots}/kampane-analyzed.png`, fullPage: true });
writeFileSync(`${shots}/kampane-analyzed.text.txt`, (await page.locator("body").innerText()).slice(0, 9000));
console.log("captured: kampane-sorted.png / kampane-analyzed.png / kampane-analyzed.text.txt");
await browser.close();
