/** Unit tests for the pure production-readiness logic (src/lib/readiness.ts):
 *  the Firebase credential preflight (the fail-loud prod gate) and the operator
 *  readiness matrix. Env + probes are passed in, so no I/O and nothing to init. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  firebaseCredMode,
  firebasePreflight,
  readinessMatrix,
} from "@/lib/readiness";

const NO_FILE = { keyFilePresent: false };
const WITH_FILE = { keyFilePresent: true };

test("firebaseCredMode follows the env → key-file → adc resolution order", () => {
  assert.equal(firebaseCredMode({ FIREBASE_SERVICE_ACCOUNT: "{}" }, NO_FILE), "service-account-env");
  assert.equal(firebaseCredMode({ FIREBASE_SERVICE_ACCOUNT: "{}" }, WITH_FILE), "service-account-env");
  assert.equal(firebaseCredMode({}, WITH_FILE), "key-file");
  assert.equal(firebaseCredMode({}, NO_FILE), "adc");
});

test("prod + no explicit creds + no escape hatch → FATAL (mustThrow)", () => {
  const pf = firebasePreflight({ NODE_ENV: "production" }, NO_FILE);
  assert.equal(pf.mode, "adc");
  assert.equal(pf.explicit, false);
  assert.equal(pf.mustThrow, true);
  assert.equal(pf.allowed, false);
  assert.match(pf.reason, /FIREBASE_SERVICE_ACCOUNT/);
  assert.match(pf.reason, /FIREBASE_ALLOW_ADC/);
});

test("prod + explicit service-account env → allowed", () => {
  const pf = firebasePreflight({ NODE_ENV: "production", FIREBASE_SERVICE_ACCOUNT: "{}" }, NO_FILE);
  assert.equal(pf.mode, "service-account-env");
  assert.equal(pf.mustThrow, false);
  assert.equal(pf.allowed, true);
});

test("prod + explicit key file → allowed", () => {
  const pf = firebasePreflight({ NODE_ENV: "production" }, WITH_FILE);
  assert.equal(pf.mode, "key-file");
  assert.equal(pf.mustThrow, false);
});

test("prod + ADC but FIREBASE_ALLOW_ADC=true → allowed (documented escape hatch)", () => {
  const pf = firebasePreflight({ NODE_ENV: "production", FIREBASE_ALLOW_ADC: "true" }, NO_FILE);
  assert.equal(pf.mode, "adc");
  assert.equal(pf.mustThrow, false);
  assert.equal(pf.allowed, true);
  assert.match(pf.reason, /FIREBASE_ALLOW_ADC=true/);
});

test("development + no creds → never throws (dev unaffected)", () => {
  const pf = firebasePreflight({ NODE_ENV: "development" }, NO_FILE);
  assert.equal(pf.mustThrow, false);
  assert.equal(pf.allowed, true);
});

test("LOCAL_DB (non-prod) + no creds → never throws", () => {
  const pf = firebasePreflight({ LOCAL_DB: "true" }, NO_FILE);
  assert.equal(pf.mustThrow, false);
});

test("readinessMatrix reports present/absent booleans + the cred mode label, no secrets", () => {
  const m = readinessMatrix(
    {
      RESEND_API_KEY: "re_x",
      GOOGLE_ADS_DEVELOPER_TOKEN: "tok",
      SKLIK_API_TOKEN: "sk",
      CRON_SECRET: "c",
      ADMIN_EMAILS: "a@x.com",
      FIREBASE_ALLOW_ADC: "true",
    },
    WITH_FILE
  );
  assert.deepEqual(m, {
    firebaseCredMode: "key-file",
    firebaseAllowAdc: true,
    resendConfigured: true,
    googleAdsConfigured: true,
    sklikConfigured: true,
    cronConfigured: true,
    adminConfigured: true,
  });
  // No secret material leaks into the matrix.
  assert.equal(JSON.stringify(m).includes("re_x"), false);
  assert.equal(JSON.stringify(m).includes("tok"), false);

  const empty = readinessMatrix({}, NO_FILE);
  assert.deepEqual(empty, {
    firebaseCredMode: "adc",
    firebaseAllowAdc: false,
    resendConfigured: false,
    googleAdsConfigured: false,
    sklikConfigured: false,
    cronConfigured: false,
    adminConfigured: false,
  });
  // Whitespace-only ADMIN_EMAILS is treated as absent.
  assert.equal(readinessMatrix({ ADMIN_EMAILS: "  " }, NO_FILE).adminConfigured, false);
});
