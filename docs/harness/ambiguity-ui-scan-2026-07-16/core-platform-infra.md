# Core Platform Infrastructure — ambiguity+ui scan

> Total: 5 findings (0 critical / 2 high / 3 medium / 0 low)

## 1. CSV formula guard turns every negative number into text
- **Severity**: High
- **Lens**: ambiguity
- **Category**: csv-negative-numbers-corrupted
- **File**: src/lib/export.ts:22-29
- **Scenario**: Any export containing a negative numeric cell — a profit delta ("-85000"), a signed percent, a `csvNum(-0.85)` result — passes through `csvCell`. `FORMULA_TRIGGER = /^[=+\-@\t\r]/` matches the leading `-`, so the cell is rewritten to `"'-85000"`.
- **Root cause**: The formula-injection guard treats *any* leading `-`/`+` as hostile, but a string that parses as a plain number (`-85000`, `-0,85`) cannot be a formula payload. The guard was designed for AI ad copy (`-50 % na vše`) and never carved out pure numerics.
- **Impact**: Every negative value in every CSV export opens in Excel/Sheets as *text* (with a visible-on-edit apostrophe), so sums, pivots and conditional formats silently exclude them. For a marketing-report product whose exports are full of deltas and net-profit columns, that is data corruption from the client's point of view.
- **Fix sketch**: In `csvCell`, before applying the guard, exempt values that are purely numeric: `if (typeof value === "number" || /^[+-]?\d+(?:[.,]\d+)?$/.test(s)) return needsQuoting ? quoted : s;`. Keep the apostrophe guard for everything else. Add a test: `csvCell(-5)` → `-5`, `csvCell("-50 % na vše")` → `"'-50 % na vše"`.

## 2. SCHEMA invites adding tables that existing databases will never receive
- **Severity**: High
- **Lens**: ambiguity
- **Category**: schema-vs-migration-split-brain
- **File**: src/lib/db.ts:38-416 (SCHEMA) vs :440-657 (MIGRATIONS)
- **Scenario**: A future developer adds `CREATE TABLE IF NOT EXISTS foo (...)` to the big commented `SCHEMA` constant — the obvious-looking place, since every existing table is documented there — but forgets the matching `MIGRATIONS` entry. Fresh databases (CI, new checkouts) get the table via v1; every *existing* database is already stamped at v1 (the `applied` probe is just `tableExists("rate_limits")`, db.ts:446), so v1 never re-runs and the table never appears. Dev works, the deployed instance throws `no such table: foo` at runtime.
- **Root cause**: Two sources of truth for shape (SCHEMA for fresh DBs, MIGRATIONS for upgrades) with no assertion tying them together. The header comment explains the ledger mechanics well but never states the one rule that matters: *a table added only to SCHEMA is invisible to any pre-existing database*.
- **Impact**: Silent schema divergence between fresh and upgraded databases; the failure surfaces as a runtime 500 in exactly the environments (long-lived local `.data/systedo.db`, prod-like) that dev/CI don't reproduce.
- **Fix sketch**: Add a startup/test invariant: enumerate table names parsed from SCHEMA and assert each (beyond the v1 base set frozen at ledger introduction) has a migration whose `applied` probe references it — or simpler, a unit test that runs MIGRATIONS v2..N against a v1-era fixture DB and diffs `sqlite_master` against a fresh `db.exec(SCHEMA)` DB. Also add one loud sentence to the SCHEMA comment: "adding a table here is NOT enough — append a Migration or existing DBs never get it."

## 3. admin.ts documents itself "Server-only" but has no server-only guard
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: missing-server-only-import
- **File**: src/lib/admin.ts:1-4
- **Scenario**: Every sibling with the same doc claim (`db.ts`, `firebase.ts`, `session.ts`, `local-mode.ts` implicitly) imports `"server-only"` so a client-component import fails the build. `admin.ts` only *says* "Server-only" in its comment. A developer imports `isAdminEmail` into a client component to conditionally render an admin button; it compiles fine.
- **Root cause**: The guard is a convention enforced by an import, and this one file skipped the import while keeping the comment.
- **Impact**: On the client, `process.env.ADMIN_EMAILS` is undefined, so `isAdminEmail` returns false for everyone — the admin UI silently never renders for real admins (fails closed, but as an unexplained bug, not a build error). It also normalizes copying the pattern without the guard, and a future refactor that inlines the allowlist would leak operator emails into the client bundle.
- **Fix sketch**: Add `import "server-only";` at the top of admin.ts, matching db.ts/firebase.ts/session.ts. Zero behavior change on the server.

## 4. Default alert sender is Resend's sandbox address — prod alerts silently die
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: sandbox-from-address-default
- **File**: src/lib/email.ts:51
- **Scenario**: An operator sets `RESEND_API_KEY` in production but not `ALERT_FROM_EMAIL`. Every send goes out as `from: "<SITE_NAME> <onboarding@resend.dev>"`. Resend only allows the `onboarding@resend.dev` sandbox sender to deliver to the *account owner's own email* — any real recipient (a client's inbox, the report cron fan-out) gets a 403 from the API.
- **Root cause**: The fallback looks like a working default but is actually a test-mode-only address; nothing in the code or docs flags that `ALERT_FROM_EMAIL` is effectively required for real recipients.
- **Impact**: The failure is best-effort by design (`postJson` logs and returns false), so scheduled report emails to clients fail every night with only a console line in Vercel logs — the exact "did last night's report deliver?" blind spot the cron_runs table was built to fix. `summarizeDelivery` then correctly refuses to mark sent, so the batch retries and fails forever.
- **Fix sketch**: Treat a configured `RESEND_API_KEY` without `ALERT_FROM_EMAIL` as a readiness warning (there is already a `productionWarnings` channel in src/lib/readiness surfaced at boot in firebase.ts:46). At minimum, document on the fallback line that resend.dev senders can only reach the account owner.

## 5. UTF-8 BOM stored as an invisible literal character in source
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: invisible-character-literal
- **File**: src/lib/export.ts:52
- **Scenario**: `const BOM = "﻿";` contains U+FEFF between the quotes — it renders as an empty string in every editor, diff view and code review. A formatter, a copy-paste refactor, or a well-meaning cleanup ("this constant is an empty string, delete it") strips it; the change is invisible in the diff.
- **Root cause**: The byte matters but the source representation carries no visual evidence that it exists.
- **Impact**: If lost, every CSV export regresses to mojibake Czech diacritics in Excel (the exact bug the BOM exists to prevent), and the regression is undiagnosable from reading the code — the constant still *looks* correct either way.
- **Fix sketch**: Use the escape sequence: `const BOM = "﻿";` — identical bytes at runtime, self-documenting and diff-visible. One-character change plus keeping the existing comment.
