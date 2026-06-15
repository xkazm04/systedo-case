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

## What's already multi-tenant

- **Auth + tokens** — per user, in Firestore (Auth.js Firestore adapter).
- **Selected Ads account** — per user (`adsConnections/{userId}`).
- **Live sync** — the connector fetches each user's own selected account.

## Remaining production step: per-user campaign persistence

The synced campaigns / AI reports / snapshots **cache** still lives in local
**SQLite** (`src/lib/db.ts`, `src/lib/campaigns/store.ts`). That's fine for a
single local instance, but for a multi-user cloud it must move to **per-user
Firestore** (e.g. `tenants/{userId}/campaigns`, `…/reports`, `…/snapshots`) —
both because SQLite-on-disk doesn't work on serverless / multi-instance, and to
isolate each user's data. The connector, the account picker and the token/refresh
plumbing are already per-user, so this is a focused store-layer swap (best done
once a live developer token lets us verify the live sync end-to-end).

## Production env

- `FIREBASE_SERVICE_ACCOUNT` = the full service-account key JSON (instead of the
  local `.data/firebase-sa.json` file).
- `AUTH_SECRET`, `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`,
  `GOOGLE_ADS_DEVELOPER_TOKEN`, and the production OAuth redirect URI.
