/** Nothing the model is told, and nothing the model hands back, may carry a demo
 *  marker or an unusable link.
 *
 *  Two long-open defects on the Kanály path, pinned here:
 *
 *  1. The brand reached the prompt as the RAW project name. A demo/sample project is
 *     named "Klinika (ukázka)", so the marker travelled into the request, came back
 *     inside every rationale / payoff / first action, and rode on into the content
 *     brief — the seeded plan filled it into the same fields with no model involved
 *     (harness bughunt-refactor-2026-07-10 #1). `promptSafeName` now guards both the
 *     wire door (validateChannelResearchRequest) and the seeded fill
 *     (channelPlanForProject).
 *
 *  2. A channel's `url` — the "kam se zapsat" link the playbook renders as an anchor —
 *     was accepted as any string under 300 chars. `javascript:` schemes, bare phrases
 *     and scheme-less paths (which a browser resolves against OUR origin) all passed.
 *     safeChannelUrl accepts http(s) with a host and drops the FIELD otherwise, never
 *     the channel.
 *
 *  Pure — no model, no I/O. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./json-loader.mjs", import.meta.url);

const { validateChannelResearchRequest } = await import("@/lib/ai/validation");
const { safeChannelUrl, normalizeChannelResearchTracked } = await import(
  "@/lib/ai/tools/channel-research"
);
const { channelPlanForProject } = await import("@/lib/organic-channels/sample");
const { sanitizeChannelState, safeChannelUrl: domainSafeChannelUrl } = await import(
  "@/lib/organic-channels/types"
);
const { promptSafeName } = await import("@/lib/projects/name");

const project = (over = {}) => ({
  id: "11111111-2222-4333-8444-555555555555",
  name: "Klinika (ukázka)",
  type: "local",
  domain: "klinika.cz",
  accentColor: "#123456",
  ...over,
});

const req = (over = {}) => ({ projectType: "local", brand: "Klinika (ukázka)", ...over });

/* ------------------------------------------------------------ 1. the brand */

test("the wire door strips a demo marker from the brand", () => {
  const v = validateChannelResearchRequest(req());
  assert.equal(v.valid, true);
  assert.equal(v.value.brand, "Klinika");
});

test("every marker promptSafeName knows is stripped at the wire door", () => {
  for (const raw of ["Dentalis (demo)", "Klinika (ukázka)", "Shop (Sample)"]) {
    const v = validateChannelResearchRequest(req({ brand: raw }));
    assert.equal(v.valid, true, raw);
    assert.equal(v.value.brand, promptSafeName(raw), raw);
  }
});

test("a real brand crosses the wire door untouched", () => {
  // The guard must be invisible to every tenant who is not a demo project.
  for (const raw of ["Mionelo", "Rohlík.cz", "Weird (demo) mid"]) {
    const v = validateChannelResearchRequest(req({ brand: raw }));
    assert.equal(v.valid, true, raw);
    assert.equal(v.value.brand, raw, raw);
  }
});

test("stripping never empties a brand the validator just accepted", () => {
  // A project named nothing BUT a marker strips to "" — falling back to the raw
  // value keeps the request valid instead of failing a length check we already passed.
  const v = validateChannelResearchRequest(req({ brand: "(ukázka)" }));
  assert.equal(v.valid, true);
  assert.equal(v.value.brand, "(ukázka)");
});

test("the seeded plan fills the clean brand into rationale, payoff and first actions", () => {
  const plan = channelPlanForProject(project());
  const text = JSON.stringify(plan);
  assert.ok(!text.includes("(ukázka)"), "no demo marker anywhere in the filled plan");
  assert.ok(text.includes("Klinika"), "…but the brand itself is still named");
});

test("stripping the marker does not reshuffle an existing seeded plan", () => {
  // The wobble key is project.id, not the brand: a plan pinned before this fix must
  // keep the same channels in the same order with the same fit scores.
  const marked = channelPlanForProject(project());
  const clean = channelPlanForProject(project({ name: "Klinika" }));
  assert.deepEqual(
    marked.map((c) => [c.id, c.fit]),
    clean.map((c) => [c.id, c.fit])
  );
});

