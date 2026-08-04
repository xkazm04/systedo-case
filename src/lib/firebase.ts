/** Firebase Admin singleton (server-only). Backs Auth.js (the Firestore adapter)
 *  and the per-user Google Ads connection. Import only from server code.
 *
 *  Credentials resolve in this order so the same code works locally and in prod:
 *   1. FIREBASE_SERVICE_ACCOUNT — the full service-account JSON in one env var (prod / Vercel).
 *   2. a key file — GOOGLE_APPLICATION_CREDENTIALS, or the local `.data/firebase-sa.json`
 *      created by the gcloud provisioning step (gitignored).
 *   3. Application Default Credentials (gcloud ADC).
 *
 *  In PRODUCTION (and not LOCAL_DB) the ADC fallthrough is FATAL unless the
 *  operator opts in with FIREBASE_ALLOW_ADC=true — see firebasePreflight — so a
 *  prod deploy can never silently run against ambient credentials nobody chose.
 *
 *  LAZY INIT (build-safety): nothing here initializes at module import. `next
 *  build` imports this module while collecting page data (auth.ts → root layout
 *  → every route incl. /_not-found), and a module-scope init made a credential-
 *  less CI runner fail the whole build ("Failed to collect page data"). The app
 *  now initializes on FIRST USE — the first property access on `firestore` or
 *  the first `storageBucket()` call — and during the build phase
 *  (NEXT_PHASE=phase-production-build) the preflight/warnings are skipped:
 *  static collection only constructs object graphs (collection refs), never
 *  performs an RPC, and firebase-admin resolves ADC lazily at first token
 *  fetch, so a zero-credential build succeeds. At RUNTIME nothing changes: the
 *  first real use runs the same preflight and throws the same fatal error on a
 *  silent-ADC prod misconfig, before any provider is touched. */
import "server-only";
import { existsSync, readFileSync } from "node:fs";
import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
  type App,
  type Credential,
} from "firebase-admin/app";
import { Firestore, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { firebasePreflight, productionWarnings } from "@/lib/readiness";

const KEY_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS ?? ".data/firebase-sa.json";

/** True while `next build` collects page data / prerenders. No request ever
 *  runs in this phase (`next start` sets phase-production-server instead). */
function isBuildPhase(): boolean {
  return process.env.NEXT_PHASE === "phase-production-build";
}

function resolveCredential(): Credential {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (raw) return cert(JSON.parse(raw));

  if (existsSync(KEY_PATH)) return cert(JSON.parse(readFileSync(KEY_PATH, "utf8")));

  return applicationDefault();
}

function init(): App {
  const apps = getApps();
  if (apps.length) return apps[0]!;

  if (!isBuildPhase()) {
    // Warn loud (but don't throw) at boot on non-fatal prod misconfig — a missing
    // CRON_SECRET boots fine yet 401s every cron + /api/health at runtime, so make
    // it visible in the deploy logs rather than a silent runtime surprise.
    for (const warning of productionWarnings(process.env)) {
      console.error(`[readiness] ${warning}`);
    }

    // Fail loud before touching a provider: refuse a silent ADC fallthrough in prod.
    const preflight = firebasePreflight(process.env, { keyFilePresent: existsSync(KEY_PATH) });
    if (preflight.mustThrow) {
      console.error(
        "[firebase] FATAL production credential preflight failed",
        JSON.stringify({ mode: preflight.mode, nodeEnv: process.env.NODE_ENV, reason: preflight.reason })
      );
      throw new Error(preflight.reason);
    }
  }

  return initializeApp({ credential: resolveCredential() });
}

let app: App | null = null;
function getFirebaseApp(): App {
  if (!app) app = init();
  return app;
}

let db: Firestore | null = null;
function getDb(): Firestore {
  if (!db) db = getFirestore(getFirebaseApp());
  return db;
}

/** The app's Firestore handle. A lazy proxy so `import { firestore }` keeps
 *  working unchanged at every call site while initialization is deferred to the
 *  first property access. `getPrototypeOf` reports the real class so
 *  `firestore instanceof Firestore` (which @auth/firebase-adapter checks at
 *  setup time) passes WITHOUT triggering initialization. */
export const firestore: Firestore = new Proxy(Object.create(null) as Firestore, {
  get(_target, prop) {
    const instance = getDb();
    const value = Reflect.get(instance as object, prop, instance);
    return typeof value === "function" ? value.bind(instance) : value;
  },
  has(_target, prop) {
    return Reflect.has(getDb() as object, prop);
  },
  getPrototypeOf() {
    return Firestore.prototype;
  },
});

/** The default Storage bucket for the Creative Studio asset library. Configurable
 *  via FIREBASE_STORAGE_BUCKET; defaults to `<project>.appspot.com`. */
export function storageBucket() {
  const name =
    process.env.FIREBASE_STORAGE_BUCKET ||
    `${process.env.GOOGLE_CLOUD_PROJECT ?? ""}.appspot.com`;
  return getStorage(getFirebaseApp()).bucket(name);
}
