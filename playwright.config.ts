import { defineConfig, devices } from "@playwright/test";
import { loadEnvConfig } from "@next/env";

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
  timeout: 100_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next dev --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
