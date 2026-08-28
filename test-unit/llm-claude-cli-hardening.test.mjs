/** The Claude CLI child is a transport, not an agent.
 *
 *  The prompt handed to `claude -p` is built from user-influenced content
 *  (project data, onboarding website scans, catalog text), so an injected "now
 *  run this" must find neither a tool to reach for nor a secret to exfiltrate.
 *  The provider used to spawn with `--dangerously-skip-permissions` and the WHOLE
 *  server env (GEMINI_API_KEY, the Firestore admin credentials, CRON_SECRET, the
 *  BYOM key secret) — these assert the argv disables tools and the child env is
 *  an allowlist. Pure — no CLI spawn. */
import { test } from "node:test";
import assert from "node:assert/strict";

const { cliArgs, cliEnv } = await import("@/lib/llm/claude");

test("cliArgs: no permission bypass, and the built-in tool set is off", () => {
  const args = cliArgs();
  assert.ok(!args.includes("--dangerously-skip-permissions"), "must not bypass permission checks");
  assert.ok(!args.some((a) => String(a).includes("dangerously")), "no dangerous-* escape hatch");
  // `--tools ""` disables the whole built-in set (Bash/Read/Write/WebFetch/…).
  const tools = args.indexOf("--tools");
  assert.ok(tools >= 0, "--tools must be passed");
  assert.equal(args[tools + 1], "");
  // user settings still load (auth), so MCP servers must be locked out separately
  assert.ok(args.includes("--strict-mcp-config"));
  // unchanged: stdin prompt, print mode, model alias
  assert.ok(args.includes("-p") && args.includes("-") && args.includes("--model"));
});

test("cliEnv: secret-bearing server env never reaches the child", () => {
  const planted = {
    GEMINI_API_KEY: "g-secret",
    ANTHROPIC_API_KEY: "a-secret",
    GOOGLE_APPLICATION_CREDENTIALS: "/creds.json",
    FIREBASE_SERVICE_ACCOUNT: "{}",
    CRON_SECRET: "c-secret",
    AUTH_SECRET: "n-secret",
    NEXTAUTH_SECRET: "n2-secret",
    BYOM_KEY_SECRET: "b-secret",
    LIGHTTRACK_KEY: "l-secret",
    LEONARDO_API_KEY: "le-secret",
    SKLIK_API_TOKEN: "s-secret",
    GOOGLE_CLIENT_SECRET: "gc-secret",
    ADAMANT_OPERATOR_PASSWORD: "p-secret",
    // an allowlist (not a denylist) is the point: a var invented tomorrow,
    // whose name looks like nothing in particular, must be dropped too
    TWIN_SMTP_URL: "smtp://user:pw@host",
    SOME_FUTURE_CREDENTIAL_STORE: "x-secret",
  };
  const saved = {};
  for (const [k, v] of Object.entries(planted)) {
    saved[k] = process.env[k];
    process.env[k] = v;
  }
  try {
    const env = cliEnv();
    for (const k of Object.keys(planted)) {
      assert.equal(env[k], undefined, `${k} must not be handed to the CLI child`);
    }
    assert.ok(!Object.values(env).some((v) => String(v).includes("secret")), "no secret value survives");
    // still runnable: PATH resolves the CLI, the home path finds its login session
    assert.ok(env.PATH, "PATH must survive");
    assert.ok(env.HOME || env.USERPROFILE, "the home path must survive");
    assert.ok(env.MAX_THINKING_TOKENS, "the thinking budget is still requested");
    // markers that would make this a nested session stay cleared
    assert.equal(env.CLAUDECODE, undefined);
    assert.equal(env.CLAUDE_CODE_ENTRYPOINT, undefined);
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});
