# Runbook — rotating a credential

**Read this when a credential has leaked, is suspected leaked, or is due.** It is
the procedure, in the order it is performed, for each class of credential this
deployment holds.

[`SECURITY.md`](../../SECURITY.md) states that the worst outcome here is somebody
spending an advertiser's budget, and
[`docs/security/threat-model.md`](../security/threat-model.md) traces where each
credential enters, rests and leaves. Neither says **how to take one away**, and the
one procedure in this repository that would be performed under time pressure was
the one nobody had written down —
[`docs/deploy.md`](../deploy.md) § Known red already owes a triage of eleven
secret-scan findings whose stated remedy is "any real credential means rotation".

This is a **lookup** ([`.github/guidance-budget.json`](../../.github/guidance-budget.json)),
routed to from [`docs/task-index.md`](../task-index.md). It is not read before every
change; it is read once, quickly, when something has gone wrong.

It never restates the threat model. Every credential below is named by its `TM-nn`
flow, and where a claim here and that page disagree, **that page owns the flow and
this one is the bug**. The machine-readable half is
[`.github/credential-rotation.json`](../../.github/credential-rotation.json), held to
the threat model on every build by
[`test-unit/credential-rotation.test.mjs`](../../test-unit/credential-rotation.test.mjs):
a credential added to the threat model with no rotation procedure is a red build.

## Read this paragraph before you rotate anything

**`AUTH_SECRET` is not only a session key.** Two token-crypto seams —
[`src/lib/inventory/token-crypto.ts`](../../src/lib/inventory/token-crypto.ts) and
[`src/lib/outbound/secret-crypto.ts`](../../src/lib/outbound/secret-crypto.ts) —
fall back to it when their dedicated key (`CATALOG_TOKEN_SECRET`,
`WEBHOOK_SECRET_KEY`) is unset. On a deployment that never set those, **rotating
`AUTH_SECRET` makes every stored connector token and every outbound webhook secret
undecryptable, for every tenant, permanently.** Nothing warns you: `decryptToken`
returns `null` for "wrong key" and for "no token" alike, so the symptom is every
tenant's sync reporting *no credentials* and being told to re-enter them.
`.env.example` § `WEBHOOK_SECRET_KEY` says the same thing at the variable.

The same trap fires in the other direction: **adding** `CATALOG_TOKEN_SECRET` to a
deployment that has been encrypting under the `AUTH_SECRET` fallback is a mass key
rotation, not a hardening step.

So: **before rotating `AUTH_SECRET`, run step 0.**

    # Are the dedicated keys set in the production environment?
    #   both set   → AUTH_SECRET rotation touches sessions only. Proceed.
    #   either unset → you are about to orphan tenant ciphertext. Go to § Re-key
    #                  a token-crypto seam FIRST, then come back.

`npm run env:manifest` prints what the repository expects; whether a value is
actually set in Vercel is the operator's half and is **outside** what any gate here
can see (`.github/environments.json` § `cannotSee`).

## The general shape

Every rotation in this repository is one of four shapes. Which one a credential is
determines whether there is a window where both values are live.

| Shape | What it means | Which credentials |
|---|---|---|
| **overlap** | the old and new value are both accepted for a window; issue, deploy, verify, then revoke the old | provider API keys, `CRON_SECRET`, `SKLIK_API_TOKEN`, `GOOGLE_ADS_DEVELOPER_TOKEN` |
| **hard cutover** | one value at a time; there is a gap and it is visible to users | `AUTH_SECRET` (signs out everyone), `FIREBASE_SERVICE_ACCOUNT` |
| **re-key** | the value is an encryption KEY, so rotating it means decrypting under the old and re-encrypting under the new, or the ciphertext is lost | `CATALOG_TOKEN_SECRET`, `WEBHOOK_SECRET_KEY`, `BYOM_KEY_SECRET` |
| **tenant action** | the operator cannot rotate it; the user must reconnect or re-paste | Google OAuth tokens, a tenant's Sklik token, a BYOM provider key |

The **re-key** row is the one that loses data if it is treated as an overlap, and
the **tenant action** row is the one where "rotated" is not a state the operator can
reach alone.

## Procedure

### 1. Contain (minutes, before anything else)

1. **Revoke at the source, not in the env.** Deleting the variable in Vercel stops
   *this* deployment using the credential; it does not stop whoever has it. Revoke
   in the issuing console: Google Cloud (OAuth client, service account, Ads
   developer token), Sklik's account settings, Resend, Leonardo, the model provider.
2. **If the credential reached git**, an ignore entry is not a remedy — see
   `docs/deploy.md` § Known red, item 2. Rotate first, decide about history second.
3. Note the time. Step 5 asks for it.

### 2. Issue and stage the replacement

Issue the new value in the same console. Do **not** paste it anywhere in this
repository: `.env*` files, test fixtures, prompts and log lines are all refused
(`no-secret-movement` in [`.github/constraint-map.json`](../../.github/constraint-map.json),
enforced partly by the pre-commit secret scan and `npm run sast` `secret-in-log`).

### 3. Cut over, by shape

**overlap** — set the new value in the production environment, redeploy, verify
(§ 4), then revoke the old value at the source. The old value stays live until the
verification passes, which is the whole reason this shape is preferred.

**hard cutover** — set the new value, redeploy, accept the gap. For `AUTH_SECRET`
the gap is every signed-in session; say so before you do it, not after. Step 0
above is mandatory here.

