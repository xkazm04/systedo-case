/** Direction 2 — retrieval stops parroting (MMR diverse selection). The pure re-ranker
 *  in src/lib/patterns/store.ts (mmrRank), exercised with synthetic vectors — no store,
 *  no network. Covers near-duplicate suppression, the λ boundaries (pure relevance vs
 *  pure diversity), tie-break determinism (recency then input order), and the
 *  small-corpus no-op (selection ≤ limit returns the input unchanged, so getPatternLines
 *  stays byte-identical to the old cosine-desc slice when the corpus fits in `limit`). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mmrRank, MMR_LAMBDA } from "@/lib/patterns/store.ts";

// Unit basis vectors so cosine is easy to reason about: e0 and a near-copy of e0 are
// ~parallel (cosine ≈ 1), e1 is orthogonal to e0 (cosine 0).
const item = (sim, vec, createdAt) => ({ sim, vec, createdAt });

test("mmrRank: suppresses a near-duplicate in favour of a genuinely different lesson", () => {
  // A (top relevance) and B (a near-copy of A's vector, slightly lower relevance) both sit
  // in the query's neighbourhood; C is less relevant but points elsewhere. Pure cosine
  // would take A, B; MMR (λ=0.7) should take A, then C — dropping B as redundant.
  const A = item(0.90, [1, 0, 0]);
  const B = item(0.88, [0.99, 0.01, 0]); // ~parallel to A
  const C = item(0.60, [0, 1, 0]); // orthogonal to A
  const picked = mmrRank([A, B, C], 2);
  assert.deepEqual(picked, [A, C], "A then the diverse C, not the near-duplicate B");
});

test("mmrRank: λ=1 is pure relevance (near-duplicates allowed back in)", () => {
  const A = item(0.90, [1, 0, 0]);
  const B = item(0.88, [0.99, 0.01, 0]);
  const C = item(0.60, [0, 1, 0]);
  // With no diversity penalty, the two highest-sim items win regardless of redundancy.
  const picked = mmrRank([A, B, C], 2, 1);
  assert.deepEqual(picked, [A, B]);
});

test("mmrRank: λ=0 is pure diversity (relevance term ignored)", () => {
  // First pick: all marginals are 0 (no picked yet, λ·sim term is zeroed) → tie broken by
  // recency then input order, so the first input wins. Second pick: maximise -(maxSim),
  // i.e. the item LEAST similar to the first → the orthogonal one.
  const A = item(0.90, [1, 0, 0], "2026-01-01T00:00:00.000Z");
  const B = item(0.88, [0.99, 0.01, 0], "2026-01-01T00:00:00.000Z");
  const C = item(0.10, [0, 1, 0], "2026-01-01T00:00:00.000Z");
  const picked = mmrRank([A, B, C], 2, 0);
  assert.deepEqual(picked, [A, C], "least-relevant-but-orthogonal C beats the near-duplicate B");
});

test("mmrRank: score ties break by recency (newer first), then deterministically", () => {
  // Two identical-in-every-numeric-way candidates; only createdAt differs → newer wins.
  const older = item(0.5, [1, 0, 0], "2026-01-01T00:00:00.000Z");
  const newer = item(0.5, [1, 0, 0], "2026-06-01T00:00:00.000Z");
  assert.deepEqual(mmrRank([older, newer], 1), [newer]);
  assert.deepEqual(mmrRank([newer, older], 1), [newer], "order-independent: recency, not input order, decides");
});

test("mmrRank: equal score AND equal recency → stable input order (full determinism)", () => {
  const a = item(0.5, [1, 0, 0], "2026-01-01T00:00:00.000Z");
  const b = item(0.5, [1, 0, 0], "2026-01-01T00:00:00.000Z");
  assert.deepEqual(mmrRank([a, b], 1), [a]);
  assert.deepEqual(mmrRank([b, a], 1), [b]);
});

test("mmrRank: missing createdAt sorts as oldest, loses a recency tie to a stamped item", () => {
  const stamped = item(0.5, [1, 0, 0], "2026-01-01T00:00:00.000Z");
  const auto = item(0.5, [1, 0, 0]); // no createdAt (auto pattern)
  assert.deepEqual(mmrRank([auto, stamped], 1), [stamped]);
});

test("mmrRank: small corpus (selection ≤ limit) is a byte-identical no-op", () => {
  const A = item(0.9, [1, 0, 0]);
  const B = item(0.8, [0.99, 0.01, 0]);
  const input = [A, B];
  const out = mmrRank(input, 6); // limit ≥ length → return input unchanged
  assert.deepEqual(out, input, "same items in the same order");
  assert.notEqual(out, input, "returned a copy, not the original array reference");
});

test("mmrRank: default λ is the documented 0.7", () => {
  assert.equal(MMR_LAMBDA, 0.7);
});
