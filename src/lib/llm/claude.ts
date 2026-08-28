/** Claude Code CLI provider (server-only, development).
 *
 *  Shells out to the locally-installed `claude` CLI in print mode and parses a
 *  single structured JSON object from its output — the same approach used in the
 *  sibling `personas` project. Runs through `cmd /c` on Windows so the `claude.cmd`
 *  shim resolves. The prompt is fed on stdin (no arg-escaping pitfalls).
 *
 *  Uses the machine's Claude subscription, so it must be logged in (`claude`).
 *  CLAUDECODE / CLAUDE_CODE_ENTRYPOINT are cleared so a nested invocation (e.g.
 *  running this from inside Claude Code) starts a fresh top-level session.
 *
 *  The child is a TRANSPORT, not an agent: it runs with no tools and no MCP
 *  servers ({@link cliArgs}) and inherits only non-secret plumbing
 *  ({@link cliEnv}) — the prompt carries user-influenced content, so an injected
 *  instruction must have neither a tool to reach for nor a credential to steal.
 */
import { spawn, spawnSync } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import {
  CLAUDE_KILL_GRACE_MS,
  CLAUDE_THINKING_TOKENS,
  CLAUDE_TIMEOUT_MS,
  claudeCliAlias,
  type ModelTier,
} from "./models";
import { isTimeoutAbort, LlmCallError } from "./errors";
import type { AiExtractionRung } from "../ai-types";

const isWindows = process.platform === "win32";

/** Terminate a CLI child with escalation: SIGTERM first, then — if it is still
 *  alive after a grace period — SIGKILL, so a wedged child can never keep holding
 *  a process-wide concurrency slot. The death check reads exitCode/signalCode
 *  (both null == still running). On Windows signals are emulated (either forcibly
 *  terminates), so the escalation is harmless there. */
export function killChild(child: ChildProcess): void {
  child.kill("SIGTERM");
  const grace = setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
    }
  }, CLAUDE_KILL_GRACE_MS);
  // Never keep the event loop alive just for the escalation timer.
  grace.unref?.();
}

/** The ONLY variables the spawned CLI inherits — an allowlist, not a denylist.
 *  The prompt is built from user-influenced content (project data, onboarding
 *  website scans, catalog text), so the child must be treated as running on
 *  attacker-supplied input: handing it the whole server env would put
 *  GEMINI_API_KEY, the Firestore admin credentials, CRON_SECRET/AUTH_SECRET, the
 *  BYOM key-encryption secret and every OAuth client secret one exfiltration
 *  away. A denylist cannot be right here — every new secret would have to be
 *  remembered — so only process/locale/network plumbing plus the paths the CLI
 *  needs to find its own login session are copied through. Anything not on this
 *  list (including ANTHROPIC_API_KEY: this path bills the operator's
 *  subscription, the same economics as the Codex provider stripping
 *  OPENAI_API_KEY, and CLAUDECODE / CLAUDE_CODE_ENTRYPOINT, whose absence keeps
 *  a nested invocation a fresh top-level session) is dropped by construction. */
const CLI_ENV_ALLOWLIST = [
  // process plumbing (POSIX + Windows) — without these `cmd /c claude` cannot resolve
  "PATH",
  "PATHEXT",
  "COMSPEC",
  "SYSTEMROOT",
  "SYSTEMDRIVE",
  "WINDIR",
  "OS",
  "NUMBER_OF_PROCESSORS",
  "PROCESSOR_ARCHITECTURE",
  "PROGRAMDATA",
  "PROGRAMFILES",
  "PROGRAMFILES(X86)",
  "PROGRAMW6432",
  "COMMONPROGRAMFILES",
  // home / config / temp — where the CLI reads its own auth session
  "HOME",
  "HOMEDRIVE",
  "HOMEPATH",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
  "XDG_CONFIG_HOME",
  "XDG_CACHE_HOME",
  "XDG_DATA_HOME",
  "CLAUDE_CONFIG_DIR",
  "TMPDIR",
  "TMP",
  "TEMP",
  "SHELL",
  "USER",
  "USERNAME",
  "LOGNAME",
  // locale / terminal
  "LANG",
  "LANGUAGE",
  "LC_ALL",
  "LC_CTYPE",
  "TERM",
  "TZ",
  // network egress (corporate proxy + custom CA) — non-secret transport config
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "ALL_PROXY",
  "http_proxy",
  "https_proxy",
  "no_proxy",
  "NODE_EXTRA_CA_CERTS",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
] as const;

