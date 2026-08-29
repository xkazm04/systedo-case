/** The conversion ledger — backend DISPATCHER. Local node:sqlite when LOCAL_DB is
 *  on, else Firestore; the backend is imported LAZILY so the LOCAL_DB path never
 *  evaluates the Firestore module (the leads / catalog-events store shape).
 *
 *  ROW-BASED, and keyed by `projectId` ALONE — the LEADS family's keying, not the
 *  catalog ledger's `(userId, projectId)`. That is deliberate: every append site is
 *  a lead-layer write (`changeStage`, `applyLeadEvent`) and none of them has a
 *  userId in scope, so keying by the owner would mean threading a session identity
 *  through the connector pipeline for the sake of a bookkeeping row. Tenancy still
 *  holds by construction — a projectId is only ever reachable through
 *  `requireOwnedProject` / `requireProjectModule` (ADR-0002), exactly as it is for
 *  `lead_contacts`.
 *
 *  ONE CONSEQUENCE, made explicit: the rollup step writes its summary into
 *  `project_state`, which IS keyed `(userId, projectId)`. {@link listConversionTenants}
 *  is the bridge — it joins the ledger's project ids back to their owners, which is
 *  the only place in this module that needs to know a project has an owner at all.
 *
 *  Server-only. The pure model lives in ./conversion-events. */
import "server-only";
import { LOCAL_DB } from "@/lib/local-mode";
import type { ConversionEvent, ConversionKind } from "./conversion-events";

export interface ConversionEventQuery {
  /** newest-first page size */
  limit?: number;
  /** restrict to one kind */
  kind?: ConversionKind;
  /** lower bound as a day string (YYYY-MM-DD); compares against the ISO `at` by prefix */
  sinceDay?: string;
}

/** One tenant that owns ledger rows. */
export interface ConversionTenant {
  userId: string;
  projectId: string;
}

function backend() {
  return LOCAL_DB ? import("./conversion-store.local") : import("./conversion-store.firestore");
}

/** Append a batch, idempotent by event id (a re-qualify after a regression UPDATES
 *  the row rather than minting a second), evicting the oldest beyond
 *  CONVERSION_EVENT_CAP.
 *
 *  THROWS on a backend failure. Both append sites call this AFTER their contact save
 *  and swallow the error there — the ledger EXPLAINS a stage move, it is never a
 *  precondition for one, so a ledger outage must not fail a stage change or an
 *  import (the `events-store.ts` posture). */
export async function appendConversionEvents(
  projectId: string,
  events: readonly ConversionEvent[]
): Promise<void> {
  if (events.length === 0) return;
  return (await backend()).appendConversionEvents(projectId, events);
}

/** The project's ledger, NEWEST FIRST, bounded. */
export async function listConversionEvents(
  projectId: string,
  query: ConversionEventQuery = {}
): Promise<ConversionEvent[]> {
  return (await backend()).listConversionEvents(projectId, query);
}

/** Drop rows strictly older than `beforeDay` (YYYY-MM-DD). Returns how many went. */
export async function pruneConversionEvents(projectId: string, beforeDay: string): Promise<number> {
  return (await backend()).pruneConversionEvents(projectId, beforeDay);
}

/** Drop the project's whole ledger. The project-delete cascade + the test-reset seam. */
export async function clearConversionEvents(projectId: string): Promise<void> {
  return (await backend()).clearConversionEvents(projectId);
}

/** Every (owner, project) pair that currently holds ledger rows, bounded. The cron
 *  rollup's work list — see the module note for why the join lives here. */
export async function listConversionTenants(limit = 500): Promise<ConversionTenant[]> {
  return (await backend()).listConversionTenants(limit);
}
