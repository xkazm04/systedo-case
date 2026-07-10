# Project & tenant workspace: CRUD, data connections, distribution & social publishing

> Total: 5
> Critical: 0 · High: 1 · Medium: 2 · Low: 2
> Lenses: bug-hunter 4 · code-refactor 1 (new-only, deduped vs code-refactor-2026-07-09)

## 1. Connecting/disconnecting a Google Ads account silently orphans social posts, microsites, shared-report links & message replies

- **Severity**: High
- **Lens**: bug-hunter
- **Category**: state-corruption
- **File**: `src/lib/campaigns/connector.ts:150-157`
- **Scenario**: `resolveTenant(userId, projectId)` builds the tenant key by *always* appending the connected Ads account id: `buildTenantKey(userId, projectId, connection?.customerId)`. So for one project the key is `u_{uid}_proj_{pid}` **before** an Ads account is connected and `u_{uid}_proj_{pid}_{customerId}` **after**. Every tenant-scoped resource in this context resolves its storage key through `resolveTenant`: `social/posts/route.ts:21,43,49,58` (posts + scheduled-post cron target), `social/messages/route.ts:20,44` (inbox replies), `microsite/route.ts:23,51,80` (published client microsite), and `campaigns/share/route.ts:29,54,77` (shareable `/report/{token}` links). Reproduction: (a) new user schedules 3 social posts and publishes a client microsite during onboarding — all stored under `u_{uid}_proj_{pid}`; (b) user later connects Google Ads in Nastavení; (c) next visit, `resolveTenant` now returns `u_{uid}_proj_{pid}_{customerId}`, so `listPosts`/`getMicrositeForTenant`/`listSharedReports` read a *different, empty* tenant. The scheduled posts vanish from the inbox (and the digest/social cron, which fans out over tenants, no longer sees them to publish), the microsite management card goes blank, and the user can no longer revoke previously shared client report links. Disconnecting reverses it. Note the contrast: project-scoped resources in the same context (`onboarding`, `twin`, `local-signals`, `competitors`) key on the stable `project.id` and are unaffected — only the `resolveTenant`-keyed ones drift.
- **Root cause**: the customerId was folded into the tenant key so live-Ads read/sync paths agree (documented at connector.ts:144-149), but non-Ads user content (social, microsite, shared reports) piggybacks on the same `resolveTenant` and inherits a key that mutates whenever the Ads connection changes. The abstraction leaked a volatile component into an identity that should be stable.
- **Impact**: user-visible data loss/disappearance — scheduled posts silently unpublished, client microsites and shared client links orphaned and unmanageable (the public token URL keeps working but can never be revoked).
- **Fix sketch**: drop `customerId` from the *storage* tenant key — make `buildTenantKey` return `u_{uid}[_proj_{pid}]` only, and let the live-Ads sync path disambiguate accounts with a separate field (e.g. a `customerId` column on the campaign docs) rather than in the tenant path. Alternatively, give social/microsite/shared-report their own `project.id`-keyed stores like the other resources in this context. Add a one-time migration mapping `_{customerId}`-suffixed docs back to the bare key.

## 2. A disabled microsite's slug can be silently stolen by another tenant

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: edge-case
- **File**: `src/app/api/microsite/route.ts:54-57`
- **Scenario**: POST guards slug uniqueness with `const existing = await getMicrosite(slug); if (existing && existing.tenant !== tenant) return 409`. But `getMicrosite` (`src/lib/microsite.ts:73-84`) returns `null` for a slug whose config has `enabled === false` (line 78: `return cfg.enabled ? cfg : null`). So if tenant A published `/m/acme` and later took it offline (`disableMicrosite` keeps the doc but flips `enabled:false`), tenant B publishing the same client name (`slugify("Acme") === "acme"`) sees `existing === null`, passes the guard, and `enableMicrosite` does `registry().doc("acme").set(cfg, { merge: true })` — overwriting the doc's `tenant`, brand and logo with B's. Tenant A permanently loses the slug: when A re-publishes, it now sees `existing.tenant !== A` and is 409'd out of its own URL. No concurrency required — a disabled state is enough.
- **Root cause**: the uniqueness check reuses the *render* accessor (`getMicrosite`, which deliberately hides disabled sites so the public page 404s) as an *ownership* check; the two need different visibility rules.
- **Impact**: cross-tenant ownership overwrite of a public, SEO-indexed URL; the original owner is locked out of a slug they still own.
- **Fix sketch**: add an ownership-aware lookup that ignores `enabled` (e.g. `getMicrositeRaw(slug)` reading the doc without the enabled filter) and use it for the collision guard, so any slug already owned by another tenant — enabled or not — is rejected.

