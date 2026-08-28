/** Bench regression (llm-core-providers-02): the Claude CLI provider spawns the CLI
 *  with --dangerously-skip-permissions, tool turns allowed (--max-turns 6) and the
 *  ENTIRE server env inherited — so a prompt-injected instruction can execute
 *  Bash/Read/Write on the host with every secret (GEMINI_API_KEY, Firestore admin
 *  creds, LIGHTTRACK_KEY, BYOM master secrets) in the child's environment. These
 *  tests spawn-intercept the provider and fail until (a) secret-bearing env vars are
 *  stripped from the child env and (b) the one-shot JSON generation cannot take tool
 *  turns (tools disabled/disallowed, or the skip-permissions flag dropped so tool
 *  calls are denied).
 *
 *  Run with --experimental-test-module-mocks (node:child_process is mocked). */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";

/** Every spawn call: { argv: [cmd, ...args], env }. */
const spawns = [];

function fakeChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = { on: () => {}, write: () => {}, end: () => {} };
  child.exitCode = null;
  child.signalCode = null;
  child.kill = () => {
    child.exitCode = 0;
  };
  return child;
}

mock.module("node:child_process", {
  namedExports: {
    spawn: (cmd, args, opts = {}) => {
      spawns.push({ argv: [cmd, ...(args ?? [])], env: opts.env ?? {} });
      const child = fakeChild();
      setImmediate(() => {
        child.stdout.emit("data", JSON.stringify({ ok: true }));
        child.exitCode = 0;
        child.emit("close", 0);
      });
      return child;
    },
    spawnSync: () => ({ status: 0, stdout: "1.0.0", stderr: "" }),
  },
});

// Plant secrets the way the real server env carries them, BEFORE the provider runs.
process.env.GEMINI_API_KEY = "bench-secret-gemini";
process.env.LIGHTTRACK_KEY = "bench-secret-lighttrack";

const { runClaude } = await import("@/lib/llm/claude");

const CALL = { system: "sys", prompt: "prompt", schema: { type: "OBJECT" } };

test("control: the provider round-trips a JSON answer through the spawn seam", async () => {
  const out = await runClaude(CALL);
  assert.deepEqual(out.value, { ok: true });
  assert.ok(spawns.length >= 1, "the CLI child was spawned");
  // The CLI still gets its thinking budget through the env.
  assert.ok(spawns.at(-1).env.MAX_THINKING_TOKENS, "non-secret CLI config still passes through");
});

test("secret-bearing env vars are stripped from the CLI child environment", async () => {
  await runClaude(CALL);
  const { env } = spawns.at(-1);
  assert.equal(
    env.GEMINI_API_KEY,
    undefined,
    "the child env must not carry GEMINI_API_KEY — today the spawn inherits the full process.env"
  );
  assert.equal(
    env.LIGHTTRACK_KEY,
    undefined,
    "the child env must not carry LIGHTTRACK_KEY — today the spawn inherits the full process.env"
  );
});

test("the one-shot JSON generation cannot take tool turns", async () => {
  await runClaude(CALL);
  const { argv } = spawns.at(-1);
  const skipsPermissions = argv.includes("--dangerously-skip-permissions");
  const restrictsTools = argv.some((a) =>
    ["--tools", "--allowedTools", "--allowed-tools", "--disallowedTools", "--disallowed-tools", "--permission-mode"].includes(a)
  );
  assert.ok(
    !skipsPermissions || restrictsTools,
    `the CLI is spawned with --dangerously-skip-permissions and NO tool restriction — an injected instruction can run Bash/Read/Write on the host. argv: ${argv.join(" ")}`
  );
});
