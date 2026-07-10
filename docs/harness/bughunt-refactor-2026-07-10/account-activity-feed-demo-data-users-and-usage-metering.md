# Account, Activity Feed, Demo Data, Users & Usage Metering

> Total: 5
> Critical: 0 · High: 1 · Medium: 1 · Low: 3
> Lenses: bug-hunter 4 · code-refactor 1 (new-only, deduped vs code-refactor-2026-07-09)

## 1. `consume()` charges quota before the paid work runs, with no compensating refund — a degraded/failed generation burns the user's whole daily allowance for nothing

- **Severity**: High
- **Lens**: bug-hunter
- **Category**: latent-failure
- **File**: `src/lib/usage.ts:68`
- **Scenario**: `consume(uid, "image", count)` is called *before* `generateImageSet` (`src/app/api/images/route.ts:75` → generation at `:89`). A free user (`image: 5`/day) requests a 5-candidate set. `LEONARDO_API_KEY` is absent or Leonardo errors, so `generateImageSet` falls back to deterministic SVG placeholders (`result.source !== "leonardo"`). The 5 units are already committed to Firestore `usage/{uid}` and there is **no refund path** — the module exports only `consume`/`getUsage`/`getUserPlan`/`byomUnlocked`, nothing that releases a charge. The user is locked out of images for the rest of the UTC day having produced only placeholders. The identical shape exists on the AI path: `consume(userId,"aiEval")` at `src/app/api/ai/route.ts:94`, then `gen()` at `:107`; if `gen()` throws or the LLM wrapper returns its deterministic demo fallback, the aiEval unit is spent on a non-answer.
- **Root cause**: The metering design assumes "charge = successful paid unit," but the charge is taken optimistically up front and the downstream call can fail *or silently degrade to a free deterministic fallback* after the debit, and there is no reverse operation to keep the ledger honest.
- **Impact**: Wrong number / value-loss for the user — paid daily quota is consumed for output that cost the app nothing and delivered no real AI/image result; on the free tier a single degraded 5-count request exhausts the day.
- **Fix sketch**: Add a `refund(userId, kind, amount)` (transactional `current - amount`, floored at 0, mirroring `consume`) to `usage.ts`, and have `images/route.ts` refund `count` when `result.source !== "leonardo"` (and `ai/route.ts` refund 1 when the result is the demo fallback / on thrown error). Alternatively invert the order: reserve, run, then commit only on a real paid result.

## 2. `actorFor` collapses every non-"you"/non-sync actor to "you" — the live feed attributes autonomous AI actions to the human operator

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: silent-failure
- **File**: `src/lib/activity/compute.ts:57`
- **Scenario**: `ActivityActor` is `"ai" | "system" | "you"` (`sample.ts:12`) and the seeded feed marks AI-drafted rows with `actor: "ai"` (`sample.ts:45,52,55`), rendered distinctly from human rows. But `actorFor` (the only actor mapper for *live* records, via `recordToEvent`) has just two branches — `"you"` for `^(vy|you)$`, `"system"` for `/auto|synchron|sync/i` — and a final `return "you"` for everything else. It can **never** produce `"ai"`. So any live record whose actor is an AI label, a userId, or any other string is shown as done by "Vy"/you. The header comment even says "any other named actor → a person," but no `"person"` actor exists. In a feed whose stated purpose (`campaigns/activity.ts:1-7`) is "the timeline an agency uses to explain account changes to a client," an AI's autonomous budget move is misattributed to the human.
- **Root cause**: The live mapper was written against only the two actor strings the current writers emit ("Vy", "Automatická synchronizace") and defaults the residual bucket to "you" instead of the neutral "system"/"ai", so the type's third variant is unreachable from live data.
- **Impact**: User-visible wrong attribution — autonomous/AI and third-party actions read as "you did this," eroding trust in a client-facing audit timeline.
- **Fix sketch**: Add an AI branch (e.g. `if (/\b(ai|asistent|twin|autopilot)\b/i.test(actor)) return "ai";`) before the fallback, and change the residual `return "you"` to `return "system"` so an unknown named actor isn't asserted to be the current user. Have the AI-emitting writers record an explicit AI actor label.

## 3. `recordToEvent` produces `NaN` `daysAgo` for an unparseable `at`, which silently bypasses the window filter and corrupts sort order