/** A fresh env for the spawned CLI: everything outside {@link CLI_ENV_ALLOWLIST}
 *  is left behind, and a "medium" thinking budget is requested. Exported so a
 *  regression test can assert the scrub. */
export function cliEnv(): NodeJS.ProcessEnv {
  // NODE_ENV is not a secret (and is a required property of ProcessEnv), so it seeds the object.
  const env: NodeJS.ProcessEnv = { NODE_ENV: process.env.NODE_ENV };
  for (const name of CLI_ENV_ALLOWLIST) {
    // process.env is case-insensitive on Windows, so the canonical upper-case
    // name also picks up `Path` / `ProgramFiles`; the child gets it upper-cased,
    // which Windows resolves identically.
    const value = process.env[name];
    if (value !== undefined) env[name] = value;
  }
  env.MAX_THINKING_TOKENS = String(CLAUDE_THINKING_TOKENS);
  return env;
}

/** CLI argv for one generation — the model alias follows the requested tier
 *  (sonnet for quality, haiku for the fast tier). Exported so a regression test
 *  can assert the spawn argv. */
export const cliArgs = (tier?: ModelTier): string[] => [
  "-p",
  "-", // read the prompt from stdin
  "--model",
  claudeCliAlias(tier),
  // NO TOOLS. This is a text-in / JSON-out transport call, and the prompt carries
  // user-influenced content (project data, onboarding website scans, catalog
  // text) — an injected "now run this" must have nothing to run. `--tools ""`
  // turns off the whole built-in set (Bash/Read/Write/WebFetch/…) and
  // `--strict-mcp-config` with no `--mcp-config` leaves zero MCP servers, so the
  // user-level settings this still loads cannot re-add a tool surface. There is
  // deliberately no `--dangerously-skip-permissions` here: it used to bypass
  // every permission check, so anything the model reached for just ran. Without
  // it a tool call that somehow survives both switches is denied instead.
  "--tools",
  "",
  "--strict-mcp-config",
  // Load ONLY user settings (keeps the login/auth session) and NOT project/local — so this headless
  // one-shot JSON generation does not inherit the repo's CLAUDE.md/AGENTS.md interactive-coding
  // instructions. The repo's AGENTS.md tells an agent to "read docs before acting", which spent the
  // single allowed turn on a Read and truncated the answer to a "Reached max turns (1)" one-liner.
  // (`--bare` would also drop project instructions but skips auth too → "Not logged in".)
  "--setting-sources",
  "user",
  // Headroom above one turn so a model that still takes a thinking step reaches the final JSON
  // instead of being cut off mid-answer. Bounded by CLAUDE_TIMEOUT_MS regardless.
  "--max-turns",
  "6",
];

let _available: boolean | null = null;

/** Is the Claude CLI installed and runnable? Cached after the first probe. */
export function claudeAvailable(): boolean {
  if (_available !== null) return _available;
  try {
    const probe = isWindows
      ? spawnSync("cmd", ["/c", "claude", "--version"], { encoding: "utf-8", windowsHide: true, timeout: 15_000, env: cliEnv() })
      : spawnSync("claude", ["--version"], { encoding: "utf-8", timeout: 15_000, env: cliEnv() });
    _available = probe.status === 0;
  } catch {
    _available = false;
  }
  return _available;
}

