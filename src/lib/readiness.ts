/** Pure production-readiness logic: the Firebase credential preflight and the
 *  operator readiness matrix. Framework-free and side-effect-free (env + probes
 *  are passed in), so the same rules back firebase.ts's boot preflight, the
 *  GET /api/health endpoint and the unit tests — with no I/O and nothing to
 *  initialize on import. Booleans and mode LABELS only; never any secret value. */

export type Env = Record<string, string | undefined>;

/** Where Firebase credentials come from, in the resolution order firebase.ts
 *  uses: the full service-account JSON in an env var, a key file on disk, or
 *  ambient Application Default Credentials as the last-resort fallback. */
export type FirebaseCredMode = "service-account-env" | "key-file" | "adc";

export type FirebaseProbes = {
  /** Does the resolved key file (GOOGLE_APPLICATION_CREDENTIALS or the default
   *  .data/firebase-sa.json) exist on disk? Gathered by the caller. */
  keyFilePresent: boolean;
};

export function firebaseCredMode(env: Env, probes: FirebaseProbes): FirebaseCredMode {
  if (env.FIREBASE_SERVICE_ACCOUNT) return "service-account-env";
  if (probes.keyFilePresent) return "key-file";
  return "adc";
}

export type FirebasePreflight = {
  mode: FirebaseCredMode;
  /** true when credentials are explicit (env var or key file), not ambient ADC. */
  explicit: boolean;
  /** true when initialization may proceed; false only in the fatal prod case. */
  allowed: boolean;
  /** true when firebase.ts must log-and-throw instead of silently using ADC. */
  mustThrow: boolean;
  reason: string;
};

/** The prod-boot credential preflight. In production, with LOCAL_DB off and no
 *  explicit credentials, silently falling through to ambient ADC means prod can
 *  run against whatever credentials happen to be on the box — so that case is
 *  FATAL unless the operator opts in with FIREBASE_ALLOW_ADC=true (genuine
 *  ADC-intended deploys, e.g. Cloud Run with an attached service account).
 *  Development and LOCAL_DB are never affected. */
export function firebasePreflight(env: Env, probes: FirebaseProbes): FirebasePreflight {
  const mode = firebaseCredMode(env, probes);
  const explicit = mode !== "adc";
  const isProd = env.NODE_ENV === "production";
  // LOCAL_DB is itself hard-gated off in production, but mirror its own guard.
  const localDb = env.LOCAL_DB === "true" && !isProd;
  const allowAdc = env.FIREBASE_ALLOW_ADC === "true";
  const mustThrow = isProd && !localDb && !explicit && !allowAdc;

  let reason: string;
  if (mustThrow) {
    reason =
      "Firebase is initializing in production with NO explicit credentials " +
      "(FIREBASE_SERVICE_ACCOUNT unset and no key file) — refusing to fall back to " +
      "ambient Application Default Credentials. Set FIREBASE_SERVICE_ACCOUNT (the full " +
      "service-account JSON), or, for a deploy that genuinely intends ADC (e.g. an " +
      "attached service account), set FIREBASE_ALLOW_ADC=true.";
  } else if (mode === "adc") {
    reason = allowAdc
      ? "Using ambient Application Default Credentials (FIREBASE_ALLOW_ADC=true)."
      : "Using ambient Application Default Credentials (non-production).";
  } else {
    reason = `Using explicit credentials (${mode}).`;
  }

  return { mode, explicit, allowed: !mustThrow, mustThrow, reason };
}

export type ReadinessMatrix = {
  firebaseCredMode: FirebaseCredMode;
  firebaseAllowAdc: boolean;
  resendConfigured: boolean;
  googleAdsConfigured: boolean;
  sklikConfigured: boolean;
  cronConfigured: boolean;
  adminConfigured: boolean;
};

/** The operator readiness matrix: present/absent booleans (plus the Firebase
 *  credential MODE label) for the credentials that gate production surfaces.
 *  Deliberately carries no secret material — only whether each is configured. */
export function readinessMatrix(env: Env, probes: FirebaseProbes): ReadinessMatrix {
  return {
    firebaseCredMode: firebaseCredMode(env, probes),
    firebaseAllowAdc: env.FIREBASE_ALLOW_ADC === "true",
    resendConfigured: Boolean(env.RESEND_API_KEY),
    googleAdsConfigured: Boolean(env.GOOGLE_ADS_DEVELOPER_TOKEN),
    sklikConfigured: Boolean(env.SKLIK_API_TOKEN),
    cronConfigured: Boolean(env.CRON_SECRET),
    adminConfigured: Boolean((env.ADMIN_EMAILS ?? "").trim()),
  };
}
