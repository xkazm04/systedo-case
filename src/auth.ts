/** Auth.js (next-auth v5) configuration, switched by deploy mode:
 *
 *  CLOUD (default) — "Sign in with Google" with the Google Ads scope, persisted
 *  in Firestore. The offline + consent params mean Google returns a refresh
 *  token, which the Firestore adapter stores on the user's `accounts/{provider}`
 *  doc; the Ads connector reads it to call the Ads API on the user's behalf.
 *
 *  SELF_HOSTED (docs/open-source/self-hosting.md §2, Option A) — a single
 *  operator password (`ADAMANT_OPERATOR_PASSWORD`) through an Auth.js
 *  Credentials provider with JWT sessions, so no database adapter (and no
 *  Firestore) is needed at all. One fixed user id keeps the per-project tenancy
 *  (`u_{userId}_proj_{projectId}`) working unchanged — single-tenant self-host
 *  is the honest v1 case; multi-user over sqlite is the documented v1.1 item.
 *  The fail-closed boot rule (no password and no explicit ALLOW_OPEN=1 refuses
 *  to boot) is enforced in src/instrumentation.ts via selfHostBootError().
 *  Google OAuth in self-host (still required by Google for the Ads connector)
 *  currently also requires the Firestore adapter for token storage — a known
 *  gap tracked in impact.md Gap 3 (`google/token.ts`).
 *
 *  Server-only (firebase-admin and node:crypto are Node-only). */
import NextAuth, { type NextAuthConfig, type Session } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { FirestoreAdapter } from "@auth/firebase-adapter";
import { createHash, timingSafeEqual } from "node:crypto";
import { firestore } from "@/lib/firebase";
import { SELF_HOSTED } from "@/lib/deploy-mode";
import { recordSignup } from "@/lib/analytics/track";

/** Read/manage the signed-in user's Google Ads accounts. */
export const ADWORDS_SCOPE = "https://www.googleapis.com/auth/adwords";

/** Local-dev OAuth bypass. With `DEV_AUTH=true` every `await auth()` resolves to
 *  a hardcoded test user, so developers can use the authed product (/app) without
 *  configuring Google OAuth. Data still persists to Firestore under the dev user id
 *  (Firebase creds are still used).
 *
 *  GATED off when EITHER NODE_ENV=production OR VERCEL_ENV=production. Note the
 *  actual invariant: NODE_ENV is a build-mode convention, not a deployment-safety
 *  boundary — a custom Node server / Dockerfile running `node server.js` may leave
 *  it "development", so this is defense-in-depth, NOT a proof it "can never" bypass
 *  auth in a real deployment. Belt-and-braces: keep DEV_AUTH out of any non-dev
 *  env file, and rely on real OAuth being configured in production.
 *
 *  DEV_AUTH deliberately does NOT consult SELF_HOSTED — the self-host mode never
 *  implies an auth bypass; it selects the real Credentials provider below. */
export const DEV_AUTH =
  process.env.DEV_AUTH === "true" &&
  process.env.NODE_ENV !== "production" &&
  process.env.VERCEL_ENV !== "production";

/** The synthetic session returned while DEV_AUTH is active. Identity is
 *  overridable via env so two devs can use distinct test users / data. */
export const DEV_SESSION: Session = {
  user: {
    id: process.env.DEV_AUTH_USER_ID || "dev-user",
    name: process.env.DEV_AUTH_USER_NAME || "Dev Tester",
    email: process.env.DEV_AUTH_USER_EMAIL || "dev@local.test",
    image: null,
  } as Session["user"],
  // far-future so it never reads as expired
  expires: "2999-12-31T23:59:59.000Z",
};

/** The single self-host operator identity. A FIXED id: the sqlite store's
 *  tenancy keys embed it, so it must be stable across sign-ins and restarts. */
const OPERATOR_USER = {
  id: "operator",
  name: "Operator",
  email: "operator@self-hosted.invalid",
  image: null,
};

