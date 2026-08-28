/** The `/kanaly-zdarma` marketing page states numbers and names channels. This
 *  pins that every one of them is DERIVED from the shipping catalog rather than
 *  typed into copy — which is the only thing that stops a marketing claim from
 *  outliving the code behind it (docs/ship/2026-08-28-kanaly-core-path.md §6 C1).
 *
 *  It also guards the two ways the page could quietly become dishonest: the demo
 *  table drifting away from the public demo it claims to mirror, and the seeded
 *  fill's "vaší firmy / vaší nabídky" placeholders reaching a marketing surface. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { freeChannelFacts } from "@/components/marketing/kanaly/facts";
import { CHANNEL_CATEGORIES } from "@/lib/organic-channels/types";
import { PROJECT_TYPES } from "@/lib/projects/types";
import { channelPlanForProject } from "@/lib/organic-channels/sample";
import { demoProjectFor } from "@/lib/demo/projects";
import { getProjectCatalog } from "@/lib/catalog/resolve";

/** The fill the seeded plan falls back to when it knows nothing about the
 *  business. On a marketing page it would be advice about nothing. */
const PLACEHOLDERS = /vaší firmy|vaší nabídky|vaší lokality/;

test("the counts on the page are the catalog's own, not literals", () => {
  const facts = freeChannelFacts();
  assert.equal(facts.families, CHANNEL_CATEGORIES.length);
  assert.equal(facts.businessTypes, PROJECT_TYPES.length);
  // A union over every type's curated list — must be at least as large as the
  // biggest single plan and no larger than all of them concatenated.
  assert.ok(facts.curatedChannels >= facts.demo.plan.length, "union smaller than one plan");
  assert.ok(facts.curatedChannels > 0, "no curated channels at all");
});

test("the demo table is the public demo's own plan, fit-ranked", () => {
  const { project, plan } = freeChannelFacts().demo;
  // Same fixture the /dashboard?m=kanaly demo renders (DemoModule's kanaly case).
  assert.equal(project.id, demoProjectFor("eshop").id);

  const catalog = getProjectCatalog(project, new Date("2026-01-01T00:00:00.000Z"));
  const category = [...new Set(catalog.map((o) => o.category).filter(Boolean))][0];
  const expected = channelPlanForProject(project, category ? { category } : {});
  assert.deepEqual(
    plan.map((c) => c.id),
    expected.map((c) => c.id)
  );

  for (let i = 1; i < plan.length; i++) {
    assert.ok(plan[i - 1].fit >= plan[i].fit, `plan not fit-ranked at row ${i}`);
  }
});

test("no seeded placeholder reaches the marketing surface", () => {
  const { plan } = freeChannelFacts().demo;
  for (const c of plan) {
    const text = [c.rationale, c.payoff, ...c.firstActions].join(" ");
    assert.ok(!PLACEHOLDERS.test(text), `placeholder survived into ${c.name}: ${text}`);
  }
});
