/** Pins the channel-lifecycle model (ChannelTrack) and the signpost derivation:
 *  legacy flat-status blobs migrate onto stages, sanitizers stay bounded, and
 *  deriveChannelNext computes the one next step from stored intent + the twin
 *  modules' real state (readiness is derived, never persisted). */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeTrack,
  sanitizeChannelState,
  channelKind,
  planProvenance,
  competitorsGrounding,
} from "@/lib/organic-channels/types";
import {
  deriveChannelNext,
  suggestedMode,
  suggestedTwinScope,
} from "@/lib/organic-channels/next-step";

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

const ctx = (over = {}) => ({
  trainedScopes: [],
  enabledTwinChannels: [],
  pendingByChannel: {},
  ...over,
});

test("channelKind maps every category onto a lifecycle kind", () => {
  assert.equal(channelKind("directory"), "listing");
  assert.equal(channelKind("marketplace"), "listing");
  assert.equal(channelKind("community"), "conversational");
  assert.equal(channelKind("social"), "conversational");
  assert.equal(channelKind("pr"), "pr");
  assert.equal(channelKind("partnership"), "pr");
  assert.equal(channelKind("content"), "content");
});

test("sanitizeTrack migrates legacy flat statuses", () => {
  assert.deepEqual(sanitizeTrack("active"), { stage: "live" });
  assert.deepEqual(sanitizeTrack("done"), { stage: "done" });
  assert.equal(sanitizeTrack("not-started"), null);
  assert.equal(sanitizeTrack("garbage"), null);
});

test("sanitizeTrack coerces a wire track and drops the identified default", () => {
  const t = sanitizeTrack({
    stage: "planned",
    mode: "twin",
    twinScope: "social",
    inboxSource: "manual",
    maxPerWeek: 99,
    decidedAt: "2026-08-07T00:00:00.000Z",
    extra: "dropped",
  });
  assert.deepEqual(t, {
    stage: "planned",
    mode: "twin",
    twinScope: "social",
    inboxSource: "manual",
    maxPerWeek: 14, // clamped
    decidedAt: "2026-08-07T00:00:00.000Z",
  });
  assert.equal(sanitizeTrack({ stage: "identified" }), null);
  assert.equal(sanitizeTrack({ stage: "nonsense", mode: "twin" }), null);
});

test("sanitizeChannelState reads tracks, migrates legacy statuses maps, stays bounded", () => {
  const current = sanitizeChannelState({ tracks: { a: { stage: "live", mode: "manual" } } });
  assert.deepEqual(current.tracks, { a: { stage: "live", mode: "manual" } });

  const legacy = sanitizeChannelState({ statuses: { a: "active", b: "done", c: "not-started" } });
  assert.deepEqual(legacy.tracks, { a: { stage: "live" }, b: { stage: "done" } });

  const flood = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`k${i}`, { stage: "live" }]));
  assert.equal(Object.keys(sanitizeChannelState({ tracks: flood }).tracks).length, 64);
});

test("plan provenance: the sample gutter follows the source, a pinned plan carries its generation time", () => {
  // Seeded fallback (a real tenant who never pinned a plan) → the standard
  // sample gutter, exactly like every other seeded module.
  assert.deepEqual(planProvenance({ source: "sample" }), { sample: true });
  // A degraded read shows the read-only sample → it wears the gutter too.
  assert.deepEqual(planProvenance({ source: "sample", updatedAt: "2026-08-01T00:00:00.000Z" }), {
    sample: true,
  });
  // A pinned AI plan: no sample gutter, but it discloses WHEN it was generated.
  assert.deepEqual(planProvenance({ source: "ai", updatedAt: "2026-08-01T00:00:00.000Z" }), {
    sample: false,
    generatedAt: "2026-08-01T00:00:00.000Z",
  });
  assert.deepEqual(planProvenance({ source: "ai" }), { sample: false });
});

test("competitor grounding: a FAILED read is distinct from a tenant with none", () => {
  assert.equal(competitorsGrounding(false, ["Rival s.r.o."]), "ok");
  assert.equal(competitorsGrounding(false, []), "none"); // genuinely no competitors
  assert.equal(competitorsGrounding(true, []), "unavailable"); // read failed — degraded
});

test("wizard suggestions follow the channel kind", () => {
  assert.equal(suggestedMode(ch({ category: "directory" })), "manual");
  assert.equal(suggestedMode(ch({ category: "community" })), "twin");
  assert.equal(suggestedTwinScope(ch({ category: "pr" })), "email");
  assert.equal(suggestedTwinScope(ch({ category: "community" })), "social");
});

