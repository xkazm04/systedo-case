/** Shared browser plumbing for the 2026-08-29 kanaly L2 run.
 *  Playwright library API (not the test runner) so each step can be driven and
 *  judged separately, with state carried in state.json between invocations. */
import { chromium } from "playwright";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const RUN_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
export const SHOTS = join(RUN_DIR, "shots");
/** Textual evidence lives OUTSIDE shots/: `uat/.gitignore` drops each run's shots
 *  directory (large, reproducible captures), while the dumps a report cites must
 *  survive. (The glob is spelled out in that .gitignore — writing it here would
 *  end this block comment early: an asterisk-slash inside it is a parse bomb.) */
export const EVIDENCE = join(RUN_DIR, "evidence");
export const BASE = process.env.BASE_URL ?? "http://localhost:3107";
const STATE = join(RUN_DIR, "driver", "state.json");

mkdirSync(SHOTS, { recursive: true });
mkdirSync(EVIDENCE, { recursive: true });

export function state() {
  return existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : {};
}
export function saveState(patch) {
  const next = { ...state(), ...patch };
  writeFileSync(STATE, JSON.stringify(next, null, 2));
  return next;
}

/** A browser context with the locale cookie pinned to cs (DEFAULT_LOCALE is en
 *  since 2026-08-05; the Character reads Czech). */
export async function open({ theme = "light", viewport = { width: 1440, height: 1000 } } = {}) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport,
    colorScheme: theme === "dark" ? "dark" : "light",
    deviceScaleFactor: 1,
  });
  await ctx.addCookies([{ name: "locale", value: "cs", url: BASE }]);
  // The app reads an explicit choice from localStorage (`theme` → data-theme on
  // <html>, set before paint by the layout script) and otherwise follows
  // prefers-color-scheme. Set BOTH so the run exercises the explicit path and
  // the media path agree.
  await ctx.addInitScript((t) => {
    try {
      localStorage.setItem("theme", t);
    } catch {}
  }, theme);
  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") console.log("  [console.error]", m.text().slice(0, 300));
  });
  page.on("pageerror", (e) => console.log("  [pageerror]", String(e).slice(0, 300)));
  return { browser, ctx, page };
}

export async function shot(page, name) {
  const p = join(SHOTS, `${name}.png`);
  await page.screenshot({ path: p, fullPage: true });
  console.log("  shot →", name + ".png");
}

export function dump(name, text) {
  writeFileSync(join(EVIDENCE, `${name}.txt`), text);
}
