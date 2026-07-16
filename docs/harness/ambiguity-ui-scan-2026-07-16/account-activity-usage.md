# Account, Activity Feed, Demo Data, Users & Usage Metering — ambiguity+ui scan

> Total: 5 findings (0 critical / 1 high / 3 medium / 1 low)

## 1. `actorFor` misattributes AI and teammate actions as "you"
- **Severity**: High
- **Lens**: ambiguity
- **Category**: actor-misattribution
- **File**: src/lib/activity/compute.ts:53-58
- **Scenario**: A live `ActivityRecord` written with actor "AI asistent", "Systedo AI", or a colleague's name ("Petr Novák") flows through `recordToEvent` → the feed renders it with the "you" actor badge.
- **Root cause**: The function's own comment says "any other named actor → a person", but the fallback returns `"you"` — and there is no branch at all that ever yields `"ai"`, despite `ActivityActor = "ai" | "system" | "you"` and the seed recipes using `ai` heavily. Only `/auto|synchron|sync/` names escape to "system".
- **Impact**: The audit timeline lies about who did what: AI-initiated mutations (budget shifts, drafted replies) and other team members' actions all display as the current user's own actions. For an "audit" feed that is a trust-breaking mislabel, and it silently diverges from the seed data's actor distribution the UI was designed around.
- **Fix sketch**: Add an AI branch (e.g. `/\b(ai|asistent|agent)\b/i` or, better, have emitters pass a structured actor kind through `ActivityRecord` instead of free text) and make the final fallback a distinct value (`"system"` or a new `"member"`), matching the comment. Update the doc comment to whatever the real contract is.

## 2. Session helpers swallow all failures into `0`, making "error" indistinguishable from "no sessions"
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: error-shape-collapse
- **File**: src/lib/account/sessions.ts:16-17,32-33
- **Scenario**: Firestore is misconfigured or the query needs a missing composite index. `activeSessionCount` returns 0 → the Account & Security page tells a signed-in user they have zero active sessions. Worse, the user clicks "sign out everywhere", `revokeAllSessions` throws, catches, and returns 0 — the UI reports "0 revoked" while every other device stays signed in, and the user believes they are secured.
- **Root cause**: Both `catch` blocks collapse failure into the same value as the legitimate empty case; "best-effort" is documented for page rendering but is applied to a security action too. Also latent: `firestore.batch()` caps at 500 ops, undocumented here (unlikely but silently truncating if exceeded — it would actually throw on commit → 0 again).
- **Impact**: A security-critical operation can fail while reporting a calm, plausible number. Users acting on a suspected account compromise get false assurance.
- **Fix sketch**: Return `number | null` (or `{ ok, count }`) so callers can render "unavailable" for the count and a real error state for revocation; keep the never-throw guarantee at the route layer, not inside the primitive. Log the caught error (currently discarded).

## 3. `consume`/`getUsage` trust the stored `plan` string — an unknown plan crashes metering
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: unvalidated-persisted-enum
- **File**: src/lib/usage.ts:87-90 (also 23-31)
- **Scenario**: A `usage/{userId}` doc carries a plan value not present in `PLANS` — a renamed tier, a manual console edit, or a Stripe-layer writing a new plan name before the catalogue ships. `PLANS[plan]` is `undefined`, so `PLANS[plan][kind]` throws inside the transaction and every paid action for that user 500s.
- **Root cause**: `snap.data() as UsageDoc` is a blind cast; `data.plan ?? "free"` only handles absence, not invalidity. TypeScript's `Plan` type gives false confidence about runtime Firestore contents. The module doc even anticipates an external monetization layer mutating `plan`.
- **Impact**: One bad field bricks all AI evaluations, syncs, and image generation for the affected user until the doc is hand-fixed — with a confusing stack trace far from the cause.
- **Fix sketch**: `const plan = data.plan && data.plan in PLANS ? data.plan : "free";` in `statusFrom`, `getUserPlan`, and `consume` (one small `normalizePlan()` helper), optionally logging the unknown value once.

## 4. Quota "day" is UTC, not the user's (Czech) day — undocumented boundary
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: timezone-assumption
- **File**: src/lib/usage.ts:19-21
- **Scenario**: A Czech user exhausts their daily quota at 23:30 local time in winter. The UI (and support) say "resets at midnight", but `dayKey()` is `toISOString().slice(0,10)` — the counter actually resets at 01:00 (CET) / 02:00 (CEST) local. Conversely a burst at 00:30 local still counts against "yesterday".
- **Root cause**: The day boundary is an implicit UTC choice; neither the doc comment ("daily quota"), `UsageStatus.day`, nor the plans catalogue states which timezone defines a day. For a product whose entire audience is CZ, local expectation and metering reality differ by 1–2 hours every single day.
- **Impact**: Confusing "why am I still blocked after midnight" support cases; any UI countdown to reset built on local midnight will be wrong. Low data risk, recurring UX/clarity papercut.
- **Fix sketch**: Either document "days are UTC" on `dayKey()`/`UsageStatus.day` and surface the actual reset instant in the UI, or compute the key in `Europe/Prague` (`Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague" })`) and say so.

## 5. `maskEmail` doesn't mask single-character local parts
- **Severity**: Low
- **Lens**: ui
- **Category**: masking-edge-case
- **File**: src/lib/account/compute.ts:32-37
- **Scenario**: A user with `j@firma.cz` opens Account & Security; the "obscured" email renders as `j@firma.cz` — identical to the raw value — while every other user sees `m•••@x.com`.
- **Root cause**: `"•".repeat(local.length - 1)` yields an empty string for length-1 locals, so first char + zero dots reconstructs the full address; the function's contract ("obscure the local part") silently fails on the shortest inputs. (`at <= 0` also returns malformed input verbatim, which is at least intentional.)
- **Impact**: Minor privacy/consistency gap on a security page: the one class of address that is easiest to guess is the one shown unmasked, and the display is visually inconsistent across users.
- **Fix sketch**: Guarantee at least one mask character, e.g. `` `${local[0]}${"•".repeat(Math.max(1, local.length - 1))}${email.slice(at)}` ``, and add a unit case for 1-char locals.
