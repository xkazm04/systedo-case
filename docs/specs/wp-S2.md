# WP S2 — Twin delivery + autonomy on the wire
card #9 (delivery half) · XL (narrowed to L: email only, replies only, no follow-up drafting) · gate: **irreversible** (real messages leave the app) · wave 4 · runs in PARALLEL with S1 (disjoint write sets)

## Goal
An approved draft can actually be DELIVERED: the throwing `email-smtp` placeholder
becomes a real email connector over the sender the crons already use (Resend), the send
route's atomic claim moves into a lib function that both the route and a new
`twin-dispatch` ledgers step call (so `sentAt` is STILL minted in exactly one function),
that claim now enforces a per-channel weekly cap and a per-channel consent requirement
(fail-closed, `mayContact`), a consent GRANT path exists in the CRM so the gate can ever
open, and channels on `autonomy:"auto"` get their pending inbound drafts auto-drafted by
the twin (through the chokepoint, cron-spend-guarded), auto-decided, and — only when
every gate agrees — auto-delivered. Acceptance: the claim gates pinned red→green
(cap, consent, unconfigured, already-sent idempotent), the route byte-identical to today
on the manual path, the dispatcher step pinned end-to-end on the sqlite twin with a
fixture connector and a fixture generator, the `sentAt` grep still shows ONE mint
site — ≥32 assertions.

## Non-goals
- No SMS/WhatsApp/social delivery (those channels stay `manual`); no IMAP/SMTP transport
  (no `nodemailer` dep — the env is `RESEND_API_KEY`, not `TWIN_SMTP_URL`; retire the
  latter name in `.env.example`/self-hosting doc with a one-line note).
- No follow-up/cadence DRAFTING (the twin still answers inbound; it does not initiate) —
  the deck's "follow-up cadence" is a later rung; `maxPerWeek` here caps SENDS.
- No change to `decideDraft` semantics for DRAFT approval — delivery gets its own pure
  gate `decideDelivery`. No change to `/api/projects/[id]/twin` commit route.
- `resolveTwinDraftGate` fail-OPEN (`load.ts:86-88`) is a drafting gate and stays; the
  DELIVERY gate fails CLOSED by construction (store error → no send).
- Do not touch S1's files (campaigns/**, sklik/**), insights, lp-exp. No new public route.

## Seams
- **Connector:** `src/lib/twin/connectors.ts:64-79` — replace `emailSmtp` with `email`
  (id `"email"`, channels `["email","leads"]`, `configured: Boolean(process.env.RESEND_API_KEY)`),
  `send` → `sendEmail(to, subject, html)` (`src/lib/email.ts:49-72`; it returns `false`
  on failure — the connector THROWS on `false` because `TwinConnector.send` signals
  failure by throwing, `send/route.ts:98`). `SendPayload` (:25-29) gains `to: string`
  (address) and `subject?: string`; body rendered as minimal HTML (escape + `<br>`);
  subject = `Re: ` + first line of `inbound` (≤ 80) or the brand name. `storableConnectorId`
  maps the retired `"email-smtp"` id to `"email"` (stored blobs keep working).
- **Draft address:** `TwinDraft` (`types.ts:152-175`) gains `to?: string` (the delivery
  address; `sanitizeDraft` bounds it 320, email-shaped for the email channel) and
  `contactId?: string` (CRM join for consent). Intake sets `to` from the email
  flavour's `from` (`inbound.ts` email normalizer) and `contactId` when
  `findContactByKeys` (`leads/store.ts:41`) matches the address — best-effort inside the
  intake route AFTER the twin write (never blocks intake).
- **Claim → lib:** NEW `src/lib/twin/deliver.ts` — `deliverDraft(userId, projectId,
  draftId, deps?)` is the send route's :45-142 moved VERBATIM (claim in `mutateTwin`,
  connector send outside, `retryRevert` on failure, the four `SendSignal` kinds + two new:
  `"cap-exceeded"`, `"consent-required"`). `sentAt` minted at the top of this function
  and nowhere else. The route becomes a thin adapter mapping signals → the exact
  responses it returns today (pin by fixture: same status codes + bodies).
