/** Pins ONE definition of "trained" (and "enabled") across the communication
 *  surfaces: the Kanály signpost context is built from the same predicates the
 *  Twin header pill reads (`hasTrainedVoice` / `voiceTrainedAt`), and the
 *  enabled-channel gate counts only tenant-chosen channel config — never the
 *  seed's `enabled: true` defaults nobody chose. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSignpostContext, deriveChannelNext } from "@/lib/organic-channels/next-step";
import { sampleTwin } from "@/lib/twin/sample";
import { hasTrainedVoice } from "@/lib/twin/voice-age";

const EPOCH = new Date(0).toISOString();
const REAL_STAMP = "2026-08-01T00:00:00.000Z";

const ch = (over = {}) => ({
  id: "kanal",
  name: "Kanál",
  category: "community",
  fit: 80,
  effort: "low",
  rationale: "",
  payoff: "",
  firstActions: [],
  ...over,
});

const voice = (scope, over = {}) => ({
  scope,
  directives: "Piš lidsky a věcně.",
  traits: [],
  lengthHint: "2–4 věty",
  constraints: [],
  examples: [],
  updatedAt: REAL_STAMP,
  ...over,
});

const channelCfg = (channel, over = {}) => ({
  channel,
  enabled: true,
  autonomy: "assist",
  connector: "manual",
  autoThreshold: 0.8,
  ...over,
});

/** Mirror of resolveTwin's per-scope merge: saved rows win, seed fills gaps. */
const mergeVoices = (saved, seeded) => {
  const byScope = new Map();
  for (const v of seeded) byScope.set(v.scope, v);
  for (const v of saved) byScope.set(v.scope, v);
  return [...byScope.values()];
};

test("seeded-only twin: nothing counts as trained or enabled (seed defaults are not choices)", () => {
  const seeded = sampleTwin("local"); // seeds leads+reviews channels enabled:true
  const ctx = buildSignpostContext({ state: seeded, trainedScopes: [] }, null);

  assert.deepEqual(ctx.trainedScopes, []);
  // Pre-fix, the seed's enabled:true channels leaked through here.
  assert.deepEqual(ctx.enabledTwinChannels, []);
  // The signpost and the Twin header pill agree on the same resolved state.
  assert.equal(hasTrainedVoice(seeded.voices), ctx.trainedScopes.length > 0);

  // A planned twin channel therefore starts at "train the voice", not further.
  assert.deepEqual(
    deriveChannelNext(ch(), { stage: "planned", mode: "twin", twinScope: "reviews" }, ctx),
    { key: "train-voice", to: "twin" }
  );
});

test("a saved-but-EPOCH-stamped or emptied voice does NOT count as trained", () => {
  const seeded = sampleTwin("eshop");
  for (const savedVoice of [
    voice("social", { updatedAt: EPOCH }), // seed-stamped row
    voice("social", { directives: "   " }), // emptied editor row
  ]) {
    const state = { ...seeded, voices: mergeVoices([savedVoice], seeded.voices) };
    const ctx = buildSignpostContext({ state, trainedScopes: ["social"] }, { channels: [] });
    assert.deepEqual(ctx.trainedScopes, []);
    // Header pill agreement holds for the untrained cases too.
    assert.equal(hasTrainedVoice(state.voices), ctx.trainedScopes.length > 0);
  }
});

test("a seeded sample voice merged under a saved state never counts (trainedScopes gate)", () => {
  const seeded = sampleTwin("eshop");
  // The tenant saved ONLY a channel toggle: resolveTwin reports source "trained"
  // and merges the seeded generic voice in, but trainedScopes stays voice-less.
  const saved = { channels: [channelCfg("email")] };
  const state = { ...seeded, channels: saved.channels };
  const ctx = buildSignpostContext({ state, trainedScopes: [] }, saved);

  assert.deepEqual(ctx.trainedScopes, []);
  // ...while the tenant-chosen channel DOES pass the enabled gate.
  assert.deepEqual(ctx.enabledTwinChannels, ["email"]);
});

test("a trained tenant's true state still derives go-live", () => {
  const seeded = sampleTwin("eshop");
  const savedVoice = voice("social");
  const saved = {
    voices: [savedVoice],
    channels: [channelCfg("social"), channelCfg("email", { enabled: false })],
    facts: [],
    drafts: [{ status: "pending", channel: "social" }],
  };
  const state = {
    voices: mergeVoices(saved.voices, seeded.voices),
    channels: saved.channels,
    facts: saved.facts,
    drafts: saved.drafts,
  };
  const ctx = buildSignpostContext({ state, trainedScopes: ["social"] }, saved);

  assert.deepEqual(ctx.trainedScopes, ["social"]);
  assert.deepEqual(ctx.enabledTwinChannels, ["social"]); // disabled email excluded
  assert.deepEqual(ctx.pendingByChannel, { social: 1 });
  assert.equal(hasTrainedVoice(state.voices), ctx.trainedScopes.length > 0);

  assert.deepEqual(
    deriveChannelNext(
      ch(),
      { stage: "planned", mode: "twin", twinScope: "social", inboxSource: "manual" },
      ctx
    ),
    { key: "go-live" }
  );
});
