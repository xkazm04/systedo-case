// Minimal UAT browser driver for the pilot discovery pass.
// Drives a route in chromium, captures a screenshot + accessibility snapshot +
// visible text so the Character (the LLM) can perceive the page and decide.
// Usage: node drive.mjs <path> <shotName> [clickRoleName]
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";

const PORT = process.env.E2E_PORT ?? "3100";
const [path = "/dashboard", shot = "page", clickName] = process.argv.slice(2);
const base = `http://localhost:${PORT}`;
const outDir = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const shotsDir = outDir.replace(/driver\/?$/, "shots");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
await page.goto(base + path, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(800);

if (clickName) {
  try {
    await page.getByRole("button", { name: new RegExp(clickName) }).first().click();
    await page.waitForTimeout(800);
  } catch (e) {
    console.log("click failed:", String(e).split("\n")[0]);
  }
}

await page.screenshot({ path: `${shotsDir}/${shot}.png`, fullPage: true });
const snapshot = await page.locator("body").ariaSnapshot();
const text = (await page.locator("body").innerText()).slice(0, 6000);
writeFileSync(`${shotsDir}/${shot}.a11y.yaml`, snapshot);
writeFileSync(`${shotsDir}/${shot}.text.txt`, text);
console.log("title:", await page.title());
console.log("url:", page.url());
console.log("captured:", `${shot}.png / ${shot}.a11y.json / ${shot}.text.txt`);
await browser.close();
