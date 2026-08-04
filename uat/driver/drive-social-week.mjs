// Bespoke L2 driver for Sofie's "plan a week of social" journey.
// Navigates to /app/demo-eshop/socialni, captures the pre-typing start state
// (brand-voice strip), toggles platforms, runs the WeekPlanner batch,
// captures the filled calendar, then runs the Composer AI draft too.
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3002";
const outDir = (process.env.SHOT_DIR ?? "uat/_shots").replace(/\/?$/, "/");
mkdirSync(outDir, { recursive: true });

async function capture(page, name) {
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${outDir}${name}.png`, fullPage: true });
  writeFileSync(`${outDir}${name}.text.txt`, (await page.locator("body").innerText()).slice(0, 20000));
  writeFileSync(`${outDir}${name}.aria.yaml`, await page.locator("body").ariaSnapshot());
  console.log("captured", name);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 2400 } });
await page.goto(BASE + "/app/demo-eshop/socialni", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
await page.waitForTimeout(1200);

// 1. Start state — brand strip should already show catalogue voice, before any typing.
await capture(page, "01-start-state");

// 2. Toggle Facebook + TikTok on (Instagram is on by default) for the batch.
try {
  await page.getByRole("button", { name: /^Facebook$/ }).first().click();
  await page.getByRole("button", { name: /^TikTok$/ }).first().click();
} catch (e) {
  console.log("platform toggle failed:", String(e).split("\n")[0]);
}

// 3. Fill topics (generic, senior-manager-style briefs, no product names mentioned —
//    this is the grounding test: does the AI pull in real Mionelo catalogue items?).
const topics = "Podzimní novinka v nabídce\nRychlá zdravá svačina do práce";
try {
  const textarea = page.getByLabel(/Témata/i);
  await textarea.fill(topics);
} catch (e) {
  console.log("topics fill failed:", String(e).split("\n")[0]);
}

await capture(page, "02-batch-configured");

// 4. Click "Naplánovat týden" and wait for the batch (2 topics x 3 platforms = 6 AI calls).
try {
  await page.getByRole("button", { name: /Naplánovat týden/i }).first().click();
} catch (e) {
  console.log("plan click failed:", String(e).split("\n")[0]);
}

const start = Date.now();
const MAX_MS = 180000;
let prevLen = -1;
let stable = 0;
while (Date.now() - start < MAX_MS) {
  await page.waitForTimeout(3000);
  const t = await page.locator("body").innerText();
  const stillRunning = /Generuji…/.test(t);
  if (!stillRunning) {
    if (t.length === prevLen) {
      if (++stable >= 2) break;
    } else stable = 0;
    prevLen = t.length;
  }
}
console.log("batch elapsed:", Math.round((Date.now() - start) / 1000), "s");

await capture(page, "03-week-calendar-filled");

// 5. Composer: leave brand field blank (test auto-brand grounding), generic topic,
//    IG + TikTok, AI draft.
try {
  const topicInput = page.getByLabel(/^Téma$/i);
  await topicInput.fill("Novinka pro zákazníky");
  // ensure Composer's own platform toggles include tiktok (default ig+fb) — add tiktok
  const composerCard = page.locator("h2", { hasText: "Nový příspěvek" }).locator("..");
  await composerCard.getByRole("button", { name: /^TikTok$/ }).first().click().catch(() => {});
  await page.getByRole("button", { name: /Navrhnout s AI/i }).first().click();
} catch (e) {
  console.log("composer draft failed:", String(e).split("\n")[0]);
}

const start2 = Date.now();
prevLen = -1;
stable = 0;
while (Date.now() - start2 < 90000) {
  await page.waitForTimeout(3000);
  const t = await page.locator("body").innerText();
  const stillRunning = /AI píše…/.test(t);
  if (!stillRunning) {
    if (t.length === prevLen) {
      if (++stable >= 2) break;
    } else stable = 0;
    prevLen = t.length;
  }
}
console.log("composer elapsed:", Math.round((Date.now() - start2) / 1000), "s");

await capture(page, "04-composer-ai-draft");

await browser.close();
