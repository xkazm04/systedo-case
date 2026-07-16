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

/**
 * Non-fatal production readiness warnings — configuration that boots fine but
 * silently degrades a surface at RUNTIME, surfaced loudly at boot (see
 * firebase.ts) instead of failing the deploy.
 *
 * CRON_SECRET is the one such gate today. Unlike the Firebase credential
 * preflight (which THROWS, because with no data backend nothing works), a missing
 * CRON_SECRET is deliberately a WARN, not a throw: the site still serves every
 * page without it — only the scheduled crons and /api/health 401 at runtime.
 * Refusing to boot the whole product over a background-job secret would be a worse
 * failure than the one it guards against, so we log-loud-and-continue and let the
 * operator fix it. Returns the human-readable warning lines (empty outside prod).
 */
export function productionWarnings(env: Env): string[] {
  if (env.NODE_ENV !== "production") return [];
  const warnings: string[] = [];
  if (!env.CRON_SECRET) {
    warnings.push(
      "CRON_SECRET is unset in production — the scheduled crons and /api/health will " +
        "401 at runtime. Set CRON_SECRET to enable them."
    );
  }
  return warnings;
}

/** The last-run marker /api/health projects per cron (a subset of CronHealth). */
export type CronLastRun = { cron: string; finishedAt: string };

/**
 * The crons whose most-recent run is older than their allowed max age — the
 * warning tier /api/health surfaces so a silently-not-firing schedule is visible
 * without digging through logs. Pure (clock passed in): given the same inputs it
 * returns the same list, so the staleness rule is unit-testable in isolation.
 *
 * `maxAgeMs` is keyed by cron name; a cron with no entry is not judged (returned
 * as fresh). A run with an unparseable `finishedAt` is skipped rather than
 * flagged (a bad timestamp is not evidence the cron stopped). Sorted for a stable
 * projection.
 */
export function cronsStale(
  lastRuns: CronLastRun[],
  maxAgeMs: Record<string, number>,
  now: number
): string[] {
  const stale: string[] = [];
  for (const r of lastRuns) {
    const max = maxAgeMs[r.cron];
    if (max === undefined) continue; // cadence unknown → not judged
    const age = now - Date.parse(r.finishedAt);
    if (Number.isFinite(age) && age > max) stale.push(r.cron);
  }
  return stale.sort();
}
