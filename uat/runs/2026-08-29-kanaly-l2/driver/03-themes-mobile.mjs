/** Step 3 — the same key screens in light and dark, desktop and mobile.
 *  Asserts rendering rather than vibes: reads the resolved <html data-theme>,
 *  the computed background/foreground of the page and the plan card, which
 *  columns the channel table actually renders at each width, and whether the
 *  playbook opens and its first actions are readable. */
import { open, shot, dump, state, BASE } from "./lib.mjs";

const who = process.argv[2] ?? "standa";
const s = state();
const projectId = who === "radek" ? s.radekProjectId : s.standaProjectId;

const CASES = [
  { tag: "desktop-light", theme: "light", viewport: { width: 1440, height: 1000 } },
  { tag: "desktop-dark", theme: "dark", viewport: { width: 1440, height: 1000 } },
  { tag: "mobile-light", theme: "light", viewport: { width: 390, height: 844 } },
  { tag: "mobile-dark", theme: "dark", viewport: { width: 390, height: 844 } },
];

const report = [];
for (const c of CASES) {
  const { browser, page } = await open(c);
  try {
    await page.goto(`${BASE}/app/${projectId}/kanaly`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { level: 2, name: /Kanály zdarma/ }).first().waitFor({ timeout: 90_000 });
    await page.waitForTimeout(1500);

    const probe = await page.evaluate(() => {
      const css = (el, p) => (el ? getComputedStyle(el).getPropertyValue(p) : null);
      const table = document.querySelector("table");
      const headers = table
        ? [...table.querySelectorAll("thead th")]
            .filter((th) => th.offsetParent !== null || th.getClientRects().length)
            .map((th) => th.textContent.trim())
        : [];
      const card = document.querySelector('section[aria-labelledby="visibility-plan-title"]');
      const quick = [...document.querySelectorAll("*")].find((e) =>
        /Rychlá výhra/.test(e.textContent ?? "") && e.children.length < 6
      );
      const rows = table ? table.querySelectorAll("tbody tr").length : 0;
      return {
        dataTheme: document.documentElement.dataset.theme ?? null,
        bodyBg: css(document.body, "background-color"),
        bodyFg: css(document.body, "color"),
        cardBg: css(card, "background-color"),
        cardFg: css(card, "color"),
        visibleHeaders: headers,
        rows,
        quickWin: quick ? quick.textContent.trim().slice(0, 120) : null,
        docScrollX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      };
    });

    await shot(page, `${who}-20-kanaly-${c.tag}`);

    // The playbook drawer — the surface that carries the first actions.
    const topRow = page.locator("table tbody tr").first();
    await topRow.locator("td").first().click();
    const dlg = page.getByRole("dialog").first();
    let playbook = null;
    if (await dlg.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await page.waitForTimeout(600);
      const box = await dlg.boundingBox();
      const txt = await dlg.innerText();
      playbook = {
        width: box?.width ?? null,
        fitsViewport: box ? box.width <= c.viewport.width + 1 : null,
        actionCount: (txt.match(/\n/g) ?? []).length,
        text: txt,
      };
      await shot(page, `${who}-21-playbook-${c.tag}`);
      dump(`${who}-21-playbook-${c.tag}`, txt);
    }

    report.push({ case: c.tag, ...probe, playbook: playbook && { ...playbook, text: undefined } });
    console.log(c.tag, JSON.stringify({ ...probe, playbookW: playbook?.width }, null, 0));
  } finally {
    await browser.close();
  }
}
dump(`${who}-20-theme-mobile-report`, JSON.stringify(report, null, 2));
