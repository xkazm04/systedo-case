/** Auth.js (next-auth v5) configuration — "Sign in with Google" with the Google
 *  Ads scope, persisted in Firestore. The offline + consent params mean Google
 *  returns a refresh token, which the Firestore adapter stores on the user's
 *  `accounts/{provider}` doc; the Ads connector reads it to call the Ads API on
 *  the user's behalf. Server-only (firebase-admin is Node-only). */
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { FirestoreAdapter } from "@auth/firebase-adapter";
import { firestore } from "@/lib/firebase";

/** Read/manage the signed-in user's Google Ads accounts. */
export const ADWORDS_SCOPE = "https://www.googleapis.com/auth/adwords";

export const { handlers, auth, signIn, signOut } = NextAuth({
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
