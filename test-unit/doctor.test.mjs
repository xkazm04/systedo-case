/** Unit tests for the pure doctor rules (scripts/doctor-rules.mjs) — the env →
 *  product-surface mapping behind `npm run doctor`. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDoctorReport, nodeSatisfies } from "../scripts/doctor-rules.mjs";

const PROBES_NONE = {
  nodeVersion: "v24.14.0",
  claudeCli: null,
  saFile: false,
  gacFile: false,
  localDbFile: false,
};

const row = (rows, prefix) => rows.find((r) => r.surface.startsWith(prefix));

test("nodeSatisfies enforces the >=22.5 (node:sqlite) floor", () => {
  assert.equal(nodeSatisfies("v22.5.0"), true);
  assert.equal(nodeSatisfies("v24.14.0"), true);
  assert.equal(nodeSatisfies("v22.4.9"), false);
  assert.equal(nodeSatisfies("v21.9.0"), false);
  assert.equal(nodeSatisfies("garbage"), false);
});

test("empty env → everything demo/off, nothing errors, every non-on row has a hint", () => {
  const rows = buildDoctorReport({}, PROBES_NONE);
  assert.equal(rows.length, 8);
  assert.equal(row(rows, "Node.js").status, "on");
  assert.equal(row(rows, "AI nástroje — dev").status, "demo");
  assert.equal(row(rows, "AI nástroje — produkce").status, "demo");
  assert.equal(row(rows, "/app — přihlášení").status, "off");
  assert.equal(row(rows, "/app — data").status, "off");
  assert.equal(row(rows, "Cron").status, "off");
  assert.equal(row(rows, "Creative Studio").status, "demo");
  assert.equal(row(rows, "Google Ads").status, "demo");
  for (const r of rows) {
    if (r.status !== "on") assert.ok(r.hint, `${r.surface} should carry a fix hint`);
  }
});

test("fully configured cloud env → all surfaces on", () => {
  const env = {
    GEMINI_API_KEY: "k",
    AUTH_SECRET: "s",
    GOOGLE_CLIENT_ID: "id",
    GOOGLE_CLIENT_SECRET: "sec",
    GOOGLE_CLOUD_PROJECT: "proj",
    FIREBASE_SERVICE_ACCOUNT: "{}",
    CRON_SECRET: "c",
    RESEND_API_KEY: "r",
    LEONARDO_API_KEY: "l",
    GOOGLE_ADS_DEVELOPER_TOKEN: "t",
  };
  const rows = buildDoctorReport(env, { ...PROBES_NONE, claudeCli: "1.0.0 (Claude Code)" });
  assert.ok(rows.every((r) => r.status === "on"), JSON.stringify(rows.filter((r) => r.status !== "on")));
});

test("old Node is an error with a hint", () => {
  const rows = buildDoctorReport({}, { ...PROBES_NONE, nodeVersion: "v20.11.0" });
  const node = row(rows, "Node.js");
  assert.equal(node.status, "error");
  assert.ok(node.hint);
});

test("partial Auth.js config is an error naming the missing vars", () => {
  const rows = buildDoctorReport({ AUTH_SECRET: "s" }, PROBES_NONE);
  const auth = row(rows, "/app — přihlášení");
  assert.equal(auth.status, "error");
  assert.match(auth.detail, /GOOGLE_CLIENT_ID/);
  assert.match(auth.detail, /GOOGLE_CLIENT_SECRET/);
});

test("DEV_AUTH bypass counts as on outside production, off in production", () => {
  const dev = buildDoctorReport({ DEV_AUTH: "true" }, PROBES_NONE);
  assert.equal(row(dev, "/app — přihlášení").status, "on");
  const prod = buildDoctorReport({ DEV_AUTH: "true", NODE_ENV: "production" }, PROBES_NONE);
  assert.equal(row(prod, "/app — přihlášení").status, "off");
});

test("LOCAL_DB without a seeded db file hints at seed:local", () => {
  const rows = buildDoctorReport({ LOCAL_DB: "true" }, PROBES_NONE);
  const data = row(rows, "/app — data");
  assert.equal(data.status, "on");
  assert.match(data.hint ?? "", /seed:local/);
  const seeded = buildDoctorReport({ LOCAL_DB: "true" }, { ...PROBES_NONE, localDbFile: true });
  assert.equal(row(seeded, "/app — data").hint, undefined);
});

test("GOOGLE_CLOUD_PROJECT without any service-account key is a misconfiguration", () => {
  const rows = buildDoctorReport({ GOOGLE_CLOUD_PROJECT: "proj" }, PROBES_NONE);
  assert.equal(row(rows, "/app — data").status, "error");
  const withFile = buildDoctorReport({ GOOGLE_CLOUD_PROJECT: "proj" }, { ...PROBES_NONE, saFile: true });
  const data = row(withFile, "/app — data");
  assert.equal(data.status, "on");
  assert.match(data.detail, /firebase-sa\.json/);
});

test("CRON_SECRET without Resend is a degraded (demo) state, not off", () => {
  const rows = buildDoctorReport({ CRON_SECRET: "c" }, PROBES_NONE);
  const cron = row(rows, "Cron");
  assert.equal(cron.status, "demo");
  assert.match(cron.detail, /logují/);
});

test("Leonardo without a Gemini key flags the missing vision scoring", () => {
  const rows = buildDoctorReport({ LEONARDO_API_KEY: "l" }, PROBES_NONE);
  const studio = row(rows, "Creative Studio");
  assert.equal(studio.status, "demo");
  assert.match(studio.detail, /GEMINI_API_KEY/);
});

test("vision model falls back GEMINI_VISION_MODEL → GEMINI_MODEL → default", () => {
  const base = { LEONARDO_API_KEY: "l", GEMINI_API_KEY: "k" };
  const def = row(buildDoctorReport(base, PROBES_NONE), "Creative Studio");
  assert.match(def.detail, /gemini-3-flash-preview/);
  const shared = row(buildDoctorReport({ ...base, GEMINI_MODEL: "m-shared" }, PROBES_NONE), "Creative Studio");
  assert.match(shared.detail, /m-shared/);
  const vision = row(
    buildDoctorReport({ ...base, GEMINI_MODEL: "m-shared", GEMINI_VISION_MODEL: "m-vision" }, PROBES_NONE),
    "Creative Studio"
  );
  assert.match(vision.detail, /m-vision/);
});
