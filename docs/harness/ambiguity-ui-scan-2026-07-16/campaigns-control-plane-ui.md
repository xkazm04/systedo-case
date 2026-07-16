# Campaigns / Ad Ops Control Plane — ambiguity+ui scan

> Total: 5 findings (0 critical / 2 high / 2 medium / 1 low)

## 1. Non-CZK accounts still see hard-coded CZK on signed deltas and the change strip — one row mixes two currencies
- **Severity**: High
- **Lens**: ambiguity
- **Category**: currency-relabel-gap
- **File**: src/components/campaigns/ControlPlane.tsx:221 (also BudgetMoves.tsx:234,246,319; ChangeStrip.tsx:87)
- **Scenario**: A EUR/PLN Google Ads account is connected (Direction 2 relabeling active). In a pending change-set row, ControlPlane renders `{money(m.amount)} · {fmt.fmtSignedCZK(m.estValueGain)}` — the move amount is labeled in euros while the estimated gain on the *same line* is labeled in koruny. BudgetMoves does the same for every est. gain/saving/profit figure, and ChangeStrip formats added/removed campaign cost with `fmt.fmtCZK` because it never receives `fmtMoney` at all.
- **Root cause**: The currency-aware formatter (`resolveMoneyFormatter`) was threaded only to unsigned surfaces; there is no signed variant (BudgetMoves.tsx:123 openly documents "no currency-aware SIGNED formatter yet"), and ChangeStrip was simply skipped when `fmtMoney` was threaded through CampaignsClient.
- **Impact**: The exact failure Direction 2 exists to prevent — foreign amounts read as koruny — survives on the money surfaces where users make decisions (projected gains, savings, profit, sync diffs). Mixed currencies in one row also erodes trust in every other number.
- **Fix sketch**: Add a signed mode to `resolveMoneyFormatter` (or a `resolveSignedMoneyFormatter` beside it), thread it wherever `fmt.fmtSignedCZK` appears in this context, and pass `fmtMoney` into ChangeStrip from CampaignsClient. CZK/unknown accounts stay byte-identical.

## 2. Staging a change-set from a critical table row fails completely silently
- **Severity**: High
- **Lens**: ui
- **Category**: missing-error-state
- **File**: src/components/campaigns/CampaignsClient.tsx:266-286 (consumed at CampaignTable.tsx:321-329, 630-641)
- **Scenario**: User clicks "Připravit balíček" on a critical row. The control-plane POST returns 4xx/5xx (e.g. a pending set already exists, quota, network drop). `preparePackage` returns `false`, the row's `prepare` clears `preparingId`, and… nothing else happens. The button label flips from "Připravuji…" back to "Připravit balíček" with zero feedback, no scroll to the control plane, no error text anywhere.
- **Root cause**: `preparePackage` communicates failure only via its boolean resolution; neither CampaignsClient nor CampaignTable stores or renders that failure. Every sibling flow (BudgetMoves.propose, AlertsInbox.stage, ControlPlane.act) surfaces the server's error string — this one path drops it.
- **Impact**: On the most urgent affordance in the table (critical rows only), the user cannot tell "it worked" from "it failed" — they either re-click (possible duplicate proposals) or walk away believing a governed fix was staged when it wasn't.
- **Fix sketch**: Have `preparePackage` parse `json.error` and hand it back (or keep per-row error state in CampaignTable next to `preparingId`), render it under the button like the analyze-error row does, and only call `revealThreadTarget` on success (already the case).

## 3. Un-memoised `changesById` rebuilds every render and busts CampaignTable's expensive triage memo
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: memo-identity-leak
- **File**: src/components/campaigns/CampaignsClient.tsx:323-325 (defeats CampaignTable.tsx:395-398)
- **Scenario**: Any CampaignsClient re-render — an alert load reporting via `onAlertsChange`, a type-card click, `headerHost` resolving, share state — creates a fresh `Object.fromEntries(...)` for `changesById`. CampaignTable's `useMemo(() => deriveCampaignRows(...), [campaigns, changesById, goals, campaignSeries])` keys on that identity, so the "expensive layer — withMetrics + the full triage rule engine per campaign (including the slow-bleed scan over each campaign's daily series)" it explicitly memoises re-runs on every parent render anyway.
- **Root cause**: The prop is derived inline without `useMemo`. TypeBreakdown noticed the same hazard and worked around it by *excluding* `changesById` from its deps (with a long comment and an eslint-disable) — treating the symptom in one consumer while the source and the other consumer stay broken.
- **Impact**: Wasted full-portfolio triage passes on frequent, cheap parent renders (the memo's stated purpose is defeated); plus two consumers now encode two contradictory beliefs about `changesById`'s identity, which a future developer will have to untangle.
- **Fix sketch**: Wrap the derivation in `useMemo(() => Object.fromEntries(...), [changes])` in CampaignsClient. Then TypeBreakdown's dep-exclusion workaround (and its eslint-disable) can be deleted.

## 4. Header KPI portal target is resolved exactly once on mount — badges silently vanish if the slot isn't there yet
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: fragile-portal-timing
- **File**: src/components/campaigns/CampaignsClient.tsx:207-212
- **Scenario**: The mount effect runs `document.getElementById("module-header-actions")` a single time. If ModulePage's header slot commits after CampaignsClient mounts (streaming/Suspense boundary, layout refactor, or the component being reused on a page without the slot), `headerHost` stays `null` forever and the four portfolio KPI badges — Cost, Conversion value, ROAS, PNO, the page's only portfolio totals — never render, with no fallback and no error.
- **Root cause**: A one-shot DOM query encodes the undocumented assumption "the header slot is always committed before this effect fires"; there is no retry, no in-flow fallback rendering, and nothing that would make the failure visible in development.
- **Impact**: A quiet, environment-dependent disappearance of the primary portfolio numbers; the coupling to a magic element id lives only in this file and breaks invisibly when the layout changes.
- **Fix sketch**: Either render the KPI row in-flow when `headerHost` is null (graceful fallback), or resolve the host robustly (ref/context provided by ModulePage instead of a stringly id; or a `MutationObserver`/second-frame retry). At minimum, `console.warn` in dev when the slot is missing.

## 5. Hand-rolled Czech plural rule (1 / 2–4 / 5+) is copy-pasted across four components
- **Severity**: Low
- **Lens**: ui
- **Category**: repeated-pattern-extract
- **File**: src/components/campaigns/TriageBanner.tsx:91-92 (also HealthTimeline.tsx:56-57, TypeBreakdown.tsx:107-108, plus per-file `*1/*234/*N` key triplets)
- **Scenario**: Every count label re-implements `n === 1 ? key1 : n >= 2 && n <= 4 ? key234 : keyN` inline, and each translation table carries three near-identical keys per noun (campaign/critical/attention/verb). Adding the next counted noun means re-copying both the ternary and the key triplet; getting the 2–4 band wrong in one spot produces a grammatical error only Czech readers will notice.
- **Root cause**: No shared pluralization helper; the i18n layer's `useT` interpolates but does not select plural forms, so each component grew its own selector.
- **Impact**: Silent divergence risk (one copy already varies: TriageBanner needs matching verb forms too), avoidable translation-table bloat, and friction for every future counted string in this Czech-first product.
- **Fix sketch**: Add a tiny `czPlural(n, one, few, many)` helper (or wire `Intl.PluralRules("cs")`) in the i18n client module and replace the four inline ternaries; keep the existing keys so rendered output is byte-identical.
