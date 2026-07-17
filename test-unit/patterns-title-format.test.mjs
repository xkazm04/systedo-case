/** ppc-patterns #3 — pattern display titles are load-bearing identifiers.
 *  minePatterns MINTS titles ("Vzor pro škálování: …", "… je nejefektivnější typ")
 *  while patternContradicted RE-PARSES them via separate prefix/suffix constants
 *  (SCALING_PREFIX / BEST_TYPE_SUFFIX). Reword one side but not the other and
 *  nothing throws — the contradiction safety net just goes dark. This test pins
 *  the two together: it mines the patterns, then feeds the MINED titles straight
 *  into contradictedSavedIds so a copy edit that desyncs mint↔parse fails CI.
 *  Pure — no store, no clock. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { minePatterns, contradictedSavedIds } from "@/lib/patterns/extract";
import { PAID_PORTFOLIO_TARGET_PNO } from "@/lib/targets";

// targetRoas at the default 18 % PNO ≈ 5.56×.
const camp = (name, type, cost, value, status = "enabled") => ({
  id: name,
  name,
  type,
  status,
  impressions: 10_000,
  clicks: 500,
  cost,
  conversions: 20,
  conversionValue: value,
});
const ctx = (campaigns) => ({ campaigns, channels: [], pnoGoal: PAID_PORTFOLIO_TARGET_PNO });

test("mined scaling + best-type titles are still recognised by the contradiction check", () => {
  // A single winner well over target → mines BOTH a best-type (structure) and a
  // scaling template (budget) whose subject is this campaign.
  const mined = minePatterns([camp("Kampaň A", "search", 10_000, 70_000)], {}); // ROAS 7 > 5.56

  const scaling = mined.find((p) => p.category === "budget" && p.title.includes("škálování"));
  const bestType = mined.find((p) => p.category === "structure" && p.title.includes("nejefektivnější"));
  assert.ok(scaling, "a scaling-template pattern was mined");
  assert.ok(bestType, "a best-type pattern was mined");

  // Persist those exact mined titles as saved pins, then hand them fresh data that
  // contradicts the claim (same campaign/type now BELOW target ROAS = 3.0).
  const asSaved = (p) => ({ ...p, id: `s-${p.title}`, source: "manual" });
  const below = ctx([camp("Kampaň A", "search", 10_000, 30_000)]);
  const flagged = contradictedSavedIds([asSaved(scaling), asSaved(bestType)], below);

  assert.ok(
    flagged.has(`s-${scaling.title}`),
    "SCALING_PREFIX must still match the minted scaling title",
  );
  assert.ok(
    flagged.has(`s-${bestType.title}`),
    "BEST_TYPE_SUFFIX must still match the minted best-type title",
  );
});

test("mined winning pins are NOT flagged while the claim still holds (no false positive)", () => {
  const mined = minePatterns([camp("Kampaň A", "search", 10_000, 70_000)], {});
  const asSaved = (p) => ({ ...p, id: `s-${p.title}`, source: "manual" });
  const stillWinning = ctx([camp("Kampaň A", "search", 10_000, 70_000)]); // ROAS 7 > target
  const flagged = contradictedSavedIds(mined.map(asSaved), stillWinning);
  assert.equal(flagged.size, 0, "a claim that still holds is never contradicted");
});