**re-key a token-crypto seam** — the ciphertext is the problem, not the key.

1. Set the dedicated key (`CATALOG_TOKEN_SECRET` / `WEBHOOK_SECRET_KEY` /
   `BYOM_KEY_SECRET`) **before** anything encrypts under the fallback, if it is not
   set already. This is the state you want to be in permanently.
2. If ciphertext already exists under the old key, it must be read with the old key
   and written with the new one. **There is no migration script in this repository
   today.** Writing one is the work; guessing is not. Until it exists, a re-key on
   a deployment with stored tenant ciphertext is an operator decision with a known
   cost: every affected tenant re-enters their token.
3. Whichever way it goes, the tenant-visible failure is "token stored but
   undecryptable" — see the module headers of the two crypto seams, which document
   the precedence chain.

**tenant action** — the operator revokes; the tenant reconnects.

- **Google OAuth (TM-11)**: revoking the OAuth client or the user's grant in Google
  Cloud invalidates refresh tokens. Each affected user signs in again.
  `src/lib/google/token.ts` will surface the failure as a 401, which the connector
  classifies as `token`, tries to refresh once, and then degrades to sample data
  **with the degradation flagged** — so a revoked token shows as degraded, not as
  wrong numbers. `test-unit/fault-injection-ads-sync.test.mjs` is what asserts that.
- **Sklik (TM-12)** and **warehouse/ERP (TM-13)**: the user pastes a new token in
  the UI; the old ciphertext is overwritten.
- **BYOM provider key (TM-15)**: the user revokes it at their own provider and
  pastes a new one in Settings. The operator cannot see it —
  `getPublicByomConfig` is what a settings surface reads, and `resolveByomKey` (the
  decrypting one) is refused inside any route by `sast` `plaintext-key-in-route`.

### 4. Verify

Rotation is not finished when the variable is set. In order:

    npm run doctor                 # env preflight — is the name even present?
    npm run env:manifest:check     # the declaration still matches the tree
    npm run check:ci               # nothing about the change broke a gate

Then the half no gate can reach — `docs/deploy.md` § Post-deploy verification:
sign in, load `/app`, and confirm the affected surface serves **live** data rather
than a flagged degradation. A rotation that silently left the deployment on sample
data is the failure this step exists to catch.

For `CRON_SECRET` specifically, the six schedules in `vercel.json` are the
verification: a wrong secret fails **closed**
([`src/lib/cron-auth.ts`](../../src/lib/cron-auth.ts), asserted by
`test-unit/cron-auth.test.mjs`), so the symptom is crons that stop running rather
than crons that run unauthenticated.

### 5. Record it

Add a row to § The log below, in the same change. A rotation nobody dated cannot be
told from one that never happened, which is the state this repository is in today.

## The log

**Nothing below has been rotated or drilled.** That is the honest state on
2026-09-01 and it is written here rather than left blank, because an empty table
reads as "no incidents" instead of "never exercised". The dates live in
[`.github/credential-rotation.json`](../../.github/credential-rotation.json)
(`lastRotated` / `lastDrilled`, `null` where it has never happened); this table is
the readable copy.

| Credential class | Flows | Shape | Last rotated | Last drilled |
|---|---|---|---|---|
| Session / fallback crypto key | TM-01 | hard cutover | never | never |
| Firestore service account | TM-02 | hard cutover | never | never |
| Cron guard | TM-03 | overlap | never | never |
| Model / image provider keys | TM-04 | overlap | never | never |
| Google Ads developer token | TM-05 | overlap | never | never |
| Resend | TM-06 | overlap | never | never |
| Sklik operator token | TM-07 | overlap | never | never |
| Token-crypto keys | TM-08, TM-09, TM-10 | re-key | never | never |
| Google OAuth (per tenant) | TM-11 | tenant action | never | never |
| Pasted connector tokens (per tenant) | TM-12, TM-13, TM-14 | tenant action | never | never |
| BYOM provider key (per tenant) | TM-15 | tenant action | never | never |

**How long does a rotation take?** Nobody has measured it, and this page will not
guess. The other drills here (`npm run revert:drill`, `mutation:drill`,
`flake:drill`, `harness:drill`) each exist because an estimate was not good enough;
this one has no script, because rotating a real credential is a red action under
[`AGENTS.md`](../../AGENTS.md) § What you may do unattended and an agent may not
perform it. **The drill is the operator's**, and the smallest honest version is:
rotate `CRON_SECRET` — it is overlap-shaped, it affects no tenant data, and its
failure mode is fail-closed — time it end to end, and put the number in the row
above.

## What this runbook cannot do

Stated here rather than assumed, the same way
[`.github/environments.json`](../../.github/environments.json) carries its own
`cannotSee` list:

- **It cannot tell you whether a value is set correctly in Vercel.** Every check it
  names reads the repository.
- **It cannot re-key stored ciphertext.** No migration exists for the token-crypto
  seams; § Procedure step 3 says so instead of implying otherwise.
- **It cannot find a hard-coded credential.** `npm run sast` `secret-in-log` and the
  pre-commit secret scan catch credential *shapes*; a value that does not look like
  one is invisible to both. The full-history gitleaks run
  (`.github/workflows/supply-chain.yml`, job `secrets`) is the check that would find
  it, and `docs/deploy.md` § Known red records that it is currently red with eleven
  untriaged findings.
