/** Step 4 — is the channel table actually USABLE at 390px?
 *  The desktop table drops two columns below md, but the last column carries the
 *  per-row CTA. Measure whether the table overflows its scroll container, whether
 *  the CTA is inside the viewport, and whether it can be clicked. */
import { open, shot, dump, state, BASE } from "./lib.mjs";

const who = process.argv[2] ?? "standa";
const s = state();
const projectId = who === "radek" ? s.radekProjectId : s.standaProjectId;

const { browser, page } = await open({ theme: "light", viewport: { width: 390, height: 844 } });
try {
  await page.goto(`${BASE}/app/${projectId}/kanaly`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { level: 2, name: /Kanály zdarma/ }).first().waitFor({ timeout: 90_000 });
  await page.waitForTimeout(2500);

  const m = await page.evaluate(() => {
    const table = document.querySelector("table");
    const wrap = table?.parentElement;
    const btn = table?.querySelector("tbody tr button");
    const r = btn?.getBoundingClientRect();
    const cs = wrap ? getComputedStyle(wrap) : null;
    return {
      tableWidth: table?.scrollWidth,
      wrapClientWidth: wrap?.clientWidth,
      wrapScrollWidth: wrap?.scrollWidth,
      wrapOverflowX: cs?.overflowX,
      wrapClass: wrap?.className,
      viewport: window.innerWidth,
      ctaText: btn?.textContent?.trim(),
      ctaRect: r && { x: Math.round(r.x), right: Math.round(r.right), w: Math.round(r.width) },
      ctaFullyInViewport: r ? r.right <= window.innerWidth + 0.5 : null,
    };
  });
  console.log(JSON.stringify(m, null, 2));
  dump(`${who}-30-mobile-table-metrics`, JSON.stringify(m, null, 2));

  // Can it still be operated? Playwright scrolls into view before clicking, so
  // this answers "reachable", which is a lower bar than "readable".
  const btn = page.locator("table tbody tr button").first();
  let clickable = null;
  try {
    await btn.click({ timeout: 8000 });
    clickable = true;
    await page.waitForTimeout(1200);
    await shot(page, `${who}-31-mobile-after-cta-click`);
  } catch (e) {
    clickable = String(e).slice(0, 200);
  }
  console.log("CTA clickable:", clickable);

  // The stagger question: does the sidebar settle, or stay faded?
  await page.goto(`${BASE}/app/${projectId}/kanaly`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);
  await shot(page, `${who}-32-mobile-settled`);
} finally {
  await browser.close();
}
