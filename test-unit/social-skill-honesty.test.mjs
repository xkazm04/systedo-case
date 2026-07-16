/** Skill SDK contract honesty (src/lib/skills/types.ts + src/lib/ai/tools/social.ts).
 *
 *  The contract gap fixed here: `validate` is now input-aware and `backfill` is a
 *  first-class contract field, so a registry-driven run of socialSkill (via runSkill)
 *  carries the SAME billing honesty as the dedicated generateSocialPosts wrapper —
 *  instead of regressing to "empty/partial answer backfilled from canned templates,
 *  billed as a real generation". Proven on the pure contract pieces (no model). */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./json-loader.mjs", import.meta.url);

let socialSkill;
let skillToGenerateArgs;

before(async () => {
  const [social, types] = await Promise.all([
    import("@/lib/ai/tools/social"),
    import("@/lib/skills/types"),
  ]);
  socialSkill = social.socialSkill;
  skillToGenerateArgs = types.skillToGenerateArgs;
});

const input = (platforms) => ({ topic: "T", tone: "pratelsky", platforms });
const complete = { posts: [{ platform: "instagram", content: "A" }, { platform: "facebook", content: "B" }] };

// ── socialSkill.validate is input-aware (the strict variant, not over-limit-only) ──

test("socialSkill.validate flags every REQUESTED platform missing a post", () => {
  const v = socialSkill.validate({ posts: [] }, input(["instagram", "facebook"]));
  assert.equal(v.length, 2);
  assert.ok(v.every((m) => /Chybí příspěvek pro platformu/.test(m)));
});

test("socialSkill.validate passes a complete set", () => {
  assert.deepEqual(socialSkill.validate(complete, input(["instagram", "facebook"])), []);
});

// ── socialSkill.backfill drives meta.demo (full) vs meta.partialDemo (partial) ──

test("socialSkill.backfill: full / partial / none by how much the model filled", () => {
  const i = input(["instagram", "facebook"]);
  assert.equal(socialSkill.backfill({ posts: [] }, i), "full", "nothing filled → full demo");
  assert.equal(
    socialSkill.backfill({ posts: [{ platform: "instagram", content: "A" }] }, i),
    "partial",
    "one filled → partial"
  );
  assert.equal(socialSkill.backfill(complete, i), "none", "all filled → a real answer");
});

// ── skillToGenerateArgs binds the input-aware validator to the plain wrapper shape ──

test("skillToGenerateArgs(social) binds validate to THIS input (empty answer fails)", () => {
  const args = skillToGenerateArgs(socialSkill, input(["instagram", "facebook"]));
  // The wrapper sees a plain (parsed) => string[] — but it is bound to the platforms.
  assert.equal(args.validate({ posts: [] }).length, 2);
  assert.deepEqual(args.validate(complete), []);
});
