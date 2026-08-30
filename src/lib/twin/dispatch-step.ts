/** WP S2 — the `twin-dispatch` ledger step: AUTONOMY ON THE WIRE.
 *
 *  Registered in src/lib/cron/ledgers.ts — that one line in LEDGER_STEPS is the whole
 *  registration ceremony (no new route, no `vercel.json` entry, no new guard; WP F4).
 *
 *  WHAT IT DOES, per project that has a twin, and ONLY on a channel the operator put
 *  on `autonomy: "auto"` with a real, configured connector:
 *    (a) DRAFT — a message that ARRIVED through the signed intake and nobody has
 *        answered (`isInboundDraft`, `reply === ""`) is handed to `generateTwinReply`
 *        in the project's own voice, and the result goes through the SAME
 *        `decideDraft` gate the UI uses. Above the bar with no risks ⇒ approved;
 *        anything else stays pending for a human, exactly as if a human had clicked
 *        "draft".
 *    (b) DELIVER — an `approved` draft on such a channel goes through `deliverDraft`,
 *        which is the same claim the send route makes. The gate there decides; a
 *        refusal is counted and NEVER retried inside the same tick.
 *
 *  WHAT IT WILL NOT DO, and these are the load-bearing refusals:
 *   • It never touches a `review` or `assist` channel. Those are the operator's
 *     promise to themselves that a human is in the loop, and a cron is not a human.
 *   • It never sends a `pending` draft. Approval — by the gate or by a person — is
 *     the precondition, always.
 *   • It never drafts through `/api/ai`. ADR-0003: the chokepoint is
 *     `generateStructured`, reached here by calling the twin-reply TOOL directly.
 *     Going through the HTTP route would need a session this has no way to hold.
 *   • It skips DEMO projects: the public demo must never mail anybody.
 *   • It does nothing at all when no real connector exists in this deployment —
 *     walking every tenant to discover that would spend the tick to learn nothing
 *     (the social read-back step's honest-zero-work rule).
 *
 *  SPEND. Every draft is one provider call, guarded like the digest diagnosis:
 *  `durableGuard("cron:twin-dispatch", [], { spendUnits: 1 })` before the call, and
 *  the unit REFUNDED when the call degraded to the demo or threw — so the shared
 *  daily ceiling counts calls actually made. Exhaustion stops the drafting arm for
 *  the tick rather than failing the step.
 *
 *  Bounded per tick so one busy tenant cannot eat the shared 300 s invocation.
 *  Server-only. */
import "server-only";
import type { LedgerStep, LedgerStepResult } from "@/lib/cron/ledgers";
import { durableGuard, refundGlobalSpend } from "@/lib/ai/durable-limit";
import { generateTwinReply } from "@/lib/ai/tools/twin-reply";
import { isDemoProjectId } from "@/lib/projects/demo";
import { getProject } from "@/lib/projects/store";
import { promptSafeName } from "@/lib/projects/name";
import type { Project } from "@/lib/projects/types";
import type { AiResponse, TwinReplyRequest } from "@/lib/ai-types";
import { connectorFor, CONNECTORS, type TwinConnector } from "./connectors";
import { deliverDraft, type DeliverDeps, type DeliverOutcome } from "./deliver";
import { isInboundDraft } from "./inbound-id";
import { listTwinTenants, mutateTwin } from "./store";
import { resolveTwin } from "./resolve";
import { loadTwinVoice } from "./load";
import {
  decideDraft,
  twinAvoidContext,
  type TwinChannel,
  type TwinChannelConfig,
  type TwinDraft,
  type TwinState,
} from "./types";

/** The step id — the run record's key and the namespace its counts report under. */
export const TWIN_DISPATCH_STEP_ID = "twin-dispatch";

/** Half-hourly. An inbound message deserves an answer within the hour, and every
 *  tick that drafts costs provider units — thirty minutes is responsive without
 *  turning the ceiling into a subscription to the cron. */
export const DISPATCH_INTERVAL_MS = 30 * 60_000;

/** Unanswered inbound messages drafted per project per tick. */
export const DISPATCH_DRAFTS_PER_TICK = 5;

/** Approved drafts delivered per project per tick. The weekly cap is the real
 *  limit; this only bounds one tick's work. */
export const DISPATCH_SENDS_PER_TICK = 10;

/** Projects visited per tick. */
export const DISPATCH_PROJECT_SCAN = 500;

export interface TwinDispatchCounts extends Record<string, number> {
  projects: number;
  drafted: number;
  approved: number;
  delivered: number;
  refused: number;
  failed: number;
}

