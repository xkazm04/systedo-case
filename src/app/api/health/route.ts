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
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
