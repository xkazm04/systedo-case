/** OpenAI Codex CLI provider (server-only, development).
 *
 *  Shells out to the locally-installed `codex` CLI in its non-interactive mode
 *  (`codex exec --json`) and parses a single structured JSON object from the
 *  final agent message — the second rung of the keyless dev ladder, behind the
 *  Claude CLI (see ./provider-order.ts). Runs through `cmd /c` on Windows so
 *  the `codex.cmd` shim resolves. The prompt is fed on stdin (the `-` prompt
 *  argument; no arg-escaping pitfalls) and stdin is CLOSED after the write —
 *  an open stdin makes the CLI wait on "Reading additional input from stdin".
 *
 *  Uses the machine's ChatGPT plan sign-in, so it must be logged in
 *  (`codex login`). OPENAI_API_KEY is stripped from the child env: with a key
 *  visible the CLI bills the metered platform API instead of the flat-rate
 *  plan — the same economics as the Claude path's env hygiene.
 *
 *  Output dialect: `--json` emits JSONL events; the answer is the text of the
 *  LAST `item.completed` event whose `item.type` is `agent_message`. There is
 *  no single-object result mode. `--output-schema` exists but takes a strict
 *  JSON Schema FILE, while this app's schemas are in Google GenAI `Type` form
 *  (OBJECT/STRING/…) — so we embed the schema in the prompt exactly like the
 *  Claude path and reuse its extraction ladder, rather than converting schema
 *  dialects and managing a temp file per call. */
import { spawn, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { CODEX_TIMEOUT_MS, type ModelTier } from "./models";
import { isTimeoutAbort, LlmCallError } from "./errors";
import { buildCliPrompt, extractJsonTraced, killChild, type ExtractedJson } from "./claude";

const isWindows = process.platform === "win32";

/** A fresh env for the spawned CLI: strip the metered API key so the run bills
 *  the operator's ChatGPT plan, never the platform API. Deliberate — most CLIs
 *  in this class prefer a visible key over the seat session. */
function cliEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.OPENAI_API_KEY;
  return env;
}

/** CLI argv for one generation. The CLI's default model serves both tiers (see
 *  CODEX_MODEL in ./models.ts), so there is no `-m` here.
 *  - `-C <tmpdir>` + `--skip-git-repo-check`: a NEUTRAL working directory, so
 *    this headless one-shot JSON generation loads no ambient AGENTS.md /
 *    project instructions (the Claude path gets the same neutrality from
 *    `--setting-sources user`).
 *  - `--sandbox read-only`: a pure generation must not write anything; Codex
 *    enforces this at the OS level, the strongest stance in the CLI class.
 *  - `--ephemeral`: no session files persisted for a transport call.
 *  - trailing `-`: read the prompt from stdin. */
const cliArgs = (): string[] => [
  "exec",
  "--json",
  "--skip-git-repo-check",
  "-C",
  tmpdir(),
  "--sandbox",
  "read-only",
  "--ephemeral",
  "-",
];

let _available: boolean | null = null;

/** Is the Codex CLI installed AND signed in? `codex login status` exits 0 only
 *  when a usable auth session exists — a zero-token probe that proves
 *  authorization, not just installation (a `--version` probe would report an
 *  installed-but-logged-out CLI as available and every call would then fail).
 *  Cached after the first probe. */
export function codexAvailable(): boolean {
  if (_available !== null) return _available;
  try {
    const probe = isWindows
      ? spawnSync("cmd", ["/c", "codex", "login", "status"], { encoding: "utf-8", windowsHide: true, timeout: 15_000, env: cliEnv() })
      : spawnSync("codex", ["login", "status"], { encoding: "utf-8", timeout: 15_000, env: cliEnv() });
    _available = probe.status === 0;
  } catch {
    _available = false;
  }
  return _available;
}

