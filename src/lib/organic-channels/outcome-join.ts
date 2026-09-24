/** The ONE join from the /go outcome ledger onto a channel plan.
 *
 *  A minted link carries whatever LABEL its mint door used — Distribuce writes
 *  "Instagram" / "Newsletter" / "LinkedIn" / "X / Twitter" — while the plan the
 *  tenant reads names the same places "Instagram (organicky)" and "E-mailový
 *  newsletter". A lowercase-and-trim equality join (the old `outcomeFor`) attached
 *  0 of the four Distribuce labels across all five seeded plans, so the measured
 *  badge never lit on the plan it was built to measure.
 *
 *  So the join goes through the repo's ONE channel vocabulary
 *  (`channelKeyFromLabel`, publishing/channel-key.ts) and the plan-regeneration
 *  identity fold (`foldChannelKey`, ./reconcile), in three tiers, each accepted only
 *  when exactly ONE plan channel matches (the false-merge guard reconcilePlanTracks
 *  uses — a guessed attachment is worse than none):
 *    1. the same name, case/whitespace-insensitive (what the old join accepted — so
 *       nothing that joined before stops joining);
 *    2. the same `foldChannelKey` identity ("Instagram" ≡ "Instagram (organicky)",
 *       "Firmy.cz" ≡ "Firmy.cz (Seznam)") — this is also what keeps a label that IS
 *       a plan channel's own name joined when two plan channels share a ChannelKey;
 *    3. the same NON-"other" ChannelKey ("Newsletter" ≡ "E-mailový newsletter").
 *       "other" (Firmy.cz, Heureka, Reddit…) is never a join key — two unrelated
 *       directories would merge on it.
 *  Whatever resolves to no single channel is returned in `unattributed`. Several
 *  outcome rows landing on one channel are summed (links, clicks; lastClickAt =
 *  max), so a rename or a second mint door never splits a channel's measurement.
 *
 *  Computed at read time: no store, blob or migration holds its answer. Pure and
 *  framework-free — the /kanaly table (a client component), the visibility plan
 *  and any later mint door (the Kanály playbook) all join through this function. */
import { channelKeyFromLabel } from "@/lib/publishing/channel-key";
import type { ChannelOutcome } from "./outcomes";
import { foldChannelKey } from "./reconcile";

export interface OutcomeJoin {
  /** plan channel id → the summed outcome of every row that joined it */
  byId: Record<string, ChannelOutcome>;
  /** outcome rows no single plan channel could claim — reported, never guessed */
  unattributed: ChannelOutcome[];
}

type PlanChannel = { id: string; name: string };

/** key → the one channel id holding it, or null when two or more do. */
function uniqueIndex(
  channels: readonly PlanChannel[],
  keyOf: (name: string) => string | null
): Map<string, string | null> {
  const index = new Map<string, string | null>();
  for (const c of channels) {
    const key = keyOf(c.name);
    if (!key) continue;
    index.set(key, index.has(key) ? null : c.id);
  }
  return index;
}

const exactKey = (name: string): string | null => name.trim().toLowerCase() || null;
const foldKey = (name: string): string | null => foldChannelKey(name) || null;
const vocabKey = (name: string): string | null => {
  const key = channelKeyFromLabel(name);
  return key === "other" ? null : key;
};
const TIERS = [exactKey, foldKey, vocabKey] as const;

/** The plan channel `label` resolves to, or null when no tier names exactly one. */
function resolve(label: string, indexes: readonly Map<string, string | null>[]): string | null {
  for (let i = 0; i < TIERS.length; i++) {
    const key = TIERS[i]!(label);
    if (!key) continue;
    const id = indexes[i]!.get(key);
    if (id) return id;
    // An AMBIGUOUS hit (null) falls through to the next tier, which answers only
    // if it names exactly one channel on its own; otherwise the label ends
    // unattributed.
  }
  return null;
}

/** Join ledger outcome rows onto a plan's channels. See the file header. */
export function joinOutcomesToPlan(
  channels: readonly PlanChannel[],
  outcomes: readonly ChannelOutcome[] | undefined
): OutcomeJoin {
  const byId: Record<string, ChannelOutcome> = {};
  const unattributed: ChannelOutcome[] = [];
  if (!outcomes || outcomes.length === 0) return { byId, unattributed };

  const indexes = TIERS.map((keyOf) => uniqueIndex(channels, keyOf));
  const nameOf = new Map(channels.map((c) => [c.id, c.name]));
  for (const o of outcomes) {
    const id = resolve(o.channel, indexes);
    if (!id) {
      unattributed.push(o);
      continue;
    }
    const prev = byId[id];
    const lastClickAt =
      prev?.lastClickAt && (!o.lastClickAt || prev.lastClickAt > o.lastClickAt) ? prev.lastClickAt : o.lastClickAt;
    byId[id] = {
      channel: nameOf.get(id) ?? o.channel,
      links: (prev?.links ?? 0) + o.links,
      clicks7d: (prev?.clicks7d ?? 0) + o.clicks7d,
      clicks30d: (prev?.clicks30d ?? 0) + o.clicks30d,
      ...(lastClickAt ? { lastClickAt } : {}),
    };
  }
  return { byId, unattributed };
}
