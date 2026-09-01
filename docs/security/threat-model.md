# Threat model — where every credential enters, rests and leaves

`SECURITY.md` states the policy: what is in scope, what the automated guardrails
are, and the promise that a secret is never logged, committed or put in a prompt.
What it does not do — and what an agent about to change a route, a store or the
LLM chokepoint actually needs — is **name the flows**. A policy answers "is this
allowed?"; this answers "if I put a credential here, whose hands does it pass
through, and which fence would stop me?"

This is a **lookup** ([`.github/guidance-budget.json`](../../.github/guidance-budget.json)),
routed to from [`docs/task-index.md`](../task-index.md). Read it before touching a
credential path — the BYOM key, a connector token, the cron guard, an outbound
webhook — not before every change.

It is deliberately not a second copy of anything. Every fact below is a pointer
into the file that owns it; where a claim here and the code disagree, the code
wins and this document is the bug.

## The three questions this answers

1. **For each credential, which contexts may see it?** The table below, and the
   `seen by` column is the answer a diff can be checked against.
2. **Which of the fences in [`eslint.config.mjs`](../../eslint.config.mjs) exist
   for SECURITY rather than for architecture?** Two of the three. See § The seams,
   by what they are actually defending.
3. **What must be read before touching the BYOM key path?** § The one path that is
   fenced twice.

## Credentials, by flow

Classified the way `.github/environments.json` classifies them — the operator's
credentials (one value for the whole deployment) and the **tenant's** credentials
(one value per user, per connected account), because the two have completely
different blast radii and the second is the interesting half.

### Operator-wide — one value, whole deployment

| Credential | Enters via | At rest | Leaves to | Seen by | What stands on it |
|---|---|---|---|---|---|
| `AUTH_SECRET` | platform env | never stored | nothing — signs session cookies | `src/lib/auth*`, and as the fallback key of both token-crypto seams below | `sast` `client-env` (a `"use client"` module may not read it) |
| `FIREBASE_SERVICE_ACCOUNT` | platform env | never stored | Google (Firestore admin API) | `src/lib/` store layer only | lint `adamant/seams` — a route or component importing `firebase-admin` is refused |
| `CRON_SECRET` | platform env | never stored | compared against an inbound `Authorization` header | `src/lib/cron-auth.ts`, and only it | `test-unit/cron-auth.test.mjs` (fail-closed, constant-time, digested); mutants `cron-fails-open` and `cron-undigested-compare` |
| `GEMINI_API_KEY`, `LEONARDO_API_KEY`, `OPENROUTER_API_KEY`, `QWEN_API_KEY` | platform env | never stored | the provider | `src/lib/llm/` and the image/vision modules | lint `adamant/seams` + `adamant/seams-lib` — a client may be constructed nowhere else (ADR-0003) |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | platform env | never stored | Google Ads API, alongside a *tenant's* OAuth token | `src/lib/google/` | `sast` `route-auth` on every route that reaches it |
| `RESEND_API_KEY` | platform env | never stored | Resend, when mail is sent | `src/lib/` mail path | **honour** — `no-outbound-under-operator` in [`.github/constraint-map.json`](../../.github/constraint-map.json) has no fence; the operator presses send |
| `SKLIK_API_TOKEN` | platform env | never stored | Sklik API | `src/lib/campaigns/` | `SKLIK_WRITES_ENABLED` (below) decides whether the path may mutate at all |
| `CATALOG_TOKEN_SECRET` | platform env | never stored | nothing — it is the KEY, not a credential | `src/lib/inventory/token-crypto.ts` | `sast` `deprecated-cipher` pins it to the explicit-IV form |
| `WEBHOOK_SECRET_KEY` | platform env | never stored | nothing — the KEY for outbound secrets | `src/lib/outbound/secret-crypto.ts` | same rule, same reason |
| `BYOM_KEY_SECRET` | platform env | never stored | nothing — the KEY for tenant provider keys | `src/lib/llm/keys/crypto.ts` | same rule; and see § below |

**Both token-crypto seams fall back to `AUTH_SECRET`** when their dedicated key is
unset (`src/lib/inventory/token-crypto.ts`, `src/lib/outbound/secret-crypto.ts`,
each says so in its own header). That is a deliberate convenience with a
consequence worth stating once: **rotating `AUTH_SECRET` on a deployment that never
set the dedicated keys makes every stored connector token and webhook secret
undecryptable.** Neither file can warn you at rotation time and no gate can see it.
It belongs in the rotation step of [`docs/deploy.md`](../deploy.md), and it is the
single most likely way this repository loses tenant data without any code being
wrong.

### Per-tenant — one value per user, per connected account

These are the ones a bug leaks *someone else's* copy of, so the row that matters is
`seen by`.

