import { expect, type BrowserContext, type Page } from "@playwright/test";

/**
 * Shared fixtures for the Playwright suite. NOT a spec — the default `testMatch`
 * (`**\/*.@(spec|test).*`) does not collect this file, so it is safe to keep
 * beside the specs that import it.
 *
 * Everything here exists because of ONE recurring defect class, recorded as K05
 * in uat/runs/2026-08-28-kanaly-l1 and now observed three times:
 *
 *   1. the workspace anchor drifted (`Adamant — domů` → `Adamant: domů` after the
 *      CS-DASH i18n sweep 1038216d) and eight authed tests SILENTLY SKIPPED;
 *   2. tests/kampane-triage.spec.ts asserted Czech copy against an English render
 *      (DEFAULT_LOCALE flipped `cs` → `en` in 22746f17) and timed out at 30s;
 *   3. tests/design-system.spec.ts failed the same way, on the same cause.
 *
 * The shape is always the same: a spec cannot see its own subject, and the
 * failure reads like a broken page (or, worse, like nothing at all). Two fixtures
 * close it — one for each half:
 *
 *   • `pinLocale` — the copy column a spec asserts is a decision, so state it
 *     rather than inheriting whatever the browser default happens to be;
 *   • `gotoAppHub` — decide authed-vs-gate from two MUTUALLY EXCLUSIVE anchors and
 *     fail loudly when neither resolves, instead of defaulting to "gate" and
 *     letting `test.skip` swallow the whole suite.
 */

/** The cookie `src/lib/i18n/locale.ts` reads to pick the copy column. */
export const LOCALE_COOKIE = "locale";

/**
 * Pin the locale a spec's assertions are written in.
 *
 * `DEFAULT_LOCALE` is `en` (src/lib/format.ts:41, flipped from `cs` on
 * 2026-08-05) and a fresh Playwright browser carries no locale cookie, so a spec
 * full of Czech locators renders English and every locator misses. Pinning beats
 * translating the assertions when the Czech copy is part of what the page is
 * being checked for; use bilingual matchers instead when it is not (see
 * tests/public-demos.spec.ts).
 *
 * Call it from a `beforeEach` that runs BEFORE the navigation — a cookie set
 * after `page.goto` does not repaint the page already on screen.
 */
export async function pinLocale(
  context: BrowserContext,
  baseURL: string | undefined,
  locale: "cs" | "en" = "cs"
) {
  await context.addCookies([
    { name: LOCALE_COOKIE, value: locale, url: baseURL ?? "http://localhost:3100" },
  ]);
}

/**
 * The sign-in gate's own heading (`src/components/app/AppSignInGate.tsx:28,39`).
 * Rendered ONLY when `AuthGate` finds no session — the one gate-exclusive anchor.
 *
 * Deliberately NOT the "Sign in with Google" BUTTON: the authed hub's topbar
 * renders the same label (DEV_AUTH patches the server `auth()` only, so the
 * client `useSession` stays anonymous), so the button resolves in BOTH states and
 * cannot decide between them. Keying on it is what let a drifted workspace anchor
 * report "gate" on a server that had just logged `DEV_AUTH active`.
 */
export function signInGate(page: Page) {
  return page.getByRole("heading", { name: /Spusťte si vlastní Adamant|Start your own Adamant/ });
}

/**
 * The authed project hub's topbar home link (`ProjectsHome.tsx:178`) — rendered
 * unconditionally by the hub in every one of its states, and never by the gate.
 *
 * Punctuation-agnostic on purpose: the brand-plus-word shape is the durable part
 * and the separator is exactly what a copy sweep is allowed to change. Re-pinning
 * it to the current separator would only move the next silent skip to the next
 * sweep.
 */
export function workspaceHome(page: Page) {
  return page.getByRole("link", { name: /Adamant.{0,3}(domů|home)/ });
}

/**
 * Open `/app` and report which of the two legitimate states rendered.
 *
 * THE GUARD (K05): both anchors above are exclusive to their state, so "neither
 * resolved" is not a third state — it is a broken anchor or a broken page, and it
 * FAILS here. Callers may `test.skip` on a returned "gate" (a legitimate run
 * against a deployment where DEV_AUTH is off); they can no longer be handed a
 * "gate" that is really an unrecognised hub.
 *
 * Generous timeout: the dev server compiles the route on first hit.
 */
export async function gotoAppHub(page: Page): Promise<"gate" | "authed"> {
  await page.goto("/app");
  await expect(
    signInGate(page).or(workspaceHome(page)).first(),
    "/app rendered neither the sign-in gate heading nor the workspace home link — " +
      "the anchor drifted or the page failed to render. This must fail, not skip."
  ).toBeVisible({ timeout: 45_000 });
  return (await workspaceHome(page).isVisible()) ? "authed" : "gate";
}
