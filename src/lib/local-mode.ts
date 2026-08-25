/** Local-dev data backend flag (server-only, framework-free — deliberately does
 *  NOT import firebase, so the local path never pulls firebase-admin in).
 *
 *  With `LOCAL_DB=true` the authed product persists projects + users to the local
 *  `node:sqlite` file (`.data/systedo.db`) instead of Firestore, so local
 *  development needs no Firebase credentials at all. Pairs with `DEV_AUTH`
 *  (the OAuth bypass in src/auth.ts) for a fully offline `/app`:
 *
 *    DEV_AUTH=true LOCAL_DB=true npm run dev   # or: npm run dev:local
 *
 *  HARD-GATED off when NODE_ENV=production, so it can never silently redirect a
 *  real deployment's data to an ephemeral local file — with ONE deliberate
 *  exception: an explicit `SELF_HOSTED=true` install (docs/open-source/
 *  self-hosting.md §1), where the sqlite file IS the production store and the
 *  operator has said so out loud. DEV_AUTH is NOT part of that exception. */
import { SELF_HOSTED } from "@/lib/deploy-mode";

export const LOCAL_DB =
  process.env.LOCAL_DB === "true" &&
  (process.env.NODE_ENV !== "production" || SELF_HOSTED);
