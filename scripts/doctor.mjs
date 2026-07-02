#!/usr/bin/env node
/** `npm run doctor` — preflight that maps the env matrix to enabled product
 *  surfaces. Loads .env.local (and friends) exactly like playwright.config.ts
 *  does, probes the machine (Node version, claude CLI, key files, local DB) and
 *  prints a surface × status table with the fix hint from .env.example for
 *  everything that runs in demo mode or is off. Reads env only — makes no model
 *  calls and touches nothing.
 *
 *  Run:  npm run doctor
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import nextEnv from "@next/env";
import { buildDoctorReport } from "./doctor-rules.mjs";

const ROOT = process.cwd();

// @next/env is CJS; depending on the interop the function lives on the module
// or on .default. Resolve both so the script works under plain `node`.
const loadEnvConfig = nextEnv.loadEnvConfig ?? nextEnv.default?.loadEnvConfig;
loadEnvConfig(ROOT, true, { info: () => {}, error: console.error });

/** Best-effort `claude --version` — a missing CLI just means demo mode in dev. */
function probeClaudeCli() {
  try {
    const res = spawnSync("claude", ["--version"], {
      encoding: "utf8",
      timeout: 15_000,
      shell: process.platform === "win32",
    });
    if (res.status === 0 && res.stdout) return res.stdout.trim().split("\n")[0];
  } catch {
    /* not installed */
  }
  return null;
}

const gac = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const probes = {
  nodeVersion: process.version,
  claudeCli: probeClaudeCli(),
  saFile: existsSync(join(ROOT, ".data", "firebase-sa.json")),
  gacFile: Boolean(gac && existsSync(gac)),
  localDbFile: existsSync(join(ROOT, ".data", "systedo.db")),
};

const rows = buildDoctorReport(process.env, probes);

const MARK = { on: "✓", demo: "◐", off: "○", error: "✗" };
const LABEL = { on: "zapnuto", demo: "demo režim", off: "vypnuto", error: "problém" };

console.log("\nsystedo doctor — co je zapnuté a proč (env → produktové plochy)\n");
const width = Math.max(...rows.map((r) => r.surface.length)) + 2;
for (const r of rows) {
  console.log(`  ${MARK[r.status]} ${r.surface.padEnd(width)}${LABEL[r.status].padEnd(12)}${r.detail}`);
  if (r.hint) console.log(`    ${" ".repeat(width)}↳ ${r.hint}`);
}

const demoOrOff = rows.filter((r) => r.status !== "on").length;
const errors = rows.filter((r) => r.status === "error").length;
console.log(
  `\n  ${rows.length - demoOrOff}/${rows.length} ploch zapnuto` +
    (demoOrOff ? `, ${demoOrOff} v demo režimu / vypnuto — hinty výše (kopie z .env.example)` : "") +
    (errors ? `; ${errors}× nekonzistentní konfigurace (✗)` : "") +
    "\n"
);

// Exit non-zero only on real misconfiguration (✗) — demo mode is a supported state.
process.exit(errors ? 1 : 0);
