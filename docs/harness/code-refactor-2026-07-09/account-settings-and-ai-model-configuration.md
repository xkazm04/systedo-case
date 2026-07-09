# Account, Settings & AI Model Configuration

> Context #2 - code_refactor scan, 2026-07-09
> Total: 5 (Critical: 0, High: 3, Medium: 1, Low: 1)
> Files read: 14

## 1. ByomKeys and ByomMatrix each independently fetch and re-implement mutation-apply for the same `/api/byom` config

- **Severity**: High
- **Category**: duplication
- **File**: `src/components/app/modules/ByomKeys.tsx:116-133`
- **Scenario**: `src/app/app/[projectId]/nastaveni/page.tsx:18-20` renders `<ByomKeys />` and `<ByomMatrix />` together on the same settings page. Each mounts its own `useEffect` that independently `GET`s `/api/byom` and holds its own `{ entitled, config }` state (ByomKeys.tsx:116-133 vs. the near-identical `ByomMatrix.tsx:58-74`), so the same account-wide config is fetched twice on every load of that page. The mutation wrapper is duplicated too: ByomKeys.tsx's `call()` (136-169) and ByomMatrix.tsx's `apply()` (76-92) both do setBusy → fetch → parse JSON → on `!res.ok` setError → else merge `config` into state → finally setBusy(null); they differ only in that `call()` also surfaces a `validation` notice.
- **Root cause**: each component was built against the same `/api/byom` endpoint with no shared client-side data layer for BYOM config.
- **Impact**: two network round-trips and two independent loading/error races for one resource on every settings-page visit; the hand-copied mutation wrappers can silently drift (an error-handling fix made in one won't reach the other).
- **Fix sketch**: extract a `useByomConfig()` hook (e.g. new `src/lib/llm/keys/useByomConfig.ts`) that owns the fetch-on-mount effect and a parameterized `apply()` (optional `vendor` arg for the validation-notice branch `ByomKeys` needs); have both `ByomKeys.tsx` and `ByomMatrix.tsx` consume it, and lift `{ entitled, config }` to the `nastaveni` page (or a shared client wrapper) so it is fetched once and passed down.
- **Build risk**: keep the new hook importing only `./types` (pure types), not `./store`/`./store.local`/`./store.firestore`, which pull in `node:sqlite`/Firestore — both existing components already import only `./types`, so this is a matter of not regressing that when extracting.

## 2. AccountSecurity hardcodes the support email instead of importing the canonical constant

- **Severity**: High
- **Category**: duplication
- **File**: `src/components/app/modules/AccountSecurity.tsx:14`
- **Scenario**: `AccountSecurity.tsx:14` declares `const SUPPORT_EMAIL = "podpora@adamant.app"` and uses it in the GDPR account-deletion `mailto:` link (167-168). The exact same literal is already exported as `SUPPORT_EMAIL` from `src/lib/site.ts:24`, whose doc comment (site.ts:22-23) reads: "Canonical contact addresses — one brand, one domain, everywhere (E1). A buyer doing due diligence must never see two company names or two support domains."
- **Root cause**: the component was written standalone without importing the already-existing canonical constant.
- **Impact**: if the support address or domain ever changes, this is the one call site editing `lib/site.ts` won't update — silently reintroducing the exact "two support domains" risk the constant exists to prevent, in the one flow (irreversible account deletion) where the contact address matters most.
- **Fix sketch**: delete the local `SUPPORT_EMAIL` const in `AccountSecurity.tsx` and `import { SUPPORT_EMAIL } from "@/lib/site"` instead.
- **Build risk**: `lib/site.ts`'s only non-constant import is `@/lib/llm/models.ts`, which is pure string/function constants with no `node:*`/`server-only` imports — verified safe to import into this `"use client"` component.

## 3. ActivityModule reimplements the CSV download instead of the shared `lib/export.ts` helpers, and breaks the app's own Czech-Excel delimiter convention

- **Severity**: High
- **Category**: duplication
- **File**: `src/components/app/modules/ActivityModule.tsx:98-109`
- **Scenario**: `exportCsv()` hand-rolls a Blob+BOM+anchor-click download, comma-joining rows via the locally-imported `csvCell` (from `src/lib/activity/compute.ts:37-39`). This is byte-for-byte the same pattern as `src/components/app/modules/SpendModule.tsx:55-66`'s `exportCsv()` (its own `csvCell`, its own Blob/anchor code) — while `src/lib/export.ts` exists specifically to be, per its own doc comment, "shared by the export buttons" and is in fact used that way by 13+ other export buttons (`CampaignTable.tsx:518`, `ChannelsSection.tsx:94`, `TrendCard.tsx:117`, `AdGenerator.tsx:549-575`, `CatalogModule.tsx:152`, `MonthlyReport.tsx:144`, `ContentPipeline.tsx`, etc., all via `downloadText(name, toCsv(headers, rows))`). `toCsv` uses a semicolon delimiter — "the separator Czech Excel (cs-CZ) expects" per `export.ts:13-14` — so Activity's (and Spend's) comma-joined CSV opens as one unparsed column in Czech-locale Excel, while every other export button in the product opens correctly for the same user.
- **Root cause**: Activity/Spend's CSV export predates, or was written without awareness of, the `lib/export.ts` convention the rest of the app converged on.
- **Impact**: two duplicated Blob/anchor/BOM implementations to maintain, plus a real user-visible inconsistency in a Czech-first product — Activity and Usage exports silently fail to parse for the app's primary (cs-CZ Excel) audience while every other export in the app works.
- **Fix sketch**: replace the body of `exportCsv()` with `downloadText("activity.csv", toCsv(header, rows))` from `@/lib/export`; drop the local Blob/anchor code and the now-unneeded `csvCell` import (`toCsv`/`csvField` already handle quoting). Apply the identical fix to `SpendModule.tsx`'s `exportCsv()` (outside this context's file list, but the same bug, same fix).

## 4. `short()` model-slug-shortening helper is copy-pasted three times

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/components/app/modules/ByomQualityMatrix.tsx:31`
- **Scenario**: `const short = (slug: string) => slug.split("/").pop() ?? slug;` is defined verbatim in `ByomQualityMatrix.tsx:31` and again in `ByomQualityOverview.tsx:38`, and the same expression is inlined a third time in `ByomMatrix.tsx:157` (`rec.model.split("/").pop()`). All three shorten the same OpenRouter-style `vendor/model` slug format that `matrixSlug()` in `src/lib/llm/quality.ts:143-145` already owns (that module also owns `cellComposite`, `modelRanking`, etc. for this exact slug format).
- **Root cause**: each component needed a one-line display helper and reimplemented it; `lib/llm/quality.ts` never grew the inverse "display name" helper to pair with `matrixSlug`.
- **Impact**: minor today, but any future edge-case fix (e.g. a slug with no `/`) would need to land in three places, and the inline third occurrence in `ByomMatrix.tsx` is the easiest of the three to miss.
- **Fix sketch**: add `export const modelShortName = (slug: string) => slug.split("/").pop() ?? slug;` to `src/lib/llm/quality.ts` next to `matrixSlug`, then import it in `ByomQualityMatrix.tsx`, `ByomQualityOverview.tsx` and `ByomMatrix.tsx`, deleting all three local/inline definitions.

## 5. Dead `connected`/`action`/`missing` copy keys in IntegrationStatusModule

- **Severity**: Low
- **Category**: dead-code
- **File**: `src/components/app/modules/IntegrationStatusModule.tsx:13,29`
- **Scenario**: `COPY.cs` and `COPY.en` each declare `connected: "Připojeno", action: "Vyžaduje akci", missing: "Nenastaveno"` (line 13; line 29 for `en`) — the exact same three strings as `sumConnected`/`sumAction`/`sumMissing` on the very next line, which the component actually renders (`<Sum label={c.sumConnected} .../>` etc., lines 69-71). The component never reads `c.connected`, `c.action`, or `c.missing`; every status label it renders instead comes from the separate nested `status: {...}` object (lines 16/32, read via `c.status[r.status]` at line 88). `COPY` is a file-local `const` (not exported), so this is fully verifiable within the file — no other module can be reading these keys.
- **Root cause**: looks like a leftover from renaming the summary-tile keys to the `sumX` prefix (to disambiguate them from the nested `status` object) without deleting the pre-rename keys.
- **Impact**: none functionally — pure dead weight in a translation object — but it invites a future edit to the wrong copy of "Vyžaduje akci" and wondering why nothing changed on screen.
- **Fix sketch**: delete the `connected`, `action`, `missing` keys from both `COPY.cs` (line 13) and `COPY.en` (line 29).
