/** Agency-link visibility — the pure state that answers "which Google Ads account
 *  is each project linked to, and which connected accounts aren't linked to ANY
 *  project?". An agency connects many accounts (MCC) but each Adamant project links
 *  to at most one (`project.adsCustomerId`); a freshly connected account that no
 *  project points at is invisible until someone maps it. This module derives that
 *  from data the projects hub already has in hand — the project list and the
 *  user-level connected-accounts list — so no per-project Firestore read is added.
 *  Framework-free (no React, no firebase) so it's trivially unit-testable. */

/** The minimal shape of a connected Ads account this module needs. Structurally
 *  compatible with `ConnectedAccount` from campaigns/connection. */
export interface LinkableAccount {
  customerId: string;
  customerName: string;
}

/** The minimal project shape this module needs — just its identity + the link. */
export interface LinkableProject {
  id: string;
  name: string;
  adsCustomerId?: string;
}

/** A project's Ads-link status, resolved against the set of connected accounts so
 *  the badge can name the account (not just echo the raw id). */
export interface ProjectAdsLink {
  linked: boolean;
  customerId?: string;
  /** the connected account's friendly name when we know it, else undefined */
  customerName?: string;
}

/** Resolve one project's link. `linked` is driven purely by `adsCustomerId` (the
 *  honest, already-loaded signal); the name is a best-effort lookup that degrades to
 *  undefined when the linked id isn't among the currently connected accounts (e.g. it
 *  was disconnected) — the badge then shows the id alone rather than lying. */
export function projectAdsLink(
  project: LinkableProject,
  accounts: readonly LinkableAccount[] = []
): ProjectAdsLink {
  const customerId = project.adsCustomerId;
  if (!customerId) return { linked: false };
  const match = accounts.find((a) => a.customerId === customerId);
  return { linked: true, customerId, customerName: match?.customerName };
}

/** The connected accounts NOT linked to ANY project — the agency's "loose" accounts
 *  that need mapping. Order preserved from `accounts`; an account linked to even one
 *  project drops out. Pure: (accounts × projects) → unmapped accounts. */
export function unmappedAccounts(
  accounts: readonly LinkableAccount[],
  projects: readonly LinkableProject[]
): LinkableAccount[] {
  const linkedIds = new Set(
    projects.map((p) => p.adsCustomerId).filter((id): id is string => Boolean(id))
  );
  return accounts.filter((a) => !linkedIds.has(a.customerId));
}