test("identified/paused/done stages short-circuit", () => {
  assert.deepEqual(deriveChannelNext(ch(), undefined, ctx()), { key: "decide" });
  assert.deepEqual(deriveChannelNext(ch(), { stage: "paused" }, ctx()), { key: "resume" });
  assert.deepEqual(deriveChannelNext(ch(), { stage: "done" }, ctx()), { key: "none" });
});

test("planned twin channel walks blockers in order: voice → enable → inbox → live", () => {
  const track = { stage: "planned", mode: "twin", twinScope: "social" };
  assert.deepEqual(deriveChannelNext(ch(), track, ctx()), { key: "train-voice", to: "twin" });
  assert.deepEqual(
    deriveChannelNext(ch(), track, ctx({ trainedScopes: ["social"] })),
    { key: "enable-channel", to: "sprava-kanalu" }
  );
  assert.deepEqual(
    deriveChannelNext(ch(), track, ctx({ trainedScopes: ["social"], enabledTwinChannels: ["social"] })),
    { key: "set-inbox" }
  );
  assert.deepEqual(
    deriveChannelNext(
      ch(),
      { ...track, inboxSource: "manual" },
      ctx({ trainedScopes: ["social"], enabledTwinChannels: ["social"] })
    ),
    { key: "go-live" }
  );
  // A non-conversational twin channel needs no inbox step.
  assert.deepEqual(
    deriveChannelNext(
      ch({ category: "pr" }),
      { stage: "planned", mode: "twin", twinScope: "email" },
      ctx({ trainedScopes: ["email"], enabledTwinChannels: ["email"] })
    ),
    { key: "go-live" }
  );
});

test("planned manual channel points at the playbook", () => {
  assert.deepEqual(
    deriveChannelNext(ch({ category: "directory" }), { stage: "planned", mode: "manual" }, ctx()),
    { key: "first-action" }
  );
});

test("live stage routes by kind: listing closes, conversational checks inbox, content creates", () => {
  assert.deepEqual(
    deriveChannelNext(ch({ category: "directory" }), { stage: "live", mode: "manual" }, ctx()),
    { key: "mark-done" }
  );
  // `scope` rides along so the schranka CTA can open the picker on the exact
  // twin channel it counted pending drafts for.
  assert.deepEqual(
    deriveChannelNext(
      ch(),
      { stage: "live", mode: "twin", twinScope: "social" },
      ctx({ pendingByChannel: { social: 3 } })
    ),
    { key: "check-inbox", to: "schranka", scope: "social", count: 3 }
  );
  // Manual conversational without an inbox source keeps producing instead.
  assert.deepEqual(
    deriveChannelNext(ch({ category: "social" }), { stage: "live", mode: "manual" }, ctx()),
    { key: "create-content", to: "socialni" }
  );
  assert.deepEqual(
    deriveChannelNext(ch({ category: "content" }), { stage: "live", mode: "manual" }, ctx()),
    { key: "create-content", to: "obsahovy-engine" }
  );
});

test("the signpost keeps its promises: no CTA targets a module the project type lacks", async () => {
  const { isModuleAvailable } = await import("@/lib/projects/modules");
  // The real leadgen case: the seeded plan ships LinkedIn (category "social"),
  // but `socialni` is not a leadgen module — pre-fix the CTA landed on notFound().
  const leadgenGate = (key) => isModuleAvailable("leadgen", key);
  assert.equal(isModuleAvailable("leadgen", "socialni"), false); // the premise
  assert.deepEqual(
    deriveChannelNext(
      ch({ id: "linkedin-organic", category: "social" }),
      { stage: "live", mode: "manual" },
      ctx(),
      leadgenGate
    ),
    // The content engine (available for every type) is the honest fallback.
    { key: "create-content", to: "obsahovy-engine" }
  );
  // A type that HAS the social planner keeps the social deep link.
  assert.deepEqual(
    deriveChannelNext(
      ch({ category: "social" }),
      { stage: "live", mode: "manual" },
      ctx(),
      (key) => isModuleAvailable("eshop", key)
    ),
    { key: "create-content", to: "socialni" }
  );
  // The generic guard: an unavailable target with no equivalent module falls
  // back to working the channel here (the playbook), never to a 404.
  assert.deepEqual(
    deriveChannelNext(
      ch(),
      { stage: "planned", mode: "twin", twinScope: "social" },
      ctx(),
      () => false
    ),
    { key: "first-action" }
  );
});
