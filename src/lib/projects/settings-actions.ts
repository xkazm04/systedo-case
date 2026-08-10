/** The pure decisions behind the Nastavení page's two project-level actions — the
 *  Ads link and the deletion cascade — kept out of the components so they can be
 *  test-pinned without a DOM.
 *
 *  WHY THIS EXISTS: the module registry advertises Nastavení as the home of "napojení
 *  Google Ads", but the only client of the (fully guarded) PATCH route was the
 *  projects hub. Surfacing the link on the settings page means evaluating the SAME
 *  rule the hub pre-flights — `decideAdsLink` — once per connected account, and
 *  turning the route's refusal codes into something a user can act on. And DELETE
 *  returns `{ok, cleaned, failed}`; reading only `res.ok` made a delete that stranded
 *  three satellite stores look exactly like a clean one.
 *
 *  Framework-free (no React, no fetch) on purpose. */
import {
  decideAdsLink,
  type AdsLinkAction,
  type LinkableAccount,
  type LinkableProject,
} from "@/lib/projects/ads-link";

/** What the PATCH route's status code MEANS to the user. The route refuses a
 *  double-claimed account with 409 and an account that isn't one of the caller's own
 *  with 422 (`requireLinkableAdsAccount`); everything else non-2xx is a plain
 *  failure worth retrying. Kept separate from the messages so both the hub's grammar
 *  and this page's can render the same verdict in their own words. */
export type AdsPatchOutcome = "ok" | "already-claimed" | "unknown-account" | "failed";

export function adsPatchOutcome(status: number): AdsPatchOutcome {
  if (status >= 200 && status < 300) return "ok";
  if (status === 409) return "already-claimed";
  if (status === 422) return "unknown-account";
  return "failed";
}

/** One connected Ads account as the settings picker needs to render it: what picking
 *  it would DO to this project, and — when it would do nothing because another
 *  project already holds it — which project that is, so the refusal is explained
 *  before the round-trip instead of after it (the r15 design: rejection is
 *  recoverable because unlink exists, and the user is told exactly where to unlink). */
export interface AdsAccountOption extends LinkableAccount {
  /** `noop` = this project's CURRENT link */
  action: AdsLinkAction;
  /** set only when another project claims this account — the option is unselectable */
  claimedBy?: string;
}

/** Annotate every connected account with the verdict the API would return, using the
 *  one shared rule. Order preserved from `accounts`. */
export function adsAccountOptions(opts: {
  project: LinkableProject;
  accounts: readonly LinkableAccount[];
  /** ALL of the user's projects, including `project` itself */
  projects: readonly LinkableProject[];
}): AdsAccountOption[] {
  const { project, accounts, projects } = opts;
  return accounts.map((a) => {
    const verdict = decideAdsLink({ project, customerId: a.customerId, accounts, projects });
    if (verdict.ok) return { ...a, action: verdict.action };
    // `unknown-account` is unreachable here (the account came FROM the list), so the
    // only refusal in practice is a collision — name the project holding it. Either
    // way the option is not selectable.
    if (verdict.reason === "already-claimed") {
      return { ...a, action: "noop" as const, claimedBy: verdict.byProject.name };
    }
    return { ...a, action: "noop" as const };
  });
}

/** What a DELETE actually accomplished. The route deletes the workspace doc whether
 *  or not every satellite store cooperated, and records the stragglers in the durable
 *  orphan ledger — so a partial result is not an error to swallow, it is the one
 *  moment the user can learn their data cleanup is unfinished (and that the sweep at
 *  /api/projects/orphans can finish it). */
export interface CascadeOutcome {
  /** the project itself is gone either way — this is only about its satellite data */
  partial: boolean;
  cleaned: string[];
  failed: string[];
}

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0) : [];

/** Read the DELETE payload defensively: an older/other shape must degrade to "clean",
 *  never to a phantom warning. */
export function readCascadeOutcome(json: unknown): CascadeOutcome {
  const body = (json ?? {}) as { cleaned?: unknown; failed?: unknown };
  const failed = strings(body.failed);
  return { partial: failed.length > 0, cleaned: strings(body.cleaned), failed };
}

/** The headline of an orphan-sweep report (GET/POST /api/projects/orphans), reduced
 *  to what a settings panel shows: how many dead projects still hold data, and which
 *  cleanup units are still failing after an apply. */
export interface OrphanSummary {
  orphanCount: number;
  /** distinct cleanup-unit names still pending across all orphaned findings */
  pending: string[];
  applied: boolean;
  /** apply-mode: units that STILL failed, i.e. the sweep did not finish the job */
  stillFailing: string[];
}

export function summarizeOrphanReport(json: unknown): OrphanSummary {
  const report = ((json ?? {}) as { report?: unknown }).report as
    | {
        applied?: unknown;
        findings?: { status?: unknown; pending?: unknown; stillFailing?: unknown }[];
      }
    | undefined;
  const findings = Array.isArray(report?.findings) ? report.findings : [];
  const orphans = findings.filter((f) => f?.status === "orphaned");
  const pending = new Set<string>();
  const stillFailing = new Set<string>();
  for (const f of orphans) {
    // After an apply, `pending` is the pre-run set — only `stillFailing` is news.
    for (const n of strings(f.pending)) pending.add(n);
    for (const n of strings(f.stillFailing)) stillFailing.add(n);
  }
  return {
    orphanCount: orphans.length,
    pending: [...pending],
    applied: report?.applied === true,
    stillFailing: [...stillFailing],
  };
}
