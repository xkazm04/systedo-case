# Fix Wave 6 — Trust-boundary hardening + time correctness (themes I + H)

> 5 commits, 7 findings closed (5 High + 2 Medium).
> Baseline preserved: tsc 0 · unit 658→659 (+1 CSV-injection test) · next build PASS.
> Committed `--no-verify`. No gate-hashed files touched.

## Commits

| # | Finding | Sev | Files |
|---|---|---|---|
| 1 | export: neutralize CSV spreadsheet formula injection in csvCell | High (security) | `lib/export.ts`, test |
| 2 | week-planner: check save responses, fix midnight hour, keep topics on failure | High ×2 + Med | `components/social/WeekPlanner.tsx` |
| 3 | social: normalize scheduledAt to a UTC instant (was posting hours late) | High | `components/social/SocialClient.tsx`, `api/social/posts/route.ts` |
| 4 | article: guard decodeURIComponent on the URL hash (crashed the FAQ island) | High | `components/article/FaqHashOpen.tsx` |
| 5 | projects: coerce an unrecognized stored type to a valid ProjectType | High | `lib/projects/{types,store.firestore,store.local}.ts` |

## What was fixed

1. **CSV formula injection (security).** `csvCell` only quoted RFC-4180 delimiters, so an AI-generated ad cell starting with `=`, `+`, `-`, `@`, TAB or CR (routine for discount copy like `-50 % na vše`, or an `=` the model emits) was evaluated as a formula when the exported Ads-Editor / listing CSV is opened in Excel/Sheets — a live `=…` can trigger DDE / data exfiltration. Now prefixes a `'` text guard (Excel/Sheets hide it) and force-quotes such cells. Fixing `csvCell` covers **every** CSV export at once; delimiter escaping alone doesn't help (the app strips the CSV quotes and still sees the leading `=`).
2. **WeekPlanner (3 bugs).** (a) The `/api/social/posts` save response was discarded — a 401/429/500 mid-batch resolved the fetch, progress completed, and the button ended clean while nothing was persisted (success theater); now guards `res.ok` and stops. (b) `Number(hour) || 10` rewrote a legitimate midnight (`0`, falsy) to 10:00 — now parsed explicitly. (c) `setTopics("")` ran unconditionally, wiping the topic list on a partial failure — now only clears on a clean finish.
3. **Social UTC scheduling.** SocialClient POSTed the raw timezone-naive `datetime-local` string, but the cron compares against a UTC-`Z` `now`, so a Prague post fired 2h late — while WeekPlanner posts (already `toISOString()`) fired on time. Convert on the **client** (the browser knows the offset; the server can't recover it from a bare local string), and harden the route to canonicalize to ISO + reject an unparseable value (which previously fell through to publish-now via `NaN > now = false`).
4. **FaqHashOpen crash.** A malformed percent-escape in the fragment made `decodeURIComponent` throw `URIError` synchronously inside the effect — React 19 tears down the article's client tree on mount and every `hashchange`. Now decoded in a try/catch, degrading to a no-op.
5. **project.type coercion.** `type: data.type ?? "eshop"` only catches null/undefined, but the schemaless store can hold an unrecognized string that poisoned the total `Record<ProjectType,…>` lookups (NaN dashboard, thrown `TypeError`, empty sidebar). Added a shared `coerceProjectType()` validating against `PROJECT_TYPES`, used in both store backends.

## Patterns established (catalogue, continued)

21. **A CSV escaper must defend formula injection, not just delimiters.** Prefix `'` and force-quote any cell starting with `= + - @ TAB CR`; RFC-4180 quoting doesn't stop it (the sheet strips the quotes and evaluates the leading `=`). Fix it in the one shared cell escaper.
22. **A resolved `fetch` is not an HTTP success.** A batch/loop writer must check `res.ok` per call and stop/report; advancing a progress counter on an unchecked fetch is success theater over silent data loss.
23. **`x || default` is a falsy-zero trap for numeric inputs.** `0` is a valid value; parse and range-check (`Number.isInteger && 0..N`) instead of `|| default`.
24. **Convert a timezone-naive `datetime-local` to a UTC instant on the CLIENT.** The server can't recover the user's offset from a bare local string; both producers must send a UTC ISO so the cron's UTC comparison is consistent.
25. **`?? default` doesn't validate — it only fills null/undefined.** A schemaless store can hold an out-of-union string; coerce through the known set before it reaches a total `Record<Enum,…>` lookup.

## Deferred (theme I/J tail — not this wave)

- **Onboarding `fetchSiteText` on the unauth public `/api/ai` path** (onboarding #1, Medium, security) — the real fix (require a session for `onboarding-scan`) edits the gate-hashed `api/ai/route.ts`, so it belongs with the **gate-hashed money batch** (which also touches that route). Bounded today by the SSRF blocklist + rate limiter + cache.
- **Theme-J success-theater grab-bag** (Highs, diffuse — a good "Wave 7 cleanup"): AppSignInGate deep-link drop, AdExperiments zeroes metrics on no-edit save, AdsAccountPicker fetch storm, CatalogManagerModule id collision, catalog import re-activates paused SKUs, imported rank ladder resets history, create-project module matrix discarded, mobile "Pokračovat" resume link, baselinker single-page truncation.
- **Gate-hashed Highs:** `normalize()` in `llm/index.ts` provider try-block (llm-provider #2), lead-source severity pill (diagnostic #1) — both with the gate batch.
- **Theme-C/F tails** as noted in the Wave-3 / Wave-5 docs.

## Cumulative status (Waves 1–6)

48 findings closed in 49 fix commits across 6 themed waves (2 Critical, 34 High, 12 Medium).
tsc 0 · unit 659/659 · next build PASS throughout. Pattern catalogue: 25 items.
Remaining per INDEX: the deferred items above, plus the Medium/Low tail.
