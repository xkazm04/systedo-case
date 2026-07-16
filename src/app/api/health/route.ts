/** GET /api/health — operator readiness probe. Behind the same CRON_SECRET
 *  Bearer guard as the cron endpoints (cronAuthorized is constant-time, so the
 *  auth check leaks nothing via timing), it returns the readiness matrix as
 *  present/absent booleans plus the active data-backend mode. It reports only
 *  WHICH credentials are configured — never any secret value — so it is safe to
 *  wire to an uptime monitor.
 *
 *  Beyond configuration it probes REALITY: a timeout-bounded 1-doc Firestore
 *  liveness read (a present-but-misconfigured credential passes the creds-boolean
 *  yet fails here), reported SEPARATELY as `firestoreReachable`; and `cronsStale`,
 *  the crons whose last run is older than their schedule allows. Node runtime. */
import { existsSync } from "node:fs";
import { cronAuthorized } from "@/lib/cron-auth";
import { LOCAL_DB } from "@/lib/local-mode";
import { readinessMatrix, cronsStale } from "@/lib/readiness";
import { listRecentCronRuns } from "@/lib/cron/runs-store";
import { projectCronHealth, type CronHealth } from "@/lib/cron/run-record";

/** How stale a cron's last run may get before it is flagged, keyed by cron name.
 *  Derived from vercel.json's schedules × a 2× TOLERANCE that absorbs scheduling
 *  drift and a single missed tick without crying wolf:
 *    sync + social       — hourly  (0 * * * *)   → 2h
 *    report              — daily   (0 6 * * *)   → 2d
 *    catalog-sync        — daily   (0 5 * * *)   → 2d
 *    digest              — weekly  (0 7 * * 1)   → 2w
 *  A cron absent from this map is not judged (no cadence to judge against). */
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const CRON_STALE_TOLERANCE = 2;
const CRON_MAX_AGE_MS: Record<string, number> = {
  sync: CRON_STALE_TOLERANCE * HOUR,
  social: CRON_STALE_TOLERANCE * HOUR,
  report: CRON_STALE_TOLERANCE * DAY,
  "catalog-sync": CRON_STALE_TOLERANCE * DAY,
  digest: CRON_STALE_TOLERANCE * 7 * DAY,
};

/** Timeout for the Firestore liveness read. Kept short so the health probe is
 *  responsive to an uptime monitor even when Firestore is hanging (unreachable). */
const FIRESTORE_PROBE_TIMEOUT_MS = 2000;

/** Last run per cron for the probe — best-effort: a store hiccup degrades to an
 *  empty list rather than failing the whole health check. */
async function lastCronRuns(): Promise<CronHealth[]> {
  try {
    return projectCronHealth(await listRecentCronRuns());
  } catch (err) {
    console.error("[health] failed to read cron runs:", err);
    return [];
  }
}

/** A timeout-bounded, never-throwing 1-doc Firestore liveness read. Returns
 *  "skipped" under LOCAL_DB (no Firestore to reach; also keeps firebase-admin out
 *  of the local path), `false` on timeout or any error, `true` on a real read.
 *  Never hangs the route (Promise.race) and never rejects (both sides resolve). */
async function firestoreReachable(): Promise<boolean | "skipped"> {
  if (LOCAL_DB) return "skipped";
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const { firestore } = await import("@/lib/firebase");
    const probe = firestore
      .collection("tenants")
      .limit(1)
      .get()
      .then(
        () => true,
        () => false
      );
    const timeout = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), FIRESTORE_PROBE_TIMEOUT_MS);
    });
    return await Promise.race([probe, timeout]);
  } catch {
    // e.g. the firebase module failing its boot preflight — reachability is false,
    // never a thrown 500 on the health route itself.
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS ?? ".data/firebase-sa.json";
  const matrix = readinessMatrix(process.env, { keyFilePresent: existsSync(keyPath) });
  const [crons, reachable] = await Promise.all([lastCronRuns(), firestoreReachable()]);

  return Response.json(
    {
      ok: true,
      dbMode: LOCAL_DB ? "local-sqlite" : "firestore",
      ...matrix,
      // Reality, not just configuration: an actual 1-doc read result, reported
      // separately from firebaseCredMode (creds can be present yet misconfigured).
      firestoreReachable: reachable,
      // Durable cron observability: the most recent run per scheduled cron
      // (name, finishedAt, ok, counts) — "did last night's report deliver?".
      crons,
      // Warning tier: crons whose last run is older than their schedule allows.
      cronsStale: cronsStale(crons, CRON_MAX_AGE_MS, Date.now()),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
