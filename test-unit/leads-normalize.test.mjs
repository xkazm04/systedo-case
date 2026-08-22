/** Dedup-key normalisation for the lead entity layer (src/lib/leads/normalize.ts).
 *  These rules decide whether two rows are ONE PERSON, so every branch is pinned:
 *  the gmail-only plus/dot handling, the CZ/SK E.164 folding from §B6 of the design
 *  doc, and the auto-merge policy (email OR phone — never a name). Pure: no db. */
import { test } from "node:test";
import assert from "node:assert/strict";

const {
  normalizeEmail,
  normalizePhone,
  normalizeName,
  normalizeIco,
  companyDomainFromEmail,
  contactKeys,
  isAutoMergeMatch,
  isDuplicateCandidate,
} = await import("@/lib/leads/normalize");

test("normalizeEmail: trims + lowercases, keeps ordinary local parts intact", () => {
  assert.equal(normalizeEmail("  Jan.Novak@Firma.CZ "), "jan.novak@firma.cz");
  // Dots are NOT stripped outside gmail — a.b@example.com is a different mailbox.
  assert.equal(normalizeEmail("a.b@example.com"), "a.b@example.com");
  // Nor is plus-addressing, which arbitrary providers do not have to implement.
  assert.equal(normalizeEmail("sales+leads@firma.cz"), "sales+leads@firma.cz");
});

test("normalizeEmail: gmail folds plus-tags AND dots; googlemail canonicalises", () => {
  assert.equal(normalizeEmail("Jan.Novak+adamant@gmail.com"), "jannovak@gmail.com");
  assert.equal(normalizeEmail("jannovak@gmail.com"), "jannovak@gmail.com");
  assert.equal(normalizeEmail("j.a.n.n.o.v.a.k@googlemail.com"), "jannovak@gmail.com");
  // …so all three are ONE person.
  const a = normalizeEmail("Jan.Novak+x@gmail.com");
  const b = normalizeEmail("jannovak@googlemail.com");
  assert.equal(a, b);
});

test("normalizeEmail: rejects non-emails rather than inventing a key", () => {
  for (const bad of ["", "   ", "not-an-email", "@nodomain.cz", "user@", "user@nodot", "a b@x.cz", null, undefined, 42]) {
    assert.equal(normalizeEmail(bad), undefined, `${String(bad)} must not produce a key`);
  }
});

test("normalizePhone: the §B6 example set all folds to one E.164 key", () => {
  const expected = "+420777123456";
  for (const raw of [
    "+420 777 123 456",
    "777123456",
    "00420777123456",
    "420777123456",
    "(+420) 777-123-456",
    "+420.777.123.456",
    " 777 123 456 ",
  ]) {
    assert.equal(normalizePhone(raw), expected, `${raw} should fold to ${expected}`);
  }
});

test("normalizePhone: SK region + trunk zero", () => {
  assert.equal(normalizePhone("+421 901 123 456"), "+421901123456");
  assert.equal(normalizePhone("0901123456", "SK"), "+421901123456");
  assert.equal(normalizePhone("901123456", "SK"), "+421901123456");
});

test("normalizePhone: refuses garbage instead of folding it onto a real subscriber", () => {
  for (const bad of ["", "abc", "12345", "+42077712345", "+4207771234567", null, undefined, {}]) {
    assert.equal(normalizePhone(bad), undefined, `${String(bad)} must not produce a key`);
  }
});

test("normalizePhone: an extension is not part of the number", () => {
  assert.equal(normalizePhone("+420 777 123 456 ext. 22"), "+420777123456");
});

test("normalizeName: diacritic-folded, whitespace-collapsed (Czech-safe)", () => {
  assert.equal(normalizeName("  Jan   NOVÁK "), "jan novak");
  assert.equal(normalizeName("Žofie Křížová"), "zofie krizova");
  assert.equal(normalizeName("   "), undefined);
});

test("companyDomainFromEmail: work domains only, never free mail", () => {
  assert.equal(companyDomainFromEmail("jan@stavbyprofi.cz"), "stavbyprofi.cz");
  assert.equal(companyDomainFromEmail("jan@gmail.com"), undefined);
  assert.equal(companyDomainFromEmail("jan@seznam.cz"), undefined);
});

test("normalizeIco: 8 digits, zero-padded like the register", () => {
  assert.equal(normalizeIco("27074358"), "27074358");
  assert.equal(normalizeIco("123456"), "00123456");
  assert.equal(normalizeIco("CZ 270 743 58"), "27074358");
  assert.equal(normalizeIco("123456789"), undefined);
});

test("contactKeys derives all three at once and omits what it cannot derive", () => {
  const keys = contactKeys({ name: "Jan Novák", email: "JAN@Firma.cz", phone: "777 123 456" });
  assert.deepEqual(keys, {
    emailKey: "jan@firma.cz",
    phoneKey: "+420777123456",
    nameKey: "jan novak",
  });
  assert.deepEqual(contactKeys({ name: "  " }), {});
});

test("auto-merge: exact email OR exact phone — a shared name is NOT a match", () => {
  const a = contactKeys({ name: "Jan Novák", email: "jan@firma.cz" });
  const b = contactKeys({ name: "Jan Novák", email: "jan@firma.cz", phone: "777123456" });
  assert.equal(isAutoMergeMatch(a, b), true);

  const phoneOnlyA = contactKeys({ phone: "+420777123456" });
  const phoneOnlyB = contactKeys({ phone: "777 123 456" });
  assert.equal(isAutoMergeMatch(phoneOnlyA, phoneOnlyB), true);

  const nameOnlyA = contactKeys({ name: "Jan Novák" });
  const nameOnlyB = contactKeys({ name: "jan novak" });
  assert.equal(isAutoMergeMatch(nameOnlyA, nameOnlyB), false);
  // …it is a SUGGESTION instead.
  assert.equal(isDuplicateCandidate(nameOnlyA, nameOnlyB), true);
});

test("duplicate candidate: a contradicting hard key disqualifies the suggestion", () => {
  const a = contactKeys({ name: "Jan Novák", email: "jan@firma.cz" });
  const b = contactKeys({ name: "Jan Novák", email: "jan@jinafirma.cz" });
  assert.equal(isAutoMergeMatch(a, b), false);
  assert.equal(isDuplicateCandidate(a, b), false);
});
