/** Per-user Google Ads connections — the accounts the user connected and which
 *  one is active. Stored in Firestore (`adsConnections/{userId}`):
 *  `{ accounts: ConnectedAccount[], activeCustomerId }`. An agency connects many
 *  accounts (MCC) and switches between them. Server-only. */
import { firestore } from "@/lib/firebase";

export interface ConnectedAccount {
  customerId: string;
  customerName: string;
  connectedAt: string;
}

/** The active connection in the shape the connector / tenant resolver expect. */
export interface AdsConnection {
  customerId: string;
  customerName: string;
  connectedAt: string;
}

const COLLECTION = "adsConnections";

interface ConnectionsDoc {
  accounts?: ConnectedAccount[];
  activeCustomerId?: string;
}

function docRef(userId: string) {
  return firestore.collection(COLLECTION).doc(userId);
}

async function read(userId: string): Promise<ConnectionsDoc> {
  const doc = await docRef(userId).get();
  return (doc.data() as ConnectionsDoc) ?? {};
}

/** User ids with at least one connected Ads account — the set the scheduled
 *  sync iterates. */
export async function listConnectedUserIds(): Promise<string[]> {
  const snap = await firestore.collection(COLLECTION).get();
  return snap.docs
    .filter((d) => ((d.data() as ConnectionsDoc).accounts?.length ?? 0) > 0)
    .map((d) => d.id);
}

/** All connected accounts for the user + which is active. */
export async function listConnectedAccounts(
  userId: string
): Promise<{ accounts: ConnectedAccount[]; activeCustomerId: string | null }> {
  const data = await read(userId);
  return { accounts: data.accounts ?? [], activeCustomerId: data.activeCustomerId ?? null };
}

/** One specific connected account in the AdsConnection shape, or null when the
 *  user never connected it — the per-account lookup behind the scheduled sync's
 *  all-accounts fan-out (an id the user doesn't own resolves to null, so a
 *  caller can never sync somebody else's customer id). */
export async function getConnectedAccount(
  userId: string,
  customerId: string
): Promise<AdsConnection | null> {
  const { accounts } = await listConnectedAccounts(userId);
  const match = accounts.find((a) => a.customerId === customerId);
  return match
    ? { customerId: match.customerId, customerName: match.customerName, connectedAt: match.connectedAt }
    : null;
}

/** The active account (or first connected), in the AdsConnection shape — the
 *  one the connector syncs and the tenant is keyed on. */
export async function getAdsConnection(userId: string): Promise<AdsConnection | null> {
  const { accounts, activeCustomerId } = await listConnectedAccounts(userId);
  if (accounts.length === 0) return null;
  const active = accounts.find((a) => a.customerId === activeCustomerId) ?? accounts[0]!;
  return { customerId: active.customerId, customerName: active.customerName, connectedAt: active.connectedAt };
}

/** Connect an account (idempotent) and make it active. */
export async function addAccount(
  userId: string,
  customerId: string,
  customerName: string
): Promise<void> {
  const data = await read(userId);
  const accounts = (data.accounts ?? []).filter((a) => a.customerId !== customerId);
  accounts.push({ customerId, customerName, connectedAt: new Date().toISOString() });
  await docRef(userId).set({ accounts, activeCustomerId: customerId }, { merge: true });
}

/** Switch which connected account is active. */
export async function setActiveAccount(userId: string, customerId: string): Promise<void> {
  await docRef(userId).set({ activeCustomerId: customerId }, { merge: true });
}

/** Disconnect one account (re-points active to another, or clears it). */
export async function removeAccount(userId: string, customerId: string): Promise<void> {
  const data = await read(userId);
  const accounts = (data.accounts ?? []).filter((a) => a.customerId !== customerId);
  const activeCustomerId =
    data.activeCustomerId === customerId ? accounts[0]?.customerId ?? null : data.activeCustomerId ?? null;
  await docRef(userId).set({ accounts, activeCustomerId }, { merge: true });
}