/** Injection seam — the fixtures replace the model and the wire, never the gates. */
export interface DispatchDeps {
  generate?: (req: TwinReplyRequest) => Promise<AiResponse<{ reply: string; questions: string[]; confidence: number; risks: string[] }>>;
  connectorFor?: (id: string) => TwinConnector;
  deliver?: (userId: string, projectId: string, draftId: string, deps?: DeliverDeps) => Promise<DeliverOutcome>;
  /** override the honest-zero-work probe (fixtures inject their own wire) */
  anyRealConnector?: () => boolean;
  /** charge one unit of the global daily ceiling; `false` = exhausted, skip */
  charge?: () => Promise<boolean>;
  refund?: () => Promise<void>;
  projectScan?: number;
}

export const twinDispatchStep: LedgerStep = {
  id: TWIN_DISPATCH_STEP_ID,
  due: (now, lastRunAt) => {
    if (!lastRunAt) return true;
    const at = Date.parse(lastRunAt);
    if (!Number.isFinite(at)) return true; // an unreadable stamp must not wedge the step
    return now.getTime() - at >= DISPATCH_INTERVAL_MS;
  },
  run: () => runTwinDispatch(),
};

/** Does this deployment have ANY connector that actually transmits? Read off the
 *  REGISTRY rather than a hardcoded id list, so a second real connector needs no
 *  edit here. `manual` is always "configured" and transmits nothing — it is not a
 *  wire, and a deployment holding only it has nothing for this step to do. */
function anyRealConnectorConfigured(): boolean {
  return CONNECTORS.some((c) => c.id !== "manual" && c.configured);
}

/** The channels this project has genuinely handed to the twin: enabled, `auto`, and
 *  wired to a connector that really sends. A `manual` connector on an `auto` channel
 *  is NOT dispatchable — marking a draft `sent` through it would record a delivery
 *  no human performed. */
function dispatchableChannels(
  state: TwinState,
  resolve: (id: string) => TwinConnector
): TwinChannelConfig[] {
  const out: TwinChannelConfig[] = [];
  for (const cfg of state.channels) {
    if (!cfg.enabled || cfg.autonomy !== "auto") continue;
    const connector = resolve(cfg.connector);
    if (connector.id === "manual" || !connector.configured) continue;
    if (!connector.channels.includes(cfg.channel)) continue;
    out.push(cfg);
  }
  return out;
}

/** An arrived message nobody has answered. */
function pendingInbound(drafts: readonly TwinDraft[], channel: TwinChannel): TwinDraft[] {
  return drafts.filter((d) => d.channel === channel && d.status === "pending" && d.reply === "" && isInboundDraft(d));
}

/** One tick's work. Never throws — the runner isolates a throw anyway, but a step
 *  that reports `{ ok: false, error }` gives the run record something readable. */
export async function runTwinDispatch(deps: DispatchDeps = {}): Promise<LedgerStepResult> {
  const counts: TwinDispatchCounts = { projects: 0, drafted: 0, approved: 0, delivered: 0, refused: 0, failed: 0 };
  const resolve = deps.connectorFor ?? connectorFor;
  const deliver = deps.deliver ?? deliverDraft;
  const generate = deps.generate ?? ((req: TwinReplyRequest) => generateTwinReply(req, "cs"));
  const charge =
    deps.charge ?? (async () => (await durableGuard("cron:twin-dispatch", [], { spendUnits: 1 })).ok);
  const refund = deps.refund ?? (() => refundGlobalSpend(1));

  // Honest zero-work: with nothing that can transmit, there is nothing to dispatch,
  // and walking every tenant to discover that would spend the tick to learn nothing.
  if (!(deps.anyRealConnector ?? anyRealConnectorConfigured)()) return { ok: true, counts };

  let tenants;
  try {
    tenants = await listTwinTenants(deps.projectScan ?? DISPATCH_PROJECT_SCAN);
  } catch (err) {
    return { ok: false, counts, error: err instanceof Error ? err.message : String(err) };
  }

  for (const { userId, projectId } of tenants) {
    // The public demo speaks to nobody. Skipping by id keeps that true without a
    // per-project flag anyone could forget to set.
    if (isDemoProjectId(projectId)) continue;
    try {
      const project = await getProject(userId, projectId);
      if (!project) continue; // mid-delete race — never dispatch under a guessed owner
      const resolved = await resolveTwin(projectId, project.type);
      const channels = dispatchableChannels(resolved.state, resolve);
      if (channels.length === 0) continue;
      counts.projects++;

      for (const cfg of channels) {
        await draftArm(project, cfg, resolved.state, counts, { generate, charge, refund });
      }
      // Re-read AFTER the drafting arm so a draft this tick just auto-approved is
      // eligible for delivery in the same tick — the operator asked for end to end.
      const afterDraft = await resolveTwin(projectId, project.type);
      for (const cfg of channels) {
        await sendArm(userId, projectId, cfg, afterDraft.state, counts, deliver, resolve);
      }
    } catch (err) {
      // One tenant's failure must not cost every other tenant its dispatch.
      counts.failed++;
      console.error(`[twin] dispatch failed for ${projectId}:`, err);
    }
  }

  return { ok: counts.failed === 0, counts };
}

