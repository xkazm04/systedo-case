/** GBP status parse: a NEGATED affirmative ("not connected", "unverified", "nepripojeno")
 *  is a problem, not a clean bill. The import feeds attentionScore, so it must fail toward
 *  attention (registry: attention-score-for-many-locations, procedure step 1). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./json-loader.mjs", import.meta.url);
const { parseGbpRows } = await import("@/lib/local-signals/import");

const status = (word) => parseGbpRows(`Praha,${word},10,4,1`)[0].status;

test("parseGbpRows: negated affirmatives are not healthy", () => {
  const bad = [
    "not connected", "unverified", "not verified", "pending verification", "verification required",
    "nepřipojeno", "nepripojeno", "neověřeno", "neovereno", "nezdravý", "not active", "not live", "not healthy", "nefunkční", "nefunguje",
  ];
  for (const w of bad) assert.notEqual(status(w), "connected", `"${w}" must not parse as connected`);
});

test("parseGbpRows: explicit affirmatives stay connected, disconnects stay disconnected", () => {
  for (const w of ["connected", "verified", "active", "live", "ok", "healthy", "připojeno", "aktivní", "ověřeno", "OK - verified"])
    assert.equal(status(w), "connected", w);
  for (const w of ["disconnected", "odpojeno", "inactive", "neaktivní", "offline"])
    assert.equal(status(w), "disconnected", w);
});
