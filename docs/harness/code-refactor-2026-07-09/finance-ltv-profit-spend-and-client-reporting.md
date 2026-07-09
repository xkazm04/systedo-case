# Finance: LTV, Profit, Spend & Client Reporting

> Context #5 - code_refactor scan, 2026-07-09
> Total: 5 (Critical: 0, High: 2, Medium: 3, Low: 0)
> Files read: 12

## 1. `ratioTone` is byte-identical in two sibling files, but the codebase already has a home for it

- **Severity**: High
- **Category**: duplication
- **File**: `src/components/app/modules/LtvModule.tsx:121-125`
- **Scenario**: `LtvProjectionPanel.tsx:61-65` defines the exact same function, character for character:
  ```ts
  function ratioTone(r: number): string {
    if (r >= 3) return "text-positive";
    if (r >= 1) return "text-navy-800";
    return "text-negative";
  }
  ```
  Both files render on the same `/ltv` page (`LtvModule` renders `LtvProjectionPanel` directly at `LtvModule.tsx:309`), so a developer scanning the page for "why does the LTV:CAC color logic live here" finds it twice, in two different component files, with no import between them.
- **Root cause**: `LtvProjectionPanel` was added later (feature #3, interactive horizon/churn projection) as a co-located client child and needed the same healthy/borderline/unhealthy color banding as the parent's cohort table, so the three-line helper was copy-pasted instead of imported.
- **Impact**: the 3.0×/1.0× thresholds are a business rule (matches the `ltvCacTarget`/`healthyInsight` copy in both files' `T` tables). If the target ratio ever changes, it's easy to update one copy and miss the other — the same LTV:CAC number would then render green in one panel and amber in its sibling on the same page. The codebase already keeps this shape of helper (`roasMetricTone`, `pnoMetricTone` in `src/lib/campaigns/triage.ts`; `scoreTone` in `src/lib/speed-lead/qualification.ts`) as an exported pure function in the domain's `lib/*/compute.ts`, not inlined per-component — this pair breaks that convention.
- **Fix sketch**: add `export function ratioTone(r: number): string { … }` to `src/lib/ltv/compute.ts` (both files already import types and functions from there — `cohortTrend`, `ltvProjection`, `LTV_HORIZON`, etc.). Delete the local definition in `LtvModule.tsx:121-125` and `LtvProjectionPanel.tsx:61-65`, and import it from `@/lib/ltv/compute` in both.

## 2. `SpendModule`'s CSV export reimplements the shared download helper — and drops a step the shared one needs

- **Severity**: High
- **Category**: duplication
- **File**: `src/components/app/modules/SpendModule.tsx:35-66`
- **Scenario**: this same context already uses the shared helper twice — `LtvReportButton.tsx:6,21` (`downloadText("kohorty-cac-ltv.csv", buildCohortCsv(rows))`) and `MonthlyReport.tsx:13,144` (`downloadText(\`report-${period}.md\`, …)`) — plus 9 more call sites across `src/components/campaigns/`, `src/components/ai/`, and `src/components/app/modules/CatalogModule.tsx`. `SpendModule.exportCsv` instead hand-rolls the same sequence locally:
  ```ts
  const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  ...
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "usage.csv";
  a.click();
  URL.revokeObjectURL(url);
  ```
  `downloadText` in `src/lib/export.ts:38-53` does the same thing but appends the anchor to `document.body` before calling `.click()` and removes it after — `SpendModule`'s copy never appends the anchor to the DOM at all, which is the documented reason browsers (historically Safari/WebKit) can silently no-op a `.click()` on a detached `<a>` element.
- **Root cause**: `SpendModule` was shaped directly on the raw telemetry/cost model (per its file header comment) and its export button was written standalone rather than reusing `@/lib/export`, which two of this context's own siblings already depend on.
- **Impact**: two independently-maintained CSV escaping rules exist in one context (`SpendModule`'s local `csvCell` uses `,` as the delimiter and quotes on `["\n]`; `lib/export.ts`'s `csvField`/`toCsv` use `;` — the Czech-Excel-friendly delimiter the rest of the app standardizes on — and quote on `[",\n;]`). Any future column value containing a semicolon (e.g. a model name or operation id) would export unescaped from `SpendModule` but correctly from every other export in the app. Plus the missing DOM-append is a latent cross-browser download bug the shared helper already fixed once.
- **Fix sketch**: replace `SpendModule.tsx`'s local `csvCell` (line 36) and the body of `exportCsv` (lines 55-66) with `import { toCsv, downloadText } from "@/lib/export";` then `downloadText("usage.csv", toCsv(header, rows))`, matching the pattern already used two files over in `LtvReportButton.tsx`.

## 3. `ProfitModule` hand-rolls the same "read/coerce/persist to localStorage" boilerplate twice in one file

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/components/app/modules/ProfitModule.tsx:267-307`
- **Scenario**: the margin-scenario persistence block (`scenariosKey`, `coerceScenarios`, `loadScenarios`, `ProfitModule.tsx:267-307`) and the real-numbers-override persistence block (`realKey`, `RealOverride`, `loadReal`, `ProfitModule.tsx:361-391`) both do: build a `systedo.profit.*.${projectId}` key → SSR-guard (`typeof window === "undefined"`) → `JSON.parse` in a `try/catch` that degrades to an empty default → a field-by-field shape check that drops anything malformed. The two `useEffect` persist-on-change blocks (`ProfitModule.tsx:538-554`) are likewise near-identical, differing only in the key and the state being serialized.
- **Root cause**: the real-numbers override (`#ROB-02`) was added after the scenario feature (`#4`) and copied its localStorage pattern rather than factoring it out, since both needed "safe read, safe write, SSR-safe" semantics.
- **Impact**: ~35 lines of ceremony duplicated for two different payload shapes in the same file; the same shape of boilerplate also appears independently in `src/components/app/modules/CompareSeoTable.tsx` (`coerceWeights`) and `src/components/app/modules/SpeedLeadModule.tsx` (via `src/lib/speed-lead/snippets.ts`'s `coerceSnippets`), so this is at least the fourth hand-written copy of the same read-coerce-degrade pattern app-wide.
- **Fix sketch**: extract a small generic `function loadJson<T>(key: string, coerce: (raw: unknown) => T, fallback: T): T` (SSR guard + try/catch + call `coerce`) local to `ProfitModule.tsx`, and use it for both `loadScenarios` (pass `coerceScenarios`) and `loadReal` (pass a small `coerceReal` extracted from the current inline loop at lines 376-386). If the shape recurs again, promote it to `src/lib/` as a shared helper — not required for this fix.

## 4. `ProfitModule`'s `costModel` prop re-declares the type `CostModelEditor` already exports

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/components/app/modules/ProfitModule.tsx:431`
- **Scenario**: `ProfitModule` declares its `costModel` prop as an inline object-literal type:
  ```ts
  costModel?: { grossMarginPct: number; monthlyOverhead: number; perOrderCost: number } | null;
  ```
  `CostModelEditor.tsx:11-15` exports exactly this shape as `CostModelView`, and this context's own `MonthlyReport.tsx:17,81` already imports and reuses it (`import CostModelEditor, { type CostModelView } from "@/components/app/modules/CostModelEditor";` … `costModel?: CostModelView | null;`). `ProfitModule` receives this same object from the same `/api/projects/[id]/cost-model` shape (it POSTs to that route at `ProfitModule.tsx:518-526` with the same three fields) but types it independently.
- **Root cause**: `ProfitModule`'s cost-model prop predates or was written in parallel with `MonthlyReport`'s adoption of the shared `CostModelView` export, so it never got updated to import it.
- **Impact**: low on its own (structural typing means a field added to one won't break the other silently), but it's one more place a reviewer has to remember to keep in sync by hand if the cost-model shape ever changes, and it obscures that `ProfitModule` and `MonthlyReport`/`CostModelEditor` are describing the same server-side record.
- **Fix sketch**: in `ProfitModule.tsx`, add `import type { CostModelView } from "@/components/app/modules/CostModelEditor";` and change line 431 to `costModel?: CostModelView | null;`. No other change needed — the object shape is already identical.

## 5. `ProfitModule.tsx` is 1,416 lines doing five distinct jobs, while its own context already shows the split pattern

- **Severity**: Medium
- **Category**: structure
- **File**: `src/components/app/modules/ProfitModule.tsx:1-1416`
- **Scenario**: one file owns: the per-channel margin table + overhead-allocation toggle (`ProfitModule.tsx:826-1037`), the margin-scenario save/load/compare UI (`ProfitModule.tsx:1040-1173`), the "what-if" budget-reallocation simulator (`ProfitModule.tsx:1176-1312`), the product/category profit view (`ProfitModule.tsx:1317-1400`), and the real-numbers-override form (`ProfitModule.tsx:687-734`) — five largely independent features sharing one component, one `T` i18n table (~150 keys), and one state block. Contrast with this same context's `LtvModule.tsx` (499 lines), which already splits its interactive pieces into co-located siblings — `LtvDiagnosisPanel.tsx`, `LtvProjectionPanel.tsx`, `LtvReportButton.tsx` — each receiving computed data as props.
- **Root cause**: features were added incrementally (`#2` product view, `#3` trend, `#4` scenarios, `#5` overhead, `#ROB-02` real-numbers override — the inline comments number each addition) directly into the original file instead of following the split-into-siblings pattern this context already established for `LtvModule`.
- **Impact**: no correctness risk today, but the file is materially harder to review or modify safely than its sibling modules — a change to the scenario UI risks an unrelated diff touching reallocation-simulator code 400 lines away in the same file, and the size makes `git blame`/PR review slower than it needs to be.
- **Fix sketch**: split along the existing feature boundaries into sibling files under `src/components/app/modules/` (e.g. `ProfitScenariosPanel.tsx` for lines ~1040-1173, `ProfitReallocationPanel.tsx` for lines ~1176-1312, `ProfitProductsPanel.tsx` for lines ~1317-1400), each taking the already-computed `rows`/`summary`/`plan`/`productResult` as props — mirroring how `LtvModule` passes `rows`/`summary`/`cohorts` down to its panels. Leave the channel table + overhead toggle + real-numbers override in `ProfitModule.tsx` as the orchestrator. This is a larger, lower-urgency refactor than findings 1-4; sequence it after them.
