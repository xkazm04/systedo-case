// Eva's loop: SEO brief → publishable draft on /ai-asistent. Real model calls
// under the workspace's 60s client ceiling (useAiTool AI_TIMEOUT_MS). Polls for
// the outcome (done | timeout) instead of blindly waiting the full ceiling.
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";

const PORT = process.env.E2E_PORT ?? "3100";
const shots = new URL("../shots/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const base = `http://localhost:${PORT}`;

async function waitOutcome(page, doneRe, maxMs = 190000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const txt = await page.locator("body").innerText();
    if (doneRe.test(txt)) return { state: "done", ms: Date.now() - t0 };
    if (/neodpověděl do \d+ sekund/i.test(txt)) return { state: "timeout", ms: Date.now() - t0 };
    await page.waitForTimeout(2000);
  }
  return { state: "unknown", ms: Date.now() - t0 };
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 1500 } });
await page.goto(`${base}/ai-asistent`, { waitUntil: "networkidle", timeout: 60000 });

await page.getByRole("tab", { name: /Obsahový brief/ }).click();
await page.waitForTimeout(400);
await page.getByRole("button", { name: /Vyplnit ukázku/ }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${shots}/eva-brief-form.png`, fullPage: true });

await page.getByRole("button", { name: /Vytvořit brief/ }).click();
const brief = await waitOutcome(page, /Rozepsat článek|Stáhnout \.md|Title tag/);
console.log(`brief: ${brief.state} after ~${Math.round(brief.ms / 1000)}s`);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${shots}/eva-brief-result.png`, fullPage: true });
writeFileSync(`${shots}/eva-brief-result.text.txt`, (await page.locator("body").innerText()).slice(0, 9000));

if (brief.state === "done") {
  const draftBtn = page.getByRole("button", { name: /Rozepsat článek/ });
  if (await draftBtn.count()) {
    await draftBtn.first().scrollIntoViewIfNeeded();
    await draftBtn.first().click();
    const draft = await waitOutcome(page, /Stáhnout \.json|Vygenerovat znovu/);
    console.log(`article-draft: ${draft.state} after ~${Math.round(draft.ms / 1000)}s`);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${shots}/eva-draft-result.png`, fullPage: true });
    writeFileSync(`${shots}/eva-draft-result.text.txt`, (await page.locator("body").innerText()).slice(0, 9000));
  }
} else {
  console.log("brief did not complete — skipping draft step");
}
await browser.close();