/** Exported so the sibling Codex CLI provider embeds the IDENTICAL schema
 *  contract (same Czech JSON-only instruction, same Google GenAI Type framing)
 *  instead of drifting on a copy. */
export function buildCliPrompt(system: string, prompt: string, schema: object): string {
  return [
    system,
    "",
    prompt,
    "",
    "Odpověz POUZE jedním JSON objektem — žádný text okolo, žádné markdown bloky, žádné komentáře.",
    "JSON musí přesně odpovídat tomuto schématu (formát Google GenAI Type: OBJECT/ARRAY/STRING/NUMBER/BOOLEAN):",
    JSON.stringify(schema),
  ].join("\n");
}

function runCli(input: string, opts: { tier?: ModelTier; signal?: AbortSignal } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const { tier, signal } = opts;
    // An already-fired signal must not spawn a CLI child at all. A caller abort is
    // a deliberate stop (`aborted`); an already-elapsed wrapper deadline is a
    // `timeout` (retryable).
    if (signal?.aborted) {
      if (isTimeoutAbort(signal.reason)) {
        reject(new LlmCallError("timeout", "Časový limit vypršel před spuštěním Claude CLI.", { provider: "claude" }));
      } else {
        reject(new LlmCallError("aborted", "Požadavek byl zrušen klientem před spuštěním Claude CLI.", { provider: "claude" }));
      }
      return;
    }
    const args = cliArgs(tier);
    const child = isWindows
      ? spawn("cmd", ["/c", "claude", ...args], { windowsHide: true, env: cliEnv() })
      : spawn("claude", args, { env: cliEnv() });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      killChild(child);
      reject(new LlmCallError("timeout", `Claude CLI vypršel po ${CLAUDE_TIMEOUT_MS} ms.`, { provider: "claude" }));
    }, CLAUDE_TIMEOUT_MS);
    // The composed signal (caller abort OR wrapper deadline) fired: kill the child
    // instead of burning a concurrency slot on output nobody will read. Classify a
    // deadline fire as a retryable timeout and a real caller abort as `aborted`.
    const onAbort = () => {
      clearTimeout(timer);
      killChild(child);
      if (isTimeoutAbort(signal?.reason)) {
        reject(new LlmCallError("timeout", "Claude CLI překročil časový limit — ukončeno.", { provider: "claude" }));
      } else {
        reject(new LlmCallError("aborted", "Požadavek byl zrušen klientem — Claude CLI ukončeno.", { provider: "claude" }));
      }
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };

    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", (err) => {
      cleanup();
      // A spawn failure (CLI missing, EACCES) is a local transport fault — code
      // "network" so a transient spawn hiccup gets the same bounded retry as an
      // HTTP transport error.
      reject(new LlmCallError("network", `Claude CLI se nepodařilo spustit: ${err.message}`, { provider: "claude", cause: err }));
    });
    child.on("close", (code) => {
      cleanup();
      // Some non-zero exits still print a usable answer on stdout; prefer stdout.
      if (stdout.trim()) resolve(stdout);
      // A non-zero exit with no usable output is a provider-side failure (retryable).
      else reject(new LlmCallError("server", `Claude CLI selhal (kód ${code}): ${stderr.slice(0, 300)}`, { provider: "claude" }));
    });

    // A write to a child that failed to spawn or died instantly (EPIPE,
    // ERR_STREAM_DESTROYED — e.g. the CLI was uninstalled after the cached
    // availability probe, or the abort/timeout path killed it before stdin flushed)
    // surfaces as an 'error' event on the stdin STREAM. That is distinct from
    // child.on("error") (spawn failure) above, and an 'error' on a stream with NO
    // listener is thrown as an uncaught exception outside this Promise's reach —
    // which would take the Node process down instead of degrading to a typed
    // LlmCallError. The no-op listener (rejection is already owned by the close/error
    // handlers) plus a guarded write close that seam.
    child.stdin.on("error", () => {});
    try {
      child.stdin.write(input);
      child.stdin.end();
    } catch {
      /* child already gone — the process 'error'/'close' handler settles the Promise */
    }
  });
}

