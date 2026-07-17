/** Czech plural selection (src/lib/format.ts czPlural): Czech has three forms —
 *  singular (1), paucal (2–4) and genitive plural (0, ≥5). Alert titles are the
 *  highest-visibility copy (inbox headline + email subject), so a single critical
 *  must read "1 nová kritická kampaň", not "1 nových kritických kampaní". */
import { test } from "node:test";
import assert from "node:assert/strict";
import { czPlural } from "@/lib/format";

const forms = (n) => czPlural(n, "one", "few", "many");

test("czPlural picks singular / paucal / genitive-plural per Czech rules", () => {
  assert.equal(forms(1), "one");
  assert.equal(forms(2), "few");
  assert.equal(forms(3), "few");
  assert.equal(forms(4), "few");
  assert.equal(forms(5), "many");
  assert.equal(forms(11), "many");
  assert.equal(forms(21), "many"); // Czech 21 is genitive plural, not singular
  assert.equal(forms(0), "many");
});

test("czPlural is sign- and fraction-insensitive (uses the integer magnitude)", () => {
  assert.equal(forms(-1), "one");
  assert.equal(forms(-3), "few");
  assert.equal(forms(1.9), "one");
});

test("the critical-alert title reads as native Czech for a single campaign", () => {
  const n = 1;
  const title = `${n} ${czPlural(n, "nová kritická kampaň", "nové kritické kampaně", "nových kritických kampaní")}`;
  assert.equal(title, "1 nová kritická kampaň");
  const n3 = 3;
  const t3 = `${n3} ${czPlural(n3, "nová kritická kampaň", "nové kritické kampaně", "nových kritických kampaní")}`;
  assert.equal(t3, "3 nové kritické kampaně");
});
