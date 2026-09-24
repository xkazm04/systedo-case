/** The ONE join from the /go outcome ledger onto a channel plan
 *  (src/lib/organic-channels/outcome-join.ts).
 *
 *  A minted link carries whatever LABEL its mint door used ("Instagram",
 *  "Newsletter" from Distribuce), while a seeded plan names the same channels
 *  "Instagram (organicky)" and "E-mailový newsletter". The old join was
 *  lowercase-and-trim equality, so across all five seeded plans it attached 0 of
 *  the four Distribuce labels. What this file pins:
 *
 *   • a Distribuce label reaches the seeded plan row it belongs to, through the
 *     repo's one channel vocabulary (publishing/channel-key.ts);
 *   • several outcome rows landing on one channel are SUMMED (lastClickAt = max);
 *   • the false-merge guard: a ChannelKey held by two plan channels joins neither,
 *     and the outcome is reported as unattributed instead of guessed;
 *   • "other" never merges on "other": those channels join only through the
 *     conservative foldChannelKey identity, unique on the plan side;
 *   • the coverage invariant over every seeded plan × every Distribuce label.
 *  Pure — no store, no React, no I/O. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./json-loader.mjs", import.meta.url);

const { joinOutcomesToPlan } = await import("@/lib/organic-channels/outcome-join");
const { outcomeFor } = await import("@/lib/organic-channels/outcomes");
const { baseChannelPlan } = await import("@/lib/organic-channels/sample");
const { channelKeyFromLabel } = await import("@/lib/publishing/channel-key");
const { REPURPOSE_CHANNELS } = await import("@/lib/distribution/generate");
const { PROJECT_TYPES } = await import("@/lib/projects/types");

const content = () => baseChannelPlan("content", {}, "x");
const plan = (...names) => names.map((name, i) => ({ id: `k${i}`, name }));

test("a Distribuce 'Instagram' outcome reaches the seeded 'Instagram (organicky)' row", () => {
  const out = joinOutcomesToPlan(content(), [{ channel: "Instagram", links: 1, clicks7d: 2, clicks30d: 5 }]);
  assert.equal(out.byId["instagram-organic"]?.clicks30d, 5);
  assert.deepEqual(out.unattributed, []);
});

test("a Distribuce 'Newsletter' outcome reaches the seeded 'E-mailový newsletter' row", () => {
  const channels = content();
  assert.equal(channels.find((c) => c.id === "newsletter")?.name, "E-mailový newsletter");
  const out = joinOutcomesToPlan(channels, [{ channel: "Newsletter", links: 1, clicks7d: 1, clicks30d: 2 }]);
  assert.equal(out.byId.newsletter?.clicks30d, 2);
});

test("outcome rows that land on one channel are summed into ONE row, lastClickAt = max", () => {
  const out = joinOutcomesToPlan(content(), [
    { channel: "Instagram", links: 2, clicks7d: 1, clicks30d: 5, lastClickAt: "2026-09-01" },
    { channel: "Instagram (organicky)", links: 1, clicks7d: 2, clicks30d: 3, lastClickAt: "2026-09-10" },
  ]);
  const row = out.byId["instagram-organic"];
  assert.ok(row);
  assert.equal(row.links, 3);
  assert.equal(row.clicks7d, 3);
  assert.equal(row.clicks30d, 8);
  assert.equal(row.lastClickAt, "2026-09-10");
  assert.equal(Object.keys(out.byId).length, 1, "one channel, one row");
});

test("ambiguity guard: a ChannelKey held by two plan channels joins neither", () => {
  const channels = [
    { id: "fb-skupiny", name: "Facebook skupiny" },
    { id: "fb-stranka", name: "Facebook stránka" },
  ];
  assert.equal(channelKeyFromLabel("Facebook skupiny"), "facebook");
  assert.equal(channelKeyFromLabel("Facebook stránka"), "facebook");
  const facebook = { channel: "Facebook", links: 1, clicks7d: 1, clicks30d: 7 };
  const out = joinOutcomesToPlan(channels, [facebook]);
  assert.equal("fb-skupiny" in out.byId, false);
  assert.equal("fb-stranka" in out.byId, false);
  assert.deepEqual(out.unattributed, [facebook], "unresolved is reported, never guessed");
});

test("ambiguity guard still lets a label that IS a plan channel's name join that channel", () => {
  // organic-B mints /go links from the Kanály playbook with the plan channel's own
  // name — an exact identity must survive a shared ChannelKey.
  const channels = [
    { id: "fb-skupiny", name: "Facebook skupiny" },
    { id: "fb-stranka", name: "Facebook stránka" },
  ];
  const out = joinOutcomesToPlan(channels, [{ channel: "Facebook skupiny", links: 1, clicks7d: 0, clicks30d: 3 }]);
  assert.equal(out.byId["fb-skupiny"]?.clicks30d, 3);
  assert.equal("fb-stranka" in out.byId, false);
});

test("'other' never merges on 'other' — Firmy.cz joins by fold, Heureka stays absent", () => {
  const channels = [
    { id: "firmy-cz", name: "Firmy.cz (Seznam)" },
    { id: "heureka", name: "Heureka" },
  ];
  assert.equal(channelKeyFromLabel("Firmy.cz (Seznam)"), "other");
  assert.equal(channelKeyFromLabel("Heureka"), "other");
  const out = joinOutcomesToPlan(channels, [{ channel: "Firmy.cz (Seznam)", links: 1, clicks7d: 0, clicks30d: 4 }]);
  assert.equal(out.byId["firmy-cz"]?.clicks30d, 4);
  assert.equal("heureka" in out.byId, false);

  const stray = { channel: "Zboží.cz", links: 1, clicks7d: 0, clicks30d: 9 };
  const miss = joinOutcomesToPlan(channels, [stray]);
  assert.deepEqual(miss.byId, {}, "an 'other' label with no fold identity attaches nowhere");
  assert.deepEqual(miss.unattributed, [stray]);
});

test("coverage invariant: every Distribuce label joins <= 1 seeded channel, and >= 1 when its key is in the plan", () => {
  let hits = 0;
  for (const type of PROJECT_TYPES) {
    const channels = baseChannelPlan(type, {}, "x");
    for (const label of REPURPOSE_CHANNELS) {
      const key = channelKeyFromLabel(label);
      const out = joinOutcomesToPlan(channels, [{ channel: label, links: 1, clicks7d: 1, clicks30d: 1 }]);
      const joined = Object.keys(out.byId).length;
      assert.ok(joined <= 1, `${type}/${label}: joined ${joined} channels`);
      const holders = channels.filter((c) => channelKeyFromLabel(c.name) === key);
      if (key !== "other" && holders.length > 0) {
        assert.equal(joined, 1, `${type}/${label}: the plan holds '${key}' but nothing joined`);
        assert.ok(holders.some((c) => c.id in out.byId), `${type}/${label}: joined the wrong channel`);
      }
      hits += joined;
    }
  }
  assert.ok(hits > 0, "the invariant is not vacuous: seeded plans do hold Distribuce channels");
});

test("outcomeFor is a wrapper over the join: 'Instagram' now answers for 'Instagram (organicky)'", () => {
  const outcomes = [{ channel: "Instagram", links: 1, clicks7d: 2, clicks30d: 5 }];
  assert.equal(outcomeFor(outcomes, "Instagram (organicky)")?.clicks30d, 5);
  assert.equal(outcomeFor(outcomes, "LinkedIn (organicky)"), null);
  assert.equal(outcomeFor(outcomes, "Heureka"), null);
});

test("plan helper sanity: a plan with no outcomes joins nothing", () => {
  const out = joinOutcomesToPlan(plan("Instagram"), []);
  assert.deepEqual(out, { byId: {}, unattributed: [] });
  assert.deepEqual(joinOutcomesToPlan(plan("Instagram"), undefined), { byId: {}, unattributed: [] });
});
