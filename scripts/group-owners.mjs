#!/usr/bin/env node
/** Who answers for each context GROUP — the join between .github/CODEOWNERS and
 *  context-map.json (zero-dependency, reads committed data only).
 *
 *  WHY THIS EXISTS. Ownership here is declared per FILE and the system is described
 *  per GROUP, and nothing joined the two. .github/CODEOWNERS is deliberately narrow —
 *  about fifteen law files, with its own first line saying everything else is open
 *  season — which is the right shape for a rule GitHub acts on, and it answers a
 *  question nobody has ("who owns this line?"). The question this repository has is
 *  the other one: ~97% of commits are agent-written, agents create files inside
 *  contexts, and 117 contexts are organised into 12 groups. A whole group can gain
 *  files, gain cross-group imports and gain source no context maps, and nothing here
 *  could say that NOBODY has read it — because there was no list of groups with a
 *  name next to each.
 *
 *  WHAT IT IS NOT. It does not request a review: GitHub reads .github/CODEOWNERS and
 *  nothing else. Turning all 12 groups into CODEOWNERS paths would make one
 *  maintainer the required reviewer of the whole tree, which is how a routing rule
 *  stops being read — and it would delete the signal CODEOWNERS currently carries,
 *  which is that these particular fifteen paths are different. A row here records who
 *  ANSWERS for a group when the weekly triage pass reaches it, and in which order.
 *
 *  RUNG (docs/adr/0007-gate-rung-discipline.md): the DECLARATION blocks and the JOIN
 *  reports, the same split as `npm run fences` and the mutation census. Blocking, via
 *  test-unit/group-owners.test.mjs inside `npm run test:unit` → `check:ci` →
 *  `.husky/pre-push`:
 *
 *    G1  every group in context-map.json has a row here;
 *    G2  every row names a group context-map.json still has;
 *    G3  every `owner` is a handle .github/CODEOWNERS already uses — an owner nobody
 *        can be routed to is a name, not an owner;
 *    G4  every row says WHY, and carries a triageRank;
 *    G5  triageRank is a positive integer, so the pass has an order rather than a
 *        preference.
 *
 *  Reported, never blocking: which CODEOWNERS rules land inside which group (computed
 *  by matching each rule's path against the groups' own `file_paths`), which groups
 *  hold no law file at all, and how many files each group claims. A group with a law
 *  file in it is a group where a change already stops for a human; a group with none
 *  is one where the gate is the whole review — and that is the number this print
 *  exists to make visible, not to fail on.
 *
 *  Usage:
 *    npm run owners:groups              # the table, ordered by triage rank
 *    npm run owners:groups -- --check   # G1..G5 (exit 1 on a violation)
 *    npm run owners:groups -- --summary FILE
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DECL_REL = ".github/group-owners.json";
const MAP_REL = "context-map.json";
const CODEOWNERS_REL = ".github/CODEOWNERS";

const argv = process.argv.slice(2);
const CHECK = argv.includes("--check");
const summaryIdx = argv.indexOf("--summary");
const SUMMARY_FILE = summaryIdx !== -1 ? argv[summaryIdx + 1] : null;

const out = [];
const say = (s = "") => {
  out.push(s);
  console.log(s);
};

function readJson(rel) {
  const path = join(ROOT, rel);
  if (!existsSync(path)) {
    console.error(`✗ group owners: ${rel} does not exist.`);
    process.exit(1);
  }
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    console.error(`✗ group owners: ${rel} is not parseable JSON — ${err.message}`);
    process.exit(1);
  }
}

const declaration = readJson(DECL_REL);
const map = readJson(MAP_REL);
const codeowners = existsSync(join(ROOT, CODEOWNERS_REL)) ? readFileSync(join(ROOT, CODEOWNERS_REL), "utf8") : "";

const rows = Array.isArray(declaration.groups) ? declaration.groups : [];
const mapGroups = Array.isArray(map.groups) ? map.groups : [];
const contexts = Array.isArray(map.contexts) ? map.contexts : [];

/** group name → the files its contexts claim. */
const filesByGroup = new Map();
for (const ctx of contexts) {
  const name = ctx.group;
  if (!name) continue;
  const list = filesByGroup.get(name) ?? [];
  for (const p of ctx.file_paths ?? []) list.push(p.replace(/\\/g, "/"));
  filesByGroup.set(name, list);
}

