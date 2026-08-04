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

/** The project (other than `exceptProjectId`) that already claims `customerId`, or
 *  null. One account may back at most ONE project — see {@link decideAdsLink}. */
export function claimingProject(
  customerId: string,
  projects: readonly LinkableProject[],
  exceptProjectId: string
): LinkableProject | null {
  if (!customerId) return null;
  return projects.find((p) => p.id !== exceptProjectId && p.adsCustomerId === customerId) ?? null;
}

/** What a requested `adsCustomerId` write actually DOES to a project. `noop` and
 *  `link` are silent; `relink` and `unlink` destroy an existing link, so the UI
 *  confirms them first. */
export type AdsLinkAction = "link" | "relink" | "unlink" | "noop";

/** Verdict on a requested link. `ok:false` is a refusal the API turns into a coded
 *  4xx and the UI turns into a localized message. */
export type AdsLinkVerdict =
  | { ok: true; action: AdsLinkAction; previousCustomerId?: string }
  /** the id is not one of the caller's own connected Ads accounts */
  | { ok: false; reason: "unknown-account" }
  /** another of the caller's projects already links this account */
  | { ok: false; reason: "already-claimed"; byProject: LinkableProject };

/** Decide whether a project may take `customerId` — the single rule both the API
 *  (authoritative) and the projects hub (pre-flight, so the user is warned before a
 *  round-trip) evaluate, so the two can never disagree on what is allowed.
 *
 *  Three things it enforces, none of which existed before:
 *   1. UNKNOWN ACCOUNT — the id must be one of the caller's own connected accounts.
 *      PATCH used to store any string unchecked and then announce "Google Ads
 *      napojen" on it, so a typo produced a permanently, confidently wrong link.
 *   2. ONE ACCOUNT, ONE PROJECT — an account claimed by another of the caller's
 *      projects is REFUSED, not silently overwritten. Rationale: planSyncTargets
 *      fans a connected account out to every project that links it, so a shared
 *      account lands identical spend in two client reports, each looking legitimate
 *      and neither flagged. Moving an account between projects stays possible, but
 *      as two deliberate steps (unlink there, link here) — the affirmation-checkbox
 *      alternative is precisely what a person mapping ten accounts clicks through.
 *   3. NAMING THE DESTRUCTIVE CASES — `relink`/`unlink` drop an existing link (and
 *      with it that project's sync target), so the caller can confirm before doing it.
 *
 *  `customerId` must already be trimmed; `""` means UNLINK (the store maps an empty
 *  string to a cleared field). Pure — the caller supplies the accounts + projects. */
export function decideAdsLink(opts: {
  project: LinkableProject;
  /** trimmed; "" = unlink */
  customerId: string;
  /** the caller's connected Ads accounts */
  accounts: readonly LinkableAccount[];
  /** ALL of the caller's projects (including `project` itself) */
  projects: readonly LinkableProject[];
}): AdsLinkVerdict {
  const { project, customerId, accounts, projects } = opts;
  const current = project.adsCustomerId ?? "";

  if (!customerId) {
    return current ? { ok: true, action: "unlink", previousCustomerId: current } : { ok: true, action: "noop" };
  }
  // Unlinking is always allowed; everything else must name a real connected account.
  if (!accounts.some((a) => a.customerId === customerId)) return { ok: false, reason: "unknown-account" };

  const claimed = claimingProject(customerId, projects, project.id);
  if (claimed) return { ok: false, reason: "already-claimed", byProject: claimed };

  if (current === customerId) return { ok: true, action: "noop" };
  return current
    ? { ok: true, action: "relink", previousCustomerId: current }
    : { ok: true, action: "link" };
}
