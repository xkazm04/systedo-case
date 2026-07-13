/** Per-tenant client profile grounds the report prompt (src/lib/campaigns/
 *  report-input.ts): the client identity + PNO target come from a ClientProfile,
 *  not a hardcoded string. The default profile must render byte-identically to
 *  the old hardcoded Mionelo line (demos unchanged); a custom profile must
 *  replace both the identity and the target, with no Mionelo leakage. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildOverallPrompt, buildCampaignPrompt } from "@/lib/campaigns/report-input";
import { DEFAULT_CLIENT_PROFILE } from "@/lib/campaigns/report-config-types";

// Build expected fragments from the profile itself so the assertion never depends
// on the exact em-dash byte in a source literal.
const identity = (c) => `Klient: ${c.name} (${c.domain})`;

function campaign(id = "c1", name = "Search · Brand") {
  return {
    id,
    name,
    type: "search",
    status: "enabled",
    impressions: 100_000,
    clicks: 2_000,
    cost: 10_000,
    conversions: 40,
    conversionValue: 60_000,
  };
}

test("default (no client arg) still renders the Mionelo identity + 18% target", () => {
  const prompt = buildOverallPrompt([campaign()], "30d");
  assert.ok(prompt.includes(identity(DEFAULT_CLIENT_PROFILE)), "demo identity preserved");
  assert.ok(prompt.includes(DEFAULT_CLIENT_PROFILE.businessLine));
  // default PNO goal is the paid-portfolio target (18%)
  assert.ok(/Cílové PNO domluvené s klientem: 18\s*%/.test(prompt));
});

test("the default profile constant equals the Mionelo seed", () => {
  assert.equal(DEFAULT_CLIENT_PROFILE.name, "Mionelo");
  assert.equal(DEFAULT_CLIENT_PROFILE.domain, "mionelo.cz");
  assert.equal(DEFAULT_CLIENT_PROFILE.pnoGoal, 0.18);
});

test("a custom profile replaces identity AND target, with no Mionelo leakage", () => {
  const client = {
    name: "Acme",
    domain: "acme.com",
    businessLine: "B2B SaaS pro logistiku",
    pnoGoal: 0.1,
  };
  const prompt = buildOverallPrompt([campaign()], "30d", [], undefined, client);
  assert.ok(prompt.includes(identity(client)));
  assert.ok(prompt.includes(client.businessLine));
  assert.ok(/Cílové PNO domluvené s klientem: 10\s*%/.test(prompt));
  assert.ok(!prompt.includes("Mionelo"), "no hardcoded client identity leaks through");
});

test("the single-campaign prompt is client-driven too", () => {
  const c = campaign();
  const client = { name: "Acme", domain: "acme.com", businessLine: "B2B SaaS", pnoGoal: 0.12 };
  const prompt = buildCampaignPrompt(c, [c], "30d", undefined, client);
  assert.ok(prompt.includes(identity(client)));
  assert.ok(/Cílové PNO domluvené s klientem: 12\s*%/.test(prompt));
});
