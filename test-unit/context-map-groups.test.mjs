/** The context map's GROUP names have to be decidable (zero-dependency, blocking).
 *
 *  CLAUDE.md tells every agent to read `context-map.json` at task start and scope
 *  its edits to the relevant context's files. That instruction is only executable
 *  if the reader can tell the groups apart, and until 2026-09-02 it could not: the
 *  2026-07-30 scan produced "AI & Content Engine" next to "AI & Content
 *  Generation", "Campaign Management" next to "Campaign & Ads Management",
 *  "Analytics & Reporting" next to "Performance & Analytics" and "Social Media"
 *  next to "Social & Content Publishing" — four pairs with nothing in the names to
 *  decide between them. The evidence that this was noise rather than architecture
 *  is that everything downstream had already worked around it: .github/
 *  group-owners.json gave each twin the same owner, the same triage rank and a
 *  `why` that said so out loud ("which one is an artefact of the scan rather than
 *  a decision"), and .claude/architect/config.md and .claude/explorer/config.md
 *  both re-merged the pairs by hand into the menu they actually offer.
 *
 *  The four merges are the fix. This file is what stops it coming back — a scan
 *  regenerates that map, so a rule nobody enforces would last exactly one rescan.
 *
 *    G1  the map is internally consistent: every context names a group that
 *        exists, `group_id` agrees with that group's `id`, and `context_count`
 *        is the number of contexts that actually claim it. A count nobody
 *        recomputes is how "116" and "117" coexisted in one file.
 *    G2  `stats` agrees with the arrays it summarises.
 *    G3  every group states its `$scope` — what belongs in it, in a sentence.
 *        `$`-prefixed keys are this team's; the rest are the scanner's.
 *    G4  no two group names are CONFUSABLE: neither name's significant tokens
 *        are a subset of another's, and no two share more than one token. That
 *        is the shape all four merged pairs had.
 *    G5  and where two names legitimately share ONE token — Site, Shell,
 *        Management, Content, Catalog all appear twice on purpose — each side
 *        names the other in `$notTo` with the question that decides it. A
 *        collision an agent cannot resolve from the map is the whole complaint,
 *        whether or not the names are twins.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const map = JSON.parse(readFileSync(join(ROOT, "context-map.json"), "utf8"));

const groups = Array.isArray(map.groups) ? map.groups : [];
const contexts = Array.isArray(map.contexts) ? map.contexts : [];

/** Words that carry no distinguishing weight in a group name. */
const STOPWORDS = new Set(["and", "the", "of", "a", "for"]);

/** The significant tokens of a group name, lowercased. */
export const tokens = (name) =>
  String(name)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !STOPWORDS.has(t));

const isSubset = (a, b) => a.every((t) => b.includes(t));

/** Why two names cannot be told apart, or null when they can. */
export function confusable(a, b) {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.length || !tb.length) return "one of the names has no significant words in it";
  if (isSubset(ta, tb) || isSubset(tb, ta)) {
    return "every significant word of one name is in the other, so the shorter name never rules the longer one out";
  }
  const shared = ta.filter((t) => tb.includes(t));
  if (shared.length > 1) {
    return `they share ${shared.length} of their significant words (${shared.join(", ")})`;
  }
  return null;
}

const byName = new Map(groups.map((g) => [g.name, g]));

test("G1 — the map is internally consistent about which context is in which group", () => {
  assert.ok(groups.length, "context-map.json declares no groups.");
  assert.equal(new Set(groups.map((g) => g.name)).size, groups.length, "two groups share a name.");
  assert.equal(new Set(groups.map((g) => g.id)).size, groups.length, "two groups share an id.");

  const counted = new Map();
  for (const ctx of contexts) {
    const group = byName.get(ctx.group);
    assert.ok(
      group,
      `context "${ctx.name}" is in group "${ctx.group}", which context-map.json does not declare. An agent ` +
        "scoping by that group finds nothing, and scripts/context-decay.mjs cannot classify its domain."
    );
    assert.equal(
      ctx.group_id,
      group.id,
      `context "${ctx.name}" names group "${ctx.group}" but carries a different group_id. The two disagree about ` +
        "where the file belongs, and which one wins depends on which consumer read it."
    );
    counted.set(ctx.group, (counted.get(ctx.group) ?? 0) + 1);
  }

  for (const group of groups) {
    assert.equal(
      group.context_count,
      counted.get(group.name) ?? 0,
      `group "${group.name}" claims ${group.context_count} context(s) and ${counted.get(group.name) ?? 0} name it. ` +
        "CLAUDE.md's generated block prints that number to every agent."
    );
  }
});

