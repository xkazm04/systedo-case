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
import { asApproved, asRejected, asSent, buildDraft, upsertDraft } from "@/lib/twin/banking";
import {
  HOT_DRAFTS_CAP,
  isTerminal,
  overflowCount,
  partitionDrafts,
  RECENT_TERMINAL_WINDOW,
  TWIN_ARCHIVE_CAP,
  withArchivedRejects,
} from "@/lib/twin/archive";
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

// --- banking: the shared draft lifecycle ----------------------------------

const seed = (over = {}) => ({
  channel: "leads",
  contact: "Jana",
  inbound: "Máte volný termín?",
  reply: "Dobrý den, ozvu se s termínem.",
  questions: ["Kdy se vám to hodí?"],
  confidence: 90,
  risks: [],
  ...over,
});

test("buildDraft runs the SAME autonomy gate every channel uses", () => {
  const autoOk = buildDraft(cfg(), seed(), "id1", "2026-07-15T00:00:00.000Z");
  assert.equal(autoOk.status, "approved", "auto + confident + risk-free self-approves");
  assert.equal(autoOk.autoApproved, true);
  assert.equal(autoOk.decidedAt, "2026-07-15T00:00:00.000Z", "a machine decision is stamped");

  const risky = buildDraft(cfg(), seed({ risks: ["Slibuje termín."] }), "id2", "2026-07-15T00:00:00.000Z");
  assert.equal(risky.status, "pending", "a risk forces human review");
  assert.equal(risky.autoApproved, false);
  assert.equal("decidedAt" in risky, false, "a pending draft isn't decided yet");

  const supervised = buildDraft(cfg({ autonomy: "assist" }), seed(), "id3", "2026-07-15T00:00:00.000Z");
  assert.equal(supervised.status, "pending", "assist never self-approves");
});

test("asApproved/asRejected/asSent are the pure status transitions", () => {
  const base = buildDraft(cfg({ autonomy: "assist" }), seed(), "id", "2026-07-15T00:00:00.000Z");
  const now = "2026-07-16T00:00:00.000Z";

  const app = asApproved(base, now);
  assert.equal(app.status, "approved");
  assert.equal(app.autoApproved, false, "a human approval is never an auto-approval");
  assert.equal(app.decidedAt, now);

  const rej = asRejected(base, now, "too_long", "  zkrať to  ");
  assert.equal(rej.status, "rejected");
  assert.equal(rej.rejectReason, "too_long", "the counted reason feeds rejectionPatterns");
  assert.equal(rej.rejectNote, "zkrať to", "the free note is trimmed");
  assert.equal(asRejected(base, now, "off_brand").rejectNote, undefined, "an empty note is omitted");

  const sent = asSent(app, now);
  assert.equal(sent.status, "sent");
  assert.equal(sent.sentAt, now);
});

test("upsertDraft appends a new draft but FLIPS one with the same id (no double-count)", () => {
  const a = buildDraft(cfg(), seed(), "keep", "2026-07-15T00:00:00.000Z");
  const drafts = [a];
  const appended = upsertDraft(drafts, buildDraft(cfg(), seed(), "new", "2026-07-15T00:00:00.000Z"));
  assert.equal(appended.length, 2, "a fresh id appends");

  const flipped = upsertDraft(drafts, asRejected(a, "2026-07-16T00:00:00.000Z", "off_brand"));
  assert.equal(flipped.length, 1, "the same id replaces in place");
  assert.equal(flipped[0].status, "rejected", "the record is overturned, not duplicated");
});

test("a banked+sent lead draft ticks the `activity` readiness milestone", () => {
  const state = { ...sampleTwin("leadgen"), drafts: [] };
  const before = deriveReadiness(state, { offerings: 0 });
  assert.equal(before.milestones.find((m) => m.milestone === "activity").level, "empty");

  const leadSent = asSent(buildDraft(cfg({ channel: "leads" }), seed(), "d", "2026-07-15T00:00:00.000Z"), "2026-07-15T00:01:00.000Z");
  const after = deriveReadiness({ ...state, drafts: [leadSent] }, { offerings: 0 });
  assert.equal(
    after.milestones.find((m) => m.milestone === "activity").level,
    "complete",
    "a sent lead draft is real activity — the milestone the leads inbox never used to reach"
  );
});

// --- archival: the hot ⇄ history split -------------------------------------

const term = (id, status, over = {}) =>
  draft({ id, status, createdAt: `2026-07-15T00:00:${String(id).padStart(2, "0")}.000Z`, ...over });
