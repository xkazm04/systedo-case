/** Unit tests for the twin's pure policy layer (src/lib/twin/*).
 *
 *  Three things here are load-bearing and easy to get subtly wrong:
 *   - `decideDraft` is the ONLY gate between the model and an unreviewed outbound
 *     message. A regression that lets a risky draft self-approve is the worst bug
 *     this module can have, so it is pinned from every direction.
 *   - `resolveVoice` decides which trained voice a channel speaks in.
 *   - `sanitizeTwinState` is the wire boundary: the client POSTs the whole blob. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  avoidDirectives,
  channelConfig,
  decideDraft,
  DEFAULT_AUTO_THRESHOLD,
  rejectionPatterns,
  resolveVoice,
  sanitizeTwinState,
} from "@/lib/twin/types";
import { deriveReadiness, buildGaps } from "@/lib/twin/readiness";
import { sampleTwin } from "@/lib/twin/sample";
import { voiceToWire } from "@/lib/twin/wire";
import { voiceLines } from "@/lib/ai/tools/voice";

const cfg = (over = {}) => ({
  channel: "email",
  enabled: true,
  autonomy: "auto",
  connector: "manual",
  autoThreshold: 80,
  ...over,
});

// --- decideDraft: the autonomy gate ---------------------------------------

test("decideDraft: only `auto` above the bar with zero risks self-approves", () => {
  const clean = { confidence: 90, risks: [] };
  const r = decideDraft(cfg(), clean);
  assert.equal(r.status, "approved");
  assert.equal(r.autoApproved, true);
});

test("decideDraft: a flagged risk always forces human review, however confident", () => {
  const r = decideDraft(cfg(), { confidence: 100, risks: ["Slibuje termín."] });
  assert.equal(r.status, "pending", "a risk must beat a perfect confidence score");
  assert.equal(r.autoApproved, false);
});

test("decideDraft: confidence below the channel's bar stays pending", () => {
  assert.equal(decideDraft(cfg({ autoThreshold: 80 }), { confidence: 79, risks: [] }).status, "pending");
  assert.equal(decideDraft(cfg({ autoThreshold: 80 }), { confidence: 80, risks: [] }).status, "approved", "the bar is inclusive");
});

test("decideDraft: `review` and `assist` never self-approve, even on a perfect draft", () => {
  const perfect = { confidence: 100, risks: [] };
  for (const autonomy of ["review", "assist"]) {
    const r = decideDraft(cfg({ autonomy }), perfect);
    assert.equal(r.status, "pending", `${autonomy} must not self-approve`);
    assert.equal(r.autoApproved, false);
  }
});

// --- resolveVoice ----------------------------------------------------------

const voice = (scope, directives = "Piš věcně.") => ({
  scope,
  directives,
  traits: [],
  lengthHint: "",
  constraints: [],
  examples: [],
  updatedAt: "1970-01-01T00:00:00.000Z",
});

test("resolveVoice: a channel's own voice wins, else the generic register, else null", () => {
  const voices = [voice("generic"), voice("email", "Vykej.")];
  assert.equal(resolveVoice(voices, "email").scope, "email");
  assert.equal(resolveVoice(voices, "chat").scope, "generic", "falls back to generic");
  assert.equal(resolveVoice([], "chat"), null, "nothing trained → null");
});

test("resolveVoice: an explicit override borrows another channel's register", () => {
  const voices = [voice("generic"), voice("email", "Vykej."), voice("sms", "Buď úsečný.")];
  assert.equal(resolveVoice(voices, "email", "sms").scope, "sms");
});

// --- rejection feedback loop ----------------------------------------------

const draft = (over = {}) => ({
  id: "d", channel: "email", contact: "", inbound: "", reply: "x", questions: [],
  confidence: 0, risks: [], status: "rejected", autoApproved: false,
  createdAt: "1970-01-01T00:00:00.000Z", ...over,
});

test("rejectionPatterns tallies only rejected drafts on the asked-for channel, most-common first", () => {
  const drafts = [
    draft({ rejectReason: "too_long" }),
    draft({ rejectReason: "too_long" }),
    draft({ rejectReason: "off_brand" }),
    draft({ rejectReason: "inaccurate", channel: "chat" }),
    draft({ rejectReason: "risky_claim", status: "approved" }),
    draft({ rejectReason: undefined }),
  ];
  const p = rejectionPatterns(drafts, "email");
  assert.deepEqual(p, [
    { reason: "too_long", count: 2 },
    { reason: "off_brand", count: 1 },
  ]);
  assert.equal(rejectionPatterns(drafts).length, 3, "no channel filter → every channel");
});

test("avoidDirectives turns the top-N tally into prompt instructions", () => {
  const out = avoidDirectives([
    { reason: "too_long", count: 3 },
    { reason: "off_brand", count: 2 },
    { reason: "inaccurate", count: 1 },
    { reason: "wrong_tone", count: 1 },
  ]);
  assert.equal(out.length, 3, "capped at 3 by default");
  assert.match(out[0], /kratší/);
});

// --- channelConfig ---------------------------------------------------------

test("channelConfig invents a safe, supervised default for an unconfigured channel", () => {
  const c = channelConfig([], "whatsapp");
  assert.equal(c.enabled, false);
  assert.equal(c.autonomy, "assist", "never `auto` by default");
  assert.equal(c.connector, "manual");
  assert.equal(c.autoThreshold, DEFAULT_AUTO_THRESHOLD);
});

// --- readiness -------------------------------------------------------------

test("deriveReadiness: the seeded sample twin is honestly reported as untrained", () => {
  const r = deriveReadiness(sampleTwin("leadgen"), { offerings: 0 });
  const by = Object.fromEntries(r.milestones.map((m) => [m.milestone, m.level]));
  assert.equal(by.grounding, "empty", "no catalog");
  assert.equal(by.voice, "partial", "generic register only");
  assert.equal(by.training, "empty", "no seeded style facts — a fake tick would be a lie");
  assert.equal(by.activity, "empty");
  assert.ok(r.score > 0 && r.score < 100, `score should be partial, got ${r.score}`);
});

test("deriveReadiness: a fully trained twin scores 100", () => {
  const state = {
    voices: [voice("generic"), { ...voice("email"), constraints: [
      { kind: "do", rule: "a" }, { kind: "dont", rule: "b" }, { kind: "do", rule: "c" },
    ] }],
    channels: [cfg()],
    facts: Array.from({ length: 5 }, (_, i) => ({
      id: `f${i}`, scope: "email", question: "", answer: "a", source: "sample", createdAt: "1970-01-01T00:00:00.000Z",
    })),
    drafts: [draft({ status: "sent" })],
  };
  const r = deriveReadiness(state, { offerings: 3 });
  assert.equal(r.score, 100);
  assert.deepEqual(buildGaps(r), [], "no gaps at 100");
});

test("buildGaps ranks empty milestones before partial ones", () => {
  const r = deriveReadiness(sampleTwin("eshop"), { offerings: 1 });
  const gaps = buildGaps(r);
  const firstPartial = gaps.findIndex((g) => g.level === "partial");
  const lastEmpty = gaps.map((g) => g.level).lastIndexOf("empty");
  if (firstPartial !== -1 && lastEmpty !== -1) {
    assert.ok(lastEmpty < firstPartial, "every empty gap outranks every partial one");
  }
  assert.ok(gaps.every((g) => g.delta > 0), "each gap recovers something");
});

// --- wire conversion -------------------------------------------------------

test("voiceToWire splits the tagged constraint list into always/never and drops empties", () => {
  const w = voiceToWire({
    scope: "email",
    directives: "  Vykej.  ",
    traits: ["věcný"],
    lengthHint: "",
    constraints: [
      { kind: "do", rule: "Poděkuj" },
      { kind: "dont", rule: "Neslibuj cenu" },
      { kind: "do", rule: "Nabídni termín" },
    ],
    examples: [],
    updatedAt: "1970-01-01T00:00:00.000Z",
  });
  assert.equal(w.directives, "Vykej.");
  assert.deepEqual(w.always, ["Poděkuj", "Nabídni termín"]);
  assert.deepEqual(w.never, ["Neslibuj cenu"]);
  assert.equal("lengthHint" in w, false, "a blank hint is omitted, not sent as ''");
});

// --- the shared voice prompt block -----------------------------------------

test("voiceLines is empty for an untrained twin, so each tool's own rules govern", () => {
  assert.deepEqual(voiceLines(undefined), []);
  assert.deepEqual(voiceLines({}), [], "an empty voice contributes no prompt lines");
});

test("voiceLines renders directives, traits, length and the always/never rules", () => {
  const out = voiceLines({
    directives: "Vykej.",
    traits: ["věcný", "vřelý"],
    lengthHint: "2–4 věty",
    always: ["Poděkuj"],
    never: ["Neslibuj cenu"],
  }).join("\n");
  assert.match(out, /Vykej\./);
  assert.match(out, /Rysy hlasu: věcný, vřelý/);
  assert.match(out, /2–4 věty/);
  assert.match(out, /VŽDY:\n- Poděkuj/);
  assert.match(out, /NIKDY:\n- Neslibuj cenu/);
});

test("voiceLines takes a heading, so a post is not phrased as a reply", () => {
  const out = voiceLines({ directives: "Vykej." }, "Hlas značky v příspěvcích:").join("\n");
  assert.match(out, /Hlas značky v příspěvcích:/);
  assert.doesNotMatch(out, /na tomto kanálu/);
});

// --- wire sanitizer --------------------------------------------------------

test("sanitizeTwinState coerces junk, dedupes by scope/channel and drops replyless drafts", () => {
  const s = sanitizeTwinState({
    voices: [
      { scope: "email", directives: "první" },
      { scope: "email", directives: "druhá" },
      { scope: "nonsense", directives: "zahozeno" },
    ],
    channels: [
      { channel: "email", enabled: true, autonomy: "sudo", autoThreshold: 9000 },
      { channel: "pigeon", enabled: true },
    ],
    facts: [{ answer: "ok" }, { answer: "" }],
    drafts: [{ channel: "email", reply: "text" }, { channel: "email" }, { channel: "pigeon", reply: "x" }],
    junk: "ignored",
  });
  assert.equal(s.voices.length, 1, "one voice per scope; unknown scope dropped");
  assert.equal(s.voices[0].directives, "druhá", "last write per scope wins");
  assert.equal(s.channels.length, 1, "unknown channel dropped");
  assert.equal(s.channels[0].autonomy, "assist", "an unknown autonomy falls back to supervised");
  assert.equal(s.channels[0].autoThreshold, 100, "threshold clamped into range");
  assert.equal(s.facts.length, 1, "a fact with no answer is not a fact");
  assert.equal(s.drafts.length, 1, "a draft with no reply / unknown channel is dropped");
});

test("sanitizeTwinState never trusts a client-claimed `sent`/`approved` shape into a bad status", () => {
  const s = sanitizeTwinState({
    drafts: [{ channel: "email", reply: "x", status: "definitely-sent", confidence: -50, autoApproved: "yes" }],
  });
  assert.equal(s.drafts[0].status, "pending", "an unknown status degrades to pending, not approved");
  assert.equal(s.drafts[0].confidence, 0, "confidence clamped to 0..100");
  assert.equal(s.drafts[0].autoApproved, false, "a truthy string is not `true`");
});