/** The path rules in CODEOWNERS: `[{ path, owners }]`, comments and blanks dropped. */
const ownerRules = [];
const handles = new Set();
for (const raw of codeowners.split(/\r?\n/)) {
  const line = raw.replace(/#.*$/, "").trim();
  if (!line) continue;
  const parts = line.split(/\s+/);
  const path = parts[0];
  const owners = parts.slice(1).filter((p) => p.startsWith("@"));
  if (!owners.length) continue;
  for (const o of owners) handles.add(o);
  ownerRules.push({ path, owners });
}

/** Does a CODEOWNERS path claim this repo-relative file? Directory rules end in `/`
 *  and claim everything under them; a file rule is an exact match. Leading `/` is
 *  CODEOWNERS' "anchored at the repository root", which is how every rule here is
 *  written. Globs are not interpreted — this is a REPORT, and a rule it cannot
 *  resolve is printed as unmatched rather than guessed at. */
function claims(rulePath, file) {
  const p = rulePath.replace(/^\//, "");
  if (p.includes("*")) return false;
  return p.endsWith("/") ? file.startsWith(p) : file === p;
}

// --- the checks --------------------------------------------------------------

const violations = [];
const declaredNames = new Set(rows.map((r) => r.group));
const mapNames = new Set(mapGroups.map((g) => g.name));

// G1 — a group the map has and this file does not.
for (const g of mapGroups) {
  if (declaredNames.has(g.name)) continue;
  violations.push(
    `${MAP_REL} has the group "${g.name}" (${g.context_count} context(s), domain ${g.domain}) and ${DECL_REL} ` +
      "does not. A group nobody answers for is the one the weekly triage pass skips without noticing — add the " +
      "row, with the sentence saying what a wrong change there costs."
  );
}

// G2 — a row for a group the map no longer has.
for (const r of rows) {
  if (mapNames.has(r.group)) continue;
  violations.push(
    `${DECL_REL} declares an owner for "${r.group}", which ${MAP_REL} no longer has. A stale declaration reads ` +
      "exactly like a current one — drop the row in the diff that dropped the group, or re-point it at the " +
      "group the rescan renamed it to."
  );
}

// G3/G4/G5 — the row itself.
for (const r of rows) {
  if (!r.owner) {
    violations.push(`${DECL_REL}: "${r.group}" has no \`owner\`.`);
  } else if (!handles.has(r.owner)) {
    violations.push(
      `${DECL_REL}: "${r.group}" is owned by ${r.owner}, which ${CODEOWNERS_REL} never names. An owner GitHub ` +
        "cannot route to is a name, not an owner — add them to CODEOWNERS first, where a review request can " +
        "actually reach them."
    );
  }
  if (!String(r.why ?? "").trim()) {
    violations.push(
      `${DECL_REL}: "${r.group}" records no \`why\`. The reason a group is read early is the whole content of ` +
        "its rank — without it the order is a preference."
    );
  }
  if (!Number.isInteger(r.triageRank) || r.triageRank < 1) {
    violations.push(
      `${DECL_REL}: "${r.group}" has triageRank ${JSON.stringify(r.triageRank)}; it must be a positive integer, ` +
        "so the weekly pass has an order rather than a list."
    );
  }
}

// --- the report --------------------------------------------------------------

const ranked = [...rows].sort((a, b) => (a.triageRank ?? 99) - (b.triageRank ?? 99) || a.group.localeCompare(b.group));

say(`Group ownership — ${mapGroups.length} group(s) in ${MAP_REL}, ${rows.length} declared in ${DECL_REL}`);
say("");
say("| Rank | Group | Domain | Owner | Contexts | Files | Law files inside |");
say("| --- | --- | --- | --- | --- | --- | --- |");

const unclaimed = [];
for (const r of ranked) {
  const g = mapGroups.find((x) => x.name === r.group);
  const files = filesByGroup.get(r.group) ?? [];
  const inside = ownerRules.filter((rule) => files.some((f) => claims(rule.path, f)));
  if (!inside.length) unclaimed.push(r.group);
  say(
    `| ${r.triageRank ?? "—"} | ${r.group} | ${g?.domain ?? "—"} | ${r.owner ?? "—"} | ` +
      `${g?.context_count ?? 0} | ${files.length} | ${inside.length ? inside.map((i) => `\`${i.path}\``).join(" ") : "—"} |`
  );
}

say("");
say(
  `  ${rows.length - unclaimed.length} of ${rows.length} group(s) contain at least one ${CODEOWNERS_REL} law file. ` +
    "In the rest, the gate IS the review:"
);
for (const name of unclaimed) say(`    · ${name}`);

// Which CODEOWNERS rules this report could not place — a rule outside every group's
// file list is either a path no context maps (the map is an index, not an inventory)
// or one that has moved. Printed rather than failed for exactly that reason.
const unplaced = ownerRules.filter(
  (rule) => ![...filesByGroup.values()].some((files) => files.some((f) => claims(rule.path, f)))
);
if (unplaced.length) {
  say("");
  say(`  ${unplaced.length} ${CODEOWNERS_REL} rule(s) sit outside every group's mapped files:`);
  for (const rule of unplaced) say(`    · ${rule.path} → ${rule.owners.join(" ")}`);
  say(
    "    (context-map.json is an index rather than an inventory — `npm run agents:surface` counts the source " +
      "files no context claims. A rule here is unmapped, not unowned.)"
  );
}

if (SUMMARY_FILE) {
  try {
    appendFileSync(SUMMARY_FILE, `### Group ownership\n\n${out.join("\n")}\n`);
  } catch (err) {
    console.error(`(could not write the summary: ${err.message})`);
  }
}

if (violations.length) {
  console.error("");
  console.error(`✗ ${violations.length} group-ownership violation(s):`);
  for (const v of violations) console.error(`  • ${v}`);
  console.error("");
  console.error(`  Fix: edit ${DECL_REL} so it lists exactly the groups ${MAP_REL} holds, each with an owner`);
  console.error(`  ${CODEOWNERS_REL} already names, a reason, and a triage rank. Re-run \`npm run owners:groups\`.`);
  if (CHECK) process.exit(1);
} else if (CHECK) {
  say("");
  say(
    `✓ group ownership: all ${mapGroups.length} group(s) in ${MAP_REL} are answered for by a handle ` +
      `${CODEOWNERS_REL} names, each with a reason and a place in the weekly triage order.`
  );
}
