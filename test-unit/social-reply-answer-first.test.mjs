/** Suggested social replies answer in the FIRST sentence (registry technique
 *  answer-in-first-sentence-never-promise, rules 1 and 3).
 *
 *  The canned inbox reply is the floor a marketer edits and sends; it used to open
 *  with a standalone thank-you sentence and push the answer (where the prices /
 *  availability live) into the second, and an author with no first token produced
 *  the greeting "Dobrý den díky". A greeting or thanks may share the first sentence
 *  with the answer; it may not replace it. */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./json-loader.mjs", import.meta.url);

let draftReply;
before(async () => {
  ({ draftReply } = await import("@/lib/social/draft"));
});

const msg = (author, text) => ({ id: "m", platform: "instagram", author, kind: "comment", text, status: "open" });
const firstSentence = (s) => s.split(/(?<=[.!?])\s/)[0];

test("price and availability replies carry the answer in sentence one", () => {
  const price = draftReply(msg("Jana N.", "Kolik stojí ta směs?"), "shop.cz");
  const stock = draftReply(msg("Petr Svoboda", "Máte to skladem?"), "shop.cz");
  assert.match(firstSentence(price), /shop\.cz/);
  assert.match(firstSentence(stock), /shop\.cz/);
});

test("no standalone thank-you opener on a question", () => {
  for (const text of ["Kolik stojí směs?", "Máte to skladem?"]) {
    assert.doesNotMatch(firstSentence(draftReply(msg("Jana", text), "x.cz")), /^Dobrý den \S+, díky za (zájem|dotaz)!$/);
  }
});

test("an author with no usable first name gets a neutral greeting, never a stray word", () => {
  for (const author of ["", "   "]) {
    const r = draftReply(msg(author, "Kolik to stojí?"), "x.cz");
    assert.doesNotMatch(r, /Dobrý den díky/);
    assert.match(r, /^Dobrý den[,!. ]/);
  }
});

test("still promises no price, date or outcome", () => {
  for (const text of ["Kolik stojí směs?", "Máte to skladem?", "Díky moc!", "Řešíte velkoobchod?"]) {
    assert.doesNotMatch(draftReply(msg("Jana", text), "x.cz"), /\d+\s?(Kč|%|dn)|zítra|dnes/i);
  }
});
