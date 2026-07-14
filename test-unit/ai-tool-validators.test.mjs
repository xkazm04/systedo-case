/** Direction 1 — the shared object-guard reaches the core ten tools.
 *
 *  Each tool's validator must FAIL a non-object parse (null / a bare string from a
 *  truncated stream / a top-level array) with the shared NOT_OBJECT_VIOLATION, so
 *  the wrapper spends its one repair re-prompt instead of letting garbage skip
 *  straight to the demo floor — the exact escape the five legacy `return []`
 *  guards used to leave open. Runs the TS source via the shared resolve hook.
 *
 *  Seven tools import JSON-free and are pulled in statically. The three grounded on
 *  the dashboard snapshot (analysis / chat / monthly-recap) transitively import
 *  src/data/performance.json, which the JSON-free test resolve hook rejects — so a
 *  tiny local load hook injects the `type: json` attribute and they are dynamically
 *  imported. The hook is scoped to this file; it touches no shared test infra. */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { NOT_OBJECT_VIOLATION } from "@/lib/ai/tools/_validate";
import { validateAds } from "@/lib/ai/tools/ads";
import { validateBrief } from "@/lib/ai/tools/brief";
import { validateReport } from "@/lib/ai/tools/campaign-eval";
import { validateArticleDraft } from "@/lib/ai/tools/article-draft";
import { validateLocalReviewReply } from "@/lib/ai/tools/local-review-reply";
import { validateSocial } from "@/lib/ai/tools/social";
import { validateRepurpose } from "@/lib/ai/tools/repurpose";

// Local load hook: accept a plain `import x from "*.json"` (no attribute) by
// injecting `type: json`, so the snapshot-grounded tool modules load in the test.
const JSON_HOOK =
  "data:text/javascript," +
  encodeURIComponent(`
    export async function load(url, context, next) {
      if (url.endsWith('.json')) {
        return next(url, { ...context, importAttributes: { ...context.importAttributes, type: 'json' } });
      }
      return next(url, context);
    }
  `);

// The core ten this direction hardens. Repurpose's validator is channel-scoped, so
// it is wrapped to the same (parsed) => string[] shape as the rest. The three
// snapshot-grounded validators are filled in by the `before` hook below.
const VALIDATORS = {
  ads: validateAds,
  brief: validateBrief,
  "campaign-eval": validateReport,
  "article-draft": validateArticleDraft,
  "local-review-reply": validateLocalReviewReply,
  social: validateSocial,
  repurpose: (parsed) => validateRepurpose(["LinkedIn"], parsed),
};

before(async () => {
  register(JSON_HOOK, import.meta.url);
  const [analysis, chat, recap] = await Promise.all([
    import("@/lib/ai/tools/analysis"),
    import("@/lib/ai/tools/chat"),
    import("@/lib/ai/tools/monthly-recap"),
  ]);
  VALIDATORS.analysis = analysis.validateAnalysis;
  VALIDATORS.chat = chat.validateChat;
  VALIDATORS["monthly-recap"] = recap.validateRecap;
});

// A non-object parse always fails with the shared violation → the wrapper re-prompts.
const NON_OBJECTS = [
  ["null", null],
  ["undefined", undefined],
  ['a bare string (truncated stream)', '…{"headlines": ['],
  ["a top-level array", [{ ok: true }]],
  ["a number", 42],
];

const TEN = [
  "ads",
  "brief",
  "campaign-eval",
  "article-draft",
  "local-review-reply",
  "social",
  "repurpose",
  "analysis",
  "chat",
  "monthly-recap",
];

test("every one of the core ten routes a non-object through the object guard", () => {
  assert.equal(TEN.length, 10);
  for (const id of TEN) {
    const validate = VALIDATORS[id];
    assert.equal(typeof validate, "function", `${id} validator resolved`);
    for (const [label, value] of NON_OBJECTS) {
      assert.deepEqual(
        validate(value),
        [NOT_OBJECT_VIOLATION],
        `${id} must hard-fail ${label} so the repair pass runs`
      );
    }
    // A real record (even empty) passes the guard and reaches the field-level body —
    // it may raise field violations, but never the non-object one.
    assert.ok(
      !validate({}).includes(NOT_OBJECT_VIOLATION),
      `${id} passes a real object {} through the guard`
    );
  }
});
