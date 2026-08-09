/** Per-user social-connection store — LOCAL node:sqlite backend. Selected by the
 *  dispatcher in ./connection.ts under LOCAL_DB, closing the last Firestore-only
 *  tail in the social surface: without it `npm run dev:local`'s accounts API and
 *  the publish cron's connected-user scan hit firebase-admin and failed.
 *
 *  Adapter choice: connections are keyed per USER (not per tenant), so the
 *  per-tenant `tenant_docs` twin doesn't fit directly — but rather than mint a new
 *  table (+ db.ts migration; see the v20 dropped-table lesson), the rows live in
 *  the EXISTING tenant_docs twin under a reserved pseudo-tenant that no real
 *  tenant key can collide with (real keys are `sample`, `sample_*` or `u_*` —
 *  see campaigns/store-keys.ts buildTenantKey): one doc per user under
 *  (`__social__`, `connections`, {userId}) = { accounts: StoredSocialAccount[] },
 *  mirroring the Firestore `socialConnections/{userId}` doc 1:1. The adapter's
 *  listDocs doubles as the cron's connected-user scan. LOCAL_DB-only by
 *  construction (imports the local twin directly, never firebase). Server-only. */
import "server-only";
import { localTenantDocs } from "@/lib/tenant-docs/local";
import type { StoredSocialAccount } from "./account";

/** Reserved pseudo-tenant — never a real tenant key (those are `sample`,
 *  `sample_*` or `u_*`). */
const TENANT = "__social__";
const COLLECTION = "connections";

interface Doc {
  accounts?: StoredSocialAccount[];
}

export async function listStoredAccounts(userId: string): Promise<StoredSocialAccount[]> {
  const doc = await localTenantDocs.getDoc(TENANT, COLLECTION, userId);
  return (doc as Doc | undefined)?.accounts ?? [];
}

export async function saveStoredAccounts(
  userId: string,
  accounts: StoredSocialAccount[]
): Promise<void> {
  // Full-doc set (no merge): `accounts` is the whole document, same as the
  // Firestore backend's set-merge over the single field.
  await localTenantDocs.setDoc(TENANT, COLLECTION, userId, { accounts });
}

export async function listConnectedSocialUserIds(): Promise<string[]> {
  const rows = await localTenantDocs.listDocs(TENANT, COLLECTION);
  return rows.filter((r) => ((r.data as Doc).accounts?.length ?? 0) > 0).map((r) => r.id);
}