| Credential | Enters via | At rest | Leaves to | Seen by | What stands on it |
|---|---|---|---|---|---|
| Google OAuth access/refresh token | the user's Google sign-in | Firestore, under the Auth.js adapter | Google Ads API | `src/lib/google/token.ts` → `getUserAccessToken` | the tenant key (ADR-0002): the id embeds `userId`, so reading another user's row needs a forged session, not a guessed id |
| Sklik account token | the user pastes it | encrypted (`src/lib/inventory/token-crypto.ts`), in the store | Sklik API | `src/lib/campaigns/sklik-connection.ts` → `getSklikToken` | lint `adamant/seams` (no driver outside `src/lib/`) + `sast` `route-auth` |
| Warehouse / ERP connector token | the user pastes it | encrypted, same seam | the connector's API | `src/lib/inventory/` | same |
| Outbound webhook secret | the user sets it | encrypted (`src/lib/outbound/secret-crypto.ts`) | signs the outbound payload | `src/lib/outbound/emit.ts` | same |
| **BYOM provider key** (OpenAI / Gemini / Claude / OpenRouter) | the user pastes it in Settings | encrypted (`src/lib/llm/keys/crypto.ts`), in the store | the user's chosen provider, from the chokepoint | `src/lib/llm/keys/store.ts` → `resolveByomKey`, and the chokepoint | its own `sast` rule — see below |

## The seams, by what they are actually defending

The three lint fences in `eslint.config.mjs` read as one kind of rule and are not.
Knowing which is which decides how hard to push back when one fires:

- **`adamant/seams` / `adamant/seams-lib` — the store seam is a SECURITY fence.**
  Not because a driver import is dangerous in itself, but because the store layer
  is what applies the `u_{userId}_proj_{projectId}` key. A route that reaches for
  `firebase-admin` directly has taken the tenant boundary into its own hands, and
  ADR-0002's claim that cross-user access is impossible *by construction* stops
  being true of that route. It also holds `FIREBASE_SERVICE_ACCOUNT` in a layer
  that has no business seeing it.
- **`adamant/seams` — the LLM chokepoint is a SECURITY fence too**, for one reason
  that is easy to miss among the operational ones: `generateStructured()` is where
  a *tenant's* decrypted BYOM key is used. A second client built anywhere else is
  a second place a user's provider key can be handled, and the one rule below
  cannot see it.
- **`adamant/route-segment-config` — ARCHITECTURE, not security.** It defends
  `cacheComponents` from a whole-route opt-out. Nothing about a credential turns
  on it. It is in the same file and it is not the same kind of rule; treat a
  finding accordingly.

The security rules that are *not* lint are in [`scripts/sast.mjs`](../../scripts/sast.mjs)
and block through `npm run sast` (a required check *and* a stage of `check:ci`,
because master ships on push). The four that bear on the flows above:
`route-auth`, `client-env`, `secret-in-log`, `plaintext-key-in-route`.

## The one path that is fenced twice

**Before you touch the BYOM key path, read, in this order:**

1. [`docs/adr/0003-single-llm-chokepoint.md`](../adr/0003-single-llm-chokepoint.md) —
   why there is exactly one `generateStructured()`, which is where the key is used.
2. `src/lib/llm/keys/crypto.ts` — the encryption seam, and why it must stay on the
   explicit-IV form (`sast` `deprecated-cipher`).
3. `src/lib/llm/keys/store.ts` — `resolveByomKey` returns the **decrypted** key.
   `getPublicByomConfig` is what a settings surface is supposed to call.
4. The rule that will stop you: `sast` `plaintext-key-in-route` refuses any module
   under `src/app/api/` that mentions `resolveByomKey` at all — because such a
   route is one `Response.json()` away from returning a user's provider key.

That is the only credential in the tree with a rule of its own, and it earned it:
it is the one a user hands over, that the operator can be billed for, and that
would leave the machine under the user's own provider account.

## What this model cannot see

Stated here rather than left to be assumed, the same way
[`.github/environments.json`](../../.github/environments.json) carries its own
`cannotSee` list:

- **Whether a secret is actually set, or set correctly, in Vercel.** Every fence
  above reads the repository. `docs/deploy.md` § Post-deploy verification is the
  operator's half.
- **Runtime exfiltration.** Nothing here watches egress. `sast` `secret-in-log`
  catches the shape of a credential going to `console`; it cannot catch one going
  into a `fetch` body.
- **The honour rules.** `no-outbound-under-operator` and `no-secret-movement` are
  partly or wholly unfenced — see the `rung` column in
  [`.github/constraint-map.json`](../../.github/constraint-map.json). A credential
  moved into a test fixture or a prompt is caught by the pre-commit secret scan
  only if it looks like a secret.
- **A tenant's provider bill.** A BYOM key is used against the *user's* account, so
  the spend rails in `src/lib/ai/durable-limit.ts` protect the operator's bill and
  not the user's.

## Keeping this true

Routed from [`docs/task-index.md`](../task-index.md) (held by
`test-unit/docs-task-index.test.mjs`) and given an age budget in
[`.github/docs-staleness.json`](../../.github/docs-staleness.json), watching the
credential seams it names: when one of them moves, this page is reported as
overtaken rather than quietly becoming wrong.