const live = (id, status = "pending") =>
  draft({ id, status, reply: "x", createdAt: `2026-07-15T00:00:${String(id).padStart(2, "0")}.000Z` });

test("isTerminal marks sent/rejected as audit records, pending/approved as live", () => {
  assert.equal(isTerminal(draft({ status: "sent" })), true);
  assert.equal(isTerminal(draft({ status: "rejected" })), true);
  assert.equal(isTerminal(draft({ status: "pending" })), false);
  assert.equal(isTerminal(draft({ status: "approved" })), false);
});

test("partitionDrafts keeps live + a recent-terminal window, archives the older terminal rest", () => {
  // window+5 terminal drafts + 2 live, with a tiny window to force archival.
  const terminal = Array.from({ length: 8 }, (_, i) => term(i + 1, i % 2 ? "sent" : "rejected"));
  const liveDrafts = [live(90, "pending"), live(91, "approved")];
  const { hot, archive } = partitionDrafts([...terminal, ...liveDrafts], 3, 100);

  // every live draft stays hot, regardless of the window
  assert.ok(liveDrafts.every((d) => hot.some((h) => h.id === d.id)), "live work is never archived");
  // exactly `window` newest terminal stay hot; the older 5 archive
  const hotTerminal = hot.filter(isTerminal);
  assert.equal(hotTerminal.length, 3, "the recent-terminal window is kept hot");
  assert.deepEqual(hotTerminal.map((d) => d.id), [6, 7, 8], "the NEWEST terminal drafts are the ones kept");
  assert.equal(archive.length, 5, "older terminal drafts archive out");
  assert.deepEqual(archive.map((d) => d.id), [1, 2, 3, 4, 5]);
  // hot preserves the original chronological order
  assert.deepEqual(hot.map((d) => d.id), [6, 7, 8, 90, 91]);
});

test("partitionDrafts archives nothing when terminal drafts fit the window", () => {
  const drafts = [live(1), term(2, "sent"), term(3, "rejected")];
  const { hot, archive } = partitionDrafts(drafts, RECENT_TERMINAL_WINDOW, HOT_DRAFTS_CAP);
  assert.equal(archive.length, 0, "under the window, nothing leaves the hot blob");
  assert.equal(hot.length, 3);
});

test("partitionDrafts caps the hot window by the room the blob has after live work", () => {
  // cap 5, 4 live drafts → room for only 1 terminal even though the window is larger.
  const drafts = [live(1), live(2), live(3), live(4), term(5, "sent"), term(6, "rejected")];
  const { hot, archive } = partitionDrafts(drafts, RECENT_TERMINAL_WINDOW, 5);
  assert.equal(hot.filter(isTerminal).length, 1, "only 1 terminal fits under the cap");
  assert.deepEqual(hot.filter(isTerminal).map((d) => d.id), [6], "and it is the newest one");
  assert.equal(archive.length, 1);
});

test("partitionDrafts never archives live work even past the cap (blob runs over, no loss)", () => {
  const drafts = Array.from({ length: 7 }, (_, i) => live(i + 1, "pending"));
  const { hot, archive } = partitionDrafts(drafts, RECENT_TERMINAL_WINDOW, 5);
  assert.equal(archive.length, 0, "pending work is never evicted");
  assert.equal(hot.length, 7, "the blob is allowed to run over rather than lose live drafts");
});

test("overflowCount is the eviction decision, apart from the SQL that performs it", () => {
  assert.equal(overflowCount(1003, TWIN_ARCHIVE_CAP), 3);
  assert.equal(overflowCount(TWIN_ARCHIVE_CAP, TWIN_ARCHIVE_CAP), 0);
  assert.equal(overflowCount(5, TWIN_ARCHIVE_CAP), 0);
});

test("withArchivedRejects folds history into the tally, de-duped by id", () => {
  const hot = [draft({ id: "a", status: "rejected", rejectReason: "too_long" })];
  const archived = [
    draft({ id: "a", status: "rejected", rejectReason: "too_long" }), // dup of hot — must not double-count
    draft({ id: "z", status: "rejected", rejectReason: "off_brand" }),
  ];
  const merged = withArchivedRejects(hot, archived);
  assert.equal(merged.length, 2, "the overlapping id is not counted twice");
  assert.equal(withArchivedRejects(hot, []), hot, "no archive → the hot list unchanged");
  // the fold is exactly what keeps rejectionPatterns from regressing as rejects age out
  const p = rejectionPatterns(merged);
  assert.deepEqual(p, [
    { reason: "too_long", count: 1 },
    { reason: "off_brand", count: 1 },
  ]);
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