## 3. `twin/send` has no idempotency/lock — a double-submit sends the same approved draft twice

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: race-condition
- **File**: `src/app/api/projects/[id]/twin/send/route.ts:30-56`
- **Scenario**: the handler reads saved state, checks `draft.status === "approved"`, calls `connector.send(...)`, then `saveTwin` marks it `sent`. There is no lock or claim-before-send between the status check (line 33) and the state write (line 52). Two near-simultaneous POSTs with the same `draftId` (double-click, client retry on a slow connector, tab duplication) both read `status:"approved"`, both pass the gate, and both invoke `connector.send`. The final `saveTwin` is last-write-wins so the draft ends `sent` exactly once, hiding the fact that the message left twice. Today the only wired connector is `manual` (a no-op), so impact is latent — but the file's own header anticipates a real SMTP connector, at which point this double-sends a live customer email.
- **Root cause**: the send is modeled as read-check-act-write with no atomic transition; "is this draft still sendable" and "mark it sent" are not a single compare-and-set.
- **Impact**: duplicate outbound delivery (currently masked by the no-op connector; becomes real on the first credentialed connector), with no audit trace of the second send.
- **Fix sketch**: claim-before-send — atomically transition `approved → sending` (a Firestore transaction / conditional update on the draft) and only proceed if the claim succeeds; on connector failure revert to `approved`, on success set `sent`. Mirror the "deliverViaEsign claim-before-send" pattern used elsewhere in the fleet.

## 4. `social/posts` treats an unparseable `scheduledAt` as "publish now" instead of rejecting it

- **Severity**: Low
- **Lens**: bug-hunter
- **Category**: silent-failure
- **File**: `src/app/api/social/posts/route.ts:44-45`
- **Scenario**: `const future = scheduledAt && new Date(scheduledAt).getTime() > Date.now();`. When `scheduledAt` is a non-empty but unparseable string (a locale-formatted date, a typo, a value the client serialized wrong), `new Date(scheduledAt).getTime()` is `NaN`, and `NaN > Date.now()` is `false`. `future` is therefore falsy, so the branch falls through to the **publish-now** path (lines 57-69) — the post is immediately published/queued instead of being scheduled, and no validation error is returned. The user believes they scheduled a post for later; it actually went out (or failed) immediately.
- **Root cause**: the code infers intent ("schedule vs publish now") from a numeric comparison that silently coerces invalid input to `NaN`, conflating "no schedule requested" with "an invalid schedule was requested".
- **Impact**: a mistyped/misformatted schedule silently publishes now — wrong-time posting with no error surfaced to the user.
- **Fix sketch**: parse explicitly — if `scheduledAt` is non-empty, compute `const t = Date.parse(scheduledAt)` and `return 422 "Neplatné datum."` when `Number.isNaN(t)`; only then compare `t > Date.now()` to choose schedule vs publish.

## 5. `isProjectType` type guard is duplicated byte-identically across the two project CRUD routes

- **Severity**: Low
- **Lens**: code-refactor
- **Category**: duplication
- **File**: `src/app/api/projects/route.ts:13-15`
- **Scenario**: `function isProjectType(v: unknown): v is ProjectType { return typeof v === "string" && (PROJECT_TYPES as string[]).includes(v); }` is defined verbatim in both `projects/route.ts:13-15` and `projects/[id]/route.ts:8-10`. Both files already `import { PROJECT_TYPES, type ProjectType } from "@/lib/projects/types"` (where `PROJECT_TYPES` lives, `types.ts:17`), so the guard belongs next to its data. This is distinct from the prior code-refactor report's finding #2 (which was about the `userId()`/`currentUserId` duplication) — the `isProjectType` guard is not mentioned anywhere in the 2026-07-09 report.
- **Root cause**: the second route copied the guard rather than exporting it from the module that owns `PROJECT_TYPES`.
- **Impact**: small (2 files), but a future change to how a project type is validated (e.g. trimming, case-folding, a deprecated-types allowlist) must be edited in two places and can drift.
- **Fix sketch**: export `isProjectType` from `src/lib/projects/types.ts` beside `PROJECT_TYPES` and import it in both routes; delete the two local copies.
