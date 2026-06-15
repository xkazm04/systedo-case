/** Firebase Admin singleton (server-only). Backs Auth.js (the Firestore adapter)
 *  and the per-user Google Ads connection. Import only from server code.
 *
 *  Credentials resolve in this order so the same code works locally and in prod:
 *   1. FIREBASE_SERVICE_ACCOUNT — the full service-account JSON in one env var (prod / Vercel).
 *   2. a key file — GOOGLE_APPLICATION_CREDENTIALS, or the local `.data/firebase-sa.json`
 *      created by the gcloud provisioning step (gitignored).
 *   3. Application Default Credentials (gcloud ADC).
 */
import { existsSync, readFileSync } from "node:fs";
import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
  type App,
  type Credential,
} from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

function resolveCredential(): Credential {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (raw) return cert(JSON.parse(raw));

  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS ?? ".data/firebase-sa.json";
  if (existsSync(keyPath)) return cert(JSON.parse(readFileSync(keyPath, "utf8")));

  return applicationDefault();
}

function init(): App {
  const apps = getApps();
  if (apps.length) return apps[0]!;
  return initializeApp({ credential: resolveCredential() });
}

export const firebaseApp = init();
export const firestore: Firestore = getFirestore(firebaseApp);
