/** The `research` stance of the Claude Code CLI (ADR-0016) — server-only.
 *
 *  A SEPARATE seam from the no-tools generation transport in ./claude, never a
 *  flag on it: "which stance am I in?" must not be a bug that type-checks. The
 *  generation argv stays `--tools ""`; this one is the only argv in the app that
 *  grants a tool, and it grants exactly two — WebSearch and WebFetch — worn three
 *  ways at once (registry: agent-cli-transport / permission-stance-enforcement):
 *    1. `--tools`             the built-in set is narrowed to the two;
 *    2. `--allowedTools`      the two are pre-approved, nothing else is;
 *    3. `--disallowedTools`   every write/exec/read tool is denied, and deny wins,
 *  plus `--permission-mode dontAsk` (an unapproved call is refused, not asked),
 *  `--strict-mcp-config` (no MCP servers), `--setting-sources user` (no project
 *  instructions) and an EMPTY temp working directory (no workspace to read).
 *  Asking this factory for a denied tool throws: that is a caller bug.
 *
 *  Everything the run fetches is attacker text: the output is schema rows only,
 *  and any snippet a later prompt quotes goes through lib/ai/untrusted first. */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildCliPrompt, claudeAvailable, extractJsonTraced, spawnCli, type ExtractedJson } from "./claude";
import { claudeCliAlias, type ModelTier } from "./models";
import { LlmCallError } from "./errors";

/** The only tools this stance may hold. */
export const RESEARCH_TOOLS = ["WebSearch", "WebFetch"] as const;

/** Tools a research run must never hold — deny wins over any allow. */
export const RESEARCH_DENIED_TOOLS = [
  "Bash",
  "Edit",
  "Write",
  "Read",
  "Glob",
  "Grep",
  "NotebookEdit",
  "Task",
  "TodoWrite",
] as const;

/** A research run is minutes, not seconds: the app's own wall clock, because the
 *  CLI ships a turn cap but no run deadline. */
export const RESEARCH_TIMEOUT_MS = 6 * 60_000;
export const RESEARCH_MAX_TURNS = 24;

/** The one validation door: a requested tool list is checked against the deny
 *  list and the allow list before any argv exists. */
export function assertResearchTools(requested: readonly string[]): void {
  for (const t of requested) {
    if ((RESEARCH_DENIED_TOOLS as readonly string[]).includes(t)) {
      throw new Error(`research stance: "${t}" is a denied tool — a research run may not write, execute or read files`);
    }
    if (!(RESEARCH_TOOLS as readonly string[]).includes(t)) {
      throw new Error(`research stance: "${t}" is not a research tool (allowed: ${RESEARCH_TOOLS.join(", ")})`);
    }
  }
}

/** argv for one research run. Exported so a regression test can pin it. */
export function researchCliArgs(tier?: ModelTier, tools: readonly string[] = RESEARCH_TOOLS): string[] {
  assertResearchTools(tools);
  const list = tools.join(",");
  return [
    "-p",
    "-",
    "--model",
    claudeCliAlias(tier),
    "--tools",
    list,
    "--allowedTools",
    list,
    "--disallowedTools",
    RESEARCH_DENIED_TOOLS.join(","),
    "--permission-mode",
    "dontAsk",
    "--strict-mcp-config",
    "--setting-sources",
    "user",
    "--max-turns",
    String(RESEARCH_MAX_TURNS),
  ];
}

/** Can this machine run a research call at all? The install probe is shared with
 *  generation; whether web tools are enabled for this account is only known after
 *  a run, so a run that comes back with tools denied marks the stance unavailable
 *  for the rest of the process (see `markResearchUnavailable`). */
let _webDenied = false;
export function researchAvailable(): boolean {
  return !_webDenied && claudeAvailable();
}
export function markResearchUnavailable(): void {
  _webDenied = true;
}

export async function runClaudeResearch(args: {
  system: string;
  prompt: string;
  schema: object;
  tier?: ModelTier;
  signal?: AbortSignal;
}): Promise<ExtractedJson> {
  // A fresh, empty directory: nothing to read, nothing to write, no CLAUDE.md.
  const cwd = mkdtempSync(join(tmpdir(), "adamant-research-"));
  try {
    const out = await spawnCli(buildCliPrompt(args.system, args.prompt, args.schema), {
      args: researchCliArgs(args.tier),
      cwd,
      timeoutMs: RESEARCH_TIMEOUT_MS,
      signal: args.signal,
    });
    const parsed = extractJsonTraced(out);
    if (!parsed) {
      const snippet = out.trim().slice(0, 200).replace(/\s+/g, " ");
      throw new LlmCallError("malformed_json", `Claude CLI (research) nevrátil platný JSON. Začátek výstupu: ${snippet}`, {
        provider: "claude",
      });
    }
    return parsed;
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}
