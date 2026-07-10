/** Auth.js (next-auth v5) configuration — "Sign in with Google" with the Google
 *  Ads scope, persisted in Firestore. The offline + consent params mean Google
 *  returns a refresh token, which the Firestore adapter stores on the user's
 *  `accounts/{provider}` doc; the Ads connector reads it to call the Ads API on
 *  the user's behalf. Server-only (firebase-admin is Node-only). */
import NextAuth, { type Session } from "next-auth";
import Google from "next-auth/providers/google";
import { FirestoreAdapter } from "@auth/firebase-adapter";
import { firestore } from "@/lib/firebase";

/** Read/manage the signed-in user's Google Ads accounts. */
export const ADWORDS_SCOPE = "https://www.googleapis.com/auth/adwords";

/** Local-dev OAuth bypass. With `DEV_AUTH=true` every `await auth()` resolves to
 *  a hardcoded test user, so developers can use the authed product (/app) without
 *  configuring Google OAuth. HARD-GATED off when NODE_ENV=production, so it can
 *  never become an auth bypass in a real deployment. Data still persists to
 *  Firestore under the dev user id (Firebase creds are still used). */
export const DEV_AUTH =
  process.env.DEV_AUTH === "true" && process.env.NODE_ENV !== "production";

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

const nextAuth = NextAuth({
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
});

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