/* -------------------------------------------------------------------------- */
/*  (a) draft                                                                  */
/* -------------------------------------------------------------------------- */

async function draftArm(
  project: Project,
  cfg: TwinChannelConfig,
  state: TwinState,
  counts: TwinDispatchCounts,
  io: Required<Pick<DispatchDeps, "generate" | "charge" | "refund">>
): Promise<void> {
  const projectId = project.id;
  const queue = pendingInbound(state.drafts, cfg.channel).slice(0, DISPATCH_DRAFTS_PER_TICK);
  if (queue.length === 0) return;

  // Resolved ONCE per channel: the voice and the avoid-context are the same for every
  // draft in this queue, and the voice read is a store hit.
  const voice = await loadTwinVoice(project, cfg.channel);
  const avoid = twinAvoidContext(state.drafts, cfg.channel, "cs");
  const brand = promptSafeName(project.name);

  for (const draft of queue) {
    if (!(await io.charge())) return; // ceiling exhausted — stop drafting this tick
    let res;
    try {
      res = await io.generate({
        inbound: draft.inbound,
        channel: cfg.channel,
        projectType: project.type,
        ...(brand ? { brand } : {}),
        ...(draft.contact ? { contact: draft.contact } : {}),
        ...(voice ? { voice } : {}),
        ...(avoid.length > 0 ? { avoid } : {}),
      });
    } catch (err) {
      await io.refund(); // no billable work landed
      counts.failed++;
      console.error(`[twin] dispatch draft failed for ${projectId}/${draft.id}:`, err);
      continue;
    }
    if (res.meta?.demo) await io.refund(); // degraded to the deterministic fallback

    const result = res.result;
    // The SAME gate the UI uses. Note the intake's placeholder `risks: ["inbound"]`
    // is REPLACED by the model's list, not merged: it existed only to stop an
    // unanswered message being auto-approved, and this draft has now been answered.
    const verdict = decideDraft(cfg, { confidence: result.confidence, risks: result.risks });
    const decidedAt = new Date().toISOString();
    try {
      await mutateTwin(projectId, (prev) => {
        if (!prev) throw new Error("twin vanished mid-dispatch");
        return {
          ...prev,
          // Assign, never increment — the mutator may re-run inside the transaction.
          drafts: prev.drafts.map((d) =>
            d.id === draft.id && d.status === "pending"
              ? {
                  ...d,
                  reply: result.reply,
                  questions: result.questions,
                  confidence: result.confidence,
                  risks: result.risks,
                  status: verdict.status,
                  autoApproved: verdict.autoApproved,
                  decidedAt,
                }
              : d
          ),
          updatedAt: decidedAt,
        };
      });
      counts.drafted++;
      if (verdict.status === "approved") counts.approved++;
    } catch (err) {
      counts.failed++;
      console.error(`[twin] dispatch draft write failed for ${projectId}/${draft.id}:`, err);
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  (b) deliver                                                                */
/* -------------------------------------------------------------------------- */

async function sendArm(
  userId: string,
  projectId: string,
  cfg: TwinChannelConfig,
  state: TwinState,
  counts: TwinDispatchCounts,
  deliver: NonNullable<DispatchDeps["deliver"]>,
  resolve: (id: string) => TwinConnector
): Promise<void> {
  // APPROVED is the precondition, whoever approved it: the gate on an `auto` channel,
  // or the operator who clicked approve on a channel they told the twin to run. What
  // is never sent is a `pending` draft, and never anything on review/assist (those
  // channels never reach `dispatchableChannels`).
  const queue = state.drafts
    .filter((d) => d.channel === cfg.channel && d.status === "approved")
    .slice(0, DISPATCH_SENDS_PER_TICK);

  for (const draft of queue) {
    const outcome = await deliver(userId, projectId, draft.id, { connectorFor: resolve });
    if (outcome.ok) {
      if (outcome.delivered) counts.delivered++;
      else counts.refused++; // a "manual" outcome here would be a recorded non-send
      continue;
    }
    if (outcome.kind === "delivery-failed") {
      counts.failed++;
      console.error(`[twin] dispatch delivery failed for ${projectId}/${draft.id}:`, outcome.error);
      continue;
    }
    // Every gate refusal (cap, consent, address, unconfigured, not-approved) is
    // COUNTED and left alone — retrying inside the same tick would only spend the
    // budget re-learning the same "no".
    counts.refused++;
  }
}
