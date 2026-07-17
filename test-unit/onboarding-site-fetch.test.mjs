/** Unit tests for the single-pass HTML-entity decoder used by the onboarding site
 *  scan (src/lib/onboarding/site-fetch.ts). Guards the edge cases the old sequential
 *  replaces got wrong: double-decoding an escaped &amp;lt;, astral (emoji) codepoints,
 *  and hex numeric entities. */
import { test } from "node:test";
import assert from "node:assert/strict";

const { decodeEntities } = await import("@/lib/onboarding/site-fetch");

test("named entities decode; &amp; does not double-decode a following escaped entity", () => {
  assert.equal(decodeEntities("Ovoce &amp; ořechy"), "Ovoce & ořechy");
  // The escaped literal "&amp;lt;" must decode to "&lt;", NOT collapse to "<".
  assert.equal(decodeEntities("A &amp;lt; B"), "A &lt; B");
  assert.equal(decodeEntities("&nbsp;x"), " x");
  assert.equal(decodeEntities("&quot;q&quot; &apos;a&apos;"), "\"q\" 'a'");
});

test("numeric entities: decimal, hex and astral codepoints", () => {
  assert.equal(decodeEntities("&#39;"), "'");
  assert.equal(decodeEntities("&#x2013;"), "–"); // en-dash via hex (was not decoded before)
  assert.equal(decodeEntities("&#128512;"), "\u{1F600}"); // astral emoji via fromCodePoint, not mojibake
  assert.equal(decodeEntities("&#x1F600;"), "\u{1F600}");
});

test("invalid / lone-surrogate numeric entities are dropped, not thrown", () => {
  assert.equal(decodeEntities("&#xD800;"), ""); // lone surrogate → dropped (no throw)
  assert.equal(decodeEntities("plain text"), "plain text");
});
