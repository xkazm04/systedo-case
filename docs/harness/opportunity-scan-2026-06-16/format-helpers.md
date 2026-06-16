# Czech Formatting Helpers — Opportunity Scan

> Total: 5 findings (Critical: 0, High: 3, Medium: 2, Low: 0)
> Lenses: Business Visionary + Feature Scout

## 1. The locale switch is built but only the showcase uses it — wire it to a real LocaleProvider
- **Severity**: High
- **Lens**: Both
- **Category**: feature
- **File**: `src/lib/format.ts` (`createFormatters`, `LOCALES`, `DEFAULT_LOCALE`) → consumers in `src/components/**`, `src/app/**`
- **Opportunity**: `createFormatters(locale)` proves cs⇄en switching works (see `LocaleShowcase.tsx`), yet all ~209 call sites import the static `cs` named exports (`fmtCZK`, `fmtPct`, …). The product can only ever render Czech. Add a `LocaleContext`/`useFormatters()` hook that distributes a `createFormatters(locale)` instance, and a header language toggle that flips it app-wide.
- **Value**: Turns a shipped-but-dormant capability into a visible "this dashboard speaks your client's language" selling point — the single most credible differentiator for an agency pitching multi-market (EU) clients, achieved with no new formatting code.
- **Effort**: M
- **Fix sketch**: Create `LocaleProvider` holding `useState<SupportedLocale>` + `createFormatters(locale)` via `useMemo`; expose `useFormatters()`; codemod the client components (`DashboardClient`, `CampaignsClient`, badges/tables) from `import { fmtCZK }` to `const { fmtCZK } = useFormatters()`. Keep static exports for server/`lib` callers.

## 2. AI prompt builders hardcode CZK/cs formatting — pass the active locale into prompts
- **Severity**: High
- **Lens**: Both
- **Category**: functionality
- **File**: `src/lib/snapshot.ts`, `src/lib/snapshot-to-article.ts`, `src/lib/campaigns/report-input.ts`, `src/lib/campaigns/triage.ts`, `src/lib/metrics.ts`, `src/lib/gemini.ts`
- **Opportunity**: The header comment promises "every AI prompt renders numbers identically," but these builders import only the default `cs` formatters, so the AI assistant and Google-Ads evaluator always reason and reply in Czech/CZK even if the UI were switched to `en/USD`. Thread a `locale` param so prompts are built with `createFormatters(locale)`.
- **Value**: Without this, finding #1's UI toggle would show English numbers next to Czech AI commentary — an obvious credibility break in a case study whose whole point is an AI marketing assistant. Coherent multilingual AI output is the demo's "wow" moment.
- **Effort**: M
- **Fix sketch**: Give the snapshot/report/triage builders a `locale: SupportedLocale = DEFAULT_LOCALE` argument, build a local `const f = createFormatters(locale)`, and have the chat/eval API routes forward the request locale. Add the language to the system instruction so prose matches the numerals.

## 3. Currency is bound 1:1 to locale — split currency from locale for multi-currency clients
- **Severity**: Medium
- **Lens**: Business Visionary
- **Category**: monetization
- **File**: `src/lib/format.ts` (`LocaleConfig`, `LOCALES`, `fmtCZK`/`fmtCZKCompact`)
- **Opportunity**: `LocaleConfig` welds `intlLocale` to a single `currency`, so a Czech-speaking client running EUR or USD campaigns can't be represented. Real agencies manage one client across multiple ad currencies. Allow `createFormatters(locale, currencyOverride?)` so currency is selectable independently of display language.
- **Value**: Multi-currency reporting is a concrete upsell tier ("manage international accounts") and removes the assumption that every client bills in CZK — directly broadens the addressable market this case study is selling into.
- **Effort**: S
- **Fix sketch**: Add an optional `currency` param to `createFormatters` defaulting to `LOCALES[locale].currency`; pass it into the `Intl.NumberFormat` currency calls in `fmtCZK`/`fmtCZKCompact`. Keep the `fmtCZK` name for compatibility but document it as "active currency."

## 4. Add number-to-words + invoice-grade formatting to unlock a billing/export feature
- **Severity**: Medium
- **Lens**: Feature Scout
- **Category**: feature
- **File**: `src/lib/format.ts` (new `fmtWords`, `fmtCurrencyExact`)
- **Opportunity**: The helper set covers display formatting but nothing for documents: exact-haléř currency (`maximumFractionDigits: 0` rounds away decimals) and Czech number-to-words ("jedenmilion dvěstě…"), both mandatory on Czech invoices/proposals. Adding them lets the product generate a downloadable client proposal or invoice PDF from the same data.
- **Value**: A "generate client report/invoice" export is a natural, high-perceived-value extension of an analytics dashboard and a clean monetizable artifact — and it reuses the existing single-chokepoint formatting story instead of bolting on a new locale layer.
- **Effort**: M
- **Fix sketch**: Add `fmtCurrencyExact(n)` (2 fraction digits) and a `fmtWords(n, locale)` Czech/English speller; expose them through `Formatters`. Feed an existing snapshot into a report template that renders the amount-in-words line.

## 5. No guard against bad input (NaN / invalid ISO) — add safe fallbacks for AI-sourced data
- **Severity**: Medium
- **Lens**: Feature Scout
- **Category**: user_benefit
- **File**: `src/lib/format.ts` (`fmtInt`, `fmtPct`, `fmtDate`, `fmtRange`, `fmtRelative`)
- **Opportunity**: Every formatter trusts its input: `fmtInt(NaN)` → "NaN", `fmtDate("oops")` → "Invalid Date", and `fmtRelative` on a bad ISO yields "NaN". Since several values now flow from LLM output and user-editable campaign data, a single malformed field renders a broken label to the client.
- **Value**: For a polished case study meant to impress, a stray "NaN Kč" or "Invalid Date" is a trust-killer. Defensive defaults make the demo robust against the exact unpredictability the AI features introduce.
- **Effort**: S
- **Fix sketch**: Add a `Number.isFinite` guard returning a config-driven placeholder (e.g. "—") in the numeric formatters, and an `isNaN(date.getTime())` check in the date/range/relative functions before calling `Intl`. Centralize the placeholder so it stays identical everywhere, matching the context's "render identically" intent.
