/** Server-side gate for a requested `adsCustomerId` write on `PATCH /api/projects/[id]`.
 *  Gathers the two facts the decision needs — the caller's connected Ads accounts and
 *  the caller's other projects — feeds them to the PURE {@link decideAdsLink} rule, and
 *  hands the route either the verdict or the exact Response to return. Same shape as
 *  api-guard.ts's `requireOwnedProject`, so the route stays a thin body-validator.
 *
 *  Why the route can't just store the string: it used to accept ANY `adsCustomerId`
 *  unchecked and then emit a "Google Ads napojen" activity on it, so a typo'd or
 *  foreign id became a confident, permanent, invisible lie — and two projects could
 *  claim one account, which planSyncTargets then syncs into BOTH, landing identical
 *  spend in two client reports.
 *
 *  Status mapping (route-utils' catalog — no new codes):
 *    409 `conflict`      another of the caller's projects already links this account
 *    422 `unprocessable` the id is not one of the caller's connected accounts, or the
 *                        connected-accounts list could not be read at all
 *
 *  The connections store is Firestore-only, so it is imported LAZILY and only when a
 *  non-empty id is actually being written: a rename / branding PATCH — and every
 *  PATCH under LOCAL_DB, where no Ads connection can exist — never pulls
 *  firebase-admin in. A lookup that throws FAILS CLOSED (422): an id we cannot verify
 *  must not be stored, because storing it is what creates the silent lie.
 *  UNLINK (`""`) skips the account read entirely — you can always let go. */
import "server-only";
import { listProjects } from "@/lib/projects/store";
import { conflict, unprocessable } from "@/lib/api/route-utils";
import { decideAdsLink, type AdsLinkVerdict, type LinkableAccount } from "./ads-link";
import type { Project } from "./types";

const UNKNOWN_ACCOUNT = "Tento účet Google Ads není mezi vašimi připojenými účty.";
const ALREADY_CLAIMED =
  "Tento účet Google Ads už je propojený s jiným projektem. Nejdřív ho tam odpojte.";

/** Resolve the caller's connected accounts, or null when the store can't be read.
 *  Null is NOT "no accounts" — it is "we don't know", which the caller fails closed on. */
async function connectedAccounts(userId: string): Promise<LinkableAccount[] | null> {
  try {
    const { listConnectedAccounts } = await import("@/lib/campaigns/connection");
    const { accounts } = await listConnectedAccounts(userId);
    return accounts.map((a) => ({ customerId: a.customerId, customerName: a.customerName }));
  } catch (err) {
    console.error("[projects] ads-link: could not read connected accounts", err);
    return null;
  }
}

/** Gate a requested `adsCustomerId` (already trimmed; `""` = unlink) for `project`.
 *  Returns the verdict the route acts on, or the Response it must return. */
export async function requireLinkableAdsAccount(
  userId: string,
  project: Project,
  customerId: string
): Promise<{ verdict: AdsLinkVerdict } | { error: Response }> {
  if (!customerId) {
    // Unlink: no account read, no ownership question — just report the action so the
    // route can emit the honest activity record.
    return { verdict: decideAdsLink({ project, customerId: "", accounts: [], projects: [project] }) };
  }

  const [accounts, projects] = await Promise.all([connectedAccounts(userId), listProjects(userId)]);
  if (accounts === null) return { error: unprocessable(UNKNOWN_ACCOUNT, "unprocessable") };

  const verdict = decideAdsLink({ project, customerId, accounts, projects });
  if (!verdict.ok) {
    return verdict.reason === "already-claimed"
      ? { error: conflict(ALREADY_CLAIMED) }
      : { error: unprocessable(UNKNOWN_ACCOUNT, "unprocessable") };
  }
  return { verdict };
}