- **Severity**: Low
- **Lens**: bug-hunter
- **Category**: edge-case
- **File**: `src/lib/activity/compute.ts:70`
- **Scenario**: `daysAgo: Math.max(0, Math.floor((nowMs - Date.parse(r.at)) / DAY_MS))`. `listActivity` casts `d.data()` blindly (`campaigns/activity.ts:54`); if any `at` field is not an ISO string (a legacy doc, or a Firestore `Timestamp` object written by a different path), `Date.parse` returns `NaN` → `daysAgo` is `NaN`. `filterActivity` then never drops it (`NaN > windowDays` is `false`, so the "last N days" filter silently keeps it — `compute.ts:17`), and the `sort((a,b)=>a.daysAgo-b.daysAgo)` comparator returns `NaN`, yielding an undefined ordering. The row also renders "NaN" wherever `daysAgo` is displayed.
- **Root cause**: The mapper assumes `r.at` is always a well-formed date string; it neither validates the parse nor supplies a fallback, and the consumers treat `daysAgo` as a guaranteed finite number.
- **Impact**: Degradation — a single malformed record can leak past the date-window filter and scramble the feed's chronological order; visible "NaN" in the timeline.
- **Fix sketch**: Guard the parse: `const t = Date.parse(r.at); const age = Number.isFinite(t) ? Math.max(0, Math.floor((nowMs - t)/DAY_MS)) : 0;` (or drop records whose `at` is unparseable), and treat `NaN` as filtered-out in `filterActivity`.

## 4. `emitProjectActivity(null, …)` writes to the shared public "sample" tenant — a latent cross-visitor feed-pollution seam

- **Severity**: Low
- **Lens**: bug-hunter
- **Category**: latent-failure
- **File**: `src/lib/activity/emit.ts:11`
- **Scenario**: `emitProjectActivity` accepts `userId: string | null` and passes it to `resolveTenant`, which returns the literal `"sample"` tenant for a null user (`campaigns/connector.ts:154`) — the same tenant every anonymous visitor reads on the public `/dashboard` demo. Today all 8 call sites pass an authenticated `uid`/`auth.uid`, so the null branch is unreached; but the signature invites it, and the first mutation route that logs activity before (or without) an auth gate will silently append real user actions into the world-readable demo timeline, with no error (writes are best-effort/swallowed at `emit.ts:19`).
- **Root cause**: The `null` userId is accepted and mapped to a *shared* tenant rather than rejected/no-op'd; the "anonymous → sample" fallback is meant for read paths but is reachable from this write helper.
- **Impact**: Security/isolation — potential leakage of one tenant's activity into the public demo feed the moment a caller forgets the auth gate; fails silently.
- **Fix sketch**: Make the write a no-op when `userId` is falsy: `if (!userId) return;` at the top of `emitProjectActivity`, so the shared "sample" tenant is never a write target.

## 5. `ActivitySeverity` union is defined identically in two modules

- **Severity**: Low
- **Lens**: code-refactor
- **Category**: duplication
- **File**: `src/lib/activity/sample.ts:11`
- **Scenario**: `export type ActivitySeverity = "info" | "success" | "warning" | "critical"` is declared verbatim in both `src/lib/activity/sample.ts:11` and `src/lib/campaigns/activity.ts:14`. `activity/compute.ts` imports the former; the `ActivityInput`/`ActivityRecord` writers use the latter. The two must stay in lockstep — adding a fifth severity (e.g. `"neutral"`) to one leaves the other's records unrepresentable in the feed, with no compiler link between them. (Not in the 2026-07-09 report, which covered `csvCell`, the `users/local` dead code, the `usage` re-exports — already removed —, the `sessions` duplicate query, and the `demo/projects` structure split; this type duplication is distinct.)
- **Root cause**: The account-level activity feed generalized the campaigns feed's severity concept and re-declared the union locally instead of importing the existing one, to avoid a `campaigns`→`activity` import.
- **Impact**: Two edit sites for one enum; silent divergence risk when the severity set changes.
- **Fix sketch**: Declare `ActivitySeverity` once (it already lives in the domain owner `campaigns/activity.ts`) and `export type { ActivitySeverity } from "@/lib/campaigns/activity"` in `activity/sample.ts`, or hoist it to a shared `activity-types.ts` both import. Keep it framework-free.
