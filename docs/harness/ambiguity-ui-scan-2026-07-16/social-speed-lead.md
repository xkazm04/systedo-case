# Social Command Center & Speed-to-Lead Response — ambiguity+ui scan

> Total: 5 findings (0 critical / 3 high / 2 medium / 0 low)

## 1. "Real" connection decided by platform-agnostic credentials — a LinkedIn token counts as real when only Meta is configured
- **Severity**: High
- **Lens**: ambiguity
- **Category**: cross-platform-config-check
- **File**: src/lib/social/connection.ts:74 (with :39-41)
- **Scenario**: `META_APP_ID` is set but `LINKEDIN_CLIENT_ID` is not. A user connects LinkedIn with a token. `connectAccount` passes `realConfigured: socialConfigured() && hasTokenCrypto()`, and `socialConfigured()` is an OR across *all* platforms — so the LinkedIn account is stored as a real (demo:false) connection with an encrypted token.
- **Root cause**: The real-vs-demo decision uses a global "any platform configured" check for a per-platform action, while publish.ts correctly re-checks `socialProvider(platform)?.configured()` per platform.
- **Impact**: The UI shows a "real" connected account whose every publish silently falls to the simulated branch — a non-demo connection that can never publish for real. Bonus hazard on the same lines: re-connecting a platform without a token (line 70-76) silently *downgrades* an existing real connection to demo, discarding the stored token with no warning.
- **Fix sketch**: Make the check per-platform (e.g. `providerConfigured(platform)` mirroring publish.ts's `socialProvider(platform)?.configured()`), and either reject or explicitly confirm a token-less reconnect over an existing real connection.

## 2. publishReply publishes the reply as a NEW post — messageId is never sent to the provider
- **Severity**: High
- **Lens**: ambiguity
- **Category**: reply-becomes-public-post
- **File**: src/lib/social/publish.ts:76-82
- **Scenario**: A real (non-demo) account replies to an inbound DM or comment from the inbox. `publishReply` calls `provider.publish({ token, content: reply }, …)` — the exact same call `publishPost` makes; `messageId` appears only in the error log.
- **Root cause**: The provider seam has no reply operation, so replying was routed through the post-publishing call. Harmless today only because every current path is simulated, but the file's own contract ("real when the account is connected with a token") says this branch is live.
- **Impact**: The moment real credentials exist, answering a private DM would publish the reply as a standalone public post on the user's page — a private customer conversation leaked publicly under the brand's name.
- **Fix sketch**: Add a distinct `reply(messageId, …)` capability to the provider interface; until adapters implement it, make `publishReply` treat a real connection as *not yet supported* (fall to simulation with an explicit note) rather than reusing `publish`.

## 3. A crash mid-publish strands posts in "publishing" forever — no reclaim or timeout
- **Severity**: High
- **Lens**: ambiguity
- **Category**: stuck-transient-state
- **File**: src/lib/social/store.ts:91-104 (with src/lib/social/types.ts:33)
- **Scenario**: The cron atomically claims a due post (scheduled→publishing), then the process crashes / times out / deploy restarts before the provider returns and the status settles to published/failed.
- **Root cause**: The claim protocol documents the happy path ("settles to published/failed once the provider returns") but has no lease/expiry: `listDueScheduled` only queries `status == "scheduled"`, so a stranded `publishing` row is invisible to every future run.
- **Impact**: The post shows "Zveřejňuje se…" permanently in the UI, is never published and never marked failed; the user has no action to recover it short of deleting and recreating.
- **Fix sketch**: Record a `claimedAt` timestamp on claim and let the cron re-claim `publishing` posts older than N minutes (compareAndSet on status+staleness), settling them to `failed` or retrying — and document the chosen N.

## 4. withinSlaRate counts every fresh unanswered lead as an SLA hit — the "honest" band is structurally optimistic
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: optimistic-metric-semantics
- **File**: src/lib/speed-lead/analytics.ts:65-69
- **Scenario**: An inbox with 10 leads that all arrived 1 minute ago and zero replies computes `withinSlaRate = 1.0` (each open, not-yet-breached lead is counted as a hit "for now").
- **Root cause**: Open-and-within-target leads are added to both `judged` and `hits`, so pending outcomes are scored as successes. The inline comment admits they "may flip later", but the module doc claims the band "stays honest", and `judged` contradicts the `withinSlaRate` doc ("null when no lead can be judged yet") — unjudgeable leads are judged as hits.
- **Impact**: The KPI is non-monotonic (it *drops* as time passes with no action) and shows a flattering 100% exactly when the team is at its worst — new leads piling up unanswered. In a speed-to-lead product this inverts the core signal.
- **Fix sketch**: Either exclude open-not-breached leads from `judged` (rate = answered-within-target + breached only, matching the documented semantics), or split the band into "resolved SLA rate" + "N at risk" so pending leads are visible instead of pre-counted as wins.

## 5. Speed-to-lead draft promises a phone call "within minutes" regardless of channel, with placeholder-grade sign-off
- **Severity**: Medium
- **Lens**: ui
- **Category**: channel-blind-template-copy
- **File**: src/lib/speed-lead/draft.ts:17-22
- **Scenario**: A rep opens an email or chat lead and hits the one-click draft. The reply always says "ozvu se do pár minut telefonicky" — even when the lead came via email with no phone number captured, and even though nothing guarantees a call in minutes — and signs off as "ráda/rád … S pozdravem, tým".
- **Root cause**: One hardcoded template ignores `lead.channel`, although the sibling snippet library (snippets.ts) already demonstrates the channel-aware pattern (`{kanál}` placeholder + `CHANNEL_LABELS`); "ráda/rád" and the bare "tým" are unresolved-placeholder artifacts shipped to the customer verbatim if the rep doesn't edit.
- **Impact**: Sent as-is (the whole point of speed-to-lead is minimal editing), it makes a concrete promise the business may not keep and reads like an unfinished template — undermining the trust the fast reply was supposed to build.
- **Fix sketch**: Branch the contact-back sentence on `lead.channel` (call → "zavoláme zpět"; email/form/chat → "odpovíme zde / ozveme se na uvedený kontakt"), drop the gendered "ráda/rád" for a neutral phrasing, and take a brand/team-name parameter like social/draft.ts's `brand` instead of the literal "tým".
