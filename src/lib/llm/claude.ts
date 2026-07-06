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
 */
import { spawn, spawnSync } from "node:child_process";
import {
  CLAUDE_THINKING_TOKENS,
  CLAUDE_TIMEOUT_MS,
  claudeCliAlias,
  type ModelTier,
} from "./models";

const isWindows = process.platform === "win32";

/** A fresh env for the spawned CLI: drop the markers that signal we're already
 *  inside Claude Code, and request a "medium" thinking budget. */
function cliEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.CLAUDECODE;
  delete env.CLAUDE_CODE_ENTRYPOINT;
  env.MAX_THINKING_TOKENS = String(CLAUDE_THINKING_TOKENS);
  return env;
}

/** CLI argv for one generation — the model alias follows the requested tier
 *  (sonnet for quality, haiku for the fast tier). */
const cliArgs = (tier?: ModelTier): string[] => [
  "-p",
  "-", // read the prompt from stdin
  "--model",
  claudeCliAlias(tier),
  "--dangerously-skip-permissions",
  // Load ONLY user settings (keeps the login/auth session) and NOT project/local — so this headless
  // one-shot JSON generation does not inherit the repo's CLAUDE.md/AGENTS.md interactive-coding
  // instructions. The repo's AGENTS.md tells an agent to "read docs before acting", which spent the
  // single allowed turn on a Read and truncated the answer to a "Reached max turns (1)" one-liner.
  // (`--bare` would also drop project instructions but skips auth too → "Not logged in".)
  "--setting-sources",
  "user",
  // Headroom above one turn so a model that still takes a thinking/tool step reaches the final JSON
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

function buildCliPrompt(system: string, prompt: string, schema: object): string {
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
    // A client that has already gone away must not spawn a CLI child at all.
    // The wording deliberately matches no RETRYABLE marker (see ./index.ts) —
    // an abort is a deliberate stop, never worth a retry.
    if (signal?.aborted) {
      reject(new Error("Požadavek byl zrušen klientem před spuštěním Claude CLI."));
      return;
    }
    const args = cliArgs(tier);
    const child = isWindows
      ? spawn("cmd", ["/c", "claude", ...args], { windowsHide: true, env: cliEnv() })
      : spawn("claude", args, { env: cliEnv() });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Claude CLI vypršel po ${CLAUDE_TIMEOUT_MS} ms.`));
    }, CLAUDE_TIMEOUT_MS);
    // Client abort (timeout, re-run, closed tab): kill the child instead of
    // letting it burn one of the few process-wide concurrency slots for up to
    // CLAUDE_TIMEOUT_MS producing output nobody will read.
    const onAbort = () => {
      clearTimeout(timer);
      child.kill();
      reject(new Error("Požadavek byl zrušen klientem — Claude CLI ukončeno."));
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
      reject(err);
    });
    child.on("close", (code) => {
      cleanup();
      // Some non-zero exits still print a usable answer on stdout; prefer stdout.
      if (stdout.trim()) resolve(stdout);
      else reject(new Error(`Claude CLI selhal (kód ${code}): ${stderr.slice(0, 300)}`));
    });

    child.stdin.write(input);
    child.stdin.end();
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

/** Robustly extract a JSON object from CLI output: direct parse → fenced block →
 *  stream-json text fields → balanced brace scan. */
export function extractJson(raw: string): Record<string, unknown> | null {
  const text = raw.trim();
  if (!text) return null;

  const direct = tryParse(text);
  if (direct) return direct;

  // fenced ```json ... ``` blocks
  const fence = /```(?:json)?\s*([\s\S]*?)```/gi;
  let m: RegExpExecArray | null;
  while ((m = fence.exec(raw)) !== null) {
    const p = tryParse(m[1].trim()) ?? extractBalanced(m[1]);
    if (p) return p;
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
    if (p) return p;
  }

  return extractBalanced(raw);
}

/** Run a structured generation through the Claude CLI. Returns the parsed JSON
 *  object (pre-normalization). Throws on CLI failure, unparseable output, or a
 *  client abort (the CLI child is killed). `tier` picks the model alias. */
export async function runClaude(args: {
  system: string;
  prompt: string;
  schema: object;
  tier?: ModelTier;
  signal?: AbortSignal;
}): Promise<Record<string, unknown>> {
  const out = await runCli(buildCliPrompt(args.system, args.prompt, args.schema), {
    tier: args.tier,
    signal: args.signal,
  });
  const parsed = extractJson(out);
  if (!parsed) {
    // Keep the retryable marker first (see RETRYABLE in ./index.ts) and append
    // a bounded raw snippet so a parse failure is diagnosable from the log.
    const snippet = out.trim().slice(0, 200).replace(/\s+/g, " ");
    throw new Error(`Claude CLI nevrátil platný JSON. Začátek výstupu: ${snippet}`);
  }
  return parsed;
}
