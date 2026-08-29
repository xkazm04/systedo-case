/** Claim-first double-run guard for scheduled crons — backend dispatcher.
 *  Resolves to the local node:sqlite store when LOCAL_DB is on, else Firestore.
 *  The backend is imported LAZILY so the LOCAL_DB path never evaluates the
 *  Firestore module. Both backends expose an identical, ATOMIC claim: it records
 *  `period` for (tenant, kind) and returns true only when the period is NEW —
 *  concurrent/re-fired runs that see the same period get false and must skip.
 *  Server-only. */
import { LOCAL_DB } from "@/lib/local-mode";

function backend() {
  return LOCAL_DB ? import("./sent-guard.local") : import("./sent-guard.firestore");
}

/** Guard kind — the digest's weekly send, plus one namespace per ledgers-cron
 *  step (`ledger-<stepId>`). A stable string keyed alongside the tenant so the
 *  crons share the table without colliding; the template member lets a step of
 *  `/api/cron/ledgers` claim a period per tenant without this union growing a
 *  line per step. Both backends already take an arbitrary string: the sqlite
 *  `kind` column is TEXT with no CHECK (src/lib/db.ts), and Firestore uses it as
 *  the config document id — which is why a step id must stay slash-free (see
 *  `LedgerStep.id` in ./ledgers.ts). */
export type SentGuardKind = "digest-weekly" | `ledger-${string}`;

/** Atomically claim `period` for (tenant, kind). Returns true to the FIRST caller
 *  (the period was not yet recorded → proceed to send), false if it was already
 *  claimed (skip). Claim-first: call this BEFORE sending. */
export async function claimSentPeriod(
  tenant: string,
  kind: SentGuardKind,
  period: string
): Promise<boolean> {
  return (await backend()).claimSentPeriod(tenant, kind, period);
}

/** The digest weekly guard: claim this ISO week for the tenant. */
export function claimWeeklyDigest(tenant: string, week: string): Promise<boolean> {
  return claimSentPeriod(tenant, "digest-weekly", week);
}

/** Release a claim taken by {@link claimSentPeriod} when NOTHING was delivered
 *  (a throw before the first channel landed), so a later run of the SAME period
 *  retries instead of the tenant silently losing it. Mirrors the report cron's
 *  claimReportDay/releaseReportDay pairing. Only clears the exact
 *  (tenant, kind, period) claim — a no-op if the period has since moved on. */
export async function releaseSentPeriod(
  tenant: string,
  kind: SentGuardKind,
  period: string
): Promise<void> {
  return (await backend()).releaseSentPeriod(tenant, kind, period);
}

/** The digest weekly release: undo this ISO week's claim on total failure. */
export function releaseWeeklyDigest(tenant: string, week: string): Promise<void> {
  return releaseSentPeriod(tenant, "digest-weekly", week);
}
