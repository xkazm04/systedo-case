# Fix Wave 6 — Multi-market Locale (systedo-case)

> 2 atomic commits. Formatting becomes locale-parameterised through one factory —
> the whole product is now multi-market-capable — with a live cs⇄en proof on the
> design system. **Completes the 7-wave plan.**
> Baseline preserved: 0 TS / 0 lint → 0 / 0. Production build ✓.

Date: 2026-06-15.

## Commits

| Commit | Fix | Finding |
|---|---|---|
| `91eea59` | `createFormatters(locale)` factory | format-helpers #1 (Critical) |
| `56717a2` | live locale showcase on /design-system | format-helpers #2 |

## What was built

1. **`createFormatters(locale)` factory** — `format.ts` went from hard-coded
   `LOCALE="cs-CZ"`/CZK constants to a factory returning the full `Formatters` set
   bound to a locale + currency (`cs-CZ`/CZK and `en-US`/USD shipped; a new market is
   one `LOCALES` entry). **Every existing named export** (`fmtCZK`, `fmtPct`,
   `fmtRelative`, …) is preserved as a destructured default Czech instance, so all
   ~199 render sites and the AI prompt builders keep working unchanged — proven by a
   full `tsc` pass. The single chokepoint the whole product formats through is now
   locale-aware: one refactor, multi-market capability.
2. **Live showcase** — a `LocaleShowcase` client island on `/design-system` renders the
   same sample values (currency, compact currency, percent, signed delta, multiple,
   date, relative time) through `createFormatters(locale)` with a cs⇄en toggle, proving
   the capability is real. New "Lokalizace" section (`testid ds-locale`) + hero link.

## Verification

| Gate | Result |
|---|---|
| `tsc --noEmit` (full — all ~199 call sites) | 0 |
| `eslint` | 0 |
| `next build` | ✓ |
| LLM gate | pass |

## Patterns established (catalogue, cont.)

24. **Factory + preserved default** — to make a chokepoint parameterisable without
    touching N call sites, keep the old named exports as a destructured default
    instance of the new factory; a full `tsc` proves nothing broke.
25. **Prove the capability, scope the rollout** — the factory makes the product
    multi-market *capable*; a focused live showcase demonstrates it honestly without
    the L-effort rollout (threading the active locale through every render site).

## What remains (locale theme)

- **Full-app runtime switcher** — a real per-user cs/en/Kč/€ switch needs the active
  locale threaded to the formatters at each render site (React context + a hook, or a
  cookie read server-side), since the ~199 sites import the static default instance
  today. The factory is the prerequisite; this is the (L-effort) rollout.
- **Locale-consistency contract test** (format-helpers #4) — snapshot golden output
  per locale + assert the AI-prompt formatters match the UI.

---

## 7-wave plan: COMPLETE

Done: **Wave 1** (analytics core) · **1b** (analytics UI) · **2** (steering) ·
**3** (persistence) · **4** (content) · **5** (API hardening) · **6** (locale) ·
**7** (pipeline/SEO).

Remaining from the scan: only the standalone package-extraction **moonshots**
(structured-llm SDK, LLM Quality Gate, design-token package, AI case-study starter)
and the per-theme leftovers documented across the wave docs.
