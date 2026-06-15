/** Per-user Google Ads connection — which customer (account) the user chose to
 *  sync, stored in Firestore (`adsConnections/{userId}`). Server-only. */
import { firestore } from "@/lib/firebase";

export interface AdsConnection {
  /** selected Google Ads customer id (digits only) */
  customerId: string;
  /** display name at selection time */
  customerName: string;
  connectedAt: string;
}

const COLLECTION = "adsConnections";

export async function getAdsConnection(userId: string): Promise<AdsConnection | null> {
  const doc = await firestore.collection(COLLECTION).doc(userId).get();
  return doc.exists ? (doc.data() as AdsConnection) : null;
}

export async function setAdsConnection(
  userId: string,
  customerId: string,
  customerName: string
): Promise<AdsConnection> {
  const connection: AdsConnection = {
    customerId,
    customerName,
    connectedAt: new Date().toISOString(),
  };
  await firestore.collection(COLLECTION).doc(userId).set(connection);
  return connection;
}

export async function clearAdsConnection(userId: string): Promise<void> {
  await firestore.collection(COLLECTION).doc(userId).delete();
}