function runCli(input: string, opts: { signal?: AbortSignal } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const { signal } = opts;
    // An already-fired signal must not spawn a CLI child at all. A caller abort
    // is a deliberate stop (`aborted`); an already-elapsed wrapper deadline is a
    // `timeout` (retryable).
    if (signal?.aborted) {
      if (isTimeoutAbort(signal.reason)) {
        reject(new LlmCallError("timeout", "Časový limit vypršel před spuštěním Codex CLI.", { provider: "codex" }));
      } else {
        reject(new LlmCallError("aborted", "Požadavek byl zrušen klientem před spuštěním Codex CLI.", { provider: "codex" }));
      }
      return;
    }
    const args = cliArgs();
    const child = isWindows
      ? spawn("cmd", ["/c", "codex", ...args], { windowsHide: true, env: cliEnv() })
      : spawn("codex", args, { env: cliEnv() });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      killChild(child);
      reject(new LlmCallError("timeout", `Codex CLI vypršel po ${CODEX_TIMEOUT_MS} ms.`, { provider: "codex" }));
    }, CODEX_TIMEOUT_MS);
    // The composed signal (caller abort OR wrapper deadline) fired: kill the
    // child instead of burning a concurrency slot on output nobody will read.
    const onAbort = () => {
      clearTimeout(timer);
      killChild(child);
      if (isTimeoutAbort(signal?.reason)) {
        reject(new LlmCallError("timeout", "Codex CLI překročil časový limit — ukončeno.", { provider: "codex" }));
      } else {
        reject(new LlmCallError("aborted", "Požadavek byl zrušen klientem — Codex CLI ukončeno.", { provider: "codex" }));
      }
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };

    // Streams stay SEPARATE: the JSONL data channel is stdout; the CLI logs
    // startup/cache noise (Rust ERROR lines and the like) on stderr, and merging
    // them would poison the envelope parse.
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", (err) => {
      cleanup();
      // A spawn failure (CLI missing, EACCES) is a local transport fault — code
      // "network" so a transient spawn hiccup gets the same bounded retry as an
      // HTTP transport error.
      reject(new LlmCallError("network", `Codex CLI se nepodařilo spustit: ${err.message}`, { provider: "codex", cause: err }));
    });
    child.on("close", (code) => {
      cleanup();
      // Some non-zero exits still print a usable answer on stdout; prefer stdout.
      if (stdout.trim()) resolve(stdout);
      // A non-zero exit with no usable output is a provider-side failure (retryable).
      else reject(new LlmCallError("server", `Codex CLI selhal (kód ${code}): ${stderr.slice(0, 300)}`, { provider: "codex" }));
    });

    // Same stdin seam as the Claude path: an 'error' on the stdin stream with no
    // listener would crash the process; the no-op listener plus a guarded write
    // close it. Ending stdin is doubly important here — with stdin open the CLI
    // waits for more piped input before it starts.
    child.stdin.on("error", () => {});
    try {
      child.stdin.write(input);
      child.stdin.end();
    } catch {
      /* child already gone — the process 'error'/'close' handler settles the Promise */
    }
  });
}

/** Pull the final agent answer out of the `codex exec --json` JSONL stream: the
 *  LAST `item.completed` event whose item is an `agent_message`. Non-JSON lines
 *  and other event types are skipped — the stream also carries thread/turn
 *  bookkeeping and reasoning items that are not the answer. Exported for the
 *  offline envelope tests. */
export function codexAgentMessage(raw: string): string | null {
  let last: string | null = null;
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      const obj = JSON.parse(t) as Record<string, unknown>;
      if (obj.type !== "item.completed") continue;
      const item = obj.item as Record<string, unknown> | undefined;
      if (item?.type === "agent_message" && typeof item.text === "string") {
        last = item.text;
      }
    } catch {
      /* not an envelope line */
    }
  }
  return last;
}

/** Run a structured generation through the Codex CLI. Returns the parsed JSON
 *  object (pre-normalization) plus the extraction rung that produced it, so the
 *  wrapper can stamp + record it. Throws on CLI failure, unparseable output, or
 *  a client abort (the CLI child is killed). `tier` is accepted for signature
 *  parity with the sibling providers; the CLI default model serves both tiers. */
export async function runCodex(args: {
  system: string;
  prompt: string;
  schema: object;
  tier?: ModelTier;
  signal?: AbortSignal;
}): Promise<ExtractedJson> {
  const out = await runCli(buildCliPrompt(args.system, args.prompt, args.schema), {
    signal: args.signal,
  });
  const message = codexAgentMessage(out);
  if (message === null) {
    // JSONL arrived but no agent message completed (failed turn, truncated
    // stream) — a provider-side failure, retryable like any other server fault.
    const snippet = out.trim().slice(0, 200).replace(/\s+/g, " ");
    throw new LlmCallError("server", `Codex CLI nevrátil žádnou odpověď agenta. Začátek výstupu: ${snippet}`, { provider: "codex" });
  }
  // The agent message is free text; the SAME extraction ladder as the Claude
  // path turns it into one JSON object and reports which rung fired.
  const parsed = extractJsonTraced(message);
  if (!parsed) {
    const snippet = message.trim().slice(0, 200).replace(/\s+/g, " ");
    throw new LlmCallError("malformed_json", `Codex CLI nevrátil platný JSON. Začátek výstupu: ${snippet}`, { provider: "codex" });
  }
  return parsed;
}
