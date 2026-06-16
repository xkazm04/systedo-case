# Cloud setup — Google sign-in + Google Ads sync

This app is moving to a multi-user cloud service: users sign in with Google
(Auth.js), their session + OAuth tokens live in **Firestore**, and the Google Ads
sync runs against the **account they select**, on their behalf.

## Already provisioned (via gcloud, project `imshr` = `gen-lang-client-0334944767`)

- ✅ APIs enabled: `firestore.googleapis.com`, `googleads.googleapis.com`
- ✅ Firestore default database (`eur3`)
- ✅ Service account `systedo-app@gen-lang-client-0334944767.iam.gserviceaccount.com`
  with `roles/datastore.user`, key at **`.data/firebase-sa.json`** (gitignored;
  the app auto-detects it locally)

## What you need to do

### 1. Restart the dev server
New dependencies were added (`next-auth`, `firebase-admin`, `@auth/firebase-adapter`),
so a running `next dev` must be restarted to pick them up:

```bash
# Ctrl-C the running server, then:
npm run dev
```

### 2. Create the Google OAuth client
Google Cloud Console → project **imshr** → *APIs & Services → Credentials* →
**Create credentials → OAuth client ID → Web application**.

- **Authorized redirect URI** (must match exactly):
  `http://localhost:3001/api/auth/callback/google`
  (add your production URL later, e.g. `https://…/api/auth/callback/google`)
- On the **OAuth consent screen**, add the scope
  `https://www.googleapis.com/auth/adwords`. While the app is in *Testing*, add
  your own Google account as a test user.

Copy the Client ID + Secret into **`.env.local`**:

```
GOOGLE_CLIENT_ID=…
GOOGLE_CLIENT_SECRET=…
```

`AUTH_SECRET` and `AUTH_TRUST_HOST` are already set in `.env.local`. Then sign in
from the header ("Přihlásit přes Google").

### 3. (For live Ads data) Google Ads developer token
`/kampane` works on **sample data** until this is set. To pull real campaigns:

- In a Google Ads **manager (MCC)** account → *Tools → API Center* → request a
  **developer token** (a *test* token only reads test accounts; production access
  needs Google's approval).
- Put it in `.env.local`:

```
GOOGLE_ADS_DEVELOPER_TOKEN=…
GOOGLE_ADS_LOGIN_CUSTOMER_ID=…   # MCC id, digits only, if applicable
```

Once set, after signing in you'll pick which Google Ads account (customer ID) to
sync, and the connector queries it with your OAuth token.

## How it works

- `src/auth.ts` — Auth.js (Google provider, `offline` + `adwords` scope) →
  refresh token persisted by the Firestore adapter on `accounts/{provider}`.
- `src/lib/firebase.ts` — firebase-admin singleton (Firestore).
- The Ads connector reads the signed-in user's token + selected customer to call
  the Google Ads API; without a developer token it falls back to sample data.

## Fully multi-tenant (per-user, on Firestore)

- **Auth + tokens** — Auth.js Firestore adapter.
- **Connected Ads accounts** — `adsConnections/{userId}` (multiple accounts + active).
- **Campaign / report / snapshot cache** — `tenants/{tenant}/…` (per user+account;
  SQLite is gone for campaign data — only the IP rate-limiter still uses it).
- **Usage / plans** — `usage/{userId}` daily quotas (free 25 AI / 50 syncs, pro
  higher), enforced in the AI + sync + analyze routes; `GET /api/usage`.

## Cloud features (env-gated where they need a service)

- **Scheduled sync + alerting** — `/api/cron/sync` (hourly via `vercel.json`,
  `CRON_SECRET`-guarded) re-syncs every connected user and emails them on newly
  critical campaigns. Email via **Resend** (`RESEND_API_KEY`); logs without it.
- **Apply recommendations** — pause a campaign in Google Ads from the budget-move
  panel (human-confirmed, audited to `tenants/{tenant}/mutations`); live accounts only.
- **Shareable client report** — "Sdílet report" → a read-only `/report/{token}` link.

## Production env

- `FIREBASE_SERVICE_ACCOUNT` = the full service-account key JSON (instead of the
  local `.data/firebase-sa.json` file).
- `AUTH_SECRET`, `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`,
  `GOOGLE_ADS_DEVELOPER_TOKEN`, the production OAuth redirect URI.
- `CRON_SECRET` (scheduled sync), `RESEND_API_KEY` + `ALERT_FROM_EMAIL` (alert email).
