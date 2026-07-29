import { defineConfig, devices } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { CLAUDE_TIMEOUT_MS } from "./src/lib/llm/models";

// Load .env.local (and friends) so GEMINI_API_KEY is available both to the test
// runner (for the has-key gate) and to the dev server Playwright spawns below.
loadEnvConfig(process.cwd(), true);

const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests",
  // Real model calls — keep it serial and give each test room to breathe.
  fullyParallel: false,
  workers: 1,
  // Generous: the dev provider is the Claude Code CLI (medium thinking + cold
  // start), and the timeout test deliberately waits out the 60s client ceiling.
  // Derived, not a literal. The live-model specs build their own budget from
  // CLAUDE_TIMEOUT_MS (ai-asistent: +30s client ceiling, +15s result wait =
  // 195s), so a flat 100_000 here killed the test before its own assertion
  // could ever spend its budget — every live-model test failed on the runner's
  // clock rather than on the model. Keep this strictly above that derived
  // ceiling so raising the server cap moves the runner with it.
  timeout: CLAUDE_TIMEOUT_MS + 75_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Overridable so CI (or a local run) can point the suite at a production
    // server instead of the dev server, e.g.
    //   E2E_WEB_CMD="npx next start --port 3100" npm run test:e2e
    // (after a build). The override must listen on E2E_PORT (default 3100).
    command: process.env.E2E_WEB_CMD ?? `npx next dev --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // LOCAL_DB routes the four campaign-data stores at their node:sqlite twin
    // (see campaigns/store/backend.ts). Without it /kampane hard-500s on an
    // unreachable Firestore and renders "Nepodařilo se načíst kampaně", so
    // kampane-triage could only pass on a machine with live credentials.
    // Inherit the caller's value when one is set, so an intentional
    // Firestore-backed run is still possible.
    env: { LOCAL_DB: process.env.LOCAL_DB ?? "true" },
  },
});
