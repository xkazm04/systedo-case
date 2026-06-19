/** Unit tests for the Newsletter channel handoff helpers: splitting the generated
 *  „Předmět:" variant into a real subject + body, validating the subject length on
 *  its own budget (independent of the body), and assembling the paste-ready
 *  plain-text + HTML email with the UTM'd CTA. Runs the TS source directly via
 *  the shared resolve hook (node --import ./test-llm/setup.mjs --test). */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  splitNewsletter,
  checkSubject,
  newsletterPlainText,
  newsletterHtml,
  NEWSLETTER_SUBJECT_MAX,
} from "@/lib/distribution/newsletter";

test("splitNewsletter peels the Predmet prefix into subject + body", () => {
  const { subject, body } = splitNewsletter(
    "Předmět: Spánek miminka\n\nTento týden jsme sepsali průvodce.\n\nČíst → https://x.cz/a"
  );
  assert.equal(subject, "Spánek miminka");
  assert.ok(body.startsWith("Tento týden"), `body was: ${body}`);
  // the subject line never leaks back into the body
  assert.ok(!body.includes("Předmět:"));
});

test("splitNewsletter is case-insensitive and tolerant of CRLF + extra blank lines", () => {
  const { subject, body } = splitNewsletter("předmět:   Ahoj\r\n\r\n\r\nTělo zprávy");
  assert.equal(subject, "Ahoj");
  assert.equal(body, "Tělo zprávy");
});

test("splitNewsletter with no subject marker leaves subject empty, all text is body", () => {
  const { subject, body } = splitNewsletter("Žádný předmět tu není.\nDruhý řádek.");
  assert.equal(subject, "");
  assert.equal(body, "Žádný předmět tu není.\nDruhý řádek.");
});

test("checkSubject validates length on its own budget", () => {
  assert.deepEqual(checkSubject(""), { length: 0, max: NEWSLETTER_SUBJECT_MAX, status: "empty", valid: false });
  const ok = checkSubject("Krátký předmět");
  assert.equal(ok.status, "ok");
  assert.equal(ok.valid, true);
  assert.equal(ok.length, "Krátký předmět".length);
});

test("checkSubject flags over-budget subjects distinctly from empty ones", () => {
  const long = "x".repeat(NEWSLETTER_SUBJECT_MAX + 5);
  const res = checkSubject(long);
  assert.equal(res.status, "tooLong");
  assert.equal(res.valid, false);
  assert.equal(res.length, NEWSLETTER_SUBJECT_MAX + 5);
  // a custom budget is honoured
  assert.equal(checkSubject("abcdef", 5).status, "tooLong");
  assert.equal(checkSubject("abcde", 5).status, "ok");
});

test("checkSubject trims surrounding whitespace before measuring", () => {
  const res = checkSubject("   ahoj   ");
  assert.equal(res.length, 4);
  assert.equal(res.status, "ok");
});

test("newsletterPlainText carries the subject, body and UTM'd CTA", () => {
  const out = newsletterPlainText({
    subject: "Spánek miminka",
    body: "Tělo zprávy.",
    ctaUrl: "https://x.cz/a?utm_source=newsletter",
  });
  assert.ok(out.startsWith("Předmět: Spánek miminka\n"));
  assert.ok(out.includes("Tělo zprávy."));
  assert.ok(out.includes("https://x.cz/a?utm_source=newsletter"));
  assert.ok(out.includes("Číst celý článek"));
});

test("newsletterHtml is valid-ish HTML with the subject, CTA href and escaping", () => {
  const html = newsletterHtml({
    subject: "Tip & trik <b>",
    body: "První odstavec.\n\nDruhý odstavec.",
    ctaUrl: "https://x.cz/a?utm_source=newsletter&utm_campaign=c",
  });
  assert.ok(html.startsWith("<!doctype html>"));
  // subject is HTML-escaped (no raw <b> / &)
  assert.ok(html.includes("Tip &amp; trik &lt;b&gt;"));
  assert.ok(!html.includes("<b>"));
  // the CTA href is present and ampersand-escaped
  assert.ok(html.includes('href="https://x.cz/a?utm_source=newsletter&amp;utm_campaign=c"'));
  // both body paragraphs render
  assert.ok(html.includes("První odstavec."));
  assert.ok(html.includes("Druhý odstavec."));
  // two <p> body paragraphs (blank-line split)
  assert.equal((html.match(/<p style="margin:0 0 16px/g) ?? []).length, 2);
});

test("newsletterHtml round-trips a real split variant", () => {
  const variant =
    "Předmět: Spánek miminka: kompletní průvodce\n\nTento týden jsme sepsali kompletního průvodce.\n\nČíst celý článek → https://blog.example.cz/spanek?utm_source=newsletter";
  const { subject, body } = splitNewsletter(variant);
  const html = newsletterHtml({ subject, body, ctaUrl: "https://blog.example.cz/spanek?utm_source=newsletter" });
  assert.ok(html.includes("Spánek miminka: kompletní průvodce"));
  assert.ok(html.includes("Tento týden"));
});