/** Constant-time password check (same posture as cron-auth.ts): both sides are
 *  SHA-256'd to a fixed 32-byte digest so `timingSafeEqual` always gets
 *  equal-length inputs and neither the value nor its length leaks via timing. */
function operatorPasswordMatches(given: string): boolean {
  const expected = process.env.ADAMANT_OPERATOR_PASSWORD ?? "";
  if (!expected) return false; // fail closed — no password, no password login
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

/** Self-hosted: operator password + JWT sessions, no adapter, no Firestore. */
const selfHostedConfig: NextAuthConfig = {
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      id: "operator",
      name: "Operator password",
      credentials: {
        password: { label: "Operator password", type: "password" },
      },
      authorize: async (credentials) => {
        const given = typeof credentials?.password === "string" ? credentials.password : "";
        // ALLOW_OPEN=1 with NO password set: the operator explicitly chose an
        // open install (selfHostBootError permits that boot) — any submission
        // signs in. With a password set, ALLOW_OPEN changes nothing.
        if (!process.env.ADAMANT_OPERATOR_PASSWORD && process.env.ALLOW_OPEN === "1") {
          return { ...OPERATOR_USER };
        }
        return operatorPasswordMatches(given) ? { ...OPERATOR_USER } : null;
      },
    }),
  ],
  callbacks: {
    // JWT strategy has no adapter to stamp ids — carry the fixed operator id
    // through the token so `session.user.id` (which the whole app and the
    // tenancy keys read) is populated exactly as in cloud mode.
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (session.user && token.sub) {
        (session.user as { id?: string }).id = token.sub;
      }
      return session;
    },
  },
};

/** Cloud (hosted): Google OAuth with the Ads scope, Firestore-persisted. */
const cloudConfig: NextAuthConfig = {
  adapter: FirestoreAdapter(firestore),
  session: { strategy: "database" },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          // offline + consent → Google returns a refresh token we can persist and
          // reuse for the Ads API; the adwords scope authorizes Ads access.
          access_type: "offline",
          prompt: "consent",
          scope: `openid email profile ${ADWORDS_SCOPE}`,
        },
      },
    }),
  ],
  events: {
    // signup_completed: the adapter's createUser hook fires exactly ONCE per
    // account — when the Firestore adapter first writes the user row. Under the
    // database session strategy this is the hook that distinguishes a brand-new
    // user (events.signIn fires on EVERY sign-in and its isNewUser flag is a
    // JWT-strategy affordance), so the first-party signup counter is bumped here
    // and never on a returning sign-in. Best-effort inside recordSignup — an
    // analytics hiccup must never fail the OAuth flow.
    createUser: async () => {
      await recordSignup();
    },
  },
};

const nextAuth = NextAuth(SELF_HOSTED ? selfHostedConfig : cloudConfig);

export const handlers = nextAuth.handlers;
export const signOut = nextAuth.signOut;

/** Session accessor used across the app (server components, API routes, the /app
 *  gate). In DEV_AUTH mode it returns the test user without touching NextAuth or
 *  Firestore; otherwise it's the real Auth.js session resolver. */
export const auth: typeof nextAuth.auth = DEV_AUTH
  ? ((() => Promise.resolve(DEV_SESSION)) as unknown as typeof nextAuth.auth)
  : nextAuth.auth;

if (DEV_AUTH) {
  // Loud, because shipping this enabled would be a security incident.
  console.warn(
    `[auth] ⚠️  DEV_AUTH active — OAuth bypassed, signed in as ${DEV_SESSION.user?.email}. Never enable in production.`
  );
}

if (SELF_HOSTED && !process.env.ADAMANT_OPERATOR_PASSWORD) {
  // Loud on every boot of an open install — allowed only via explicit ALLOW_OPEN=1
  // (otherwise instrumentation.ts refuses to boot before this module matters).
  console.warn(
    "[auth] ⚠️  SELF_HOSTED with no ADAMANT_OPERATOR_PASSWORD — anyone who can reach this app can sign in as the operator."
  );
}