- **Delivery gate (pure, NEW in `types.ts` beside `decideDraft` :241-248):**
  `decideDelivery(cfg, draft, ctx: { sentThisWeek: number; consentOk: boolean | null;
  connectorConfigured: boolean }): DeliveryVerdict` — refuses `disabled`,
  `connector-unconfigured`, `cap-exceeded` (when `cfg.maxPerWeek` set and
  `sentThisWeek >= maxPerWeek`), `consent-required` (when `cfg.consentRequired` and
  `consentOk !== true` — null = unknown = refuse), else allows. `sentThisWeek` counts
  drafts on the channel with `sentAt` in the current ISO week (`weekStartIso`,
  `publishing/cadence.ts:41-48` — reuse, don't copy) — computed INSIDE the claim
  transaction from the same state, so two concurrent sends cannot both pass.
  `TwinChannelConfig` (:84-92) gains `maxPerWeek?: number` (1..500) and
  `consentRequired?: boolean`; `sanitizeChannelConfig` (:479-495) bounds them; defaults:
  `consentRequired` TRUE for `sms`/`whatsapp` (marketing channels), false elsewhere —
  in `channelConfig()`'s fallback (:207-217) and `channelDefaults` (`sample.ts:66-76`).
- **Consent read + grant:** read = `getContact(projectId, draft.contactId)` →
  `mayContact(contact.consent, purposeFor(channel))` (`leads/types.ts:170-173`; purpose
  map: email/leads → `"service"`? NO — a twin REPLY to an inbound message is `service`
  basis; the cap/consent gate uses purpose `"marketing_email"` for email, `"marketing_sms"`
  for sms/whatsapp, and `service` for chat/social/reviews — document the map in
  `deliver.ts` and pin it). Grant path: `src/app/api/projects/[id]/crm/contacts/
  [contactId]/route.ts` PATCH accepts `consent: { purpose, granted, basis,
  evidenceText? }` → appends a `ConsentRecord` (`origin: "operator"`, `at: now`;
  withdrawal = `granted:false` → previous record gets `withdrawnAt`) + `consent_change`
  Activity; NEW `src/components/app/modules/leads/ConsentControl.tsx` (≤120 LOC, `T`)
  mounted in `LeadDetail.tsx` (may not grow past its size — mount is 2 lines).
- **Dispatcher step (NEW `src/lib/twin/dispatch-step.ts`):**
  `TWIN_DISPATCH_STEP_ID = "twin-dispatch"`, `due`: interval 30 min (the
  `readback-step.ts:49-54` idiom); run = `listTwinProjectIds(scanCap)` (NEW on the twin
  store trio — both backends; local `SELECT project_id FROM twin`, firestore collection
  ids) → resolve owner userId (twin is project-keyed; owner via `getProjectOwner`? — use
  the same join `conversion-rollup-step` uses, `listConversionTenants` precedent; if no
  clean owner join exists, add `listTwinTenants()` returning `{userId, projectId}` to the
  trio backends the way W3-C did) → per project: for each `autonomy:"auto"` channel with
  a CONFIGURED real connector: (a) pending inbound drafts (`isInboundDraft`, `reply ===
  ""`, ≤ `DISPATCH_DRAFTS_PER_TICK = 5`) → `generateTwinReply(req)` DIRECTLY (the tool
  function, `src/lib/ai/tools/twin-reply.ts:200-218` — ADR-0003 chokepoint; request built
  exactly as `TwinOutbox.runDraft` :245-255 builds it: voice via `resolveTwinVoice`,
  avoid via `twinAvoidContext`, brand via `deriveBrandContext`), spend-guarded with the
  digest-diagnosis precedent (`durableGuard("cron:twin-dispatch")` + `refundIfDemo` shape
  from `digest-run.ts:79-96`), result → `decideDraft(cfg, result)` REPLACING the intake
  record's `risks:["inbound"]` with the model's, written via `mutateTwin` (assign, never
  increment); (b) `approved && autoApproved` drafts on those channels → `deliverDraft`
  (the gate decides; refusals counted, never retried within the tick). Counts
  `{projects, drafted, approved, delivered, refused, failed}`. Append to `LEDGER_STEPS`
  (`ledgers.ts:94-101`). Demo projects skipped (`isDemoProjectId`).
- **Audit:** `deliverDraft` success → `emitProjectActivity` (`activity/emit.ts:11`,
  `module:"schranka"`, title "Zpráva odeslána", detail channel + connector) and
  `void emitOutbound(userId, projectId, { type: "twin.sent", … })` — `twin.sent` joins
  the closed union `outbound/event-types.ts:12-20` + its UI copy row (the comment there
  says typecheck forces it); CRM `outbound_message` Activity on the contact when
  `contactId` is set (`appendActivity`, actor `{type:"twin"}`, `refs:{twinDraftId}`).
- **UI:** `TwinChannels.tsx:183-226` — `maxPerWeek` number input + `consentRequired`
  checkbox after the threshold (both locales in `T` :31-72); the intro/banner copy
  (:34/:54, :40-41/:60-61 — "Adamant transmits nothing") becomes conditional on
  `anyRealConnector`. `TwinOutboxHistory.tsx` — inbound-pending rows gain "Odpovědět"
  which seeds the composer via `replySeedKey` (`reply-seed.ts:13-38`, the
  `Inbox.tsx:83-84` shape; ≤ 12 lines) and stamps the draft id so the reply draft
  carries `to`/`contactId` from the inbound record (the composer's `bankDraft` copies
  them when a seed names a source draft). `CadencePill.tsx:23,27` copy: "vynucováno při
  odeslání" once the cap is enforced.
- **`.env.example` / `docs/deploy.md`:** `RESEND_API_KEY` already documented; add the
  twin-delivery paragraph (auto channels send REAL mail; how to keep a channel on
  review; the weekly cap).
- Tests to copy: `test-unit/twin-send-claim.test.mjs`, `twin-commit.test.mjs`,
  `twin-inbound-route.test.mjs` (fixture patterns), `cron-ledgers`/`social-readback`
  step shape, `leads-*` route fixtures, `outbound-emit` tests.

## Data contract
```ts
// types.ts (additive)
TwinChannelConfig.maxPerWeek?: number;        // 1..500, undefined = uncapped
TwinChannelConfig.consentRequired?: boolean;  // default true for sms/whatsapp
TwinDraft.to?: string;                        // delivery address (email channel)
TwinDraft.contactId?: string;                 // CRM join
export type DeliveryRefusal = "disabled" | "connector-unconfigured" | "cap-exceeded" | "consent-required";
export type DeliveryVerdict = { allowed: true } | { allowed: false; reason: DeliveryRefusal };
// deliver.ts
export type SendSignalKind = "not-found" | "not-approved" | "connector-unconfigured" | "already-sent" | "cap-exceeded" | "consent-required";
export const DISPATCH_DRAFTS_PER_TICK = 5;
export const DISPATCH_INTERVAL_MS = 30 * 60_000;
// outbound/event-types.ts (+ "twin.sent")
```
No migration: everything rides the twin blob (`sanitizeDraft`/`sanitizeChannelConfig`
accept old blobs — new fields optional) and the existing CRM stores.

## Invariants
- `sentAt` is minted in exactly ONE function (`deliverDraft`); grep-prove it in the
  report; the route and the step both call it.
- The delivery gate runs INSIDE the atomic claim (cap counted from the same state the
  claim mutates) — two concurrent sends on a `maxPerWeek:1` channel → exactly one
  `sent` (pin with the concurrent-claim pattern from `campaigns-control-plane-local-store`).
- Consent fails CLOSED: `consentRequired` + no `contactId`, or a contact with no record,
  → refused. A refusal never touches the connector.
- The dispatcher never sends on `review`/`assist` channels and never sends a draft that
  is not BOTH `approved` and `autoApproved` (operator-approved drafts on auto channels
  still send — the operator approved them; pin both directions).
- ADR-0003: the only provider call is `generateTwinReply`'s `generateStructured`; the
  cron spend is guarded and refundable like the digest diagnosis.
- Old blobs: a channel config without the new fields reads as uncapped / consent per the
  channel default; a draft without `to` on the email channel is refused
  `connector-unconfigured`-style with a clear message ("chybí adresa") — never sent to
  a name string.

## Build steps
1. `decideDelivery` + config/draft fields + sanitizers + `test-unit/twin-delivery-gate.test.mjs`
   (matrix: autonomy × configured × cap × consent; ≥12).
2. `deliver.ts` extraction + route adapter + byte-identical response pins + cap/consent
   claim pins + concurrent-claim pin (≥8).
3. Email connector + `SendPayload` + `storableConnectorId` alias + fixture (sendEmail
   mocked: true → delivered, false → throws → revert path).
4. Consent grant route + `ConsentControl` + `mayContact` purpose map pin.
5. Twin trio `listTwinTenants` + dispatch step + `LEDGER_STEPS` + sqlite end-to-end pin
   (fixture generator returns confidence 95/risks [] → auto approved → fixture connector
   delivered; confidence 60 → stays pending; assist channel → nothing sent).
6. Audit (activity + `twin.sent` event + CRM activity) + UI (channels controls, copy,
   reply-to-inbound seed, cadence pill copy) + env/deploy docs; LF-normalize; gates;
   report with the `sentAt` grep.

## Gates
`npx tsc --noEmit` · `npx eslint src/lib/twin src/lib/outbound/event-types.ts
"src/app/api/projects/[id]/twin" "src/app/api/projects/[id]/crm" src/components/app/twin
src/components/app/modules/leads src/components/social/CadencePill.tsx src/lib/cron/ledgers.ts` ·
`npm run test:unit` (all `twin-*`, `leads-*`, `outbound-*`, `cron-ledgers` green) ·
`npm run llm:gate:check` (green — no registry change).

## Acceptance
- `grep -rn "sentAt = " src/lib/twin src/app/api` → exactly one assignment, in
  `deliver.ts` (report).
- Route fixture: manual-connector send returns the identical `{ok, delivered:false,
  mode:"manual", detail, sentAt}` shape and every 4xx as today (pinned).
- `maxPerWeek:1` + two concurrent sends → one `sent`, one `cap-exceeded` (pinned).
- `consentRequired:true` + contact without a grant → `consent-required`, connector
  untouched; after the grant PATCH → delivered (pinned).
- Dispatcher end-to-end on sqlite as in step 5 (pinned; counts exact).
- ≥32 new assertions.

## Hotspot requests
- `src/lib/cron/ledgers.ts` LEDGER_STEPS append — YOURS (S1 does not touch it).
- `src/lib/outbound/event-types.ts` + its UI copy table — yours (W1-E's, landed).
- `context-map.json` (Director). No migration, no sast (no new public route).

## Rollback
Revert; blobs with `to`/`contactId`/`maxPerWeek` are ignored by old sanitizers (additive
optional); the connector id alias means stored `"email"` configs read back as
`manual` under old code (unknown id → manual, `connectors.ts:85-87`) — no strand.
Mail already sent is sent.
