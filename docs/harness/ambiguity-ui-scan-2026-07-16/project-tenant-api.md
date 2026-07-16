# Project & tenant workspace API — ambiguity+ui scan

> Total: 5 findings (0 critical / 3 high / 2 medium / 0 low)

## 1. Twin draft send has no idempotency and can be silently un-sent by a concurrent full-state save
- **Severity**: High
- **Lens**: ambiguity
- **Category**: send-race-lost-update
- **File**: src/app/api/projects/[id]/twin/send/route.ts:33-66 (and src/app/api/projects/[id]/twin/route.ts:29)
- **Scenario**: (a) The user double-clicks "Send" (or two tabs send the same draft): both requests read the saved state, both see `status === "approved"`, both call `connector.send(...)` → double external delivery once a real connector exists. (b) The client POSTs its whole twin state (`/twin` saves the entire blob) while a send is in flight or just finished: the client's stale copy still has the draft as `approved`, so the full-state save overwrites `sent` back to `approved` — the send disappears from the audit trail and the draft becomes send-eligible again. The `twin/route.ts` guard explicitly treats `sent` as terminal, but only for drafts the *posted blob* already marks `sent`; a stale client blob never says so.
- **Root cause**: Whole-blob last-writer-wins persistence (`saveTwin(project.id, {...state,...})`) with a check-then-act gap between `getTwin` and `saveTwin`, and no version/ETag or per-draft transition semantics between the two routes that write the same blob.
- **Impact**: Duplicate outbound messages to real contacts (reputation damage once connectors go live) and a corrupted send audit trail ("the message was sent but the record says approved"). Today's `manual` connector masks it, which is exactly when the assumption should be written down or closed.
- **Fix sketch**: Make send a compare-and-set: re-read + write inside one transaction (mirror `mutateLocalSignals`'s atomic read-modify-write) and flip `approved → sending → sent` so a second concurrent send 409s. In `/twin` POST, merge terminal statuses from the STORED state (a stored `sent`/`rejected` for the same draft id always wins over the posted status) instead of trusting the client blob to know about them.

## 2. A scheduled social post with a past timestamp silently publishes immediately
- **Severity**: High
- **Lens**: ambiguity
- **Category**: past-schedule-publishes-now
- **File**: src/app/api/social/posts/route.ts:62-92
- **Scenario**: The user schedules a post but the timestamp lands in the past — a year typo, a timezone misread (the route parses whatever `Date.parse` accepts, including offset-less local-looking strings), or a form that kept yesterday's date. `future` is false, so the route drops into the publish-now branch and immediately delivers through the real connector when one is connected — no confirmation, no error.
- **Root cause**: The code deliberately hardened the *unparseable* case (the comment explains rejecting NaN) but left the parseable-but-past case falling through to a branch with materially different consequences (external delivery now vs. queued). "Schedule" and "publish now" are distinct user intents collapsed by a single `scheduledMs > Date.now()` comparison.
- **Impact**: An unintended live post on a connected Facebook/LinkedIn account — the most irreversible action this route can take — triggered by the least-signal input mistake. The response even reports `status: "published"`, so the UI can only tell the user after the fact.
- **Fix sketch**: When `scheduledAt` was supplied and parses to more than a small skew window in the past (e.g. > 2 minutes), return 422 `"Naplánovaný čas je v minulosti."` instead of publishing. Keep publish-now strictly for requests that omit `scheduledAt`. Also reject offset-less datetimes (require `Z`/offset) or document that they are interpreted as server-local.

## 3. PATCH project accepts unvalidated `accentColor` / `logoUrl` that flow into public client-facing surfaces
- **Severity**: High
- **Lens**: ambiguity
- **Category**: unvalidated-branding-into-public-surface
- **File**: src/app/api/projects/[id]/route.ts:21-23 (consumed at src/app/api/campaigns/share/route.ts:38)
- **Scenario**: PATCH stores any string as `accentColor`, `logoUrl`, or `domain` (only trimmed). The share route then bakes `{ accent: project?.accentColor, logo: project?.logoUrl }` into a *public, tokenized client report*, and the microsite identity chain can pick the accent up too. A `logoUrl` of `javascript:...`/`data:text/html,...` or an `accentColor` like `red;} body{display:none` reaches a page viewed by third parties (the client), where any `<img src>`/inline-style rendering slip becomes stored XSS or CSS injection on a shareable URL.
- **Root cause**: Sibling routes in this same context sanitize every payload (`sanitizeOfferings`, `sanitizeCompetitors`, `sanitizeCostModel`, `sanitizeChannelState`, `sanitizeTwinState`) — project branding is the one write-path with no validator, yet it has the widest public blast radius. Whether the renderers escape correctly is invisible from here; the API contract simply doesn't say.
- **Impact**: Best case: a broken accent silently mangles the client-facing report's styling (brand-damaging in a white-label product). Worst case: a stored-XSS vector on public share links, reachable by anyone the report URL is forwarded to.
- **Fix sketch**: Validate at the boundary like everything else here: `accentColor` must match `/^#[0-9a-f]{3,8}$/i` (or a named-token whitelist), `logoUrl` must parse as http(s) URL, `domain` as a bare hostname; reject otherwise with the existing `badRequest(...)` shape. That makes every downstream renderer safe by construction.

## 4. `projectId` from the wire is trusted un-verified by the tenant-keyed routes — phantom tenants and an inconsistent auth posture
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: unverified-projectid-tenant-key
- **File**: src/app/api/campaigns/share/route.ts:29 (also microsite/route.ts:52, social/posts/route.ts:57, social/messages/route.ts:42)
- **Scenario**: Half of this context authenticates via `requireOwnedProject` (404s a foreign/typo'd id). The tenant-keyed half (`share`, `microsite`, `social/*`) instead feeds a raw body/query `projectId` straight into `resolveTenant`, which builds `buildTenantKey(userId, projectId)` without checking the project exists or is the caller's. No cross-user leak (the key still embeds `userId`), but any typo'd/stale/deleted projectId silently mints a fresh empty tenant: a share link created under a phantom id lists as zero reports next visit; scheduled posts vanish when the client later sends the corrected id; `deleteProjectCascade` can only scrub keys derived from *real* project ids, so phantom-tenant data is unreachable garbage forever.
- **Root cause**: Two auth idioms grew side by side (`requireOwnedProject` vs `resolveTenant`) and the tenant idiom never adopted the existence/ownership check; nothing documents that `projectId` here is "trusted-shape, unverified".
- **Impact**: Silent data loss from the user's perspective ("my scheduled posts / share links disappeared"), orphaned blobs the delete cascade can't reach, and a foot-gun for the next route author who assumes `projectId` is validated because it is everywhere else in this directory.
- **Fix sketch**: In these routes, when `projectId` is present, resolve it with `getProject(userId, projectId)` and 404 on null before calling `resolveTenant` (share/route.ts already fetches the project anyway — just stop ignoring the null). Alternatively push the check into `resolveTenant` behind an opt-out for the anonymous/sample path.

## 5. Split store-keying convention — half the per-project stores omit `uid`, resting tenancy on an undocumented global-id-uniqueness assumption
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: mixed-store-keying-convention
- **File**: src/app/api/projects/[id]/competitors/route.ts:23 (pattern also in cost-model, onboarding, organic-channels, local-signals, twin routes)
- **Scenario**: Catalog, warehouse and project-state stores key by `(uid, projectId)`; competitors, cost-model, onboarding, organic-channels, local-signals and twin key by `projectId` alone (`saveCompetitors(project.id, ...)` — the route destructures `uid` and never passes it). Isolation therefore depends on two unstated invariants: project ids are globally unique across all users forever, and *every* code path into these stores goes through `requireOwnedProject` first. A future background job, admin tool, or import script that reaches a uid-less store with an id from the wire has no second fence.
- **Root cause**: Two generations of store API grew without a recorded decision; nothing in `competitors/store.ts` (or its siblings) states that the bare `projectId` key is deliberate and what guarantees it leans on.
- **Impact**: Latent cross-tenant read/write if id-uniqueness is ever weakened (id reuse after delete, client-supplied ids, a second id namespace), and extra cognitive load: `deleteProjectCascade` and every new caller must know which stores need `uid` and which must not get it.
- **Fix sketch**: Pick one convention. Cheapest honest fix: a one-paragraph note in each uid-less store ("keyed by projectId only; safe because ids are UUID-unique and every route guard is requireOwnedProject; never call with a wire-supplied id") — or thread `uid` through the six uid-less stores to match the catalog/warehouse shape.
