/** Step 9 — live AFTER for the two UI fixes, on the worktree server.
 *   a) the channel table's last column is reachable at 390px (scroll, not clip);
 *   b) the "your tailored plan is ready / replace the sample" banner does not come
 *      back on a reload of an already-pinned plan. */
import { open, shot, dump, state, BASE } from "./lib.mjs";

const s = state();
const projectId = process.argv[2] ?? s.fixLeadgenProjectId;
if (!projectId) throw new Error("no project id");

// a) mobile
{
  const { browser, page } = await open({ theme: "light", viewport: { width: 390, height: 844 } });
  try {
    await page.goto(`${BASE}/app/${projectId}/kanaly`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { level: 2, name: /Kanály zdarma/ }).first().waitFor({ timeout: 180_000 });
    await page.waitForTimeout(2500);
    const m = await page.evaluate(() => {
      const table = document.querySelector("table");
      const wrap = table?.parentElement;
      const cs = wrap ? getComputedStyle(wrap) : null;
      const btn = table?.querySelector("tbody tr button");
      const r = btn?.getBoundingClientRect();
      return {
        wrapOverflowX: cs?.overflowX,
        wrapClientWidth: wrap?.clientWidth,
        wrapScrollWidth: wrap?.scrollWidth,
        canScrollToIt: wrap ? wrap.scrollWidth > wrap.clientWidth : null,
        ctaRightBeforeScroll: r ? Math.round(r.right) : null,
        viewport: window.innerWidth,
      };
    });
    // scroll the container to the end and re-measure the CTA
    await page.evaluate(() => {
      const w = document.querySelector("table")?.parentElement;
      if (w) w.scrollLeft = w.scrollWidth;
    });
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => {
      const btn = document.querySelector("table tbody tr button");
      const r = btn?.getBoundingClientRect();
      return r ? { right: Math.round(r.right), fully: r.right <= window.innerWidth + 0.5 } : null;
    });
    console.log("MOBILE:", JSON.stringify({ ...m, afterScroll: after }, null, 1));
    dump("fix-mobile-table-metrics", JSON.stringify({ ...m, afterScroll: after }, null, 2));
    await shot(page, "fix-mobile-table-scrolled");
  } finally {
    await browser.close();
  }
}

// b) the banner: generate → apply → RELOAD, all in ONE context, because the defect
//    is `useAiTool` rehydrating its last result from localStorage after the reload
//    that resets the in-memory `applied` flag.
{
  const { browser, page } = await open();
  try {
    const res = await page.request.post(`${BASE}/api/projects`, {
      data: { name: `Banner probe ${Date.now()}`, type: "leadgen" },
    });
    const pid = (await res.json()).project.id;
    await page.goto(`${BASE}/app/${pid}/kanaly`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { level: 2, name: /Kanály zdarma/ }).first().waitFor({ timeout: 180_000 });
    const cta = page.getByRole("button", { name: /Sestavit plán na míru \(AI\)/ }).first();
    await cta.waitFor({ timeout: 120_000 });
    for (let i = 0; i < 150 && (await cta.isDisabled().catch(() => true)); i++) {
      await page.waitForTimeout(1000);
    }
    const respP = page.waitForResponse(
      (r) => r.url().includes("/api/ai") && r.request().method() === "POST",
      { timeout: 300_000 }
    );
    await cta.click();
    await respP;
    await page.getByText(/Plán na míru je připravený/).waitFor({ timeout: 60_000 });
    const before = await page.getByText(/Plán na míru je připravený/).count();
    const savedP = page.waitForResponse(
      (r) => r.url().includes("/organic-channels") && r.request().method() === "POST",
      { timeout: 60_000 }
    );
    await page.getByRole("button", { name: /Použít tento plán/ }).click();
    await savedP;
    await page.waitForTimeout(2000);
    if (await page.getByRole("dialog").first().isVisible().catch(() => false)) {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);
    }
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { level: 2, name: /Kanály zdarma/ }).first().waitFor({ timeout: 180_000 });
    await page.waitForTimeout(2000);
    const after = await page.getByText(/Plán na míru je připravený/).count();
    const pill = await page.getByText(/^(Plán na míru \(AI\)|Ukázkový plán)$/).first().innerText();
    console.log("BANNER: before-reload count =", before, "after-reload count =", after, "| pill =", pill);
    dump("fix-banner", JSON.stringify({ before, after, pill }, null, 2));
    await shot(page, "fix-banner-after-reload");
  } finally {
    await browser.close();
  }
}
