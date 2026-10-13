/** ADR-0016: in-app web research is a SEPARATE CLI stance. These pin the three
 *  layers it wears together, the one validation door that refuses a write tool,
 *  and — the half that matters most — that the generation transport did NOT grow
 *  a tool because this one did. Pure: no child process is spawned. */
import { test } from "node:test";
import assert from "node:assert/strict";

const { researchCliArgs, assertResearchTools, RESEARCH_TOOLS, RESEARCH_DENIED_TOOLS } = await import(
  "@/lib/llm/claude-research"
);
const { cliArgs } = await import("@/lib/llm/claude");

const flag = (args, name) => args[args.indexOf(name) + 1];

test("research argv grants exactly WebSearch and WebFetch, three ways", () => {
  const args = researchCliArgs();
  assert.equal(flag(args, "--tools"), "WebSearch,WebFetch");
  assert.equal(flag(args, "--allowedTools"), "WebSearch,WebFetch");
  const denied = flag(args, "--disallowedTools").split(",");
  for (const t of ["Bash", "Edit", "Write", "Read", "Glob", "Grep"]) assert.ok(denied.includes(t), `${t} is not denied`);
  assert.equal(flag(args, "--permission-mode"), "dontAsk");
  assert.ok(args.includes("--strict-mcp-config"), "MCP servers are not shut out");
  assert.equal(flag(args, "--setting-sources"), "user");
  assert.ok(!args.includes("--dangerously-skip-permissions"), "a research run must never bypass permissions");
  assert.ok(!args.some((a) => /bypassPermissions/.test(a)), "a research run must never bypass permissions");
});

test("the validation door refuses a denied tool and an unknown one", () => {
  assert.throws(() => assertResearchTools(["WebSearch", "Bash"]), /denied tool/);
  assert.throws(() => assertResearchTools(["Write"]), /denied tool/);
  assert.throws(() => researchCliArgs(undefined, ["WebFetch", "Edit"]), /denied tool/);
  assert.throws(() => assertResearchTools(["SomeNewTool"]), /not a research tool/);
  assert.doesNotThrow(() => assertResearchTools(["WebFetch"]));
});

test("no tool is on both lists", () => {
  for (const t of RESEARCH_TOOLS) assert.ok(!RESEARCH_DENIED_TOOLS.includes(t), `${t} is both allowed and denied`);
});

test("the generation transport still holds no tool at all", () => {
  const args = cliArgs();
  assert.equal(flag(args, "--tools"), "", "the no-tools stance grew a tool");
  assert.ok(!args.includes("--allowedTools"), "the no-tools stance grew an allow list");
  assert.ok(!args.some((a) => /WebSearch|WebFetch/.test(a)), "web tools leaked into the generation stance");
});