test("G2 — stats summarise the arrays that are actually there", () => {
  assert.equal(map.stats?.contexts, contexts.length, "stats.contexts is not the length of the contexts array.");
  assert.equal(map.stats?.groups, groups.length, "stats.groups is not the length of the groups array.");
});

test("G3 — every group says what belongs in it", () => {
  for (const group of groups) {
    assert.ok(
      String(group.$scope ?? "").trim().length > 60,
      `group "${group.name}" has no \`$scope\`. A name is not a boundary: the reader deciding where a new file ` +
        "goes needs the sentence, and this is the file they already have open."
    );
  }
});

test("G4 — no two group names are confusable", () => {
  const problems = [];
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      const why = confusable(groups[i].name, groups[j].name);
      if (why) problems.push(`"${groups[i].name}" vs "${groups[j].name}" — ${why}`);
    }
  }
  assert.deepEqual(
    problems,
    [],
    "context-map.json has group names an agent cannot choose between at task start:\n  " +
      problems.join("\n  ") +
      "\n  A rescan that reintroduces a twin is the case this exists for: merge them in context-map.json (a merge " +
      "cannot add a cross-group import, so context:decay is unaffected), or rename one so the names carry the " +
      "distinction. Do not weaken this rule to make a scan's output pass."
  );
});

test("G5 — a word two groups share is a question the map answers", () => {
  const problems = [];
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      const a = groups[i];
      const b = groups[j];
      const shared = tokens(a.name).filter((t) => tokens(b.name).includes(t));
      if (!shared.length) continue;
      for (const [from, to] of [
        [a, b],
        [b, a],
      ]) {
        const note = (from.$notTo ?? {})[to.name];
        if (String(note ?? "").trim().length > 40) continue;
        problems.push(
          `"${from.name}" shares the word "${shared[0]}" with "${to.name}" and does not say in \`$notTo\` how to ` +
            "choose between them"
        );
      }
    }
  }
  assert.deepEqual(problems, [], problems.join("\n  "));
});

test("G5b — every $notTo points at a group that exists, and not at itself", () => {
  for (const group of groups) {
    for (const other of Object.keys(group.$notTo ?? {})) {
      assert.ok(byName.has(other), `group "${group.name}" disambiguates against "${other}", which does not exist.`);
      assert.notEqual(other, group.name, `group "${group.name}" disambiguates against itself.`);
    }
  }
});

test("the confusability rule refuses the names it was written for", () => {
  // A rule that has stopped matching reads exactly like a tree with nothing wrong.
  // The first two pairs are verbatim from this map on 2026-09-01; the other two are
  // the same shapes. Note what G4 deliberately cannot see: "Analytics & Reporting"
  // vs "Performance & Analytics" was just as undecidable and shares only ONE word,
  // so no lexical rule reaches it. G5 is what covers that case — a shared word costs
  // a sentence, and a pair that cannot write one is a pair that should be merged.
  for (const [a, b] of [
    ["AI & Content Engine", "AI & Content Generation"],
    ["Campaign Management", "Campaign & Ads Management"],
    ["Social Media", "Social Media Management"],
    ["Reporting", "Reporting & Analytics"],
  ]) {
    assert.ok(confusable(a, b), `"${a}" vs "${b}" must be refused — that pair is why this rule exists.`);
  }
  // And passes the collisions that are real distinctions, so it is not simply
  // refusing every name that shares a word.
  for (const [a, b] of [
    ["Site & Marketing", "App Shell & Site"],
    ["Campaign & Ads Management", "Lead & CRM Management"],
    ["Local SEO & Maps", "Platform Operations"],
  ]) {
    assert.equal(confusable(a, b), null, `"${a}" vs "${b}" is a legitimate one-word overlap and must pass.`);
  }
});
