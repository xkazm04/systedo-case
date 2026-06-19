// EV2 verification: generate a brief and report the scorecard's keyword-coverage
// chips (title / meta / first-section). Brief-only (skips the heavy draft step).
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";

const PORT = process.env.E2E_PORT ?? "3100";
const shots = new URL("../shots/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const base = `http://localhost:${PORT}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 1500 } });
await page.goto(`${base}/ai-asistent`, { waitUntil: "networkidle", timeout: 60000 });
await page.getByRole("tab", { name: /Obsahový brief/ }).click();
await page.waitForTimeout(300);
await page.getByRole("button", { name: /Vyplnit ukázku/ }).click();
await page.waitForTimeout(300);
await page.getByRole("button", { name: /Vytvořit brief/ }).click();

const t0 = Date.now();
let txt = "";
while (Date.now() - t0 < 130000) {
  txt = await page.locator("body").innerText();
  if (/Title tag|Stáhnout \.md/.test(txt)) break;
  if (/neodpověděl do \d+ sekund/i.test(txt)) { console.log("TIMEOUT"); break; }
  await page.waitForTimeout(2000);
}
await page.screenshot({ path: `${shots}/eva-brief-ev2.png`, fullPage: true });
writeFileSync(`${shots}/eva-brief-ev2.text.txt`, txt.slice(0, 9000));

const grab = (re) => (txt.match(re)?.[0] ?? "(not found)").replace(/\s+/g, " ").trim();
console.log(`done after ~${Math.round((Date.now() - t0) / 1000)}s`);
console.log("META  :", grab(/Klíčové slovo (je|chybí) v meta popisku\./));
console.log("INTRO :", grab(/Klíčové slovo (je|chybí) v první sekci osnovy\./));
console.log("TITLE :", grab(/Klíčové slovo (je|chybí) v title tagu\./));
await browser.close();