test("an explicit context brand still wins over the project name", () => {
  // channelPlanForProject spreads ctx AFTER the brand; the fix must not change that.
  const plan = channelPlanForProject(project(), { brand: "Jiná firma" });
  assert.ok(JSON.stringify(plan).includes("Jiná firma"));
});

/* -------------------------------------------------------------- 2. the url */

test("safeChannelUrl keeps a plain http(s) address", () => {
  for (const ok of [
    "https://www.firmy.cz/registrace",
    "http://mapy.cz/zapis",
    "https://business.google.com/",
  ]) {
    assert.equal(safeChannelUrl(ok), ok, ok);
  }
});

test("safeChannelUrl drops anything that is not http(s) with a host", () => {
  for (const bad of [
    "javascript:alert(1)", // a scheme the playbook would render as a live anchor
    "data:text/html,<script>0</script>",
    "file:///etc/passwd",
    "firmy.cz/registrace", // scheme-less → resolves against OUR origin
    "Zapište se na Firmy.cz", // free text, not a link at all
    "https://", // no host
    "",
    "   ",
    null,
    undefined,
    42,
  ]) {
    assert.equal(safeChannelUrl(bad), null, String(bad));
  }
});

test("safeChannelUrl rejects an over-long url instead of truncating it", () => {
  // A URL sliced mid-path looks right and 404s; the field is optional, so absence
  // is the honest outcome.
  const long = `https://example.com/${"a".repeat(400)}`;
  assert.equal(safeChannelUrl(long), null);
  assert.equal(safeChannelUrl(`https://example.com/${"a".repeat(200)}`)?.length, 220);
});

test("normalize drops a bad url but keeps the channel", () => {
  const { result, canned } = normalizeChannelResearchTracked(
    {
      summary: "Shrnutí.",
      channels: [
        {
          name: "Firmy.cz",
          category: "directory",
          fit: 90,
          effort: "low",
          rationale: "Sedí.",
          payoff: "Přinese.",
          firstActions: ["Založte profil."],
          url: "javascript:alert(1)",
        },
        {
          name: "Mapy.cz",
          category: "directory",
          fit: 80,
          effort: "low",
          rationale: "Sedí.",
          payoff: "Přinese.",
          firstActions: ["Založte profil."],
          url: "https://mapy.cz/zapis",
        },
      ],
    },
    req()
  );
  assert.equal(canned, false);
  assert.equal(result.channels.length, 2, "a bad link costs the field, never the channel");
  const [first, second] = result.channels;
  assert.equal(first.name, "Firmy.cz");
  assert.equal("url" in first, false, "the unusable link is absent, not empty-string");
  assert.equal(second.url, "https://mapy.cz/zapis");
});

/* ------------------------------------------ 3. the OTHER door: the wire plan */

/** The model is not the only way a channel's url reaches the playbook's anchor.
 *  A client POSTs the pinned plan to /api/projects/[id]/organic-channels, the route
 *  coerces it with sanitizeChannelState, and resolveOrganicChannels re-sanitizes the
 *  stored blob on every read — so this door decides what a tenant's own browser
 *  renders as a live link, on every load, forever. It applied a 300-char truncation
 *  and nothing else while the model's door rejected schemes; these pin them equal. */

test("the persistence door drops a non-http(s) url the same way the model's does", () => {
  const pinned = (url) =>
    sanitizeChannelState({
      plan: [
        {
          id: "firmy-cz",
          name: "Firmy.cz",
          category: "directory",
          fit: 90,
          effort: "low",
          rationale: "Sedí.",
          payoff: "Přinese.",
          firstActions: ["Založte profil."],
          url,
        },
      ],
    });

  for (const bad of ["javascript:alert(1)", "data:text/html,<script>0</script>", "firmy.cz/registrace", "Zapište se na Firmy.cz", `https://example.com/${"a".repeat(400)}`]) {
    const [channel] = pinned(bad).plan;
    assert.equal(channel.name, "Firmy.cz", `the channel survives: ${bad}`);
    assert.equal("url" in channel, false, `the unusable link is absent: ${bad}`);
  }

  const [ok] = pinned("https://www.firmy.cz/registrace").plan;
  assert.equal(ok.url, "https://www.firmy.cz/registrace", "a real link crosses untouched");
});

test("both doors are the same function, not two implementations of one rule", () => {
  assert.equal(safeChannelUrl, domainSafeChannelUrl);
});
