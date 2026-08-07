/** selectInjectableVoice — the trained/sample gate on AI voice injection.
 *
 *  Pins the severity-1 fix: `resolveTwin` merges the seeded per-type sample UNDER a
 *  tenant's saved voices (so the editor always has content), but a generation for a
 *  REAL tenant must speak only in voices the tenant actually saved. Before this gate,
 *  every untrained real tenant silently injected the canned Czech sample persona
 *  into `social` and `repurpose` — as if it were their trained voice. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { selectInjectableVoice } from "@/lib/twin/inject";
import { sampleTwin } from "@/lib/twin/sample";

const NOW = "2026-07-15T00:00:00.000Z";

const ownVoice = (scope, over = {}) => ({
  scope,
  directives: "Piš stroze a anglicky.",
  traits: ["strohý"],
  lengthHint: "1 věta",
  constraints: [],
  examples: [],
  updatedAt: NOW,
  ...over,
});

/** An untrained project as `resolveTwin` returns it: the seeded sample, no saved scopes. */
const untrained = () => ({ state: sampleTwin("leadgen"), trainedScopes: [] });

test("untrained real tenant: the merged sample voice injects NOTHING", () => {
  const resolved = untrained();
  // Sanity: the sample generic register is non-empty — exactly what used to leak.
  assert.ok(resolved.state.voices.some((v) => v.scope === "generic" && v.directives.trim().length > 0));
  assert.equal(selectInjectableVoice(resolved, "tenant", "social"), undefined);
  assert.equal(selectInjectableVoice(resolved, "tenant", "email"), undefined);
  assert.equal(selectInjectableVoice(resolved, "tenant", "generic"), undefined);
});

test("demo project: the sample voice DOES inject — that is the sample's job", () => {
  const voice = selectInjectableVoice(untrained(), "demo", "social");
  assert.ok(voice, "demo output keeps twin flavour");
  assert.equal(voice.scope, "generic", "falls back to the seeded generic register");
  assert.ok(voice.directives.trim().length > 0);
});

test("trained tenant: their own voice injects, and only for scopes they saved", () => {
  const seeded = sampleTwin("leadgen");
  const resolved = {
    // resolveTwin merges saved OVER seeded per scope; the saved generic replaces it.
    state: { ...seeded, voices: [ownVoice("generic"), ...seeded.voices.filter((v) => v.scope !== "generic")] },
    trainedScopes: ["generic"],
  };
  const voice = selectInjectableVoice(resolved, "tenant", "social");
  assert.ok(voice);
  assert.equal(voice.directives, "Piš stroze a anglicky.", "the tenant's OWN directives, never the sample's");
});

test("trained tenant: a channel voice they saved wins for that scope, sample gaps stay silent", () => {
  const seeded = sampleTwin("eshop");
  const resolved = {
    state: { ...seeded, voices: [...seeded.voices, ownVoice("email")] },
    trainedScopes: ["email"],
  };
  assert.equal(selectInjectableVoice(resolved, "tenant", "email")?.scope, "email");
  // The seeded generic still sits in state.voices (the editor shows it), but it was
  // never saved — so an untouched scope must not fall back to it.
  assert.equal(selectInjectableVoice(resolved, "tenant", "chat"), undefined);
});

test("trained-then-emptied: a saved row with cleared directives injects nothing", () => {
  const seeded = sampleTwin("leadgen");
  const resolved = {
    state: { ...seeded, voices: [ownVoice("generic", { directives: "   " }), ...seeded.voices.filter((v) => v.scope !== "generic")] },
    trainedScopes: ["generic"],
  };
  assert.equal(selectInjectableVoice(resolved, "tenant", "social"), undefined);
});
