/** GET /api/health — operator readiness probe. Behind the same CRON_SECRET
 *  Bearer guard as the cron endpoints (cronAuthorized is constant-time, so the
 *  auth check leaks nothing via timing), it returns the readiness matrix as
 *  present/absent booleans plus the active data-backend mode. It reports only
 *  WHICH credentials are configured — never any secret value — so it is safe to
 *  wire to an uptime monitor. Node runtime. */
import { existsSync } from "node:fs";
import { cronAuthorized } from "@/lib/cron-auth";
import { LOCAL_DB } from "@/lib/local-mode";
import { readinessMatrix } from "@/lib/readiness";
import { listRecentCronRuns } from "@/lib/cron/runs-store";
import { projectCronHealth, type CronHealth } from "@/lib/cron/run-record";

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

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS ?? ".data/firebase-sa.json";
  const matrix = readinessMatrix(process.env, { keyFilePresent: existsSync(keyPath) });

  return Response.json(
    {
      ok: true,
      dbMode: LOCAL_DB ? "local-sqlite" : "firestore",
      ...matrix,
      // Durable cron observability: the most recent run per scheduled cron
      // (name, finishedAt, ok, counts) — "did last night's report deliver?".
      crons: await lastCronRuns(),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