const tryParse = (s: string): Record<string, unknown> | null => {
  try {
    const v = JSON.parse(s);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

/** Pull the first balanced, string-aware {...} object out of arbitrary text. */
function extractBalanced(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        const parsed = tryParse(text.slice(start, i + 1));
        if (parsed) return parsed;
      }
    }
  }
  return null;
}

/** The extraction ladder's result, carrying WHICH rung produced the parse.
 *  `extraction-observability`: the rung that fired is the leading indicator of a
 *  producer/prompt change — a tool that used to land on `direct` and now routinely
 *  needs `balanced` is drifting weeks before `balanced` starts failing too. */
export interface ExtractedJson {
  value: Record<string, unknown>;
  rung: AiExtractionRung;
}

/** Robustly extract a JSON object from CLI output: direct parse → fenced block →
 *  stream-json text fields → balanced brace scan — reporting which rung fired.
 *  `extractJson` is the untraced facade over this (BYOM adapters use it). */
export function extractJsonTraced(raw: string): ExtractedJson | null {
  const text = raw.trim();
  if (!text) return null;

  const direct = tryParse(text);
  if (direct) return { value: direct, rung: "direct" };

  // fenced ```json ... ``` blocks
  const fence = /```(?:json)?\s*([\s\S]*?)```/gi;
  let m: RegExpExecArray | null;
  while ((m = fence.exec(raw)) !== null) {
    const p = tryParse(m[1].trim()) ?? extractBalanced(m[1]);
    if (p) return { value: p, rung: "fence" };
  }

  // stream-json envelope lines (claude --output-format json/stream-json)
  let assembled = "";
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      const obj = JSON.parse(t) as Record<string, unknown>;
      if (typeof obj.result === "string") assembled += obj.result;
      if (Array.isArray(obj.content)) {
        for (const item of obj.content as Array<Record<string, unknown>>) {
          if (item?.type === "text" && typeof item.text === "string") assembled += item.text;
        }
      }
    } catch {
      /* not an envelope line */
    }
  }
  if (assembled) {
    const p = tryParse(assembled.trim()) ?? extractBalanced(assembled);
    if (p) return { value: p, rung: "envelope" };
  }

  const balanced = extractBalanced(raw);
  return balanced ? { value: balanced, rung: "balanced" } : null;
}

/** Robustly extract a JSON object from CLI output. Rung-agnostic facade over
 *  {@link extractJsonTraced} — byte-identical behaviour to before. */
export function extractJson(raw: string): Record<string, unknown> | null {
  return extractJsonTraced(raw)?.value ?? null;
}

/** Run a structured generation through the Claude CLI. Returns the parsed JSON
 *  object (pre-normalization) plus the extraction rung that produced it, so the
 *  wrapper can stamp + record it. Throws on CLI failure, unparseable output, or a
 *  client abort (the CLI child is killed). `tier` picks the model alias. */
export async function runClaude(args: {
  system: string;
  prompt: string;
  schema: object;
  tier?: ModelTier;
  signal?: AbortSignal;
}): Promise<ExtractedJson> {
  const out = await runCli(buildCliPrompt(args.system, args.prompt, args.schema), {
    tier: args.tier,
    signal: args.signal,
  });
  const parsed = extractJsonTraced(out);
  if (!parsed) {
    // Unparseable output → code "malformed_json" (retryable). Append a bounded raw
    // snippet so a parse failure is diagnosable from the log.
    const snippet = out.trim().slice(0, 200).replace(/\s+/g, " ");
    throw new LlmCallError("malformed_json", `Claude CLI nevrátil platný JSON. Začátek výstupu: ${snippet}`, { provider: "claude" });
  }
  return parsed;
}
